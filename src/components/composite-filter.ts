/**
 * Parsing e avaliacao de filtros compostos para a tabela de modelos.
 * Pipe `|` concatena filtros com logica OR (aditiva).
 * Prefixo `$` indica filtro de metrica: `$Intel>=40`, `$MMLU>=60`.
 * Sem `$` filtra por nome/provider: `gpt`, `claude`.
 *
 * @module
 */

import type { EnrichedModel } from '../data/enriched-model.js';

// ── Types ──────────────────────────────────────────────────

/** Filtro por metrica: $Intel>=40 */
interface MetricFilter {
  readonly type: 'metric';
  readonly metricKey: string;
  readonly operator: Operator;
  readonly value: number;
  readonly raw: string;
}

/** Filtro por texto no nome/provider */
interface TextFilter {
  readonly type: 'text';
  readonly query: string;
  readonly raw: string;
}

export type FilterSegment = MetricFilter | TextFilter;

// ── Operators ──────────────────────────────────────────────

const OPERATORS = ['>=', '<=', '!=', '==', '>', '<'] as const;
type Operator = typeof OPERATORS[number];

const compareOp = (val: number, op: Operator, target: number): boolean => {
  switch (op) {
    case '>=': return val >= target;
    case '<=': return val <= target;
    case '>': return val > target;
    case '<': return val < target;
    case '==': return val === target;
    case '!=': return val !== target;
  }
};

// ── Metric aliases (case-insensitive lookup) ───────────────

const METRIC_ALIASES: Readonly<Record<string, string>> = {
  intel: 'intelligence', intelligence: 'intelligence',
  code: 'coding', coding: 'coding',
  math: 'math',
  mmlu: 'mmluPro', mmlupro: 'mmluPro',
  gpqa: 'gpqa',
  hle: 'hle',
  lcb: 'livecodebench', livecodebench: 'livecodebench',
  sci: 'scicode', scicode: 'scicode',
  m500: 'math500', math500: 'math500',
  aime: 'aime',
  'tok/s': 'tokensPerSec', toks: 'tokensPerSec', tokspersec: 'tokensPerSec',
  ttft: 'ttft',
  'i/$': 'costBenefit', costbenefit: 'costBenefit',
  ctx: 'context', context: 'context',
  in: 'inputPrice', 'in/m': 'inputPrice', inputprice: 'inputPrice',
  out: 'outputPrice', 'out/m': 'outputPrice', outputprice: 'outputPrice',
  tools: 'tools', reas: 'reasoning', reasoning: 'reasoning',
};

// ── Metric extractors (return display-scale values) ────────

type MetricExtractor = (m: EnrichedModel) => number | null;

/** Valores na escala de exibicao: benchmarks 0-1 sao multiplicados por 100 */
const METRIC_EXTRACTORS: Readonly<Record<string, MetricExtractor>> = {
  intelligence: (m) => m.aa.benchmarks.intelligenceIndex,
  coding: (m) => m.aa.benchmarks.codingIndex,
  math: (m) => m.aa.benchmarks.mathIndex,
  mmluPro: (m) => scaleUp(m.aa.benchmarks.mmluPro),
  gpqa: (m) => scaleUp(m.aa.benchmarks.gpqa),
  hle: (m) => scaleUp(m.aa.benchmarks.hle),
  livecodebench: (m) => scaleUp(m.aa.benchmarks.livecodebench),
  scicode: (m) => scaleUp(m.aa.benchmarks.scicode),
  math500: (m) => scaleUp(m.aa.benchmarks.math500),
  aime: (m) => scaleUp(m.aa.benchmarks.aime),
  tokensPerSec: (m) => m.aa.speed.outputTokensPerSecond,
  ttft: (m) => m.aa.speed.timeToFirstToken,
  costBenefit: (m) => {
    const intel = m.aa.benchmarks.intelligenceIndex;
    const price = m.aa.pricing.blended3to1 ?? (m.inputPrice * 0.75 + m.outputPrice * 0.25);
    return intel !== null && price > 0 ? intel / price : null;
  },
  context: (m) => m.contextWindow,
  inputPrice: (m) => m.inputPrice,
  outputPrice: (m) => m.outputPrice,
  tools: (m) => m.hasTools ? 1 : 0,
  reasoning: (m) => m.hasReasoning ? 1 : 0,
};

/** Converte escala 0-1 para 0-100 (display) */
const scaleUp = (v: number | null): number | null => v !== null ? v * 100 : null;

// ── Parsing ────────────────────────────────────────────────

const METRIC_REGEX = /^\$([a-z0-9/$._]+)\s*(>=|<=|!=|==|>|<)\s*(\d+\.?\d*)$/i;

/**
 * Faz parse de filtro composto separado por `|`.
 * Cada segmento: `$Metrica>=valor` (metrica) ou texto puro (nome/provider).
 * Segmentos sao avaliados com logica OR (aditiva).
 *
 * @example
 * parseCompositeFilter('$Intel>=40|$MMLU>=20|gpt')
 * // [MetricFilter(intel>=40), MetricFilter(mmlu>=20), TextFilter("gpt")]
 */
export function parseCompositeFilter(input: string): readonly FilterSegment[] {
  if (!input.trim()) return [];
  return input.split('|')
    .map((raw): FilterSegment | null => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('$')) {
        const match = trimmed.match(METRIC_REGEX);
        if (match) {
          const metricKey = METRIC_ALIASES[match[1]!.toLowerCase()];
          if (metricKey) {
            return { type: 'metric', metricKey, operator: match[2]! as Operator, value: parseFloat(match[3]!), raw: trimmed };
          }
        }
        return { type: 'text', query: trimmed.toLowerCase(), raw: trimmed };
      }
      return { type: 'text', query: trimmed.toLowerCase(), raw: trimmed };
    })
    .filter((s): s is FilterSegment => s !== null);
}

/**
 * Avalia modelo contra segmentos de filtro com logica OR.
 * Retorna true se o modelo satisfaz QUALQUER segmento.
 *
 * @example
 * evaluateCompositeFilter(segments, model) // true se qualquer regra bate
 */
export function evaluateCompositeFilter(
  segments: readonly FilterSegment[],
  model: EnrichedModel,
): boolean {
  if (segments.length === 0) return true;
  return segments.some((seg) => {
    if (seg.type === 'text') {
      const q = seg.query;
      return (
        model.name.toLowerCase().includes(q) ||
        model.provider.toLowerCase().includes(q) ||
        model.id.toLowerCase().includes(q) ||
        (model.aa.creatorSlug?.toLowerCase().includes(q) ?? false)
      );
    }
    const extractor = METRIC_EXTRACTORS[seg.metricKey];
    if (!extractor) return false;
    const val = extractor(model);
    if (val === null) return false;
    return compareOp(val, seg.operator, seg.value);
  });
}

/**
 * Serializa segmentos de volta para string separada por pipe.
 *
 * @example
 * serializeFilter(segments) // '$Intel>=40|gpt|$MMLU>=20'
 */
export function serializeFilter(segments: readonly FilterSegment[]): string {
  return segments.map((s) => s.raw).join('|');
}

/** Metricas disponiveis para exibicao no construtor visual */
export const AVAILABLE_METRICS: readonly string[] = [
  'Intel', 'Code', 'Math', 'MMLU', 'GPQA', 'HLE',
  'LCB', 'Sci', 'M500', 'AIME', 'Tok/s', 'TTFT', 'I/$', 'Ctx',
];
