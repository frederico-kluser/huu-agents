/**
 * Serviço para buscar modelos disponíveis via OpenRouter API em tempo real.
 * Substitui o catálogo estático de 18 modelos por dados dinâmicos.
 *
 * O endpoint GET /api/v1/models retorna todos os modelos disponíveis
 * com metadados de preço, arquitetura, contexto e capacidades.
 * Filtro: apenas modelos com output de texto, criados em 2025+.
 *
 * @module
 */

import { z } from 'zod';

/** URL base da API OpenRouter */
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

/** Timeout para requisição de modelos (15s) */
const FETCH_TIMEOUT_MS = 15_000;

/** Unix timestamp de 1 Jan 2025 00:00:00 UTC — filtro de modelos recentes */
const JAN_2025_EPOCH = 1735689600;

/**
 * Schema Zod para o objeto pricing retornado pela API.
 * Preços são strings (decisão de design da OpenRouter para precisão).
 */
const PricingSchema = z.object({
  prompt: z.string().default('0'),
  completion: z.string().default('0'),
  request: z.string().default('0'),
  image: z.string().default('0'),
}).passthrough();

/** Schema para arquitetura do modelo */
const ArchitectureSchema = z.object({
  modality: z.string().default('text->text'),
  input_modalities: z.array(z.string()).default(['text']),
  output_modalities: z.array(z.string()).default(['text']),
  tokenizer: z.string().default('unknown'),
  instruct_type: z.string().nullable().default(null),
}).passthrough();

/** Schema para top_provider */
const TopProviderSchema = z.object({
  context_length: z.number().default(0),
  max_completion_tokens: z.number().default(0),
  is_moderated: z.boolean().default(false),
}).passthrough();

/** Schema para um modelo individual da API OpenRouter */
const OpenRouterModelRawSchema = z.object({
  id: z.string(),
  name: z.string(),
  created: z.number(),
  description: z.string().default(''),
  context_length: z.number().default(0),
  architecture: ArchitectureSchema.default({ modality: 'text->text', input_modalities: ['text'], output_modalities: ['text'], tokenizer: 'unknown', instruct_type: null }),
  pricing: PricingSchema.default({ prompt: '0', completion: '0', request: '0', image: '0' }),
  top_provider: TopProviderSchema.default({ context_length: 0, max_completion_tokens: 0, is_moderated: false }),
  supported_parameters: z.array(z.string()).default([]),
});

/** Schema para a resposta da API */
const ModelsResponseSchema = z.object({
  data: z.array(OpenRouterModelRawSchema),
});

/** Tipo bruto de um modelo da API (pós-validação Zod) */
type OpenRouterModelRaw = z.infer<typeof OpenRouterModelRawSchema>;

/** Modelo normalizado para uso na aplicação */
export interface OpenRouterModel {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly createdAt: string;
  readonly description: string;
  readonly contextLength: number;
  readonly inputPrice: number;
  readonly outputPrice: number;
  readonly modality: string;
  readonly tokenizer: string;
  readonly maxCompletionTokens: number;
  readonly isModerated: boolean;
  readonly hasTools: boolean;
  readonly hasReasoning: boolean;
  readonly isFree: boolean;
}

/**
 * Converte string de preço para número com segurança.
 * Preços da API são strings para evitar problemas de ponto flutuante.
 *
 * @param priceStr - Preço em USD por token (string)
 * @returns Preço em USD por milhão de tokens
 */
const toMillionTokenPrice = (priceStr: string): number => {
  const perToken = parseFloat(priceStr);
  if (Number.isNaN(perToken)) return 0;
  return +(perToken * 1_000_000).toFixed(4);
};

/**
 * Extrai o provider do ID do modelo (formato "provider/model-name").
 *
 * @param id - ID do modelo no formato "provider/model-name"
 * @returns Nome do provider capitalizado
 */
const extractProvider = (id: string): string => {
  const slash = id.indexOf('/');
  if (slash === -1) return id;
  const raw = id.slice(0, slash);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

/**
 * Normaliza um modelo bruto da API para formato interno.
 *
 * @param raw - Modelo validado pelo Zod
 * @returns Modelo normalizado com preços em USD/1M tokens
 */
const normalizeModel = (raw: OpenRouterModelRaw): OpenRouterModel => {
  const inputPrice = toMillionTokenPrice(raw.pricing.prompt);
  const outputPrice = toMillionTokenPrice(raw.pricing.completion);

  return {
    id: raw.id,
    name: raw.name,
    provider: extractProvider(raw.id),
    createdAt: new Date(raw.created * 1000).toISOString().split('T')[0] ?? '',
    description: raw.description,
    contextLength: raw.context_length,
    inputPrice,
    outputPrice,
    modality: raw.architecture.modality,
    tokenizer: raw.architecture.tokenizer,
    maxCompletionTokens: raw.top_provider.max_completion_tokens,
    isModerated: raw.top_provider.is_moderated,
    hasTools: raw.supported_parameters.includes('tools'),
    hasReasoning: raw.supported_parameters.includes('reasoning'),
    isFree: inputPrice === 0 && outputPrice === 0,
  };
};

/** Resultado de sucesso da busca de modelos */
interface FetchModelsSuccess {
  readonly ok: true;
  readonly models: readonly OpenRouterModel[];
}

/** Resultado de erro da busca de modelos */
interface FetchModelsError {
  readonly ok: false;
  readonly error: string;
}

/** Result type para busca de modelos */
export type FetchModelsResult = FetchModelsSuccess | FetchModelsError;

/**
 * Busca modelos disponíveis na OpenRouter API.
 * Filtra por modelos com output de texto criados em 2025+.
 * Ordena por preço de input (mais barato primeiro), excluindo gratuitos.
 *
 * @param apiKey - Chave da API OpenRouter (opcional para o endpoint público)
 * @returns Result com array de modelos normalizados ou mensagem de erro
 *
 * @example
 * ```ts
 * const result = await fetchOpenRouterModels('sk-or-...');
 * if (result.ok) {
 *   console.log(`${result.models.length} modelos disponíveis`);
 * }
 * ```
 */
export const fetchOpenRouterModels = async (
  apiKey?: string,
): Promise<FetchModelsResult> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const url = `${OPENROUTER_API_BASE}/models`;
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, error: `API retornou status ${response.status}` };
    }

    const json: unknown = await response.json();
    const parsed = ModelsResponseSchema.safeParse(json);

    if (!parsed.success) {
      return { ok: false, error: `Schema inválido: ${parsed.error.message}` };
    }

    const models = parsed.data.data
      .filter((m) => m.created >= JAN_2025_EPOCH)
      .filter((m) => m.architecture.output_modalities.includes('text'))
      .filter((m) => !m.id.endsWith(':free'))
      .map(normalizeModel)
      .filter((m) => !m.isFree)
      .sort((a, b) => a.inputPrice - b.inputPrice);

    return { ok: true, models };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, error: 'Timeout ao buscar modelos (15s)' };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido ao buscar modelos',
    };
  } finally {
    clearTimeout(timeoutId);
  }
};
