/**
 * Parsing e matching de filtros compostos para a tabela de modelos.
 * Suporta filtros de texto (nome/provider) e filtros de metrica ($Metrica>=valor)
 * concatenados com pipe (|) como operador OR (aditivo).
 *
 * @module
 */

import type { EnrichedModel } from '../data/enriched-model.js';

// ── Types ────────────────────────────────────────────────────────────

type CompareOp = '>=' | '<=' | '>' | '<' | '=';

interface MetricFilter {
  readonly type: 'metric';
  readonly raw: string;
  readonly alias: string;
  readonly columnKey: string;
  readonly displayScale: number;
  readonly op: CompareOp;
  readonly value: number;
}

interface TextFilter {
  readonly type: 'text';
  readonly raw: string;
  readonly query: string;
}

type FilterSegment = MetricFilter | TextFilter;

export type { FilterSegment, MetricFilter, TextFilter, CompareOp };

// ── Metric aliases (case-insensitive) ────────────────────────────────

interface MetricDef {
  readonly columnKey: string;
  /** Multiplier: raw getValue() × displayScale = displayed value */
  readonly displayScale: number;
}

/** Maps lowercase metric alias → column key + display scale */
const METRIC_MAP: ReadonlyMap<string, MetricDef> = new Map([
  // AA indices (0-100, displayed as-is)
  ['intel', { columnKey: 'intelligence', displayScale: 1 }],
  ['intelligence', { columnKey: 'intelligence', displayScale: 1 }],
  ['code', { columnKey: 'coding', displayScale: 1 }],
  ['coding', { columnKey: 'coding', displayScale: 1 }],
  ['math', { columnKey: 'math', displayScale: 1 }],
  // Benchmarks (0-1 raw, displayed as 0-100)
  ['mmlu', { columnKey: 'mmluPro', displayScale: 100 }],
  ['mmlupro', { columnKey: 'mmluPro', displayScale: 100 }],
  ['gpqa', { columnKey: 'gpqa', displayScale: 100 }],
  ['hle', { columnKey: 'hle', displayScale: 100 }],
  ['lcb', { columnKey: 'livecodebench', displayScale: 100 }],
  ['livecodebench', { columnKey: 'livecodebench', displayScale: 100 }],
  ['sci', { columnKey: 'scicode', displayScale: 100 }],
  ['scicode', { columnKey: 'scicode', displayScale: 100 }],
  ['m500', { columnKey: 'math500', displayScale: 100 }],
  ['math500', { columnKey: 'math500', displayScale: 100 }],
  ['aime', { columnKey: 'aime', displayScale: 100 }],
  // Speed (displayed as-is)
  ['tok', { columnKey: 'tokensPerSec', displayScale: 1 }],
  ['toks', { columnKey: 'tokensPerSec', displayScale: 1 }],
  ['speed', { columnKey: 'tokensPerSec', displayScale: 1 }],
  ['ttft', { columnKey: 'ttft', displayScale: 1 }],
  // Computed / base
  ['i/$', { columnKey: 'costBenefit', displayScale: 1 }],
  ['cost', { columnKey: 'costBenefit', displayScale: 1 }],
  ['price', { columnKey: 'inputPrice', displayScale: 1 }],
  ['ctx', { columnKey: 'context', displayScale: 1 }],
]);

// ── Parsing ──────────────────────────────────────────────────────────

const METRIC_RE = /^\$([a-z0-9/$]+)\s*(>=|<=|>|<|=)\s*([0-9.]+)$/i;

const parseSegment = (raw: string): FilterSegment | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = METRIC_RE.exec(trimmed);
  if (match) {
    const alias = match[1]!.toLowerCase();
    const def = METRIC_MAP.get(alias);
    if (def) {
      return {
        type: 'metric', raw: trimmed, alias,
        columnKey: def.columnKey, displayScale: def.displayScale,
        op: match[2]! as CompareOp, value: parseFloat(match[3]!),
      };
    }
  }
  // Fallback: text filter on name/provider
  return { type: 'text', raw: trimmed, query: trimmed.toLowerCase() };
};

/**
 * Parses composite filter string into segments separated by `|` (OR).
 * `$MetricAlias>=value` for metric filters, plain text for name/provider.
 *
 * @param input - Raw filter string (e.g. "$Intel>=40|gpt")
 * @returns Parsed filter segments
 * @example
 * ```ts
 * parseCompositeFilter("$Intel>=40|$MMLU>=75|gpt")
 * // → [MetricFilter(intel>=40), MetricFilter(mmlu>=75), TextFilter("gpt")]
 * ```
 */
export const parseCompositeFilter = (input: string): readonly FilterSegment[] => {
  if (!input.trim()) return [];
  return input.split('|').map(parseSegment).filter((s): s is FilterSegment => s !== null);
};

/** Serializes filter segments back into pipe-separated string. */
export const serializeFilter = (segments: readonly FilterSegment[]): string =>
  segments.map((s) => s.raw).join('|');

/**
 * Tests if a model matches the composite filter (OR logic).
 * Model passes if it matches ANY segment, or if segments is empty.
 *
 * @param model - Enriched model to test
 * @param segments - Parsed filter segments
 * @param getColValue - Column getValue lookup by key
 * @returns true if model matches any segment
 * @example
 * ```ts
 * const segs = parseCompositeFilter("$Intel>=40|gpt");
 * const pass = matchesCompositeFilter(model, segs, getColValue);
 * ```
 */
export const matchesCompositeFilter = (
  model: EnrichedModel,
  segments: readonly FilterSegment[],
  getColValue: (columnKey: string, m: EnrichedModel) => number | null,
): boolean => {
  if (segments.length === 0) return true;

  return segments.some((seg) => {
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
    const raw = getColValue(seg.columnKey, model);
    if (raw === null) return false;
    const display = raw * seg.displayScale;
    switch (seg.op) {
      case '>=': return display >= seg.value;
      case '<=': return display <= seg.value;
      case '>': return display > seg.value;
      case '<': return display < seg.value;
      case '=': return Math.abs(display - seg.value) < 0.01;
    }
  });
};
