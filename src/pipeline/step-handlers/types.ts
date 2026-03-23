/**
 * Tipos de contrato para step handlers.
 * Baseado em wXTUC (tipos em arquivo dedicado) com interface de 6sD5N.
 *
 * @module
 */

import type { WorkerStep, WorkerProfile } from '../../schemas/worker-profile.schema.js';
import type { WorkerPipelineState } from '../../schemas/worker-pipeline-state.schema.js';

/**
 * Contexto passado a todo step handler durante execução.
 * Provê acesso ao worktree, profile config, e progresso.
 */
export interface StepHandlerContext {
  /** Caminho absoluto do worktree isolado do worker */
  readonly worktreePath: string;
  /** Perfil ativo (para model overrides e metadados) */
  readonly profile: WorkerProfile;
  /** API key do OpenRouter para steps de IA */
  readonly apiKey: string;
  /** Callback para reportar progresso durante steps longos */
  readonly onProgress?: (message: string) => void;
}

/**
 * Resultado retornado por um step handler.
 * - nextStepId: próximo step (null = fim da pipeline)
 * - stateUpdates: mudanças parciais a aplicar no state
 */
export interface StepHandlerResult {
  readonly nextStepId: string | null;
  readonly stateUpdates?: {
    readonly reservedVars?: Partial<WorkerPipelineState['reservedVars']>;
    readonly customVars?: Record<string, unknown>;
  };
}

/**
 * Assinatura de um step handler.
 * Recebe step definition, state atual, e contexto.
 * Retorna resultado com próximo step e atualizações de estado.
 *
 * @throws {Error} Em falhas irrecuperáveis
 * @throws {PipelineFailError} Em falhas de negócio (fail step)
 */
export type StepHandler = (
  step: WorkerStep,
  state: WorkerPipelineState,
  ctx: StepHandlerContext,
) => Promise<StepHandlerResult>;
