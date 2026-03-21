import { z } from 'zod';

/**
 * Configuration schema for the Pi DAG CLI application.
 * Validates and defines the shape of application configuration loaded from environment or config files.
 *
 * @example
 * const config = {
 *   openrouterApiKey: "sk-or-...",
 *   plannerModel: "openai/gpt-4.1",
 *   workerModel: "openai/gpt-4.1-mini",
 *   worktreeBasePath: "/tmp/.pi-dag-worktrees"
 * }
 *
 * const validated = ConfigSchema.parse(config);
 */
export const ConfigSchema = z.object({
  openrouterApiKey: z
    .string()
    .min(1)
    .describe('OpenRouter API key for LLM access'),
  plannerModel: z
    .string()
    .min(1)
    .default('openai/gpt-4.1')
    .describe('LLM model identifier for the planner agent'),
  workerModel: z
    .string()
    .min(1)
    .default('openai/gpt-4.1-mini')
    .describe('LLM model identifier for worker agents'),
  worktreeBasePath: z
    .string()
    .min(1)
    .default('.pi-dag-worktrees')
    .describe('Base path where worktrees are created'),
});

export type Config = z.infer<typeof ConfigSchema>;
