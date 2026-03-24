/**
 * Client para a API de modelos da OpenRouter.
 * Busca modelos em tempo real com cache em memória (TTL 1h).
 * Filtra apenas modelos de texto criados a partir de 2025.
 *
 * @module
 */

import { z } from 'zod';

/** Schema de um modelo retornado pela OpenRouter API */
const OpenRouterPricingSchema = z.object({
  prompt: z.string().default('0'),
  completion: z.string().default('0'),
  request: z.string().default('0'),
  image: z.string().default('0'),
});

const OpenRouterArchitectureSchema = z.object({
  modality: z.string().default('text->text'),
  input_modalities: z.array(z.string()).default(['text']),
  output_modalities: z.array(z.string()).default(['text']),
  tokenizer: z.string().default('unknown'),
  instruct_type: z.string().nullable().default(null),
});

const OpenRouterTopProviderSchema = z.object({
  context_length: z.number().nullable().default(null),
  max_completion_tokens: z.number().nullable().default(null),
  is_moderated: z.boolean().default(false),
});

const OpenRouterModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  created: z.number(),
  description: z.string().default(''),
  context_length: z.number().default(0),
  architecture: OpenRouterArchitectureSchema.default({}),
  pricing: OpenRouterPricingSchema.default({}),
  top_provider: OpenRouterTopProviderSchema.default({}),
  supported_parameters: z.array(z.string()).default([]),
  per_request_limits: z.record(z.string()).nullable().default(null),
});

export type OpenRouterModel = z.infer<typeof OpenRouterModelSchema>;

const ModelsResponseSchema = z.object({
  data: z.array(OpenRouterModelSchema),
});

/** Resultado tipado para operações de fetch */
export type FetchModelsResult =
  | { readonly ok: true; readonly models: readonly OpenRouterModel[] }
  | { readonly ok: false; readonly error: string };

const API_URL = 'https://openrouter.ai/api/v1/models';
const FETCH_TIMEOUT_MS = 15_000;

/** Timestamp Unix para 1 de Janeiro de 2025 */
const YEAR_2025_UNIX = 1735689600;

/** Cache em memória com TTL */
let cachedModels: readonly OpenRouterModel[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

/**
 * Semeia o cache em memória com dados carregados do disco.
 * Usado pelo sistema de cache offline para evitar fetch desnecessario.
 * Nao sobrescreve cache existente que ainda esteja valido.
 *
 * @param models - Modelos previamente salvos em disco
 * @param timestamp - Timestamp epoch de quando os dados foram salvos
 */
export const seedCache = (models: readonly OpenRouterModel[], timestamp: number): void => {
  if (cachedModels !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS) return;
  cachedModels = models;
  cacheTimestamp = timestamp;
};

/**
 * Converte string de preço por token para USD por milhão de tokens.
 *
 * @param pricePerToken - Preço em USD por token (string da API)
 * @returns Preço em USD por 1M tokens
 * @example
 * ```ts
 * tokenPriceToPerMillion('0.000001') // 1.0
 * tokenPriceToPerMillion('0.0000003') // 0.3
 * ```
 */
export const tokenPriceToPerMillion = (pricePerToken: string): number => {
  const num = parseFloat(pricePerToken);
  if (Number.isNaN(num)) return 0;
  return +(num * 1_000_000).toFixed(4);
};

/**
 * Extrai o provider (autor) do ID do modelo OpenRouter.
 *
 * @param modelId - ID no formato "autor/modelo"
 * @returns Nome do provider capitalizado
 * @example
 * ```ts
 * extractProviderName('openai/gpt-4') // 'openai'
 * extractProviderName('anthropic/claude-3') // 'anthropic'
 * ```
 */
export const extractProviderName = (modelId: string): string => {
  const slash = modelId.indexOf('/');
  return slash > 0 ? modelId.slice(0, slash) : modelId;
};

/**
 * Verifica se o cache de modelos ainda é válido.
 *
 * @returns true se o cache existe e não expirou
 */
export const isCacheValid = (): boolean =>
  cachedModels !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS;

/**
 * Retorna modelos do cache sem fazer fetch.
 * Retorna null se cache inexistente ou expirado.
 *
 * @returns Modelos cacheados ou null
 */
export const getCachedModels = (): readonly OpenRouterModel[] | null =>
  isCacheValid() ? cachedModels : null;

/**
 * Invalida o cache forçando novo fetch na próxima chamada.
 */
export const invalidateCache = (): void => {
  cachedModels = null;
  cacheTimestamp = 0;
};

/**
 * Busca modelos de texto da OpenRouter criados a partir de 2025.
 * Usa cache em memória (TTL 1h) para evitar requests desnecessárias.
 * Não requer autenticação (endpoint público).
 *
 * @param apiKey - API key opcional (melhora rate limits)
 * @returns Result com array de modelos ou erro
 * @example
 * ```ts
 * const result = await fetchOpenRouterModels();
 * if (result.ok) {
 *   console.log(`${result.models.length} modelos carregados`);
 * }
 * ```
 */
export const fetchOpenRouterModels = async (
  apiKey?: string,
): Promise<FetchModelsResult> => {
  // Retorna cache se válido
  if (isCacheValid() && cachedModels) {
    return { ok: true, models: cachedModels };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const response = await fetch(API_URL, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        return { ok: false, error: `OpenRouter API erro HTTP ${response.status}` };
      }

      const json: unknown = await response.json();
      const parsed = ModelsResponseSchema.safeParse(json);

      if (!parsed.success) {
        return { ok: false, error: `Resposta invalida da OpenRouter: ${parsed.error.message}` };
      }

      // Filtrar: apenas modelos de texto, criados em 2025+, não-gratuitos (excluir :free)
      const filtered = parsed.data.data.filter((m) => {
        const isTextOutput = m.architecture.output_modalities.includes('text');
        const is2025Plus = m.created >= YEAR_2025_UNIX;
        const isFreeVariant = m.id.endsWith(':free');
        const hasPrice = parseFloat(m.pricing.prompt) > 0 || parseFloat(m.pricing.completion) > 0;
        return isTextOutput && is2025Plus && !isFreeVariant && hasPrice;
      });

      // Ordenar por preço de input (mais barato primeiro)
      const sorted = [...filtered].sort((a: OpenRouterModel, b: OpenRouterModel) => {
        const priceA = parseFloat(a.pricing.prompt);
        const priceB = parseFloat(b.pricing.prompt);
        return priceA - priceB;
      });

      cachedModels = sorted;
      cacheTimestamp = Date.now();

      return { ok: true, models: sorted };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, error: 'Timeout ao buscar modelos da OpenRouter (15s)' };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido ao buscar modelos',
    };
  }
};
