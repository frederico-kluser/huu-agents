import { z } from 'zod';

/**
 * Schema para os agentes selecionados (planner e worker).
 *
 * @example
 * ```ts
 * const agents = { planner: 'openai/gpt-5.4', worker: 'xiaomi/mimo-v2-flash' };
 * SelectedAgentsSchema.parse(agents);
 * ```
 */
export const SelectedAgentsSchema = z.object({
  planner: z.string().min(1).describe('Modelo selecionado para o planner'),
  worker: z.string().min(1).describe('Modelo selecionado para os workers'),
});

export type SelectedAgents = z.infer<typeof SelectedAgentsSchema>;

/**
 * Schema bruto do arquivo de configuração (antes do transform).
 * Aceita tanto formato legado (plannerModel/workerModel) quanto
 * formato novo (selectedAgents), ou ambos.
 */
const RawConfigSchema = z.object({
  openrouterApiKey: z
    .string()
    .min(1)
    .describe('OpenRouter API key for LLM access'),
  plannerModel: z
    .string()
    .min(1)
    .optional()
    .describe('(Legado) LLM model identifier for the planner agent'),
  workerModel: z
    .string()
    .min(1)
    .optional()
    .describe('(Legado) LLM model identifier for worker agents'),
  selectedAgents: SelectedAgentsSchema.optional()
    .describe('Agentes selecionados para planner e worker'),
  worktreeBasePath: z
    .string()
    .min(1)
    .default('.pi-dag-worktrees')
    .describe('Base path where worktrees are created'),
});

const DEFAULT_PLANNER = 'openai/gpt-4.1';
const DEFAULT_WORKER = 'openai/gpt-4.1-mini';

/**
 * Configuration schema for the Pi DAG CLI application.
 * Suporta formato legado (plannerModel/workerModel) e formato novo (selectedAgents).
 *
 * Precedência: selectedAgents > plannerModel/workerModel > defaults.
 * O transform garante que ambos os formatos ficam sincronizados na saída.
 *
 * @example
 * ```ts
 * // Formato novo
 * ConfigSchema.parse({
 *   openrouterApiKey: 'sk-or-...',
 *   selectedAgents: { planner: 'openai/gpt-5.4', worker: 'xiaomi/mimo-v2-flash' },
 * });
 *
 * // Formato legado (migração automática)
 * ConfigSchema.parse({
 *   openrouterApiKey: 'sk-or-...',
 *   plannerModel: 'openai/gpt-5.4',
 *   workerModel: 'xiaomi/mimo-v2-flash',
 * });
 * ```
 */
export const ConfigSchema = RawConfigSchema.transform((raw) => {
  // selectedAgents tem precedência sobre campos legados
  const planner = raw.selectedAgents?.planner ?? raw.plannerModel ?? DEFAULT_PLANNER;
  const worker = raw.selectedAgents?.worker ?? raw.workerModel ?? DEFAULT_WORKER;

  return {
    openrouterApiKey: raw.openrouterApiKey,
    plannerModel: planner,
    workerModel: worker,
    selectedAgents: { planner, worker },
    worktreeBasePath: raw.worktreeBasePath,
  };
});

export type Config = z.output<typeof ConfigSchema>;
