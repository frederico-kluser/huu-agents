/**
 * Parser de filtros compostos com sintaxe pipe para a tabela de modelos.
 *
 * Sintaxe: `$MetricName>=value|$Outra<=val|texto`
 * - `$` indica filtro por metrica (case-insensitive)
 * - Sem `$` indica filtro por nome/provider (texto livre)
 * - Pipe `|` e UNION (OR): cada segmento expande os resultados
 *
 * @module
 */

import type { EnrichedModel } from '../data/enriched-model.js';

// ── Types ───────────────────────────────────────────────────────────

export type MetricOperator = '>=' | '<=' | '>' | '<' | '==';

export interface TextFilterRule {
  readonly type: 'text';
  readonly value: string;
}

export interface MetricFilterRule {
  readonly type: 'metric';
  readonly metric: string;
  readonly operator: MetricOperator;
  readonly value: number;
}

export type FilterRule = TextFilterRule | MetricFilterRule;

// ── Metric accessors (values in display scale) ─────────────────────

const scaled100 = (v: number | null): number | null =>
  v !== null ? v * 100 : null;

const computeCostBenefit = (m: EnrichedModel): number | null => {
  const intel = m.aa.benchmarks.intelligenceIndex;
  const price = m.aa.pricing.blended3to1 ?? (m.inputPrice * 0.75 + m.outputPrice * 0.25);
  if (intel === null || price <= 0) return null;
  return intel / price;
};

/** Mapa de alias (lowercase) para accessor que retorna valor na escala de display */
const METRIC_ACCESSORS: ReadonlyMap<string, (m: EnrichedModel) => number | null> = new Map([
  // Index benchmarks (0-100)
  ['intel', (m: EnrichedModel) => m.aa.benchmarks.intelligenceIndex],
  ['intelligence', (m: EnrichedModel) => m.aa.benchmarks.intelligenceIndex],
  ['code', (m: EnrichedModel) => m.aa.benchmarks.codingIndex],
  ['coding', (m: EnrichedModel) => m.aa.benchmarks.codingIndex],
  ['math', (m: EnrichedModel) => m.aa.benchmarks.mathIndex],
  // Knowledge benchmarks (raw 0-1 → display 0-100)
  ['mmlu', (m: EnrichedModel) => scaled100(m.aa.benchmarks.mmluPro)],
  ['mmlupro', (m: EnrichedModel) => scaled100(m.aa.benchmarks.mmluPro)],
  ['gpqa', (m: EnrichedModel) => scaled100(m.aa.benchmarks.gpqa)],
  ['hle', (m: EnrichedModel) => scaled100(m.aa.benchmarks.hle)],
  ['lcb', (m: EnrichedModel) => scaled100(m.aa.benchmarks.livecodebench)],
  ['livecodebench', (m: EnrichedModel) => scaled100(m.aa.benchmarks.livecodebench)],
  ['sci', (m: EnrichedModel) => scaled100(m.aa.benchmarks.scicode)],
  ['scicode', (m: EnrichedModel) => scaled100(m.aa.benchmarks.scicode)],
  ['m500', (m: EnrichedModel) => scaled100(m.aa.benchmarks.math500)],
  ['math500', (m: EnrichedModel) => scaled100(m.aa.benchmarks.math500)],
  ['aime', (m: EnrichedModel) => scaled100(m.aa.benchmarks.aime)],
  // Speed
  ['tok', (m: EnrichedModel) => m.aa.speed.outputTokensPerSecond],
  ['toks', (m: EnrichedModel) => m.aa.speed.outputTokensPerSecond],
  ['speed', (m: EnrichedModel) => m.aa.speed.outputTokensPerSecond],
  ['ttft', (m: EnrichedModel) => m.aa.speed.timeToFirstToken],
  // Cost-benefit
  ['i/$', computeCostBenefit],
  ['costbenefit', computeCostBenefit],
  // Pricing
  ['in', (m: EnrichedModel) => m.inputPrice],
  ['inputprice', (m: EnrichedModel) => m.inputPrice],
  ['out', (m: EnrichedModel) => m.outputPrice],
  ['outputprice', (m: EnrichedModel) => m.outputPrice],
  // Context
  ['ctx', (m: EnrichedModel) => m.contextWindow],
  ['context', (m: EnrichedModel) => m.contextWindow],
]);

// ── Parsing ─────────────────────────────────────────────────────────

const OPERATORS_ORDERED: readonly MetricOperator[] = ['>=', '<=', '==', '>', '<'];

/**
 * Parseia um segmento `$MetricOp Value` em MetricFilterRule.
 * Retorna null se o formato nao e valido.
 */
const parseMetricSegment = (segment: string): MetricFilterRule | null => {
  const body = segment.slice(1); // remove $
  for (const op of OPERATORS_ORDERED) {
    const idx = body.indexOf(op);
    if (idx > 0) {
      const metric = body.slice(0, idx).trim().toLowerCase();
      const valueStr = body.slice(idx + op.length).trim();
      const value = parseFloat(valueStr);
      if (isNaN(value) || !METRIC_ACCESSORS.has(metric)) return null;
      return { type: 'metric', metric, operator: op, value };
    }
  }
  return null;
};

/**
 * Parseia string de filtro com pipes em array de FilterRule.
 *
 * @param input - String de filtro (ex: `$Intel>=40|gpt`)
 * @returns Array de regras parseadas
 * @example
 * ```ts
 * parseFilterString('$Intel>=40|$MMLU>=20|gpt')
 * // [{ type:'metric', metric:'intel', operator:'>=', value:40 },
 * //  { type:'metric', metric:'mmlu', operator:'>=', value:20 },
 * //  { type:'text', value:'gpt' }]
 * ```
 */
export const parseFilterString = (input: string): readonly FilterRule[] => {
  if (!input.trim()) return [];
  return input.split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((segment): FilterRule | null => {
      if (segment.startsWith('$')) return parseMetricSegment(segment);
      return { type: 'text', value: segment };
    })
    .filter((r): r is FilterRule => r !== null);
};

/**
 * Serializa array de FilterRule de volta para string pipe-separated.
 *
 * @param rules - Array de regras
 * @returns String serializada (ex: `$intel>=40|gpt`)
 */
export const serializeFilters = (rules: readonly FilterRule[]): string =>
  rules.map((r) =>
    r.type === 'text' ? r.value : `$${r.metric}${r.operator}${r.value}`,
  ).join('|');

// ── Matching ────────────────────────────────────────────────────────

const matchesText = (m: EnrichedModel, query: string): boolean => {
  const q = query.toLowerCase();
  return (
    m.name.toLowerCase().includes(q) ||
    m.provider.toLowerCase().includes(q) ||
    m.id.toLowerCase().includes(q) ||
    m.tokenizer.toLowerCase().includes(q) ||
    (m.aa.creatorSlug?.toLowerCase().includes(q) ?? false)
  );
};

const matchesMetric = (m: EnrichedModel, rule: MetricFilterRule): boolean => {
  const accessor = METRIC_ACCESSORS.get(rule.metric);
  if (!accessor) return false;
  const val = accessor(m);
  if (val === null) return false;
  switch (rule.operator) {
    case '>=': return val >= rule.value;
    case '<=': return val <= rule.value;
    case '>': return val > rule.value;
    case '<': return val < rule.value;
    case '==': return Math.abs(val - rule.value) < 0.01;
  }
};

/**
 * Aplica regras de filtro como UNION (OR).
 * Cada regra filtra independentemente; resultados sao mesclados sem duplicatas.
 *
 * @param models - Modelos a filtrar
 * @param rules - Regras de filtro
 * @returns Modelos que atendem a pelo menos uma regra
 */
export const applyFilters = (
  models: readonly EnrichedModel[],
  rules: readonly FilterRule[],
): readonly EnrichedModel[] => {
  if (rules.length === 0) return models;

  const matchedIds = new Set<string>();
  const result: EnrichedModel[] = [];

  for (const model of models) {
    if (matchedIds.has(model.id)) continue;
    const matches = rules.some((rule) =>
      rule.type === 'text' ? matchesText(model, rule.value) : matchesMetric(model, rule),
    );
    if (matches) {
      matchedIds.add(model.id);
      result.push(model);
    }
  }
  return result;
};

/** Nomes de metricas disponiveis para display no modal */
export const AVAILABLE_METRICS: readonly string[] = [
  'intel', 'code', 'math', 'mmlu', 'gpqa', 'hle',
  'lcb', 'sci', 'm500', 'aime', 'tok', 'ttft', 'i/$',
  'in', 'out', 'ctx',
];
