import type { EventEmitter } from 'node:events';

import type { DAG, DAGNode } from '../schemas/dag.schema.js';
import type { WorkerResult } from '../schemas/worker-result.schema.js';
import { merge } from '../git/git-wrapper.js';
import { createWorktree, removeWorktree } from '../git/worktree-manager.js';

// --- Tipos públicos ---

/** Resultado consolidado da execução do DAG */
export interface ExecutionResult {
  readonly completed: readonly string[];
  readonly failed: readonly string[];
  readonly blocked: readonly string[];
}

/** Função que executa o trabalho de um node no worktree isolado */
export type WorkerFn = (
  node: DAGNode,
  worktreePath: string,
) => Promise<WorkerResult>;

/**
 * Eventos emitidos durante execução do DAG.
 * Usar com emitter.on('node-started' | 'node-completed' | 'node-failed', handler).
 */
export interface DAGExecutorEvents {
  'node-started': [{ readonly nodeId: string }];
  'node-completed': [{ readonly nodeId: string; readonly result: WorkerResult }];
  'node-failed': [{ readonly nodeId: string; readonly error: string }];
}

// --- Topological Sort (Kahn's algorithm) ---

/**
 * Computa waves de execução paralela via topological sort (Kahn's algorithm).
 * Nodes na mesma wave não possuem dependência entre si e podem executar em paralelo.
 *
 * @param nodes - Nodes do DAG com dependências declaradas
 * @returns Waves ordenadas — nodes na mesma wave podem executar em paralelo
 * @throws {Error} Ciclo detectado no DAG (nodes restantes listados na mensagem)
 * @example
 * const waves = topoSortWaves([
 *   { id: '1', task: 'Setup DB', dependencies: [], status: 'pending', files: [] },
 *   { id: '2', task: 'Auth API', dependencies: ['1'], status: 'pending', files: [] },
 *   { id: '3', task: 'User API', dependencies: ['1'], status: 'pending', files: [] },
 * ]);
 * // waves = [['1'], ['2', '3']]  — wave 0 primeiro, wave 1 em paralelo
 */
export const topoSortWaves = (
  nodes: readonly DAGNode[],
): readonly (readonly string[])[] => {
  const nodeIds = new Set(nodes.map(n => n.id));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, readonly string[]>();

  for (const node of nodes) {
    for (const dep of node.dependencies) {
      if (!nodeIds.has(dep)) {
        throw new Error(
          `Node '${node.id}' depende de '${dep}' que não existe no DAG`,
        );
      }
    }
    inDegree.set(node.id, node.dependencies.length);
    for (const dep of node.dependencies) {
      dependents.set(dep, [...(dependents.get(dep) ?? []), node.id]);
    }
  }

  const waves: string[][] = [];
  const remaining = new Set(nodes.map(n => n.id));

  while (remaining.size > 0) {
    const wave = [...remaining].filter(
      id => (inDegree.get(id) ?? 0) === 0,
    );

    if (wave.length === 0) {
      throw new Error(
        `Ciclo detectado no DAG. Nodes restantes: ${[...remaining].join(', ')}`,
      );
    }

    waves.push(wave);

    for (const id of wave) {
      remaining.delete(id);
      for (const child of dependents.get(id) ?? []) {
        inDegree.set(child, (inDegree.get(child) ?? 1) - 1);
      }
    }
  }

  return waves;
};

// --- Concurrency Limiter ---

/**
 * Executa tasks com limite de concorrência via semáforo cooperativo.
 * Mantém até `limit` Promises ativas simultaneamente dentro de uma wave.
 *
 * @param tasks - Factories de Promise a executar
 * @param limit - Máximo de execuções simultâneas (>=1)
 * @returns Resultados na mesma ordem dos tasks (settled)
 */
const runWithConcurrency = async <T>(
  tasks: readonly (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> => {
  if (tasks.length === 0) return [];

  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      try {
        const value = await tasks[idx]!();
        results[idx] = { status: 'fulfilled', value };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => worker(),
  );

  await Promise.all(workers);
  return results;
};

// --- DAG Executor ---

/**
 * Executa DAG com paralelismo por wave e isolamento via Git worktrees.
 * Cada node roda em worktree próprio; resultados mergeados na branch base.
 * Falhas propagam "blocked" aos dependentes sem interromper ramos independentes.
 *
 * @param dag - DAG validado (Zod) com nodes e dependências
 * @param taskTimestamp - Timestamp da task (ex: "20260321-143000")
 * @param workerFn - Função que executa o trabalho de cada node no worktree
 * @param emitter - EventEmitter opcional para eventos node-started/completed/failed
 * @returns Nodes completed, failed e blocked
 * @throws {Error} Ciclo detectado no DAG
 * @example
 * const { EventEmitter } = await import('node:events');
 * const emitter = new EventEmitter();
 * emitter.on('node-completed', ({ nodeId }) => console.log(`Done: ${nodeId}`));
 *
 * const result = await executeDAG(dag, '20260321-143000', myWorkerFn, emitter, undefined, 4);
 * console.log(result.completed); // ['1', '3']
 * console.log(result.blocked);   // ['4'] — dependia de node que falhou
 */
export const executeDAG = async (
  dag: DAG,
  taskTimestamp: string,
  workerFn: WorkerFn,
  emitter?: EventEmitter,
  completedNodeIds?: ReadonlySet<string>,
  maxConcurrency: number = 4,
): Promise<ExecutionResult> => {
  const nodeMap = new Map(dag.nodes.map((n): [string, DAGNode] => [n.id, n]));
  const completed = new Set<string>(completedNodeIds);
  const failed = new Set<string>();
  const blocked = new Set<string>();

  const waves = topoSortWaves(dag.nodes);

  /** Marca dependentes transitivos de um node falho como blocked */
  const blockDependents = (failedId: string): void => {
    for (const node of dag.nodes) {
      if (
        node.dependencies.includes(failedId) &&
        !blocked.has(node.id) &&
        !failed.has(node.id)
      ) {
        blocked.add(node.id);
        emitter?.emit('node-failed', {
          nodeId: node.id,
          error: `Bloqueado: dependência '${failedId}' falhou`,
        });
        blockDependents(node.id);
      }
    }
  };

  /** Executa um node: cria worktree → worker → merge → cleanup */
  const executeNode = async (nodeId: string): Promise<void> => {
    const node = nodeMap.get(nodeId)!;
    emitter?.emit('node-started', { nodeId });

    const wtResult = await createWorktree(nodeId, taskTimestamp);
    if (!wtResult.ok) {
      throw new Error(`Worktree falhou: ${wtResult.error.message}`);
    }

    try {
      const result = await workerFn(node, wtResult.value.path);

      if (result.status === 'failure') {
        throw new Error(result.error ?? 'Worker retornou status failure');
      }

      // Merge subtask branch na branch base da task.
      // Workers 'partial' com commitHash são mergeados intencionalmente —
      // mudanças parciais são preservadas e o node é marcado como completed.
      if (result.commitHash) {
        const mergeResult = await merge(
          `task-${taskTimestamp}`,
          [wtResult.value.branch],
        );
        if (!mergeResult.ok) {
          throw new Error(`Merge falhou: ${mergeResult.error.message}`);
        }
      }

      completed.add(nodeId);
      emitter?.emit('node-completed', { nodeId, result });
    } finally {
      await removeWorktree(wtResult.value.path);
    }
  };

  for (const wave of waves) {
    const executable = wave.filter(id => !blocked.has(id) && !completed.has(id));
    if (executable.length === 0) continue;

    const settled = await runWithConcurrency(
      executable.map(nodeId => () => executeNode(nodeId)),
      maxConcurrency,
    );

    for (let i = 0; i < executable.length; i++) {
      const outcome = settled[i];
      const nodeId = executable[i];
      if (outcome?.status === 'rejected' && nodeId) {
        const message = outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason);
        failed.add(nodeId);
        emitter?.emit('node-failed', { nodeId, error: message });
        blockDependents(nodeId);
      }
    }
  }

  return {
    completed: [...completed],
    failed: [...failed],
    blocked: [...blocked],
  };
};
