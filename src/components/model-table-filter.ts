/**
 * Parsing, serialization e avaliacao de filtros compostos para a tabela de modelos.
 *
 * Sintaxe: `$Intel>=40|$MMLU>=20|gpt`
 * - Segmentos com `$` sao filtros de metrica (case-insensitive nos nomes de coluna)
 * - Segmentos sem `$` sao filtros de texto (busca em nome/provider/id)
 * - `|` separa regras com semantica OR (uniao de resultados)
 *
 * @module
 */

import type { EnrichedModel } from '../data/enriched-model.js';
import type { ColumnDef, FilterMode } from './model-table-columns.js';

// ── Types ───────────────────────────────────────────────────────────

export type ComparisonOp = '>=' | '<=' | '>' | '<' | '==';

export interface TextFilterRule {
  readonly type: 'text';
  readonly query: string;
}

export interface MetricFilterRule {
  readonly type: 'metric';
  readonly metricName: string;
  readonly operator: ComparisonOp;
  readonly value: number;
}

export type FilterRule = TextFilterRule | MetricFilterRule;

// ── Parsing ─────────────────────────────────────────────────────────

const METRIC_REGEX = /^\$(\S+?)\s*(>=|<=|>|<|==)\s*(-?\d+\.?\d*)$/;

/**
 * Faz parse de um segmento individual de filtro.
 *
 * @param segment - Segmento ja trimado (ex: `$Intel>=40` ou `gpt`)
 * @returns FilterRule parseada
 * @example
 * ```ts
 * parseSegment('$Intel>=40') // { type: 'metric', metricName: 'intel', operator: '>=', value: 40 }
 * parseSegment('gpt')        // { type: 'text', query: 'gpt' }
 * ```
 */
const parseSegment = (segment: string): FilterRule => {
  if (!segment.startsWith('$')) {
    return { type: 'text', query: segment.toLowerCase() };
  }

  const match = METRIC_REGEX.exec(segment);
  if (!match) {
    // Segmento $ invalido -> degradar para texto sem o $
    return { type: 'text', query: segment.slice(1).toLowerCase() };
  }

  return {
    type: 'metric',
    metricName: match[1]!.toLowerCase(),
    operator: match[2]! as ComparisonOp,
    value: Number(match[3]),
  };
};

/**
 * Faz parse de um filtro composto separado por pipe.
 *
 * @param input - String completa do filtro (ex: `$Intel>=40|$MMLU>=20|gpt`)
 * @returns Array de regras parseadas
 * @example
 * ```ts
 * const rules = parseFilterRules('$Intel>=40|gpt');
 * // [{ type: 'metric', metricName: 'intel', operator: '>=', value: 40 },
 * //  { type: 'text', query: 'gpt' }]
 * ```
 */
export const parseFilterRules = (input: string): readonly FilterRule[] => {
  if (!input.trim()) return [];
  return input
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(parseSegment);
};

/**
 * Serializa regras de volta para string pipe-separated.
 *
 * @param rules - Array de FilterRule
 * @returns String serializada (ex: `$Intel>=40|gpt`)
 */
export const serializeFilterRules = (rules: readonly FilterRule[]): string =>
  rules
    .map((r) => {
      if (r.type === 'text') return r.query;
      return `$${r.metricName}${r.operator}${r.value}`;
    })
    .join('|');

// ── Evaluation ──────────────────────────────────────────────────────

/**
 * Avalia se um modelo satisfaz um filtro de texto.
 * Busca em name, provider, id, tokenizer e creatorSlug.
 */
const matchesText = (model: EnrichedModel, query: string): boolean =>
  model.name.toLowerCase().includes(query) ||
  model.provider.toLowerCase().includes(query) ||
  model.id.toLowerCase().includes(query) ||
  model.tokenizer.toLowerCase().includes(query) ||
  (model.aa.creatorSlug?.toLowerCase().includes(query) ?? false);

/**
 * Encontra coluna pelo filterAlias ou label (case-insensitive).
 */
const findColumn = (columns: readonly ColumnDef[], name: string): ColumnDef | undefined =>
  columns.find(
    (c) => c.filterAlias === name || c.label.toLowerCase() === name || c.key.toLowerCase() === name,
  );

/**
 * Aplica operador de comparacao.
 */
const compare = (actual: number, op: ComparisonOp, threshold: number): boolean => {
  switch (op) {
    case '>=': return actual >= threshold;
    case '<=': return actual <= threshold;
    case '>': return actual > threshold;
    case '<': return actual < threshold;
    case '==': return actual === threshold;
  }
};

/**
 * Avalia se um modelo satisfaz um filtro de metrica.
 * Retorna false se a coluna nao existir ou o valor for null.
 */
const matchesMetric = (
  model: EnrichedModel,
  rule: MetricFilterRule,
  columns: readonly ColumnDef[],
): boolean => {
  const col = findColumn(columns, rule.metricName);
  if (!col) return false;
  const val = col.getValue(model);
  if (val === null) return false;
  return compare(val, rule.operator, rule.value);
};

/**
 * Aplica regras de filtro com semantica OR (uniao).
 * Se nao houver regras, retorna todos os modelos.
 *
 * @param models - Modelos a filtrar
 * @param rules - Regras parseadas
 * @param columns - Definicoes de coluna (para lookup de metricas)
 * @returns Modelos que satisfazem pelo menos uma regra
 * @example
 * ```ts
 * const filtered = applyFilterRules(models, parseFilterRules('$Intel>=40|gpt'), COLUMNS);
 * ```
 */
export const applyFilterRules = (
  models: readonly EnrichedModel[],
  rules: readonly FilterRule[],
  columns: readonly ColumnDef[],
): readonly EnrichedModel[] => {
  if (rules.length === 0) return models;
  return models.filter((m) =>
    rules.some((rule) => {
      if (rule.type === 'text') return matchesText(m, rule.query);
      return matchesMetric(m, rule, columns);
    }),
  );
};

/**
 * Aplica filtro preset (pre-definido) como pre-filtro.
 *
 * @param models - Modelos a filtrar
 * @param mode - Modo de filtro preset
 * @returns Modelos filtrados pelo preset
 */
export const applyPresetFilter = (
  models: readonly EnrichedModel[],
  mode: FilterMode,
): readonly EnrichedModel[] => {
  switch (mode) {
    case 'none':
      return models;
    case 'has-benchmarks':
      return models.filter((m) => m.aa.matched);
    case 'high-intel':
      return models.filter((m) => (m.aa.benchmarks.intelligenceIndex ?? 0) >= 40);
    case 'best-value':
      return models.filter((m) => {
        const intel = m.aa.benchmarks.intelligenceIndex;
        const price = m.aa.pricing.blended3to1 ?? (m.inputPrice * 0.75 + m.outputPrice * 0.25);
        return intel !== null && price > 0 && intel / price >= 20;
      });
    case 'fast':
      return models.filter((m) => (m.aa.speed.outputTokensPerSecond ?? 0) > 80);
  }
};
