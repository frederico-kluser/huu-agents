/**
 * Catálogo dinâmico de modelos LLM via OpenRouter API.
 * Busca modelos em tempo real (cache 1h), filtra 2025+, text-output.
 * Preços em USD por milhão de tokens. Contexto em K tokens.
 *
 * @module
 */

import {
  type OpenRouterModel,
  fetchOpenRouterModels,
  tokenPriceToPerMillion,
  extractProviderName,
  getCachedModels,
} from './openrouter-client.js';

/** Entrada do catálogo de modelos — compatível com interface anterior */
export interface ModelEntry {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly contextWindow: number;
  readonly inputPrice: number;
  readonly outputPrice: number;
  readonly maxCompletionTokens: number;
  readonly hasTools: boolean;
  readonly hasReasoning: boolean;
  readonly isModerated: boolean;
  readonly modality: string;
  readonly tokenizer: string;
  readonly description: string;
  readonly createdAt: string;
  readonly supportedParams: readonly string[];
}

/**
 * Converte um modelo da OpenRouter API para o formato interno ModelEntry.
 *
 * @param raw - Modelo cru da API OpenRouter
 * @returns ModelEntry normalizado
 * @example
 * ```ts
 * const entry = toModelEntry(openRouterModel);
 * console.log(entry.inputPrice); // preço por 1M tokens
 * ```
 */
export const toModelEntry = (raw: OpenRouterModel): ModelEntry => ({
  id: raw.id,
  name: raw.name,
  provider: extractProviderName(raw.id),
  contextWindow: Math.round(raw.context_length / 1000),
  inputPrice: tokenPriceToPerMillion(raw.pricing.prompt),
  outputPrice: tokenPriceToPerMillion(raw.pricing.completion),
  maxCompletionTokens: raw.top_provider.max_completion_tokens ?? 0,
  hasTools: raw.supported_parameters.includes('tools'),
  hasReasoning: raw.supported_parameters.includes('reasoning'),
  isModerated: raw.top_provider.is_moderated,
  modality: raw.architecture.modality,
  tokenizer: raw.architecture.tokenizer,
  description: raw.description.slice(0, 200),
  createdAt: new Date(raw.created * 1000).toISOString().split('T')[0]!,
  supportedParams: raw.supported_parameters,
});

/**
 * Busca e retorna todos os modelos disponíveis da OpenRouter (2025+, texto).
 * Usa cache em memória (TTL 1h).
 *
 * @param apiKey - API key opcional para melhor rate limiting
 * @returns Array de ModelEntry ou erro
 * @throws Nunca — retorna Result pattern
 * @example
 * ```ts
 * const result = await loadModels('sk-or-...');
 * if (result.ok) console.log(`${result.models.length} modelos`);
 * ```
 */
export const loadModels = async (
  apiKey?: string,
): Promise<{ readonly ok: true; readonly models: readonly ModelEntry[] } | { readonly ok: false; readonly error: string }> => {
  const result = await fetchOpenRouterModels(apiKey);
  if (!result.ok) return result;
  return { ok: true, models: result.models.map(toModelEntry) };
};

/**
 * Retorna modelos do cache sincronamente (sem fetch).
 * Retorna array vazio se cache não disponível.
 *
 * @returns Modelos cacheados como ModelEntry[]
 * @example
 * ```ts
 * const cached = getModelsCached();
 * const model = cached.find(m => m.id === 'openai/gpt-4');
 * ```
 */
export const getModelsCached = (): readonly ModelEntry[] => {
  const cached = getCachedModels();
  return cached ? cached.map(toModelEntry) : [];
};

/**
 * Busca modelo por ID no cache. Retorna undefined se não encontrado.
 *
 * @param id - ID do modelo (formato "provider/model")
 * @returns ModelEntry ou undefined
 * @example
 * ```ts
 * const model = findModel('anthropic/claude-sonnet-4-6');
 * if (model) console.log(model.name);
 * ```
 */
export const findModel = (id: string): ModelEntry | undefined =>
  getModelsCached().find((m) => m.id === id);

/** Formata preço: <1 com 2 casas, >=1 sem casas */
export const formatPrice = (price: number): string =>
  price < 1 ? `$${price.toFixed(2)}` : `$${price.toFixed(0)}`;

/** Formata contexto em K ou M */
export const formatContext = (k: number): string =>
  k >= 1000 ? `${(k / 1000).toFixed(1)}M` : `${k}K`;
