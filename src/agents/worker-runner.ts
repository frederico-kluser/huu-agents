/**
 * Worker Runner — executa Pi Coding Agent como worker em worktree isolada.
 *
 * Instancia createAgentSession com SessionManager.inMemory() e cwd no worktree.
 * Subscribe a eventos para streaming de progresso. Timeout configuravel (default 5 min).
 * Retorna WorkerResult Zod-validado. Segue constraint de max 250 LOC.
 */

import {
  AuthStorage,
  createAgentSession,
  SessionManager,
} from '@mariozechner/pi-coding-agent';
import { getModel } from '@mariozechner/pi-ai';

import type { DAGNode } from '../schemas/dag.schema.js';
import { WorkerResultSchema, type WorkerResult } from '../schemas/worker-result.schema.js';
import { commit, execGit } from '../git/git-wrapper.js';

/** Tipos de evento de progresso emitidos durante execucao do worker */
export type WorkerProgressType = 'text' | 'tool_start' | 'tool_end' | 'error' | 'done';

/** Evento de progresso emitido pelo worker durante execucao */
export interface WorkerProgressEvent {
  readonly nodeId: string;
  readonly type: WorkerProgressType;
  readonly content: string;
  readonly timestamp: number;
}

/** Configuracao do Worker Runner */
export interface WorkerRunnerConfig {
  /** Modelo no formato "provider/modelId" (ex: "openai/gpt-4.1-mini") */
  readonly model: string;
  /** API key do provider LLM */
  readonly apiKey: string;
  /** Temperatura do modelo (default: 0.7) */
  readonly temperature?: number;
  /** Timeout em ms por node (default: 5 min) */
  readonly timeoutMs?: number;
  /** Callback para streaming de progresso */
  readonly onProgress?: (event: WorkerProgressEvent) => void;
}

/** Subset minimo da interface AgentSession do Pi SDK usado pelo runner */
interface PiSession {
  prompt(message: string): Promise<void>;
  subscribe(callback: (event: Record<string, unknown>) => void): (() => void) | void;
  dispose(): void;
}

/** Erro lancado quando o Worker Runner falha de forma irrecuperavel */
export class WorkerRunnerError extends Error {
  constructor(message: string, public readonly nodeId: string) {
    super(message);
    this.name = 'WorkerRunnerError';
  }
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Executa um Pi Coding Agent como worker em worktree Git isolada.
 *
 * Cria session Pi SDK in-memory com cwd no worktree. Envia system prompt + task
 * como prompt. Subscribe a eventos para emitir progresso via callback.
 * Apos conclusao ou timeout, executa git status para detectar arquivos modificados.
 *
 * @param node - Node do DAG com task e metadados
 * @param worktreePath - Caminho absoluto do worktree isolado (NUNCA o repo principal)
 * @param systemPrompt - System prompt gerado por generateWorkerPrompt()
 * @param config - API key, timeout e callback de progresso
 * @returns WorkerResult Zod-validado com status, arquivos e erro
 * @throws {WorkerRunnerError} Falha ao criar session Pi SDK
 * @example
 * const result = await runWorker(
 *   { id: 'task-001', task: 'Converter format.js para TS', dependencies: [], status: 'running', files: ['utils/format.js'] },
 *   '/repo/.pi-dag-worktrees/task-abc-subtask-1',
 *   generateWorkerPrompt(node, gitLog, 'anthropic'),
 *   { apiKey: 'sk-ant-...', timeoutMs: 120_000, onProgress: console.log }
 * );
 * console.log(result.status); // 'success'
 * console.log(result.filesModified); // ['utils/format.ts']
 */
export async function runWorker(
  node: DAGNode,
  worktreePath: string,
  systemPrompt: string,
  config: WorkerRunnerConfig,
): Promise<WorkerResult> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const emit = createEmitter(node.id, config.onProgress);

  let session: PiSession | null = null;
  let disposed = false;
  const safeDispose = () => {
    if (disposed) return;
    disposed = true;
    try { session?.dispose(); } catch { /* cleanup best-effort */ }
  };

  try {
    const created = await createPiSession(worktreePath, config);
    session = created.session;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new WorkerRunnerError(`Falha ao criar session Pi: ${msg}`, node.id);
  }

  // Subscribe ANTES de prompt para nao perder eventos
  const unsub = subscribeToProgress(session, emit);
  let timedOut = false;
  let agentError: string | null = null;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    emit('error', `Timeout após ${timeoutMs}ms`);
    safeDispose();
  }, timeoutMs);

  try {
    await session.prompt(`${systemPrompt}\n\n---\n\nTarefa: ${node.task}`);
  } catch (error) {
    if (!timedOut) {
      agentError = error instanceof Error ? error.message : String(error);
      emit('error', agentError);
    }
  } finally {
    clearTimeout(timeoutId);
    unsub();
    safeDispose();
  }

  const filesModified = await getModifiedFiles(worktreePath);
  const status = resolveStatus(timedOut, agentError, filesModified);
  const errorMsg = timedOut ? `Timeout após ${timeoutMs}ms` : agentError;

  // Commit automático das mudanças do worker — o prompt não pede mais git add/commit
  let commitHash: string | null = null;
  if (filesModified.length > 0) {
    const commitResult = await commit(
      worktreePath,
      `feat(dag): ${node.task.slice(0, 72)}`,
    );
    if (commitResult.ok) {
      commitHash = commitResult.value;
    }
  }

  emit('done', `Status: ${status}, ${filesModified.length} arquivo(s), commit: ${commitHash?.slice(0, 7) ?? 'nenhum'}`);

  return WorkerResultSchema.parse({
    nodeId: node.id,
    status,
    filesModified,
    commitHash,
    error: errorMsg,
  });
}

/** Parseia modelo no formato "provider/modelId" em partes separadas */
function parseModelId(model: string): { provider: string; modelId: string } {
  const slash = model.indexOf('/');
  if (slash <= 0) return { provider: 'anthropic', modelId: model };
  return { provider: model.slice(0, slash), modelId: model.slice(slash + 1) };
}

/**
 * Cria session Pi SDK com modelo selecionado pelo usuário.
 * Parseia config.model ("provider/modelId"), resolve via getModel(),
 * e configura auth com o provider correto.
 *
 * @throws {WorkerRunnerError} Modelo inválido ou provider não suportado
 */
async function createPiSession(
  worktreePath: string,
  config: WorkerRunnerConfig,
): Promise<{ session: PiSession }> {
  const { provider, modelId } = parseModelId(config.model);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- provider vem do config do usuário, validado em runtime pelo Pi SDK
  const piModel = getModel(provider as never, modelId);

  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey(provider, config.apiKey);

  return createAgentSession({
    model: piModel,
    sessionManager: SessionManager.inMemory(),
    authStorage,
    cwd: worktreePath,
  });
}

/**
 * Mapeia eventos da session Pi para WorkerProgressEvent.
 * Filtra apenas text deltas, tool execution start/end e errors.
 */
function subscribeToProgress(
  session: PiSession,
  emit: (type: WorkerProgressType, content: string) => void,
): () => void {
  let active = true;
  const maybeUnsub = session.subscribe((event: Record<string, unknown>) => {
    if (!active) return;
    if (event.type === 'message_update') {
      const sub = event.assistantMessageEvent as Record<string, unknown> | undefined;
      if (sub?.type === 'text_delta' && typeof sub.delta === 'string') {
        emit('text', sub.delta);
      }
    }
    if (event.type === 'tool_execution_start') {
      emit('tool_start', String(event.toolName ?? 'unknown'));
    }
    if (event.type === 'tool_execution_end') {
      emit('tool_end', event.isError ? 'falhou' : 'ok');
    }
    if (event.type === 'error') {
      emit('error', String((event as Record<string, unknown>).message ?? 'erro desconhecido da session'));
    }
  });
  // Guard: se subscribe() retorna void, o flag `active` garante corte seguro
  const sdkUnsub = typeof maybeUnsub === 'function' ? maybeUnsub : () => {};
  return () => { active = false; sdkUnsub(); };
}

/**
 * Retorna lista de arquivos modificados no worktree via git status --porcelain.
 * Inclui staged, unstaged e untracked. Deduplica e trata renames.
 */
async function getModifiedFiles(cwd: string): Promise<readonly string[]> {
  const result = await execGit(['status', '--porcelain'], cwd);
  if (!result.ok || !result.value) return [];

  const files = result.value
    .split('\n')
    .filter(Boolean)
    .map(parseStatusLine)
    .filter((f): f is string => f !== null);

  return [...new Set(files)];
}

/** Extrai path de uma linha do git status --porcelain. Trata renames (old -> new). */
function parseStatusLine(line: string): string | null {
  if (line.length < 4) return null; // Minimo: "XY " + 1 char de path
  const raw = line.slice(3);
  if (!raw) return null;
  const arrowIdx = raw.indexOf(' -> ');
  return arrowIdx >= 0 ? raw.slice(arrowIdx + 4) : raw;
}

/**
 * Determina status final: partial se houve mudancas apesar de erro/timeout,
 * failure se erro/timeout sem mudancas, success se tudo ok.
 */
function resolveStatus(
  timedOut: boolean,
  agentError: string | null,
  filesModified: readonly string[],
): 'success' | 'failure' | 'partial' {
  const hasChanges = filesModified.length > 0;
  if (timedOut) return hasChanges ? 'partial' : 'failure';
  if (agentError) return hasChanges ? 'partial' : 'failure';
  return 'success';
}

/** Cria emitter tipado que encapsula nodeId e timestamp. No-op se sem callback. */
function createEmitter(
  nodeId: string,
  onProgress?: (event: WorkerProgressEvent) => void,
): (type: WorkerProgressType, content: string) => void {
  if (!onProgress) return () => {};
  return (type, content) => {
    onProgress({ nodeId, type, content, timestamp: Date.now() });
  };
}
