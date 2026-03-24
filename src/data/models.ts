/**
 * Tipos e utilitários para modelos LLM.
 * Os dados vêm em tempo real da API OpenRouter via `useOpenRouterModels`.
 * Este módulo mantém a interface `ModelEntry` como adaptador e funções de formatação.
 *
 * @module
 */

import type { OpenRouterModel } from '../services/openrouter-models.js';
import { findCachedModel, getCachedModels } from '../hooks/use-openrouter-models.js';

/**
 * Entrada do catálogo de modelos — interface compatível com UI existente.
 * Adaptada para mapear dados dinâmicos da OpenRouter API.
 */
export interface ModelEntry {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly contextWindow: number;
  readonly inputPrice: number;
  readonly outputPrice: number;
  readonly modality: string;
  readonly tokenizer: string;
  readonly maxCompletionTokens: number;
  readonly hasTools: boolean;
  readonly hasReasoning: boolean;
  readonly createdAt: string;
}

/**
 * Converte um OpenRouterModel para ModelEntry (interface da UI).
 *
 * @param m - Modelo normalizado da API
 * @returns ModelEntry compatível com componentes existentes
 */
export const toModelEntry = (m: OpenRouterModel): ModelEntry => ({
  id: m.id,
  name: m.name,
  provider: m.provider,
  contextWindow: m.contextLength,
  inputPrice: m.inputPrice,
  outputPrice: m.outputPrice,
  modality: m.modality,
  tokenizer: m.tokenizer,
  maxCompletionTokens: m.maxCompletionTokens,
  hasTools: m.hasTools,
  hasReasoning: m.hasReasoning,
  createdAt: m.createdAt,
});

/**
 * Retorna todos os modelos do cache de sessão como ModelEntry[].
 * Retorna array vazio se o cache não estiver carregado.
 *
 * @example
 * ```ts
 * const models = getModels();
 * const withTools = models.filter(m => m.hasTools);
 * ```
 */
export const getModels = (): readonly ModelEntry[] =>
  getCachedModels().map(toModelEntry);

/**
 * Busca modelo por ID exato no cache de sessão.
 *
 * @param id - ID do modelo (formato "provider/model-name")
 * @returns ModelEntry ou undefined se não encontrado/cache vazio
 */
export const findModel = (id: string): ModelEntry | undefined => {
  const m = findCachedModel(id);
  return m ? toModelEntry(m) : undefined;
};

/** Formata preço: <1 com 2 casas, >=1 sem casas */
export const formatPrice = (price: number): string =>
  price < 1 ? `$${price.toFixed(2)}` : `$${price.toFixed(0)}`;

/** Formata contexto em K ou M tokens */
export const formatContext = (ctx: number): string => {
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1)}M`;
  if (ctx >= 1_000) return `${(ctx / 1_000).toFixed(0)}K`;
  return `${ctx}`;
};

/** Formata número de tokens de completion */
export const formatMaxTokens = (tokens: number): string => {
  if (tokens === 0) return '—';
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return `${tokens}`;
};
