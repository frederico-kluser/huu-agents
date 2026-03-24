/**
 * Serviço de geração automática de Worker Pipeline Profiles via LangChain.
 * Duas chamadas LLM: (1) gerar steps da pipeline, (2) gerar metadata.
 * Resultado é validado com Zod antes de retornar.
 *
 * Usa ChatOpenAI via OpenRouter — modelo default deepseek/deepseek-chat,
 * trocável para qualquer modelo suportado.
 *
 * @module
 */

import { z } from 'zod';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import {
  WorkerProfileSchema,
  WorkerStepSchema,
  validateProfileReferences,
  type WorkerProfile,
  type ProfileScope,
} from '../schemas/worker-profile.schema.js';
import {
  buildPipelineStepsPrompt,
  buildPipelineMetadataPrompt,
} from '../prompts/pipeline-builder.prompt.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'deepseek/deepseek-chat';

// ── Result type ────────────────────────────────────────────────────

/** Tipos de erro discriminados para geração de pipeline */
export type GenerationErrorKind =
  | { readonly kind: 'llm_error'; readonly detail: string }
  | { readonly kind: 'parse_error'; readonly detail: string }
  | { readonly kind: 'validation_error'; readonly detail: string }
  | { readonly kind: 'reference_error'; readonly detail: string };

type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: GenerationErrorKind };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: GenerationErrorKind): Result<T> => ({ ok: false, error });

// ── Internal schemas for partial validation ────────────────────────

/** Schema para o output parcial da Request 1 (sem id/description/scope) */
const PipelineBodySchema = z.object({
  entryStepId: z.string().min(1),
  maxStepExecutions: z.number().int().min(1).max(100).default(20),
  initialVariables: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  steps: z.array(WorkerStepSchema).min(1),
});

/** Schema para o output da Request 2 (metadata) */
const PipelineMetadataSchema = z.object({
  id: z.string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  description: z.string().max(200).default(''),
});

// ── Config ─────────────────────────────────────────────────────────

/** Parâmetros para geração de pipeline */
export interface GeneratePipelineConfig {
  /** Descrição livre do que o pipeline deve fazer */
  readonly userDescription: string;
  /** Escopo de persistência do perfil */
  readonly scope: ProfileScope;
  /** Seats (paralelismo por wave) */
  readonly seats: number;
  /** API key do OpenRouter */
  readonly apiKey: string;
  /** Modelo LangChain a usar (default: deepseek/deepseek-chat) */
  readonly model?: string;
  /** Callback de progresso para UI */
  readonly onProgress?: (message: string) => void;
}

// ── LLM helpers ────────────────────────────────────────────────────

/**
 * Cria instância ChatOpenAI via OpenRouter.
 * Temperature baixa para output JSON determinístico.
 */
function createLlm(apiKey: string, model: string): ChatOpenAI {
  return new ChatOpenAI({
    model,
    temperature: 0.2,
    apiKey,
    configuration: { baseURL: OPENROUTER_BASE_URL },
  });
}

/**
 * Extrai JSON de uma resposta LLM que pode conter markdown fences.
 * Tenta parse direto primeiro, depois extrai de code blocks.
 *
 * @param raw - Texto cru da resposta
 * @returns Objeto parseado
 * @throws SyntaxError se não encontrar JSON válido
 */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();

  // Tenta parse direto (caso ideal: LLM retornou JSON puro)
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fallback: extrai de markdown code fences
  }

  const fenceMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/.exec(trimmed);
  if (fenceMatch?.[1]) {
    return JSON.parse(fenceMatch[1]);
  }

  // Último recurso: encontra primeiro { e último }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  throw new SyntaxError('No valid JSON found in LLM response');
}

// ── Main generator ─────────────────────────────────────────────────

/**
 * Gera um WorkerProfile completo a partir de descrição em linguagem natural.
 * Duas chamadas LLM sequenciais: steps → metadata.
 * Resultado validado com Zod + referential integrity check.
 *
 * @param config - Parâmetros de geração
 * @returns WorkerProfile validado ou erro tipado
 *
 * @example
 * const result = await generatePipeline({
 *   userDescription: 'Gere testes e corrija até passar',
 *   scope: 'project',
 *   seats: 2,
 *   apiKey: 'sk-or-...',
 * });
 * if (result.ok) console.log(result.value.id);
 */
export async function generatePipeline(config: GeneratePipelineConfig): Promise<Result<WorkerProfile>> {
  const model = config.model ?? DEFAULT_MODEL;
  const llm = createLlm(config.apiKey, model);

  // ── Request 1: Gerar steps ─────────────────────────────────────
  config.onProgress?.('Gerando pipeline steps...');

  let pipelineBody: z.infer<typeof PipelineBodySchema>;
  try {
    const stepsPrompt = buildPipelineStepsPrompt(config.userDescription);
    const stepsResponse = await llm.invoke([new HumanMessage(stepsPrompt)]);
    const rawSteps = typeof stepsResponse.content === 'string'
      ? stepsResponse.content
      : JSON.stringify(stepsResponse.content);

    const parsed = extractJson(rawSteps);
    const validation = PipelineBodySchema.safeParse(parsed);
    if (!validation.success) {
      return err({
        kind: 'validation_error',
        detail: validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }
    pipelineBody = validation.data;
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : 'Unknown error generating steps';
    const kind = detail.includes('JSON') ? 'parse_error' as const : 'llm_error' as const;
    return err({ kind, detail });
  }

  // ── Request 2: Gerar metadata ──────────────────────────────────
  config.onProgress?.('Gerando metadata (id, descricao)...');

  let metadata: z.infer<typeof PipelineMetadataSchema>;
  try {
    const metaPrompt = buildPipelineMetadataPrompt(JSON.stringify(pipelineBody, null, 2));
    const metaResponse = await llm.invoke([new HumanMessage(metaPrompt)]);
    const rawMeta = typeof metaResponse.content === 'string'
      ? metaResponse.content
      : JSON.stringify(metaResponse.content);

    const parsed = extractJson(rawMeta);
    const validation = PipelineMetadataSchema.safeParse(parsed);
    if (!validation.success) {
      return err({
        kind: 'validation_error',
        detail: `Metadata: ${validation.error.issues.map((i) => i.message).join('; ')}`,
      });
    }
    metadata = validation.data;
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : 'Unknown error generating metadata';
    const kind = detail.includes('JSON') ? 'parse_error' as const : 'llm_error' as const;
    return err({ kind, detail });
  }

  // ── Montar e validar perfil completo ───────────────────────────
  config.onProgress?.('Validando pipeline...');

  const rawProfile = {
    ...metadata,
    scope: config.scope,
    seats: config.seats,
    ...pipelineBody,
  };

  const fullValidation = WorkerProfileSchema.safeParse(rawProfile);
  if (!fullValidation.success) {
    return err({
      kind: 'validation_error',
      detail: fullValidation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
  }

  const profile = fullValidation.data;

  // Valida integridade referencial (targets apontam para steps existentes)
  const refErrors = validateProfileReferences(profile);
  if (refErrors.length > 0) {
    return err({ kind: 'reference_error', detail: refErrors.join('; ') });
  }

  return ok(profile);
}
