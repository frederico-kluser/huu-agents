/**
 * Schema Zod para estado efêmero de execução do pipeline.
 * Vive apenas durante uma execução de pipeline — projetado
 * no WorkerResult trace ao final.
 *
 * Separado do worker-profile.schema para manter SRP.
 * Baseado na abordagem wXTUC com timestamps epoch do 6sD5N.
 *
 * @module
 */

import { z } from 'zod';
import type { InitialVariableValue } from './worker-profile.schema.js';

// ── Step trace entry ──────────────────────────────────────────────

/**
 * Registra uma execução de step na pipeline trace.
 * Usado para observabilidade (PipelineTrace component) e
 * persistido no WorkerResult.
 *
 * @example
 * const entry: StepTraceEntry = {
 *   stepId: 'write-tests', type: 'pi_agent',
 *   startedAt: 1711180800000, finishedAt: 1711180883456,
 *   outcome: 'ok', error: null,
 * };
 */
export const StepTraceEntrySchema = z.object({
  stepId: z.string().min(1),
  type: z.string().min(1),
  startedAt: z.number().describe('Timestamp epoch ms'),
  finishedAt: z.number().describe('Timestamp epoch ms'),
  outcome: z.enum(['ok', 'error', 'skipped']),
  error: z.string().nullable().default(null),
});
export type StepTraceEntry = z.infer<typeof StepTraceEntrySchema>;

// ── Reserved variables ────────────────────────────────────────────

/**
 * Variáveis reservadas com semântica definida pelo runtime.
 * - task: descrição da tarefa (pode ser sobrescrita por steps)
 * - diff: diff do worktree (populada por git_diff step)
 * - error: último erro (populada pelo runtime em falhas)
 */
export const ReservedVarsSchema = z.object({
  task: z.string().describe('Current task description'),
  diff: z.string().default('').describe('Current worktree diff'),
  error: z.string().default('').describe('Last error message'),
});
export type ReservedVars = z.infer<typeof ReservedVarsSchema>;

// ── Full pipeline state ───────────────────────────────────────────

/**
 * Estado completo de runtime de uma execução de pipeline.
 * Efêmero — criado fresh para cada execução de worker com perfil.
 *
 * @example
 * const state: WorkerPipelineState = {
 *   currentStepId: 'write-tests',
 *   reservedVars: { task: 'Fix auth bug', diff: '', error: '' },
 *   customVars: { custom_tries: 0 },
 *   trace: [],
 *   stepExecutionCount: 0,
 *   status: 'running',
 *   failureReason: null,
 * };
 */
export const WorkerPipelineStateSchema = z.object({
  currentStepId: z.string().min(1).describe('ID of the step currently executing'),
  reservedVars: ReservedVarsSchema,
  customVars: z.record(z.string(), z.unknown()).default({}).describe('User-defined custom_* variables'),
  trace: z.array(StepTraceEntrySchema).default([]),
  stepExecutionCount: z.number().int().nonnegative().default(0),
  status: z.enum(['running', 'succeeded', 'failed']).default('running'),
  failureReason: z.string().nullable().default(null),
});
export type WorkerPipelineState = z.infer<typeof WorkerPipelineStateSchema>;

// ── Factory ───────────────────────────────────────────────────────

/**
 * Cria estado inicial para uma execução de pipeline.
 *
 * @param entryStepId - ID do step inicial (do perfil)
 * @param task - Descrição da tarefa do DAG node
 * @param initialVariables - Valores iniciais para variáveis custom_*
 * @returns Estado inicial limpo
 */
export function createInitialState(
  entryStepId: string,
  task: string,
  initialVariables: Readonly<Record<string, InitialVariableValue>>,
): WorkerPipelineState {
  return {
    currentStepId: entryStepId,
    reservedVars: { task, diff: '', error: '' },
    customVars: { ...initialVariables },
    trace: [],
    stepExecutionCount: 0,
    status: 'running',
    failureReason: null,
  };
}
