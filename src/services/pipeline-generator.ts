/**
 * AI-powered pipeline generator using LangChain.
 * Two-phase generation: (1) pipeline steps from user description,
 * (2) metadata (id, description) from generated pipeline.
 *
 * Uses ChatOpenAI via OpenRouter for model-agnostic generation.
 * Default model: deepseek/deepseek-chat, configurable to any supported model.
 *
 * @module
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import {
  WorkerProfileSchema,
  type WorkerProfile,
  type ProfileScope,
  validateProfileReferences,
} from '../schemas/worker-profile.schema.js';
import {
  generatePipelineStepsPrompt,
  generatePipelineMetadataPrompt,
} from '../prompts/pipeline-generator.prompt.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'deepseek/deepseek-chat';

/** Schema for the steps-generation LLM response (Call 1) */
const PipelineStepsResponseSchema = z.object({
  entryStepId: z.string().min(1),
  maxStepExecutions: z.number().int().min(1).max(100),
  initialVariables: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  steps: z.array(z.record(z.string(), z.unknown())).min(1),
});

/** Schema for metadata LLM response (Call 2) */
const MetadataResponseSchema = z.object({
  id: z.string().min(1).max(64),
  description: z.string().min(1),
});

/** Result type for pipeline generation */
export interface GeneratePipelineResult {
  readonly ok: true;
  readonly profile: WorkerProfile;
}

/** Error type for pipeline generation */
export interface GeneratePipelineError {
  readonly ok: false;
  readonly error: string;
  readonly phase: 'steps' | 'metadata' | 'validation';
  readonly raw?: string;
}

export type PipelineGenerationResult = GeneratePipelineResult | GeneratePipelineError;

/** Progress callback phases */
export type GenerationPhase = 'steps' | 'metadata' | 'validating' | 'done';

interface GeneratePipelineOptions {
  readonly description: string;
  readonly apiKey: string;
  readonly model?: string;
  readonly scope: ProfileScope;
  readonly seats: number;
  readonly onProgress?: (phase: GenerationPhase, message: string) => void;
}

/**
 * Extracts JSON from LLM response, handling markdown code fences.
 * LLMs sometimes wrap JSON in ```json ... ``` despite instructions.
 */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/m.exec(trimmed);
  return fenceMatch?.[1]?.trim() ?? trimmed;
}

/** Extracts provider name from model ID (e.g., "deepseek/deepseek-chat" → "deepseek") */
function extractProvider(model: string): string {
  const slash = model.indexOf('/');
  return slash > 0 ? model.slice(0, slash) : model;
}

/** Creates a ChatOpenAI instance configured for OpenRouter */
function createLlm(model: string, apiKey: string): ChatOpenAI {
  return new ChatOpenAI({
    model,
    temperature: 0.3,
    apiKey,
    configuration: { baseURL: OPENROUTER_BASE_URL },
  });
}

/** Invokes LLM with system + human messages, returns raw string */
async function invokeLlm(llm: ChatOpenAI, systemPrompt: string, userMsg: string): Promise<string> {
  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userMsg),
  ]);
  return typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);
}

/** Phase 1: Generate pipeline steps from user description */
async function generateSteps(
  llm: ChatOpenAI,
  provider: string,
  description: string,
): Promise<{ data: z.infer<typeof PipelineStepsResponseSchema> } | GeneratePipelineError> {
  let raw: string;
  try {
    raw = await invokeLlm(llm, generatePipelineStepsPrompt(provider), description);
  } catch (err) {
    return { ok: false, error: `LLM call failed: ${err instanceof Error ? err.message : String(err)}`, phase: 'steps' };
  }

  try {
    const parsed = JSON.parse(extractJson(raw)) as unknown;
    return { data: PipelineStepsResponseSchema.parse(parsed) };
  } catch (err) {
    return { ok: false, error: `Invalid steps JSON: ${err instanceof Error ? err.message : String(err)}`, phase: 'steps', raw };
  }
}

/** Phase 2: Generate metadata (id, description) from pipeline content */
async function generateMetadata(
  llm: ChatOpenAI,
  provider: string,
  stepsJson: string,
  userDescription: string,
): Promise<{ data: z.infer<typeof MetadataResponseSchema> } | GeneratePipelineError> {
  const userMsg = `Gere id e description para este pipeline:\n${stepsJson}\n\nDescrição original: "${userDescription}"`;
  let raw: string;
  try {
    raw = await invokeLlm(llm, generatePipelineMetadataPrompt(provider), userMsg);
  } catch (err) {
    return { ok: false, error: `Metadata LLM call failed: ${err instanceof Error ? err.message : String(err)}`, phase: 'metadata' };
  }

  try {
    const parsed = JSON.parse(extractJson(raw)) as unknown;
    return { data: MetadataResponseSchema.parse(parsed) };
  } catch (err) {
    return { ok: false, error: `Invalid metadata JSON: ${err instanceof Error ? err.message : String(err)}`, phase: 'metadata', raw };
  }
}

/** Phase 3: Assemble and validate the full profile */
function assembleProfile(
  stepsData: z.infer<typeof PipelineStepsResponseSchema>,
  metadata: z.infer<typeof MetadataResponseSchema>,
  scope: ProfileScope,
  seats: number,
): PipelineGenerationResult {
  const rawProfile = {
    id: metadata.id, description: metadata.description, scope,
    entryStepId: stepsData.entryStepId, maxStepExecutions: stepsData.maxStepExecutions,
    seats, initialVariables: stepsData.initialVariables, steps: stepsData.steps,
  };

  let profile: WorkerProfile;
  try {
    profile = WorkerProfileSchema.parse(rawProfile);
  } catch (err) {
    const zodErr = err instanceof z.ZodError
      ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : String(err);
    return { ok: false, error: `Schema validation failed: ${zodErr}`, phase: 'validation', raw: JSON.stringify(rawProfile, null, 2) };
  }

  const refErrors = validateProfileReferences(profile);
  if (refErrors.length > 0) {
    return { ok: false, error: `Reference validation: ${refErrors.join('; ')}`, phase: 'validation', raw: JSON.stringify(rawProfile, null, 2) };
  }

  return { ok: true, profile };
}

/**
 * Generates a complete WorkerProfile from a natural language description.
 * Two-phase approach: steps generation → metadata generation → validation.
 *
 * @param options - Generation configuration
 * @returns Generated profile or error with phase and raw response
 * @throws Never — errors are returned as PipelineGenerationError
 *
 * @example
 * const result = await generatePipeline({
 *   description: 'Pipeline que escreve testes e corrige até passar',
 *   apiKey: 'sk-or-...', scope: 'project', seats: 2,
 * });
 */
export async function generatePipeline(options: GeneratePipelineOptions): Promise<PipelineGenerationResult> {
  const { description, apiKey, scope, seats, onProgress } = options;
  const model = options.model ?? DEFAULT_MODEL;
  const provider = extractProvider(model);
  const llm = createLlm(model, apiKey);

  onProgress?.('steps', 'Gerando steps do pipeline...');
  const stepsResult = await generateSteps(llm, provider, description);
  if (!('data' in stepsResult)) return stepsResult;

  onProgress?.('metadata', 'Gerando metadados (id, descrição)...');
  const metaResult = await generateMetadata(llm, provider, JSON.stringify(stepsResult.data, null, 2), description);
  if (!('data' in metaResult)) return metaResult;

  onProgress?.('validating', 'Validando pipeline...');
  const result = assembleProfile(stepsResult.data, metaResult.data, scope, seats);

  if (result.ok) onProgress?.('done', 'Pipeline gerado com sucesso!');
  return result;
}
