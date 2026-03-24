/**
 * Parser e executor de filtros compostos para a tabela de modelos.
 *
 * Sintaxe: segmentos separados por `|` (pipe) que sao somados (OR/uniao).
 * - `$MetricName>=valor` — filtra por metrica numerica (case-insensitive)
 * - `texto` — filtra por nome/provider/id (case-insensitive)
 *
 * Operadores suportados: `>=`, `<=`, `>`, `<`, `==`, `!=`
 *
 * @module
 */

import type { EnrichedModel } from '../data/enriched-model.js';

// ── Types ────────────────────────────────────────────────────────────

type CompareOp = '>=' | '<=' | '>' | '<' | '==' | '!=';

interface MetricFilter {
  readonly type: 'metric';
  readonly metricKey: string;
  readonly op: CompareOp;
  readonly value: number;
  readonly raw: string;
}

interface TextFilter {
  readonly type: 'text';
  readonly query: string;
  readonly raw: string;
}

/** Um segmento individual de filtro (metrica ou texto) */
export type FilterSegment = MetricFilter | TextFilter;

// ── Metric name mapping (case-insensitive alias -> getter) ──────────

type MetricGetter = (m: EnrichedModel) => number | null;

/**
 * Mapa de alias case-insensitive para funcoes de extracao de metrica.
 * Permite usar nomes curtos ou longos nos filtros `$`.
 */
const METRIC_MAP: ReadonlyMap<string, MetricGetter> = new Map([
  // Intelligence indexes (escala 0-100)
  ['intel', (m) => m.aa.benchmarks.intelligenceIndex],
  ['intelligence', (m) => m.aa.benchmarks.intelligenceIndex],
  ['code', (m) => m.aa.benchmarks.codingIndex],
  ['coding', (m) => m.aa.benchmarks.codingIndex],
  ['math', (m) => m.aa.benchmarks.mathIndex],
  // Benchmarks (escala 0-1, exibidos como 0-100 na tabela)
  ['mmlu', (m) => m.aa.benchmarks.mmluPro === null ? null : m.aa.benchmarks.mmluPro * 100],
  ['mmlupro', (m) => m.aa.benchmarks.mmluPro === null ? null : m.aa.benchmarks.mmluPro * 100],
  ['gpqa', (m) => m.aa.benchmarks.gpqa === null ? null : m.aa.benchmarks.gpqa * 100],
  ['hle', (m) => m.aa.benchmarks.hle === null ? null : m.aa.benchmarks.hle * 100],
  ['lcb', (m) => m.aa.benchmarks.livecodebench === null ? null : m.aa.benchmarks.livecodebench * 100],
  ['livecodebench', (m) => m.aa.benchmarks.livecodebench === null ? null : m.aa.benchmarks.livecodebench * 100],
  ['sci', (m) => m.aa.benchmarks.scicode === null ? null : m.aa.benchmarks.scicode * 100],
  ['scicode', (m) => m.aa.benchmarks.scicode === null ? null : m.aa.benchmarks.scicode * 100],
  ['m500', (m) => m.aa.benchmarks.math500 === null ? null : m.aa.benchmarks.math500 * 100],
  ['math500', (m) => m.aa.benchmarks.math500 === null ? null : m.aa.benchmarks.math500 * 100],
  ['aime', (m) => m.aa.benchmarks.aime === null ? null : m.aa.benchmarks.aime * 100],
  // Speed
  ['tok/s', (m) => m.aa.speed.outputTokensPerSecond],
  ['toks', (m) => m.aa.speed.outputTokensPerSecond],
  ['speed', (m) => m.aa.speed.outputTokensPerSecond],
  ['ttft', (m) => m.aa.speed.timeToFirstToken],
  // Pricing
  ['price', (m) => m.aa.pricing.blended3to1 ?? (m.inputPrice * 0.75 + m.outputPrice * 0.25)],
  ['input', (m) => m.inputPrice],
  ['output', (m) => m.outputPrice],
  // Computed
  ['i/$', (m) => {
    const intel = m.aa.benchmarks.intelligenceIndex;
    const price = m.aa.pricing.blended3to1 ?? (m.inputPrice * 0.75 + m.outputPrice * 0.25);
    if (intel === null || price <= 0) return null;
    return intel / price;
  }],
  ['costbenefit', (m) => {
    const intel = m.aa.benchmarks.intelligenceIndex;
    const price = m.aa.pricing.blended3to1 ?? (m.inputPrice * 0.75 + m.outputPrice * 0.25);
    if (intel === null || price <= 0) return null;
    return intel / price;
  }],
  // Context
  ['ctx', (m) => m.contextWindow],
  ['context', (m) => m.contextWindow],
]);

// ── Parsing ──────────────────────────────────────────────────────────

const OPS: readonly CompareOp[] = ['>=', '<=', '!=', '==', '>', '<'];

/**
 * Parseia um segmento individual de filtro.
 *
 * @param raw - String crua do segmento (ex: `$Intel>=40` ou `gpt`)
 * @returns FilterSegment parseado
 */
const parseSegment = (raw: string): FilterSegment => {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('$')) {
    return { type: 'text', query: trimmed.toLowerCase(), raw: trimmed };
  }

  // Remove o `$` e busca operador
  const body = trimmed.slice(1);
  for (const op of OPS) {
    const opIdx = body.indexOf(op);
    if (opIdx === -1) continue;
    const metricKey = body.slice(0, opIdx).trim().toLowerCase();
    const valueStr = body.slice(opIdx + op.length).trim();
    const value = Number(valueStr);
    if (isNaN(value)) continue;
    if (!METRIC_MAP.has(metricKey)) continue;
    return { type: 'metric', metricKey, op, value, raw: trimmed };
  }

  // Se comeca com $ mas nao parseou, trata como texto (fallback gracioso)
  return { type: 'text', query: trimmed.toLowerCase(), raw: trimmed };
};

/**
 * Parseia string de filtro composto em segmentos.
 * Segmentos vazios sao ignorados.
 *
 * @param input - String completa do filtro (ex: `$Intel>=40|gpt|$MMLU>=20`)
 * @returns Array de FilterSegment
 * @example
 * ```ts
 * const segments = parseCompositeFilter('$Intel>=40|gpt');
 * // [{ type: 'metric', metricKey: 'intel', op: '>=', value: 40 },
 * //  { type: 'text', query: 'gpt' }]
 * ```
 */
export const parseCompositeFilter = (input: string): readonly FilterSegment[] =>
  input.split('|').map((s) => s.trim()).filter(Boolean).map(parseSegment);

// ── Execution ────────────────────────────────────────────────────────

const compareValue = (actual: number, op: CompareOp, expected: number): boolean => {
  switch (op) {
    case '>=': return actual >= expected;
    case '<=': return actual <= expected;
    case '>':  return actual > expected;
    case '<':  return actual < expected;
    case '==': return actual === expected;
    case '!=': return actual !== expected;
  }
};

const matchesTextFilter = (m: EnrichedModel, q: string): boolean =>
  m.name.toLowerCase().includes(q) ||
  m.provider.toLowerCase().includes(q) ||
  m.id.toLowerCase().includes(q) ||
  m.tokenizer.toLowerCase().includes(q) ||
  (m.aa.creatorSlug?.toLowerCase().includes(q) ?? false);

const matchesSegment = (m: EnrichedModel, seg: FilterSegment): boolean => {
  if (seg.type === 'text') return matchesTextFilter(m, seg.query);
  const getter = METRIC_MAP.get(seg.metricKey);
  if (!getter) return false;
  const val = getter(m);
  if (val === null) return false;
  return compareValue(val, seg.op, seg.value);
};

/**
 * Aplica filtro composto a lista de modelos.
 * Segmentos sao combinados com OR (uniao): modelo passa se satisfaz
 * pelo menos um segmento.
 *
 * @param models - Modelos a filtrar
 * @param filterStr - String de filtro composto
 * @returns Modelos que passam pelo menos um segmento
 */
export const applyCompositeFilter = (
  models: readonly EnrichedModel[],
  filterStr: string,
): readonly EnrichedModel[] => {
  const segments = parseCompositeFilter(filterStr);
  if (segments.length === 0) return models;
  return models.filter((m) => segments.some((seg) => matchesSegment(m, seg)));
};

/**
 * Retorna lista de nomes de metricas disponiveis para autocomplete/legendas.
 *
 * @returns Array de nomes unicos de metricas (lowercase)
 */
export const getAvailableMetricNames = (): readonly string[] => {
  const unique = new Set<string>();
  for (const key of METRIC_MAP.keys()) {
    unique.add(key);
  }
  return [...unique];
};

/**
 * Serializa segmentos de volta para string de filtro.
 *
 * @param segments - Array de FilterSegment
 * @returns String de filtro composto
 */
export const serializeSegments = (segments: readonly FilterSegment[]): string =>
  segments.map((s) => s.raw).join('|');
