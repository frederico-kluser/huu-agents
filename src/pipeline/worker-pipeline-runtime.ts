/**
 * Worker Pipeline Runtime — executor multi-step para worker profiles.
 *
 * Interpreta o grafo de steps definido em um WorkerProfile, gerenciando:
 * - cursor (currentStepId) para navegação
 * - estado de variáveis (reservadas + custom)
 * - trace de execução para observabilidade
 * - proteção contra loops via maxStepExecutions
 * - dispatch para handlers registrados via ReadonlyMap
 *
 * Baseado em 6sD5N (runtime imutável) com onStepComplete callback de dWvt6
 * e ReadonlyMap registry de wXTUC.
 *
 * @module
 */

import type { WorkerProfile } from '../schemas/worker-profile.schema.js';
import { findStep } from '../schemas/worker-profile.schema.js';
import type { WorkerPipelineState } from '../schemas/worker-pipeline-state.schema.js';
import type { StepTraceEntry } from '../schemas/worker-pipeline-state.schema.js';
import { createInitialState } from '../schemas/worker-pipeline-state.schema.js';
import { stepHandlerRegistry } from './step-handlers/index.js';
import type { StepHandlerContext } from './step-handlers/types.js';
import { PipelineFailError } from './step-handlers/control-handlers.js';
import type { WorkerResult } from '../schemas/worker-result.schema.js';
import { WorkerResultSchema } from '../schemas/worker-result.schema.js';
import { execGit } from '../git/git-wrapper.js';

// ── Pipeline execution config ───────────────────────────────────────

/** Configuração para executar um worker pipeline. */
export interface PipelineRunConfig {
  /** Perfil ativo a executar */
  readonly profile: WorkerProfile;
  /** Descrição da tarefa do DAG node */
  readonly task: string;
  /** Node ID do DAG (para WorkerResult) */
  readonly nodeId: string;
  /** Caminho absoluto do worktree isolado */
  readonly worktreePath: string;
  /** API key do OpenRouter */
  readonly apiKey: string;
  /** Arquivos de contexto selecionados pelo usuário (disponíveis como $context) */
  readonly contextFiles?: readonly string[];
  /** Callback para progresso a nível de step */
  readonly onProgress?: (message: string) => void;
  /** Callback invocado após cada step com a trace atualizada */
  readonly onStepComplete?: (entry: StepTraceEntry, state: WorkerPipelineState) => void;
}

// ── Main execution ──────────────────────────────────────────────────

/**
 * Executa uma pipeline de worker profile como runtime multi-step.
 *
 * O loop executa até:
 * - Um step navegar para __end__ (sucesso)
 * - Nenhum próximo step definido (sucesso — fim da cadeia)
 * - Um fail step lançar PipelineFailError (falha de negócio)
 * - maxStepExecutions excedido (terminação de segurança)
 * - Erro técnico não tratado
 *
 * @param config - Configuração do pipeline com perfil, tarefa, worktree, etc.
 * @returns WorkerResult compatível com o pipeline existente
 *
 * @example
 * const result = await runWorkerPipeline({
 *   profile, task: 'Fix auth bug', nodeId: 'task-001',
 *   worktreePath: '/repo/.worktrees/task-001', apiKey: 'sk-or-...',
 * });
 */
export async function runWorkerPipeline(config: PipelineRunConfig): Promise<WorkerResult> {
  const { profile, task, nodeId, worktreePath, apiKey, contextFiles, onProgress, onStepComplete } = config;
  const state = createInitialState(profile.entryStepId, task, profile.initialVariables, contextFiles);

  const ctx: StepHandlerContext = {
    worktreePath,
    profile,
    apiKey,
    onProgress,
  };

  onProgress?.(
    `Pipeline "${profile.id}" started `
    + `(loop guard: ${profile.maxStepExecutions}, seats: ${profile.seats})`,
  );

  try {
    const finalState = await executeLoop(profile, state, ctx, onStepComplete);
    return buildResult(nodeId, finalState, worktreePath);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    onProgress?.(`Pipeline error: ${msg}`);
    return buildResult(nodeId, { ...state, status: 'failed', failureReason: msg }, worktreePath);
  }
}

/**
 * Loop de execução: itera steps até terminação.
 * Retorna o estado final da pipeline.
 */
async function executeLoop(
  profile: WorkerProfile,
  initialState: WorkerPipelineState,
  ctx: StepHandlerContext,
  onStepComplete?: (entry: StepTraceEntry, state: WorkerPipelineState) => void,
): Promise<WorkerPipelineState> {
  let state = { ...initialState };

  while (state.status === 'running') {
    // Safety: limite de execuções
    if (state.stepExecutionCount >= profile.maxStepExecutions) {
      return {
        ...state,
        status: 'failed',
        failureReason: `Loop guard reached (${profile.maxStepExecutions} step executions). `
          + `Last step: ${state.currentStepId}. This may indicate an infinite loop.`,
      };
    }

    // Resolve step atual
    const step = findStep(profile, state.currentStepId);
    if (!step) {
      return {
        ...state,
        status: 'failed',
        failureReason: `Step "${state.currentStepId}" not found in profile "${profile.id}"`,
      };
    }

    // Busca handler no registry
    const handler = stepHandlerRegistry.get(step.type);
    if (!handler) {
      return {
        ...state,
        status: 'failed',
        failureReason: `No handler for step type "${step.type}"`,
      };
    }

    // Executa step
    const startedAt = Date.now();
    ctx.onProgress?.(`Step [${state.stepExecutionCount + 1}/${profile.maxStepExecutions}]: ${step.type}:${step.id}`);

    try {
      const result = await handler(step, state, ctx);

      const traceEntry: StepTraceEntry = {
        stepId: step.id,
        type: step.type,
        startedAt,
        finishedAt: Date.now(),
        outcome: 'ok',
        error: null,
      };

      // Aplica atualizações de estado imutavelmente
      state = {
        ...state,
        stepExecutionCount: state.stepExecutionCount + 1,
        trace: [...state.trace, traceEntry],
        ...(result.stateUpdates?.reservedVars
          ? { reservedVars: { ...state.reservedVars, ...result.stateUpdates.reservedVars } }
          : {}),
        ...(result.stateUpdates?.customVars
          ? { customVars: { ...state.customVars, ...result.stateUpdates.customVars } }
          : {}),
      };

      onStepComplete?.(traceEntry, state);

      // Navegação: null = fim da pipeline
      if (result.nextStepId === null) {
        return { ...state, status: 'succeeded' };
      }

      state = { ...state, currentStepId: result.nextStepId };

    } catch (error) {
      const finishedAt = Date.now();

      if (error instanceof PipelineFailError) {
        const traceEntry: StepTraceEntry = {
          stepId: step.id, type: step.type,
          startedAt, finishedAt, outcome: 'error', error: error.message,
        };

        return {
          ...state,
          stepExecutionCount: state.stepExecutionCount + 1,
          trace: [...state.trace, traceEntry],
          status: 'failed',
          failureReason: error.message,
        };
      }

      // Erro técnico
      const msg = error instanceof Error ? error.message : String(error);
      const traceEntry: StepTraceEntry = {
        stepId: step.id, type: step.type,
        startedAt, finishedAt, outcome: 'error', error: msg,
      };

      return {
        ...state,
        stepExecutionCount: state.stepExecutionCount + 1,
        trace: [...state.trace, traceEntry],
        status: 'failed',
        failureReason: `Technical error in step "${step.id}": ${msg}`,
        reservedVars: { ...state.reservedVars, error: msg },
      };
    }
  }

  return state;
}

// ── Result builder ──────────────────────────────────────────────────

/**
 * Converte estado final da pipeline em WorkerResult.
 * Detecta arquivos modificados via git status para determinar partial success.
 */
async function buildResult(
  nodeId: string,
  state: WorkerPipelineState,
  worktreePath: string,
): Promise<WorkerResult> {
  const statusResult = await execGit(['status', '--porcelain'], worktreePath);
  const files = statusResult.ok
    ? statusResult.value
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .map((l) => l.slice(3).trim())
    : [];

  const hasChanges = files.length > 0;

  let status: 'success' | 'failure' | 'partial';
  if (state.status === 'succeeded') {
    status = 'success';
  } else if (hasChanges) {
    status = 'partial';
  } else {
    status = 'failure';
  }

  return WorkerResultSchema.parse({
    nodeId,
    status,
    filesModified: files,
    commitHash: null,
    error: state.failureReason ?? null,
    pipelineTrace: state.trace.length > 0 ? state.trace : null,
    failureReason: state.failureReason,
  });
}
