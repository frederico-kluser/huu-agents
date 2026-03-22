/**
 * Pipeline orchestrator — conecta Planner, DAG Executor e Worker Runner
 * em um fluxo end-to-end: planTask → executeDAG(runWorker) → resultado.
 *
 * Responsável por: criar branch base, gerar timestamps, montar workerFn
 * com retry e prompts, emitir eventos para a UI e produzir o resultado final.
 * Suporta retry seletivo via retryPipeline (reutiliza DAG/branch existentes).
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

/** Configuração para retry seletivo de nodes falhados */
export interface RetryPipelineConfig {
  readonly config: Config;
  readonly dag: DAG;
  readonly branch: string;
  readonly previousResults: readonly WorkerResult[];
  readonly onProgress: (progress: PipelineProgress) => void;
}

// --- Helpers compartilhados entre runPipeline e retryPipeline ---

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

/**
 * Cria workerFn que conecta DAG Executor ao Worker Runner com retry automático.
 * Extraído para compartilhar entre runPipeline e retryPipeline.
 */
function createWorkerFn(
  config: Config,
  logs: LogEntry[],
  onEmit: () => void,
): WorkerFn {
  return async (node: DAGNode, worktreePath: string) => {
    const provider = extractProvider(config.workerModel);
    const gitLog = await getGitLog(worktreePath);
    const systemPrompt = generateWorkerPrompt(node, gitLog, provider);

    const onWorkerProgress = (event: WorkerProgressEvent) => {
      addLog(logs, event.nodeId, `[${event.type}] ${event.content}`);
      onEmit();
    };

    const retryConfig: RetryConfig = {
      model: config.workerModel,
      temperature: 0.7,
      fallbackModel: undefined,
    };

    const outcome = await retryWorker(
      async (model, temperature) => runWorker(node, worktreePath, systemPrompt, {
        model,
        apiKey: config.openrouterApiKey,
        temperature,
        onProgress: onWorkerProgress,
      }),
      retryConfig,
    );

    if (outcome.attempts > 1) {
      addLog(logs, node.id, `Retry: ${outcome.attempts} tentativa(s), modelo final: ${outcome.finalModel}`);
    }

    return outcome.result;
  };
}

/**
 * Configura EventEmitter para eventos de execução do DAG.
 * Atualiza status dos nodes, coleta resultados e emite progresso para a UI.
 */
function createExecutionEmitter(
  dag: DAG,
  results: WorkerResult[],
  logs: LogEntry[],
  onStatusChange: (activeNodeId: string | null) => void,
): EventEmitter {
  const emitter = new EventEmitter();

  emitter.on('node-started', ({ nodeId }: { nodeId: string }) => {
    updateNodeStatus(dag, nodeId, 'running');
    onStatusChange(nodeId);
  });

  emitter.on('node-completed', ({ nodeId, result }: { nodeId: string; result: WorkerResult }) => {
    updateNodeStatus(dag, nodeId, 'done');
    results.push(result);
    onStatusChange(null);
  });

  emitter.on('node-failed', ({ nodeId, error }: { nodeId: string; error: string }) => {
    updateNodeStatus(dag, nodeId, 'failed');
    results.push({ nodeId, status: 'failure', filesModified: [], commitHash: null, error });
    addLog(logs, nodeId, `FALHA: ${error}`);
    onStatusChange(null);
  });

  return emitter;
}

/** Monta PipelineProgress de sucesso ou erro */
function buildResult(
  phase: 'done' | 'error',
  dag: DAG | null,
  logs: LogEntry[],
  results: WorkerResult[],
  activeNodeId: string | null,
  branch: string,
  diffStat: string,
  error: string | null,
): PipelineProgress {
  return { phase, dag, logs, results, activeNodeId, branch, diffStat, error };
}

// --- Pipeline principal ---

/**
 * Executa o pipeline completo: planejar → executar → resultado.
 *
 * @param orchestratorConfig - Config completa com callbacks
 * @returns PlannerResult se clarify, ou resultado final do pipeline
 * @throws {Error} Se Planner falhar após retries
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
      phase, dag: currentDAG, logs: [...logs], results: [...results],
      activeNodeId, branch, diffStat: extra?.diffStat ?? '', error: extra?.error ?? null,
    });
  };

  try {
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

    const branchResult = await createBranch(branch);
    if (!branchResult.ok) {
      emit('error', { error: `Falha ao criar branch: ${branchResult.error.message}` });
      return buildResult('error', currentDAG, logs, results, activeNodeId, branch, '', branchResult.error.message);
    }

    const emitter = createExecutionEmitter(currentDAG, results, logs, (id) => {
      activeNodeId = id;
      emit('executing');
    });
    const workerFn = createWorkerFn(config, logs, () => emit('executing'));

    await executeDAG(currentDAG, timestamp, workerFn, emitter, undefined, config.maxConcurrency);

    const diffStat = await getDiffStat(branch);
    emit('done', { diffStat });
    return buildResult('done', currentDAG, logs, results, null, branch, diffStat, null);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    emit('error', { error: msg });
    return buildResult('error', currentDAG, logs, results, activeNodeId, branch, '', msg);
  }
}

// --- Retry seletivo ---

/**
 * Retry seletivo: re-executa apenas nodes falhados/bloqueados,
 * preservando resultados de nodes já concluídos com sucesso.
 * Não roda o Planner — reutiliza o DAG e branch existentes.
 *
 * Critério de retry: todo node cujo resultado anterior NÃO foi
 * success/partial é re-executado. Dependentes bloqueados entram
 * naturalmente se o node que os bloqueava agora succeeder.
 *
 * @param retryConfig - DAG, branch e resultados anteriores
 * @returns Resultado final do pipeline com resultados mesclados
 */
export async function retryPipeline(
  retryConfig: RetryPipelineConfig,
): Promise<PipelineProgress> {
  const { config, dag, branch, previousResults, onProgress } = retryConfig;
  const timestamp = branch.slice('task-'.length);

  // Nodes com resultado success/partial são preservados e pulados
  const completedIds = new Set(
    previousResults
      .filter(r => r.status === 'success' || r.status === 'partial')
      .map(r => r.nodeId),
  );

  const results: WorkerResult[] = previousResults.filter(r => completedIds.has(r.nodeId));
  const logs: LogEntry[] = [];

  // Reset: done permanece, failed/blocked → pending para re-execução
  const currentDAG: DAG = {
    ...dag,
    nodes: dag.nodes.map(n => ({
      ...n,
      status: completedIds.has(n.id) ? 'done' as const : 'pending' as const,
    })),
  };

  let activeNodeId: string | null = null;

  const emit = (
    phase: PipelineProgress['phase'],
    extra?: Partial<Pick<PipelineProgress, 'error' | 'diffStat'>>,
  ) => {
    onProgress({
      phase, dag: currentDAG, logs: [...logs], results: [...results],
      activeNodeId, branch, diffStat: extra?.diffStat ?? '', error: extra?.error ?? null,
    });
  };

  try {
    emit('executing');

    const emitter = createExecutionEmitter(currentDAG, results, logs, (id) => {
      activeNodeId = id;
      emit('executing');
    });
    const workerFn = createWorkerFn(config, logs, () => emit('executing'));

    await executeDAG(currentDAG, timestamp, workerFn, emitter, completedIds, config.maxConcurrency);

    const diffStat = await getDiffStat(branch);
    emit('done', { diffStat });
    return buildResult('done', currentDAG, logs, results, null, branch, diffStat, null);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    emit('error', { error: msg });
    return buildResult('error', currentDAG, logs, results, activeNodeId, branch, '', msg);
  }
}
