/**
 * Pipeline orchestrator — conecta Planner, DAG Executor e Worker Runner
 * em um fluxo end-to-end: planTask → executeDAG(runWorker) → resultado.
 *
 * Responsável por: criar branch base, gerar timestamps, montar workerFn
 * com retry e prompts, emitir eventos para a UI e produzir o resultado final.
 */

import { EventEmitter } from 'node:events';
import { planTask, type PlannerResult } from './planner.pipeline.js';
import { executeDAG, type WorkerFn } from './dag-executor.js';
import { retryWorker, type RetryConfig } from './retry-handler.js';
import { runWorker, type WorkerProgressEvent } from '../agents/worker-runner.js';
import { generateWorkerPrompt } from '../prompts/worker.prompt.js';
import { createBranch, execGit } from '../git/git-wrapper.js';
import type { Config } from '../schemas/config.schema.js';
import type { DAG, DAGNode } from '../schemas/dag.schema.js';
import type { WorkerResult } from '../schemas/worker-result.schema.js';
import type { LogEntry } from '../screens/execution-screen.js';

/** Estado do pipeline emitido para a UI via callback */
export interface PipelineProgress {
  readonly phase: 'planning' | 'exploring' | 'executing' | 'done' | 'error';
  readonly dag: DAG | null;
  readonly logs: readonly LogEntry[];
  readonly results: readonly WorkerResult[];
  readonly activeNodeId: string | null;
  readonly branch: string;
  readonly diffStat: string;
  readonly error: string | null;
}

/** Configuração completa do pipeline */
export interface OrchestratorConfig {
  readonly config: Config;
  readonly macroTask: string;
  readonly contextFiles: readonly string[];
  readonly rootPath: string;
  readonly onProgress: (progress: PipelineProgress) => void;
}

/**
 * Executa o pipeline completo: planejar → executar → resultado.
 *
 * 1. Cria branch base task-{timestamp}
 * 2. Invoca Planner para decompor macro-task em DAG
 * 3. Se Planner pede exploração, o pipeline interno resolve
 * 4. Executa DAG com workers paralelos via worktrees
 * 5. Cada worker recebe prompt contextualizado + retry automático
 * 6. Emite progresso em tempo real para a UI
 *
 * @param orchestratorConfig - Config completa com callbacks
 * @returns PlannerResult se clarify, ou resultado final do pipeline
 * @throws {Error} Se Planner falhar após retries
 *
 * @example
 * ```ts
 * await runPipeline({
 *   config: { openrouterApiKey: 'sk-...', plannerModel: 'openai/gpt-4.1', workerModel: 'openai/gpt-4.1-mini', worktreeBasePath: '.pi-dag-worktrees' },
 *   macroTask: 'Refatorar módulo auth',
 *   contextFiles: ['src/auth/handler.ts'],
 *   rootPath: '/repo',
 *   onProgress: (p) => updateUI(p),
 * });
 * ```
 */
export async function runPipeline(
  orchestratorConfig: OrchestratorConfig,
): Promise<PlannerResult | PipelineProgress> {
  const { config, macroTask, contextFiles, rootPath, onProgress } = orchestratorConfig;
  const timestamp = generateTimestamp();
  const branch = `task-${timestamp}`;
  const logs: LogEntry[] = [];
  const results: WorkerResult[] = [];
  let currentDAG: DAG | null = null;
  let activeNodeId: string | null = null;

  const emit = (
    phase: PipelineProgress['phase'],
    extra?: Partial<Pick<PipelineProgress, 'error' | 'diffStat'>>,
  ) => {
    onProgress({
      phase,
      dag: currentDAG,
      logs: [...logs],
      results: [...results],
      activeNodeId,
      branch,
      diffStat: extra?.diffStat ?? '',
      error: extra?.error ?? null,
    });
  };

  try {
    // Fase 1: Planner
    emit('planning');
    const plannerResult = await planTask(macroTask, contextFiles, {
      model: config.plannerModel,
      apiKey: config.openrouterApiKey,
      rootPath,
    });

    if (plannerResult.type === 'clarify') {
      return plannerResult;
    }

    currentDAG = plannerResult.dag;
    emit('executing');

    // Criar branch base
    const branchResult = await createBranch(branch);
    if (!branchResult.ok) {
      emit('error', { error: `Falha ao criar branch: ${branchResult.error.message}` });
      return { phase: 'error', dag: currentDAG, logs, results, activeNodeId, branch, diffStat: '', error: branchResult.error.message };
    }

    // Fase 2: Executar DAG
    const emitter = new EventEmitter();

    emitter.on('node-started', ({ nodeId }: { nodeId: string }) => {
      activeNodeId = nodeId;
      updateNodeStatus(currentDAG!, nodeId, 'running');
      emit('executing');
    });

    emitter.on('node-completed', ({ nodeId, result }: { nodeId: string; result: WorkerResult }) => {
      updateNodeStatus(currentDAG!, nodeId, 'done');
      results.push(result);
      activeNodeId = null;
      emit('executing');
    });

    emitter.on('node-failed', ({ nodeId, error }: { nodeId: string; error: string }) => {
      updateNodeStatus(currentDAG!, nodeId, 'failed');
      addLog(logs, nodeId, `FALHA: ${error}`);
      activeNodeId = null;
      emit('executing');
    });

    // WorkerFn que conecta DAG Executor ao Worker Runner com retry
    const workerFn: WorkerFn = async (node: DAGNode, worktreePath: string) => {
      const provider = extractProvider(config.workerModel);
      const gitLog = await getGitLog(worktreePath);
      const systemPrompt = generateWorkerPrompt(node, gitLog, provider);

      const onWorkerProgress = (event: WorkerProgressEvent) => {
        addLog(logs, event.nodeId, `[${event.type}] ${event.content}`);
        emit('executing');
      };

      const retryConfig: RetryConfig = {
        model: config.workerModel,
        temperature: 0.7,
        fallbackModel: undefined,
      };

      const outcome = await retryWorker(
        async (model, temperature) => {
          return runWorker(node, worktreePath, systemPrompt, {
            model,
            apiKey: config.openrouterApiKey,
            temperature,
            onProgress: onWorkerProgress,
          });
        },
        retryConfig,
      );

      if (outcome.attempts > 1) {
        addLog(logs, node.id, `Retry: ${outcome.attempts} tentativa(s), modelo final: ${outcome.finalModel}`);
      }

      return outcome.result;
    };

    await executeDAG(currentDAG, timestamp, workerFn, emitter);

    // Fase 3: Resultado
    const diffStat = await getDiffStat(branch);
    emit('done', { diffStat });

    return {
      phase: 'done',
      dag: currentDAG,
      logs,
      results,
      activeNodeId: null,
      branch,
      diffStat,
      error: null,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    emit('error', { error: msg });
    return {
      phase: 'error',
      dag: currentDAG,
      logs,
      results,
      activeNodeId,
      branch,
      diffStat: '',
      error: msg,
    };
  }
}

// --- Helpers ---

/** Gera timestamp no formato YYYYMMDD-HHMMSS */
function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** Extrai provider do model ID (prefixo antes de '/') */
function extractProvider(model: string): string {
  const slash = model.indexOf('/');
  return slash > 0 ? model.slice(0, slash) : 'openai';
}

/** Atualiza status de um node no DAG (mutação controlada — DAG é estado local) */
function updateNodeStatus(dag: DAG, nodeId: string, status: DAGNode['status']): void {
  const node = dag.nodes.find((n) => n.id === nodeId);
  if (node) {
    (node as { status: string }).status = status;
  }
}

/** Adiciona log entry com ID único */
function addLog(logs: LogEntry[], nodeId: string, message: string): void {
  logs.push({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    nodeId,
    message,
    timestamp: Date.now(),
  });
}

/** Obtém git log resumido do worktree para contexto do worker */
async function getGitLog(worktreePath: string): Promise<string> {
  const result = await execGit(['log', '--oneline', '-10'], worktreePath);
  return result.ok ? result.value : '';
}

/** Obtém diff stat da branch para a tela de resultado */
async function getDiffStat(branch: string): Promise<string> {
  const result = await execGit(['diff', '--stat', `main...${branch}`], process.cwd());
  return result.ok ? result.value : 'sem diff disponível';
}
