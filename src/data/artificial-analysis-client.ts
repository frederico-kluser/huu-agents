/**
 * Client para a API da Artificial Analysis.
 * Busca benchmarks, pricing e velocidade de LLMs em tempo real.
 * Cache em memoria (TTL 24h para benchmarks, 3h para velocidade).
 *
 * @module
 */

import { z } from 'zod';

// ── Schemas ─────────────────────────────────────────────────────────

const AAModelCreatorSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

const AAEvaluationsSchema = z.object({
  artificial_analysis_intelligence_index: z.number().nullable().catch(null),
  artificial_analysis_coding_index: z.number().nullable().catch(null),
  artificial_analysis_math_index: z.number().nullable().catch(null),
  mmlu_pro: z.number().nullable().catch(null),
  gpqa: z.number().nullable().catch(null),
  hle: z.number().nullable().catch(null),
  livecodebench: z.number().nullable().catch(null),
  scicode: z.number().nullable().catch(null),
  math_500: z.number().nullable().catch(null),
  aime: z.number().nullable().catch(null),
});

const AAPricingSchema = z.object({
  price_1m_blended_3_to_1: z.number().nullable().catch(null),
  price_1m_input_tokens: z.number().nullable().catch(null),
  price_1m_output_tokens: z.number().nullable().catch(null),
});

const AAModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  model_creator: AAModelCreatorSchema,
  evaluations: AAEvaluationsSchema.catch({
    artificial_analysis_intelligence_index: null,
    artificial_analysis_coding_index: null,
    artificial_analysis_math_index: null,
    mmlu_pro: null, gpqa: null, hle: null,
    livecodebench: null, scicode: null, math_500: null, aime: null,
  }),
  pricing: AAPricingSchema.catch({
    price_1m_blended_3_to_1: null,
    price_1m_input_tokens: null,
    price_1m_output_tokens: null,
  }),
  median_output_tokens_per_second: z.number().nullable().catch(null),
  median_time_to_first_token_seconds: z.number().nullable().catch(null),
  median_time_to_first_answer_token: z.number().nullable().catch(null),
});

export type AAModel = z.infer<typeof AAModelSchema>;
export type AAEvaluations = z.infer<typeof AAEvaluationsSchema>;

const AAResponseSchema = z.object({
  status: z.number(),
  data: z.array(AAModelSchema),
});

// ── Types ───────────────────────────────────────────────────────────

export type FetchAAResult =
  | { readonly ok: true; readonly models: readonly AAModel[] }
  | { readonly ok: false; readonly error: string };

// ── Constants ───────────────────────────────────────────────────────

const BASE_URL = 'https://artificialanalysis.ai/api/v2';
const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h para benchmarks

// ── Cache ───────────────────────────────────────────────────────────

let cachedAAModels: readonly AAModel[] | null = null;
let aaCacheTimestamp = 0;

/**
 * Verifica se o cache AA ainda e valido.
 *
 * @returns true se cache existe e nao expirou
 * @example
 * ```ts
 * if (isAACacheValid()) console.log('Cache hit');
 * ```
 */
export const isAACacheValid = (): boolean =>
  cachedAAModels !== null && Date.now() - aaCacheTimestamp < CACHE_TTL_MS;

/**
 * Retorna modelos AA do cache sem fetch.
 *
 * @returns Modelos cacheados ou null
 * @example
 * ```ts
 * const cached = getCachedAAModels();
 * ```
 */
export const getCachedAAModels = (): readonly AAModel[] | null =>
  isAACacheValid() ? cachedAAModels : null;

/**
 * Invalida cache AA forcando novo fetch.
 *
 * @example
 * ```ts
 * invalidateAACache();
 * ```
 */
export const invalidateAACache = (): void => {
  cachedAAModels = null;
  aaCacheTimestamp = 0;
};

// ── Fetch ───────────────────────────────────────────────────────────

/**
 * Busca modelos LLM da Artificial Analysis API com benchmarks e pricing.
 * Usa cache em memoria (TTL 24h).
 *
 * @param apiKey - API key da Artificial Analysis (header x-api-key)
 * @param promptLength - Workload de velocidade: 'medium' | 'long' | '100k'
 * @returns Result com array de modelos ou erro
 * @throws Nunca — retorna Result pattern
 * @example
 * ```ts
 * const result = await fetchAAModels('aa-key-123');
 * if (result.ok) console.log(`${result.models.length} modelos`);
 * ```
 */
export const fetchAAModels = async (
  apiKey: string,
  promptLength: 'medium' | 'long' | '100k' = 'medium',
): Promise<FetchAAResult> => {
  if (isAACacheValid() && cachedAAModels) {
    return { ok: true, models: cachedAAModels };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const url = `${BASE_URL}/data/llms/models?prompt_length=${promptLength}&parallel_queries=1`;
      const response = await fetch(url, {
        headers: { 'x-api-key': apiKey },
        signal: controller.signal,
      });

      if (response.status === 401) {
        return { ok: false, error: 'API key da Artificial Analysis invalida ou ausente.' };
      }
      if (response.status === 429) {
        return { ok: false, error: 'Rate limit da Artificial Analysis atingido (1000 req/dia).' };
      }
      if (!response.ok) {
        return { ok: false, error: `Artificial Analysis erro HTTP ${response.status}` };
      }

      const json: unknown = await response.json();
      const parsed = AAResponseSchema.safeParse(json);

      if (!parsed.success) {
        return { ok: false, error: `Resposta invalida da Artificial Analysis: ${parsed.error.message}` };
      }

      cachedAAModels = parsed.data.data;
      aaCacheTimestamp = Date.now();

      return { ok: true, models: parsed.data.data };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, error: 'Timeout ao buscar dados da Artificial Analysis (15s)' };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido ao buscar Artificial Analysis',
    };
  }
};

/**
 * Normaliza o slug/nome de um modelo AA para facilitar matching com IDs OpenRouter.
 * Remove espacos, converte para lowercase, remove sufixos de versao comuns.
 *
 * @param name - Nome ou slug do modelo AA
 * @returns String normalizada para matching
 * @example
 * ```ts
 * normalizeAAName('Claude 3.5 Sonnet') // 'claude3.5sonnet'
 * ```
 */
export const normalizeAAName = (name: string): string =>
  name.toLowerCase().replace(/[\s\-_]/g, '').replace(/[()]/g, '');
