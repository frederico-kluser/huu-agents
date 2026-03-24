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
  /** Descricao da metrica exibida no modal de colunas */
  readonly description: string;
  readonly width: number;
  readonly align: 'left' | 'right';
  readonly group: 'base' | 'benchmark' | 'speed';
  /** Se a coluna pode ser usada como criterio de ordenacao */
  readonly sortable: boolean;
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
  { key: 'name', label: 'Nome', description: 'Nome do modelo', width: 26, align: 'left', group: 'base', sortable: false,
    getValue: () => null, format: (m) => m.name.slice(0, 25) },
  { key: 'provider', label: 'Provider', description: 'Provider/empresa', width: 12, align: 'left', group: 'base', sortable: false,
    getValue: () => null, format: (m) => m.provider.slice(0, 11) },
  { key: 'context', label: 'Ctx', description: 'Janela de contexto (K tokens)', width: 6, align: 'right', group: 'base', sortable: true,
    getValue: (m) => m.contextWindow, format: (m) => formatContext(m.contextWindow),
    color: (m) => m.contextWindow >= 200 ? 'green' : m.contextWindow >= 100 ? 'yellow' : undefined },
  { key: 'inputPrice', label: '$In/M', description: 'Preco input (USD por 1M tokens)', width: 8, align: 'right', group: 'base', sortable: true,
    getValue: (m) => m.inputPrice, format: (m) => formatPrice(m.inputPrice),
    color: (m) => priceColor(m.inputPrice) },
  { key: 'outputPrice', label: '$Out/M', description: 'Preco output (USD por 1M tokens)', width: 8, align: 'right', group: 'base', sortable: true,
    getValue: (m) => m.outputPrice, format: (m) => formatPrice(m.outputPrice),
    color: (m) => priceColor(m.outputPrice) },
  { key: 'tools', label: 'Tools', description: 'Suporte a tools/function calling', width: 5, align: 'right', group: 'base', sortable: false,
    getValue: (m) => m.hasTools ? 1 : 0, format: (m) => m.hasTools ? 'Y' : '-',
    color: (m) => m.hasTools ? 'green' : undefined },
  { key: 'reasoning', label: 'Reas', description: 'Modelo de raciocinio (chain-of-thought)', width: 5, align: 'right', group: 'base', sortable: false,
    getValue: (m) => m.hasReasoning ? 1 : 0, format: (m) => m.hasReasoning ? 'Y' : '-',
    color: (m) => m.hasReasoning ? 'green' : undefined },
  // Benchmarks (AA)
  { key: 'intelligence', label: 'Intel', description: 'Intelligence Index composto (0-100) — media ponderada de 10 avaliacoes', width: 6, align: 'right', group: 'benchmark', sortable: true,
    getValue: (m) => m.aa.benchmarks.intelligenceIndex,
    format: (m) => fb100(m.aa.benchmarks.intelligenceIndex),
    color: (m) => benchColor(m.aa.benchmarks.intelligenceIndex, 30, 50) },
  { key: 'coding', label: 'Code', description: 'Coding Index (0-100) — Terminal-Bench Hard + SciCode', width: 6, align: 'right', group: 'benchmark', sortable: true,
    getValue: (m) => m.aa.benchmarks.codingIndex,
    format: (m) => fb100(m.aa.benchmarks.codingIndex),
    color: (m) => benchColor(m.aa.benchmarks.codingIndex, 25, 45) },
  { key: 'math', label: 'Math', description: 'Math Index (0-100) — AIME 2025 + MATH-500', width: 6, align: 'right', group: 'benchmark', sortable: true,
    getValue: (m) => m.aa.benchmarks.mathIndex,
    format: (m) => fb100(m.aa.benchmarks.mathIndex),
    color: (m) => benchColor(m.aa.benchmarks.mathIndex, 40, 70) },
  { key: 'mmluPro', label: 'MMLU', description: 'MMLU-Pro — Conhecimento multi-dominio PhD (14 disciplinas, escala 0-1)', width: 6, align: 'right', group: 'benchmark', sortable: true,
    getValue: (m) => m.aa.benchmarks.mmluPro,
    format: (m) => fb1(m.aa.benchmarks.mmluPro),
    color: (m) => benchColor(m.aa.benchmarks.mmluPro, 0.6, 0.75) },
  { key: 'gpqa', label: 'GPQA', description: 'GPQA Diamond — Q&A nivel PhD (198 questoes, escala 0-1)', width: 6, align: 'right', group: 'benchmark', sortable: true,
    getValue: (m) => m.aa.benchmarks.gpqa,
    format: (m) => fb1(m.aa.benchmarks.gpqa),
    color: (m) => benchColor(m.aa.benchmarks.gpqa, 0.5, 0.7) },
  { key: 'hle', label: 'HLE', description: "Humanity's Last Exam — Frontier reasoning (2.158 questoes, escala 0-1)", width: 6, align: 'right', group: 'benchmark', sortable: true,
    getValue: (m) => m.aa.benchmarks.hle,
    format: (m) => fb1(m.aa.benchmarks.hle),
    color: (m) => benchColor(m.aa.benchmarks.hle, 0.05, 0.15) },
  { key: 'livecodebench', label: 'LCB', description: 'LiveCodeBench — Codigo competitivo sem contaminacao (escala 0-1)', width: 6, align: 'right', group: 'benchmark', sortable: true,
    getValue: (m) => m.aa.benchmarks.livecodebench,
    format: (m) => fb1(m.aa.benchmarks.livecodebench),
    color: (m) => benchColor(m.aa.benchmarks.livecodebench, 0.3, 0.6) },
  { key: 'scicode', label: 'Sci', description: 'SciCode — Codigo Python cientifico (16 disciplinas, escala 0-1)', width: 6, align: 'right', group: 'benchmark', sortable: true,
    getValue: (m) => m.aa.benchmarks.scicode,
    format: (m) => fb1(m.aa.benchmarks.scicode),
    color: (m) => benchColor(m.aa.benchmarks.scicode, 0.15, 0.3) },
  { key: 'math500', label: 'M500', description: 'MATH-500 — Matematica de competicao (500 problemas, escala 0-1)', width: 6, align: 'right', group: 'benchmark', sortable: true,
    getValue: (m) => m.aa.benchmarks.math500,
    format: (m) => fb1(m.aa.benchmarks.math500),
    color: (m) => benchColor(m.aa.benchmarks.math500, 0.7, 0.9) },
  { key: 'aime', label: 'AIME', description: 'AIME 2025 — Olimpiada matematica (30 problemas, escala 0-1)', width: 6, align: 'right', group: 'benchmark', sortable: true,
    getValue: (m) => m.aa.benchmarks.aime,
    format: (m) => fb1(m.aa.benchmarks.aime),
    color: (m) => benchColor(m.aa.benchmarks.aime, 0.3, 0.6) },
  // Speed (AA)
  { key: 'tokensPerSec', label: 'Tok/s', description: 'Velocidade de geracao (mediana P50, tokens/segundo)', width: 7, align: 'right', group: 'speed', sortable: true,
    getValue: (m) => m.aa.speed.outputTokensPerSecond,
    format: (m) => fSpeed(m.aa.speed.outputTokensPerSecond),
    color: (m) => speedColor(m.aa.speed.outputTokensPerSecond) },
  { key: 'ttft', label: 'TTFT', description: 'Time to First Token — latencia ate o primeiro token (segundos)', width: 7, align: 'right', group: 'speed', sortable: true,
    getValue: (m) => m.aa.speed.timeToFirstToken,
    format: (m) => fLat(m.aa.speed.timeToFirstToken) },
  // Computed
  { key: 'costBenefit', label: 'I/$', description: 'Custo-beneficio: Intelligence Index / preco blended (maior = melhor)', width: 7, align: 'right', group: 'benchmark', sortable: true,
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

// ── Metric columns (toggleable in column selector) ──────────────────

/** Colunas de metricas que podem ser ocultadas/exibidas pelo usuario */
export const METRIC_COLUMNS: readonly ColumnDef[] = COLUMNS.filter((c) => c.group !== 'base');

/** Set default de keys de metricas visiveis */
export const DEFAULT_VISIBLE_METRICS: ReadonlySet<string> = new Set(METRIC_COLUMNS.map((c) => c.key));

// ── Sort ─────────────────────────────────────────────────────────────

export type SortKey = typeof COLUMNS[number]['key'];

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
