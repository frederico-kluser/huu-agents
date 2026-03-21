/**
 * Planner pipeline — Planner LLM + Explorer agent + Zod validation.
 * Circuit breaker: max 3 Planner->Explorer cycles, 2 validation retries.
 * Uses native structured output per model via withStructuredOutput().
 * @module
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Runnable } from '@langchain/core/runnables';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { DAGSchema, type DAG } from '../schemas/dag.schema.js';
import { generatePlannerPrompt } from '../prompts/planner.js';
import { runExplorer } from '../agents/explorer.agent.js';

/** Configuration for the Planner pipeline */
export interface PlannerPipelineConfig {
  /** LLM model ID via OpenRouter (e.g., "openai/gpt-4.1") */
  readonly model: string;
  /** OpenRouter API key */
  readonly apiKey: string;
  /** Base URL for API (default: OpenRouter) */
  readonly baseUrl?: string;
  /** Repository root path for Explorer agent */
  readonly rootPath: string;
}

/** Successful DAG decomposition */
export interface PlannerDAGResult { readonly type: 'dag'; readonly dag: DAG }
/** Clarification needed from user */
export interface PlannerClarifyResult { readonly type: 'clarify'; readonly question: string }
/** Discriminated union of pipeline outcomes */
export type PlannerResult = PlannerDAGResult | PlannerClarifyResult;

/** Thrown when pipeline exhausts retries or exploration cycles */
export class PlannerPipelineError extends Error {
  constructor(
    message: string,
    public readonly cycles: number,
    public readonly retries: number,
  ) {
    super(message);
    this.name = 'PlannerPipelineError';
  }
}
const MAX_EXPLORATION_CYCLES = 3;
/** 2 retries after initial attempt = 3 total attempts */
const MAX_VALIDATION_RETRIES = 2;

/** Extracts provider from OpenRouter model ID (prefix before '/'). */
function extractProvider(model: string): string {
  const slash = model.indexOf('/');
  return slash > 0 ? model.slice(0, slash) : 'openai';
}

/** Builds user message with macro-task, file context, and exploration results. */
function buildUserMessage(
  macroTask: string,
  selectedFiles: readonly string[],
  explorationContext: string,
): string {
  const parts = [`Macro-task: ${macroTask}`];
  if (selectedFiles.length > 0) {
    parts.push(`Arquivos selecionados:\n${selectedFiles.join('\n')}`);
  }
  if (explorationContext) {
    parts.push(`Contexto da exploração:\n${explorationContext}`);
  }
  return parts.join('\n\n');
}

/**
 * Decomposes a macro-task into a validated DAG via Planner LLM.
 *
 * Flow: system prompt -> structured LLM call -> Zod validation -> action routing.
 * On request_exploration: invokes Explorer, appends context, re-invokes Planner.
 * On clarify: returns question to caller.
 * On validation failure: retries with Zod error feedback (max 2x).
 *
 * @param macroTask - High-level task to decompose into subtasks
 * @param selectedFiles - Repository file paths providing context
 * @param config - Model, API key, and repository configuration
 * @returns DAG decomposition or clarification request
 * @throws {PlannerPipelineError} All cycles or retries exhausted
 * @throws {Error} macroTask is empty
 * @example
 * const result = await planTask(
 *   "Adicionar validação Zod no endpoint /users",
 *   ["src/routes/users.ts"],
 *   { model: "openai/gpt-4.1", apiKey: "sk-or-...", rootPath: "/repo" }
 * );
 * if (result.type === 'dag') console.log(result.dag.nodes.length); // 2
 * if (result.type === 'clarify') console.log(result.question);
 */
export async function planTask(
  macroTask: string,
  selectedFiles: readonly string[],
  config: PlannerPipelineConfig,
): Promise<PlannerResult> {
  if (!macroTask.trim()) throw new Error('macroTask must not be empty');

  const provider = extractProvider(config.model);
  const systemPrompt = generatePlannerPrompt(provider);
  // withStructuredOutput auto-selects strategy per provider:
  // OpenAI/Gemini → JSON Schema mode (native), others → tool calling mode
  const structuredModel = new ChatOpenAI({
    model: config.model,
    temperature: 0,
    apiKey: config.apiKey,
    configuration: { baseURL: config.baseUrl ?? 'https://openrouter.ai/api/v1' },
  }).withStructuredOutput(DAGSchema);
  let explorationContext = '';

  for (let cycle = 0; cycle < MAX_EXPLORATION_CYCLES; cycle++) {
    const userContent = buildUserMessage(macroTask, selectedFiles, explorationContext);
    const dag = await invokeWithRetry(structuredModel, systemPrompt, userContent);

    if (dag.action === 'decompose') {
      return { type: 'dag', dag };
    }
    if (dag.action === 'clarify') {
      return { type: 'clarify', question: dag.metadata.macroTask };
    }

    if (dag.action !== 'request_exploration') {
      throw new PlannerPipelineError(`Unexpected action: ${dag.action}`, cycle, 0);
    }

    const explorerResult = await runExplorer(
      dag.metadata.macroTask,
      config.rootPath,
      { model: config.model, apiKey: config.apiKey, baseUrl: config.baseUrl },
    );
    explorationContext = explorerResult.summary;
  }

  throw new PlannerPipelineError(
    `Circuit breaker: ${MAX_EXPLORATION_CYCLES} Planner->Explorer cycles exhausted`,
    MAX_EXPLORATION_CYCLES,
    0,
  );
}
/** Formats Zod issues into a concise error string for LLM re-prompting. */
function formatZodError(
  error: { issues: ReadonlyArray<{ path: (string | number)[]; message: string }> },
): string {
  return error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
}

/**
 * Invokes structured model with validation retry loop.
 * On failure, re-invokes with Zod error appended to user content.
 *
 * @param model - Runnable from withStructuredOutput(DAGSchema)
 * @param systemPrompt - Planner system prompt (model-specific format)
 * @param userContent - User message with macro-task and file context
 * @returns Validated DAG on success
 * @throws {PlannerPipelineError} Validation failed after all retry attempts
 * @example
 * const dag = await invokeWithRetry(structuredModel, systemPrompt, userContent);
 * console.log(dag.action); // "decompose"
 */
async function invokeWithRetry(
  model: Runnable<BaseLanguageModelInput, DAG>,
  systemPrompt: string,
  userContent: string,
): Promise<DAG> {
  let lastError = '';

  for (let retry = 0; retry <= MAX_VALIDATION_RETRIES; retry++) {
    const content = retry === 0
      ? userContent
      : `${userContent}\n\nERRO DE VALIDAÇÃO (tentativa ${retry}/${MAX_VALIDATION_RETRIES}):\n${lastError}\n\nCorija o JSON conforme o schema.`;

    try {
      const result = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(content),
      ]);
      const parsed = DAGSchema.safeParse(result);
      if (parsed.success) return parsed.data;
      lastError = `ZodError: ${formatZodError(parsed.error)}`;
    } catch (error) {
      const name = error instanceof Error ? error.constructor.name : 'Unknown';
      const msg = error instanceof Error ? error.message : String(error);
      lastError = `${name}: ${msg}`;
    }
  }

  throw new PlannerPipelineError(
    `Validation failed after ${MAX_VALIDATION_RETRIES + 1} attempts: ${lastError}`,
    0,
    MAX_VALIDATION_RETRIES,
  );
}
