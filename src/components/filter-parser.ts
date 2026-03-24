/**
 * Parser de filtros compostos para a tabela de modelos.
 * Suporta filtros por metrica ($Intel>=40) e por texto (gpt),
 * concatenados com pipe | em semantica de uniao (OR).
 *
 * @module
 */

import type { EnrichedModel } from '../data/enriched-model.js';

/** Filtro por texto em nome/provider/id */
export interface TextFilter {
  readonly type: 'text';
  readonly query: string;
  readonly raw: string;
}

/** Filtro por metrica com operador de comparacao */
export interface MetricFilter {
  readonly type: 'metric';
  readonly metricKey: string;
  readonly operator: '>=' | '<=' | '>' | '<' | '=';
  readonly value: number;
  readonly raw: string;
}

export type FilterSegment = TextFilter | MetricFilter;

type MetricExtractor = (m: EnrichedModel) => number | null;

/** Escala 0-1 para display (multiplica por 100) */
const s100 = (v: number | null): number | null => (v !== null ? v * 100 : null);

/**
 * Mapa de nomes de metrica (lowercase) para extratores de valor de display.
 * Valores retornados correspondem ao que o usuario ve na tabela.
 */
const METRIC_MAP: ReadonlyMap<string, MetricExtractor> = new Map<string, MetricExtractor>([
  ['intel', (m) => m.aa.benchmarks.intelligenceIndex],
  ['code', (m) => m.aa.benchmarks.codingIndex],
  ['math', (m) => m.aa.benchmarks.mathIndex],
  ['mmlu', (m) => s100(m.aa.benchmarks.mmluPro)],
  ['gpqa', (m) => s100(m.aa.benchmarks.gpqa)],
  ['hle', (m) => s100(m.aa.benchmarks.hle)],
  ['lcb', (m) => s100(m.aa.benchmarks.livecodebench)],
  ['sci', (m) => s100(m.aa.benchmarks.scicode)],
  ['m500', (m) => s100(m.aa.benchmarks.math500)],
  ['aime', (m) => s100(m.aa.benchmarks.aime)],
  ['tok/s', (m) => m.aa.speed.outputTokensPerSecond],
  ['toks', (m) => m.aa.speed.outputTokensPerSecond],
  ['ttft', (m) => m.aa.speed.timeToFirstToken],
  ['i/$', (m) => {
    const intel = m.aa.benchmarks.intelligenceIndex;
    const price = m.aa.pricing.blended3to1 ?? (m.inputPrice * 0.75 + m.outputPrice * 0.25);
    return intel !== null && price > 0 ? intel / price : null;
  }],
  ['ctx', (m) => m.contextWindow],
  ['in', (m) => m.inputPrice],
  ['out', (m) => m.outputPrice],
]);

/** Regex: captura nome da metrica (non-greedy), operador, e valor numerico */
const OP_RE = /^(.+?)(>=|<=|>|<|=)(-?\d+\.?\d*)$/;

/**
 * Parse uma string de filtro composto em segmentos.
 * Segmentos separados por | com semantica OR.
 * Prefixo $ indica filtro por metrica; sem $ filtra por nome/provider.
 *
 * @param input - String de filtro (ex: "$Intel>=40|gpt|$MMLU>=60")
 * @returns Array imutavel de segmentos de filtro
 * @example
 * ```ts
 * parseFilterString('$Intel>=40|gpt') // [MetricFilter, TextFilter]
 * ```
 */
export const parseFilterString = (input: string): readonly FilterSegment[] => {
  if (!input.trim()) return [];
  return input.split('|').map((s) => s.trim()).filter(Boolean).map(parseSegment);
};

const parseSegment = (raw: string): FilterSegment => {
  if (raw.startsWith('$')) {
    const expr = raw.slice(1);
    const match = OP_RE.exec(expr);
    if (match) {
      const value = parseFloat(match[3]!);
      if (!isNaN(value) && match[1]) {
        return {
          type: 'metric',
          metricKey: match[1].toLowerCase(),
          operator: match[2]! as MetricFilter['operator'],
          value,
          raw,
        };
      }
    }
  }
  return { type: 'text', query: raw.toLowerCase(), raw };
};

const cmpOp = (a: number, op: string, b: number): boolean => {
  switch (op) {
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '<': return a < b;
    case '=': return a === b;
    default: return false;
  }
};

/**
 * Aplica filtros compostos a um modelo. Semantica OR entre segmentos:
 * o modelo passa se satisfizer QUALQUER segmento (uniao).
 *
 * @param model - Modelo a testar
 * @param segments - Segmentos parseados por parseFilterString
 * @returns true se o modelo passa em pelo menos um segmento
 * @example
 * ```ts
 * matchesCompositeFilter(model, parseFilterString('$Intel>=40|gpt'))
 * ```
 */
export const matchesCompositeFilter = (
  model: EnrichedModel,
  segments: readonly FilterSegment[],
): boolean => {
  if (segments.length === 0) return true;
  return segments.some((seg) => matchesSegment(model, seg));
};

const matchesSegment = (model: EnrichedModel, seg: FilterSegment): boolean => {
  if (seg.type === 'text') {
    const q = seg.query;
    return (
      model.name.toLowerCase().includes(q) ||
      model.provider.toLowerCase().includes(q) ||
      model.id.toLowerCase().includes(q) ||
      model.tokenizer.toLowerCase().includes(q) ||
      (model.aa.creatorSlug?.toLowerCase().includes(q) ?? false)
    );
  }
  const extractor = METRIC_MAP.get(seg.metricKey);
  if (!extractor) return false;
  const val = extractor(model);
  return val !== null && cmpOp(val, seg.operator, seg.value);
};

/**
 * Reconstroi string de filtro a partir de segmentos.
 *
 * @param segs - Array de segmentos
 * @returns String de filtro com | entre segmentos
 * @example
 * ```ts
 * segmentsToString(parseFilterString('$Intel>=40|gpt')) // '$Intel>=40|gpt'
 * ```
 */
export const segmentsToString = (segs: readonly FilterSegment[]): string =>
  segs.map((s) => s.raw).join('|');

/** Nomes de metricas disponiveis para referencia no filtro visual */
export const METRIC_NAMES: readonly string[] = [...METRIC_MAP.keys()];
