/**
 * Definicoes de colunas, helpers de formatacao e constantes de ordenacao/filtro
 * para a tabela avancada de modelos LLM.
 *
 * Extraido de enhanced-model-table.tsx para manter LOC por arquivo dentro dos limites.
 *
 * @module
 */

import type { EnrichedModel } from '../data/enriched-model.js';
import { formatPrice, formatContext } from '../data/models.js';

// ── Column definition ───────────────────────────────────────────────

export interface ColumnDef {
  readonly key: string;
  readonly label: string;
  /** Alias curto para filtros $metric (case-insensitive). Ex: 'intel', 'mmlu' */
  readonly filterAlias: string;
  readonly width: number;
  readonly align: 'left' | 'right';
  readonly group: 'base' | 'benchmark' | 'speed';
  /** Extrai valor numerico para sort (null = sem dados) */
  readonly getValue: (m: EnrichedModel) => number | null;
  /** Renderiza valor para display */
  readonly format: (m: EnrichedModel) => string;
  /** Cor do valor */
  readonly color?: (m: EnrichedModel) => string | undefined;
}

// ── Color helpers ───────────────────────────────────────────────────

export const priceColor = (price: number): string | undefined =>
  price <= 0.5 ? 'green' : price <= 5 ? 'yellow' : 'red';

export const benchColor = (val: number | null, thresholds: [number, number]): string | undefined => {
  if (val === null) return undefined;
  return val >= thresholds[1] ? 'green' : val >= thresholds[0] ? 'yellow' : 'red';
};

export const speedColor = (tps: number | null): string | undefined => {
  if (tps === null) return undefined;
  return tps >= 100 ? 'green' : tps >= 50 ? 'yellow' : 'red';
};

// ── Format helpers ──────────────────────────────────────────────────

export const fmtBench = (val: number | null, scale: '100' | '1'): string => {
  if (val === null) return '-';
  return scale === '100' ? val.toFixed(1) : (val * 100).toFixed(1);
};

export const fmtSpeed = (val: number | null): string =>
  val === null ? '-' : val.toFixed(0);

export const fmtLatency = (val: number | null): string =>
  val === null ? '-' : val.toFixed(2) + 's';

// ── String pad helpers ──────────────────────────────────────────────

export const pad = (str: string, len: number): string =>
  str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);

export const padR = (str: string, len: number): string =>
  str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;

// ── Columns ─────────────────────────────────────────────────────────

export const COLUMNS: readonly ColumnDef[] = [
  // ── Base (always visible) ──
  {
    key: 'name', label: 'Nome', filterAlias: 'name', width: 26, align: 'left', group: 'base',
    getValue: () => null,
    format: (m) => m.name.slice(0, 25),
  },
  {
    key: 'provider', label: 'Provider', filterAlias: 'provider', width: 12, align: 'left', group: 'base',
    getValue: () => null,
    format: (m) => m.provider.slice(0, 11),
  },
  {
    key: 'context', label: 'Ctx', filterAlias: 'ctx', width: 6, align: 'right', group: 'base',
    getValue: (m) => m.contextWindow,
    format: (m) => formatContext(m.contextWindow),
    color: (m) => m.contextWindow >= 200 ? 'green' : m.contextWindow >= 100 ? 'yellow' : undefined,
  },
  {
    key: 'inputPrice', label: '$In/M', filterAlias: 'input', width: 8, align: 'right', group: 'base',
    getValue: (m) => m.inputPrice,
    format: (m) => formatPrice(m.inputPrice),
    color: (m) => priceColor(m.inputPrice),
  },
  {
    key: 'outputPrice', label: '$Out/M', filterAlias: 'output', width: 8, align: 'right', group: 'base',
    getValue: (m) => m.outputPrice,
    format: (m) => formatPrice(m.outputPrice),
    color: (m) => priceColor(m.outputPrice),
  },
  {
    key: 'tools', label: 'Tools', filterAlias: 'tools', width: 5, align: 'right', group: 'base',
    getValue: (m) => m.hasTools ? 1 : 0,
    format: (m) => m.hasTools ? 'Y' : '-',
    color: (m) => m.hasTools ? 'green' : undefined,
  },
  {
    key: 'reasoning', label: 'Reas', filterAlias: 'reas', width: 5, align: 'right', group: 'base',
    getValue: (m) => m.hasReasoning ? 1 : 0,
    format: (m) => m.hasReasoning ? 'Y' : '-',
    color: (m) => m.hasReasoning ? 'green' : undefined,
  },
  // ── Benchmarks (AA data) ──
  {
    key: 'intelligence', label: 'Intel', filterAlias: 'intel', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.intelligenceIndex,
    format: (m) => fmtBench(m.aa.benchmarks.intelligenceIndex, '100'),
    color: (m) => benchColor(m.aa.benchmarks.intelligenceIndex, [30, 50]),
  },
  {
    key: 'coding', label: 'Code', filterAlias: 'code', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.codingIndex,
    format: (m) => fmtBench(m.aa.benchmarks.codingIndex, '100'),
    color: (m) => benchColor(m.aa.benchmarks.codingIndex, [25, 45]),
  },
  {
    key: 'math', label: 'Math', filterAlias: 'math', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.mathIndex,
    format: (m) => fmtBench(m.aa.benchmarks.mathIndex, '100'),
    color: (m) => benchColor(m.aa.benchmarks.mathIndex, [40, 70]),
  },
  {
    key: 'mmluPro', label: 'MMLU', filterAlias: 'mmlu', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.mmluPro,
    format: (m) => fmtBench(m.aa.benchmarks.mmluPro, '1'),
    color: (m) => benchColor(m.aa.benchmarks.mmluPro, [0.6, 0.75]),
  },
  {
    key: 'gpqa', label: 'GPQA', filterAlias: 'gpqa', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.gpqa,
    format: (m) => fmtBench(m.aa.benchmarks.gpqa, '1'),
    color: (m) => benchColor(m.aa.benchmarks.gpqa, [0.5, 0.7]),
  },
  {
    key: 'hle', label: 'HLE', filterAlias: 'hle', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.hle,
    format: (m) => fmtBench(m.aa.benchmarks.hle, '1'),
    color: (m) => benchColor(m.aa.benchmarks.hle, [0.05, 0.15]),
  },
  {
    key: 'livecodebench', label: 'LCB', filterAlias: 'lcb', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.livecodebench,
    format: (m) => fmtBench(m.aa.benchmarks.livecodebench, '1'),
    color: (m) => benchColor(m.aa.benchmarks.livecodebench, [0.3, 0.6]),
  },
  {
    key: 'scicode', label: 'Sci', filterAlias: 'sci', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.scicode,
    format: (m) => fmtBench(m.aa.benchmarks.scicode, '1'),
    color: (m) => benchColor(m.aa.benchmarks.scicode, [0.15, 0.3]),
  },
  {
    key: 'math500', label: 'M500', filterAlias: 'm500', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.math500,
    format: (m) => fmtBench(m.aa.benchmarks.math500, '1'),
    color: (m) => benchColor(m.aa.benchmarks.math500, [0.7, 0.9]),
  },
  {
    key: 'aime', label: 'AIME', filterAlias: 'aime', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.aime,
    format: (m) => fmtBench(m.aa.benchmarks.aime, '1'),
    color: (m) => benchColor(m.aa.benchmarks.aime, [0.3, 0.6]),
  },
  // ── Speed (AA data) ──
  {
    key: 'tokensPerSec', label: 'Tok/s', filterAlias: 'toks', width: 7, align: 'right', group: 'speed',
    getValue: (m) => m.aa.speed.outputTokensPerSecond,
    format: (m) => fmtSpeed(m.aa.speed.outputTokensPerSecond),
    color: (m) => speedColor(m.aa.speed.outputTokensPerSecond),
  },
  {
    key: 'ttft', label: 'TTFT', filterAlias: 'ttft', width: 7, align: 'right', group: 'speed',
    getValue: (m) => m.aa.speed.timeToFirstToken,
    format: (m) => fmtLatency(m.aa.speed.timeToFirstToken),
  },
  // ── Computed ──
  {
    key: 'costBenefit', label: 'I/$', filterAlias: 'i/$', width: 7, align: 'right', group: 'benchmark',
    getValue: (m) => {
      const intel = m.aa.benchmarks.intelligenceIndex;
      const price = m.aa.pricing.blended3to1 ?? (m.inputPrice * 0.75 + m.outputPrice * 0.25);
      if (intel === null || price <= 0) return null;
      return intel / price;
    },
    format: (m) => {
      const intel = m.aa.benchmarks.intelligenceIndex;
      const price = m.aa.pricing.blended3to1 ?? (m.inputPrice * 0.75 + m.outputPrice * 0.25);
      if (intel === null || price <= 0) return '-';
      return (intel / price).toFixed(1);
    },
    color: (m) => {
      const intel = m.aa.benchmarks.intelligenceIndex;
      const price = m.aa.pricing.blended3to1 ?? (m.inputPrice * 0.75 + m.outputPrice * 0.25);
      if (intel === null || price <= 0) return undefined;
      const ratio = intel / price;
      return ratio >= 50 ? 'green' : ratio >= 15 ? 'yellow' : 'red';
    },
  },
];

// ── Sort modes ──────────────────────────────────────────────────────

export type SortKey = typeof COLUMNS[number]['key'];

export const SORT_CYCLE: readonly SortKey[] = [
  'inputPrice', 'intelligence', 'coding', 'math', 'costBenefit',
  'tokensPerSec', 'mmluPro', 'gpqa', 'hle', 'livecodebench', 'context',
];

// ── Preset filter modes ─────────────────────────────────────────────

export type FilterMode = 'none' | 'has-benchmarks' | 'high-intel' | 'best-value' | 'fast';

export const FILTER_LABELS: Record<FilterMode, string> = {
  'none': 'Todos',
  'has-benchmarks': 'Com benchmarks',
  'high-intel': 'Intel >= 40',
  'best-value': 'I/$ >= 20',
  'fast': '> 80 tok/s',
};

export const FILTER_CYCLE: readonly FilterMode[] = [
  'none', 'has-benchmarks', 'high-intel', 'best-value', 'fast',
];
