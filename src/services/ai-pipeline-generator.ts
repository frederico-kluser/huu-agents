/**
 * Serviço de geração automática de pipeline profiles via LangChain.
 *
 * Duas chamadas LLM sequenciais:
 * 1. Gerar steps da pipeline a partir de descrição natural
 * 2. Gerar metadata (id, description) a partir dos steps gerados
 *
 * Usa ChatOpenAI via OpenRouter. Modelo default: deepseek/deepseek-chat,
 * configurável para qualquer modelo suportado pelo LangChain.
 *
 * @module
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import {
  WorkerProfileSchema,
  validateProfileReferences,
  type WorkerProfile,
  type ProfileScope,
} from '../schemas/worker-profile.schema.js';
import {
  buildStepsSystemPrompt,
  buildStepsUserPrompt,
  buildMetadataSystemPrompt,
  buildMetadataUserPrompt,
} from '../prompts/pipeline-builder.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Modelo padrão para geração de pipelines */
export const DEFAULT_BUILDER_MODEL = 'deepseek/deepseek-chat';

// ── Result type ──────────────────────────────────────────────────

/** Erro discriminado da geração de pipeline */
export type GeneratorErrorKind =
  | { readonly kind: 'llm_error'; readonly detail: string }
  | { readonly kind: 'parse_error'; readonly detail: string }
  | { readonly kind: 'validation_error'; readonly detail: string };

type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: GeneratorErrorKind };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: GeneratorErrorKind): Result<T> => ({ ok: false, error });

// ── Schema para resposta parcial do LLM ──────────────────────────

/** Schema para a primeira chamada: steps + config */
const StepsResponseSchema = z.object({
  entryStepId: z.string().min(1),
  maxStepExecutions: z.number().int().min(1).max(100).default(20),
  initialVariables: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  steps: z.array(z.record(z.string(), z.unknown())).min(1),
});

/** Schema para a segunda chamada: metadata */
const MetadataResponseSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  description: z.string().default(''),
});

// ── Config ────────────────────────────────────────────────────────

/** Parâmetros para geração de pipeline */
export interface GeneratePipelineConfig {
  /** Descrição natural do pipeline desejado */
  readonly userDescription: string;
  /** API key para OpenRouter */
  readonly apiKey: string;
  /** Escopo de persistência */
  readonly scope: ProfileScope;
  /** Número de workers paralelos (seats) */
  readonly seats: number;
  /** Modelo LLM a usar (default: deepseek/deepseek-chat) */
  readonly model?: string;
  /** Callback de progresso para UI */
  readonly onProgress?: (message: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Extrai JSON de uma resposta LLM que pode conter markdown fences.
 *
 * @param raw - Texto bruto da resposta
 * @returns String JSON limpa
 */
const extractJson = (raw: string): string => {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  // Tenta encontrar o primeiro { ... } ou [ ... ]
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  return braceMatch ? braceMatch[0] : raw.trim();
};

/**
 * Invoca LLM com system + user message e retorna texto da resposta.
 *
 * @param llm - Instância ChatOpenAI configurada
 * @param systemPrompt - Prompt de sistema
 * @param userPrompt - Prompt do usuário
 * @returns Texto da resposta
 */
const callLlm = async (
  llm: ChatOpenAI,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> => {
  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);
  return typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);
};

// ── Phase helpers ─────────────────────────────────────────────────

/**
 * Phase 1: Gera steps da pipeline via LLM.
 *
 * @param llm - Instância ChatOpenAI configurada
 * @param userDescription - Descrição natural do pipeline
 * @returns Steps parseados ou erro
 */
async function generateSteps(
  llm: ChatOpenAI,
  userDescription: string,
): Promise<Result<z.infer<typeof StepsResponseSchema>>> {
  let raw: string;
  try {
    raw = await callLlm(llm, buildStepsSystemPrompt(), buildStepsUserPrompt(userDescription));
  } catch (e) {
    return err({ kind: 'llm_error', detail: e instanceof Error ? e.message : 'Unknown LLM error' });
  }

  try {
    const parsed: unknown = JSON.parse(extractJson(raw));
    return ok(StepsResponseSchema.parse(parsed));
  } catch (e) {
    return err({ kind: 'parse_error', detail: `Steps: ${e instanceof Error ? e.message : 'Invalid JSON'}` });
  }
}

/**
 * Phase 2: Gera metadata (id, description) do perfil via LLM.
 *
 * @param llm - Instância ChatOpenAI configurada
 * @param userDescription - Descrição original
 * @param stepsJson - JSON dos steps gerados
 * @returns Metadata parseada ou erro
 */
async function generateMetadata(
  llm: ChatOpenAI,
  userDescription: string,
  stepsJson: string,
): Promise<Result<z.infer<typeof MetadataResponseSchema>>> {
  let raw: string;
  try {
    raw = await callLlm(llm, buildMetadataSystemPrompt(), buildMetadataUserPrompt(userDescription, stepsJson));
  } catch (e) {
    return err({ kind: 'llm_error', detail: `Metadata: ${e instanceof Error ? e.message : 'Unknown'}` });
  }

  try {
    const parsed: unknown = JSON.parse(extractJson(raw));
    return ok(MetadataResponseSchema.parse(parsed));
  } catch (e) {
    return err({ kind: 'parse_error', detail: `Metadata: ${e instanceof Error ? e.message : 'Invalid JSON'}` });
  }
}

/**
 * Phase 3: Monta e valida o perfil completo com Zod + integridade referencial.
 *
 * @param metadata - id e description gerados
 * @param steps - Steps e config gerados
 * @param scope - Escopo do perfil
 * @param seats - Paralelismo
 * @returns Profile validado ou erro
 */
function assembleAndValidate(
  metadata: z.infer<typeof MetadataResponseSchema>,
  steps: z.infer<typeof StepsResponseSchema>,
  scope: ProfileScope,
  seats: number,
): Result<WorkerProfile> {
  const validation = WorkerProfileSchema.safeParse({
    id: metadata.id,
    description: metadata.description,
    scope,
    entryStepId: steps.entryStepId,
    maxStepExecutions: steps.maxStepExecutions,
    seats,
    initialVariables: steps.initialVariables,
    steps: steps.steps,
  });

  if (!validation.success) {
    return err({ kind: 'validation_error', detail: validation.error.issues.map((i) => i.message).join('; ') });
  }

  const refErrors = validateProfileReferences(validation.data);
  if (refErrors.length > 0) {
    return err({ kind: 'validation_error', detail: refErrors.join('; ') });
  }

  return ok(validation.data);
}

// ── Main ──────────────────────────────────────────────────────────

/**
 * Gera um pipeline profile completo a partir de descrição natural.
 * Três fases: (1) gerar steps, (2) gerar metadata, (3) montar e validar.
 *
 * @param config - Parâmetros de geração
 * @returns Profile validado ou erro tipado
 *
 * @example
 * const result = await generatePipeline({
 *   userDescription: 'Write tests, fix code, retry 3 times',
 *   apiKey: 'sk-or-...', scope: 'project', seats: 2,
 * });
 * if (result.ok) console.log(result.value.id);
 */
export async function generatePipeline(
  config: GeneratePipelineConfig,
): Promise<Result<WorkerProfile>> {
  const llm = new ChatOpenAI({
    model: config.model ?? DEFAULT_BUILDER_MODEL,
    temperature: 0.2,
    apiKey: config.apiKey,
    configuration: { baseURL: OPENROUTER_BASE_URL },
  });

  config.onProgress?.('Gerando steps da pipeline...');
  const stepsResult = await generateSteps(llm, config.userDescription);
  if (!stepsResult.ok) return stepsResult;

  config.onProgress?.('Gerando metadata do perfil...');
  const metaResult = await generateMetadata(llm, config.userDescription, JSON.stringify(stepsResult.value, null, 2));
  if (!metaResult.ok) return metaResult;

  config.onProgress?.('Validando pipeline...');
  const profileResult = assembleAndValidate(metaResult.value, stepsResult.value, config.scope, config.seats);
  if (profileResult.ok) config.onProgress?.('Pipeline gerada com sucesso!');

  return profileResult;
}
