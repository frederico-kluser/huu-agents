/**
 * Definicoes de colunas para a tabela avancada de modelos.
 * Separa dados de layout/formatacao da logica de UI.
 *
 * @module
 */

import type { EnrichedModel } from '../data/enriched-model.js';
import { formatPrice, formatContext } from '../data/models.js';

// ── Types ───────────────────────────────────────────────────────────

export interface ColumnDef {
  readonly key: string;
  readonly label: string;
  readonly width: number;
  readonly align: 'left' | 'right';
  readonly group: 'base' | 'benchmark' | 'speed';
  readonly getValue: (m: EnrichedModel) => number | null;
  readonly format: (m: EnrichedModel) => string;
  readonly color?: (m: EnrichedModel) => string | undefined;
}

// ── Color helpers ───────────────────────────────────────────────────

const priceColor = (price: number): string | undefined =>
  price <= 0.5 ? 'green' : price <= 5 ? 'yellow' : 'red';

const benchColor = (val: number | null, lo: number, hi: number): string | undefined => {
  if (val === null) return undefined;
  return val >= hi ? 'green' : val >= lo ? 'yellow' : 'red';
};

const speedColor = (tps: number | null): string | undefined => {
  if (tps === null) return undefined;
  return tps >= 100 ? 'green' : tps >= 50 ? 'yellow' : 'red';
};

// ── Format helpers ──────────────────────────────────────────────────

const fb100 = (val: number | null): string => val === null ? '-' : val.toFixed(1);
const fb1 = (val: number | null): string => val === null ? '-' : (val * 100).toFixed(1);
const fSpeed = (val: number | null): string => val === null ? '-' : val.toFixed(0);
const fLat = (val: number | null): string => val === null ? '-' : val.toFixed(2) + 's';

// ── Column array ────────────────────────────────────────────────────

/** Colunas da tabela — base sempre visiveis, benchmark/speed condicionais */
export const COLUMNS: readonly ColumnDef[] = [
  // Base
  { key: 'name', label: 'Nome', width: 26, align: 'left', group: 'base',
    getValue: () => null, format: (m) => m.name.slice(0, 25) },
  { key: 'provider', label: 'Provider', width: 12, align: 'left', group: 'base',
    getValue: () => null, format: (m) => m.provider.slice(0, 11) },
  { key: 'context', label: 'Ctx', width: 6, align: 'right', group: 'base',
    getValue: (m) => m.contextWindow, format: (m) => formatContext(m.contextWindow),
    color: (m) => m.contextWindow >= 200 ? 'green' : m.contextWindow >= 100 ? 'yellow' : undefined },
  { key: 'inputPrice', label: '$In/M', width: 8, align: 'right', group: 'base',
    getValue: (m) => m.inputPrice, format: (m) => formatPrice(m.inputPrice),
    color: (m) => priceColor(m.inputPrice) },
  { key: 'outputPrice', label: '$Out/M', width: 8, align: 'right', group: 'base',
    getValue: (m) => m.outputPrice, format: (m) => formatPrice(m.outputPrice),
    color: (m) => priceColor(m.outputPrice) },
  { key: 'tools', label: 'Tools', width: 5, align: 'right', group: 'base',
    getValue: (m) => m.hasTools ? 1 : 0, format: (m) => m.hasTools ? 'Y' : '-',
    color: (m) => m.hasTools ? 'green' : undefined },
  { key: 'reasoning', label: 'Reas', width: 5, align: 'right', group: 'base',
    getValue: (m) => m.hasReasoning ? 1 : 0, format: (m) => m.hasReasoning ? 'Y' : '-',
    color: (m) => m.hasReasoning ? 'green' : undefined },
  // Benchmarks (AA)
  { key: 'intelligence', label: 'Intel', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.intelligenceIndex,
    format: (m) => fb100(m.aa.benchmarks.intelligenceIndex),
    color: (m) => benchColor(m.aa.benchmarks.intelligenceIndex, 30, 50) },
  { key: 'coding', label: 'Code', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.codingIndex,
    format: (m) => fb100(m.aa.benchmarks.codingIndex),
    color: (m) => benchColor(m.aa.benchmarks.codingIndex, 25, 45) },
  { key: 'math', label: 'Math', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.mathIndex,
    format: (m) => fb100(m.aa.benchmarks.mathIndex),
    color: (m) => benchColor(m.aa.benchmarks.mathIndex, 40, 70) },
  { key: 'mmluPro', label: 'MMLU', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.mmluPro,
    format: (m) => fb1(m.aa.benchmarks.mmluPro),
    color: (m) => benchColor(m.aa.benchmarks.mmluPro, 0.6, 0.75) },
  { key: 'gpqa', label: 'GPQA', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.gpqa,
    format: (m) => fb1(m.aa.benchmarks.gpqa),
    color: (m) => benchColor(m.aa.benchmarks.gpqa, 0.5, 0.7) },
  { key: 'hle', label: 'HLE', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.hle,
    format: (m) => fb1(m.aa.benchmarks.hle),
    color: (m) => benchColor(m.aa.benchmarks.hle, 0.05, 0.15) },
  { key: 'livecodebench', label: 'LCB', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.livecodebench,
    format: (m) => fb1(m.aa.benchmarks.livecodebench),
    color: (m) => benchColor(m.aa.benchmarks.livecodebench, 0.3, 0.6) },
  { key: 'scicode', label: 'Sci', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.scicode,
    format: (m) => fb1(m.aa.benchmarks.scicode),
    color: (m) => benchColor(m.aa.benchmarks.scicode, 0.15, 0.3) },
  { key: 'math500', label: 'M500', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.math500,
    format: (m) => fb1(m.aa.benchmarks.math500),
    color: (m) => benchColor(m.aa.benchmarks.math500, 0.7, 0.9) },
  { key: 'aime', label: 'AIME', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.aime,
    format: (m) => fb1(m.aa.benchmarks.aime),
    color: (m) => benchColor(m.aa.benchmarks.aime, 0.3, 0.6) },
  // Speed (AA)
  { key: 'tokensPerSec', label: 'Tok/s', width: 7, align: 'right', group: 'speed',
    getValue: (m) => m.aa.speed.outputTokensPerSecond,
    format: (m) => fSpeed(m.aa.speed.outputTokensPerSecond),
    color: (m) => speedColor(m.aa.speed.outputTokensPerSecond) },
  { key: 'ttft', label: 'TTFT', width: 7, align: 'right', group: 'speed',
    getValue: (m) => m.aa.speed.timeToFirstToken,
    format: (m) => fLat(m.aa.speed.timeToFirstToken) },
  // Computed
  { key: 'costBenefit', label: 'I/$', width: 7, align: 'right', group: 'benchmark',
    getValue: (m) => {
      const intel = m.aa.benchmarks.intelligenceIndex;
      const price = m.aa.pricing.blended3to1 ?? (m.inputPrice * 0.75 + m.outputPrice * 0.25);
      return (intel === null || price <= 0) ? null : intel / price;
    },
    format: (m) => {
      const intel = m.aa.benchmarks.intelligenceIndex;
      const price = m.aa.pricing.blended3to1 ?? (m.inputPrice * 0.75 + m.outputPrice * 0.25);
      return (intel === null || price <= 0) ? '-' : (intel / price).toFixed(1);
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

// ── Sort ─────────────────────────────────────────────────────────────

export type SortKey = typeof COLUMNS[number]['key'];

export const SORT_CYCLE: readonly SortKey[] = [
  'inputPrice', 'intelligence', 'coding', 'math', 'costBenefit',
  'tokensPerSec', 'mmluPro', 'gpqa', 'hle', 'livecodebench', 'context',
];

// ── Preset filters ──────────────────────────────────────────────────

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

// ── Helpers ─────────────────────────────────────────────────────────

export const pad = (str: string, len: number): string =>
  str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);

export const padR = (str: string, len: number): string =>
  str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;
