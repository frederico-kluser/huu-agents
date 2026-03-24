/**
 * Tabela avancada de modelos LLM com:
 * - Scroll horizontal (h/l ou setas) para ver todas as colunas
 * - Ordenacao por qualquer coluna (s para ciclar, S para inverter)
 * - Filtros por texto, benchmark minimo, custo-beneficio
 * - Dados de benchmark da Artificial Analysis quando disponiveis
 *
 * @module
 */

import { useState, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import type { EnrichedModel } from '../data/enriched-model.js';
import { formatPrice, formatContext } from '../data/models.js';

// ── Column definitions ──────────────────────────────────────────────

interface ColumnDef {
  readonly key: string;
  readonly label: string;
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

const priceColor = (price: number): string | undefined =>
  price <= 0.5 ? 'green' : price <= 5 ? 'yellow' : 'red';

const benchColor = (val: number | null, thresholds: [number, number]): string | undefined => {
  if (val === null) return undefined;
  return val >= thresholds[1] ? 'green' : val >= thresholds[0] ? 'yellow' : 'red';
};

const speedColor = (tps: number | null): string | undefined => {
  if (tps === null) return undefined;
  return tps >= 100 ? 'green' : tps >= 50 ? 'yellow' : 'red';
};

const fmtBench = (val: number | null, scale: '100' | '1'): string => {
  if (val === null) return '-';
  return scale === '100' ? val.toFixed(1) : (val * 100).toFixed(1);
};

const fmtSpeed = (val: number | null): string =>
  val === null ? '-' : val.toFixed(0);

const fmtLatency = (val: number | null): string =>
  val === null ? '-' : val.toFixed(2) + 's';

const COLUMNS: readonly ColumnDef[] = [
  // ── Base (always visible) ──
  {
    key: 'name', label: 'Nome', width: 26, align: 'left', group: 'base',
    getValue: () => null,
    format: (m) => m.name.slice(0, 25),
  },
  {
    key: 'provider', label: 'Provider', width: 12, align: 'left', group: 'base',
    getValue: () => null,
    format: (m) => m.provider.slice(0, 11),
  },
  {
    key: 'context', label: 'Ctx', width: 6, align: 'right', group: 'base',
    getValue: (m) => m.contextWindow,
    format: (m) => formatContext(m.contextWindow),
    color: (m) => m.contextWindow >= 200 ? 'green' : m.contextWindow >= 100 ? 'yellow' : undefined,
  },
  {
    key: 'inputPrice', label: '$In/M', width: 8, align: 'right', group: 'base',
    getValue: (m) => m.inputPrice,
    format: (m) => formatPrice(m.inputPrice),
    color: (m) => priceColor(m.inputPrice),
  },
  {
    key: 'outputPrice', label: '$Out/M', width: 8, align: 'right', group: 'base',
    getValue: (m) => m.outputPrice,
    format: (m) => formatPrice(m.outputPrice),
    color: (m) => priceColor(m.outputPrice),
  },
  {
    key: 'tools', label: 'Tools', width: 5, align: 'right', group: 'base',
    getValue: (m) => m.hasTools ? 1 : 0,
    format: (m) => m.hasTools ? 'Y' : '-',
    color: (m) => m.hasTools ? 'green' : undefined,
  },
  {
    key: 'reasoning', label: 'Reas', width: 5, align: 'right', group: 'base',
    getValue: (m) => m.hasReasoning ? 1 : 0,
    format: (m) => m.hasReasoning ? 'Y' : '-',
    color: (m) => m.hasReasoning ? 'green' : undefined,
  },
  // ── Benchmarks (AA data) ──
  {
    key: 'intelligence', label: 'Intel', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.intelligenceIndex,
    format: (m) => fmtBench(m.aa.benchmarks.intelligenceIndex, '100'),
    color: (m) => benchColor(m.aa.benchmarks.intelligenceIndex, [30, 50]),
  },
  {
    key: 'coding', label: 'Code', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.codingIndex,
    format: (m) => fmtBench(m.aa.benchmarks.codingIndex, '100'),
    color: (m) => benchColor(m.aa.benchmarks.codingIndex, [25, 45]),
  },
  {
    key: 'math', label: 'Math', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.mathIndex,
    format: (m) => fmtBench(m.aa.benchmarks.mathIndex, '100'),
    color: (m) => benchColor(m.aa.benchmarks.mathIndex, [40, 70]),
  },
  {
    key: 'mmluPro', label: 'MMLU', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.mmluPro,
    format: (m) => fmtBench(m.aa.benchmarks.mmluPro, '1'),
    color: (m) => benchColor(m.aa.benchmarks.mmluPro, [0.6, 0.75]),
  },
  {
    key: 'gpqa', label: 'GPQA', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.gpqa,
    format: (m) => fmtBench(m.aa.benchmarks.gpqa, '1'),
    color: (m) => benchColor(m.aa.benchmarks.gpqa, [0.5, 0.7]),
  },
  {
    key: 'hle', label: 'HLE', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.hle,
    format: (m) => fmtBench(m.aa.benchmarks.hle, '1'),
    color: (m) => benchColor(m.aa.benchmarks.hle, [0.05, 0.15]),
  },
  {
    key: 'livecodebench', label: 'LCB', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.livecodebench,
    format: (m) => fmtBench(m.aa.benchmarks.livecodebench, '1'),
    color: (m) => benchColor(m.aa.benchmarks.livecodebench, [0.3, 0.6]),
  },
  {
    key: 'scicode', label: 'Sci', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.scicode,
    format: (m) => fmtBench(m.aa.benchmarks.scicode, '1'),
    color: (m) => benchColor(m.aa.benchmarks.scicode, [0.15, 0.3]),
  },
  {
    key: 'math500', label: 'M500', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.math500,
    format: (m) => fmtBench(m.aa.benchmarks.math500, '1'),
    color: (m) => benchColor(m.aa.benchmarks.math500, [0.7, 0.9]),
  },
  {
    key: 'aime', label: 'AIME', width: 6, align: 'right', group: 'benchmark',
    getValue: (m) => m.aa.benchmarks.aime,
    format: (m) => fmtBench(m.aa.benchmarks.aime, '1'),
    color: (m) => benchColor(m.aa.benchmarks.aime, [0.3, 0.6]),
  },
  // ── Speed (AA data) ──
  {
    key: 'tokensPerSec', label: 'Tok/s', width: 7, align: 'right', group: 'speed',
    getValue: (m) => m.aa.speed.outputTokensPerSecond,
    format: (m) => fmtSpeed(m.aa.speed.outputTokensPerSecond),
    color: (m) => speedColor(m.aa.speed.outputTokensPerSecond),
  },
  {
    key: 'ttft', label: 'TTFT', width: 7, align: 'right', group: 'speed',
    getValue: (m) => m.aa.speed.timeToFirstToken,
    format: (m) => fmtLatency(m.aa.speed.timeToFirstToken),
  },
  // ── Computed ──
  {
    key: 'costBenefit', label: 'I/$', width: 7, align: 'right', group: 'benchmark',
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

type SortKey = typeof COLUMNS[number]['key'];

const SORT_CYCLE: readonly SortKey[] = [
  'inputPrice', 'intelligence', 'coding', 'math', 'costBenefit',
  'tokensPerSec', 'mmluPro', 'gpqa', 'hle', 'livecodebench', 'context',
];

// ── Filter modes ────────────────────────────────────────────────────

type FilterMode = 'none' | 'has-benchmarks' | 'high-intel' | 'best-value' | 'fast';

const FILTER_LABELS: Record<FilterMode, string> = {
  'none': 'Todos',
  'has-benchmarks': 'Com benchmarks',
  'high-intel': 'Intel >= 40',
  'best-value': 'I/$ >= 20',
  'fast': '> 80 tok/s',
};

const FILTER_CYCLE: readonly FilterMode[] = ['none', 'has-benchmarks', 'high-intel', 'best-value', 'fast'];

// ── Helpers ─────────────────────────────────────────────────────────

const pad = (str: string, len: number): string =>
  str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);

const padR = (str: string, len: number): string =>
  str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;

const HEADER_LINES = 8;

// ── Props ───────────────────────────────────────────────────────────

interface EnhancedModelTableProps {
  readonly models: readonly EnrichedModel[];
  readonly onSelect: (model: EnrichedModel) => void;
  readonly title?: string;
  readonly hasAAData?: boolean;
  /** Callback ao pressionar ESC — volta sem selecionar */
  readonly onCancel?: () => void;
}

/**
 * Tabela avancada de selecao de modelos com scroll horizontal,
 * ordenacao multi-criterio, filtros de benchmark e dados AA.
 *
 * Keybindings:
 * - j/k ou setas: navegar verticalmente
 * - h/l ou Shift+setas: scroll horizontal (colunas)
 * - s: ciclar ordenacao (preco, intel, code, math, custo-beneficio, velocidade)
 * - S (shift+s): inverter direcao da ordenacao
 * - f: ciclar filtro preset (todos, com benchmarks, high intel, best value, fast)
 * - Enter: selecionar modelo
 *
 * @example
 * ```tsx
 * <EnhancedModelTable models={enriched} onSelect={handleSelect} hasAAData={true} />
 * ```
 */
export const EnhancedModelTable = ({
  models,
  onSelect,
  title,
  hasAAData,
  onCancel,
}: EnhancedModelTableProps) => {
  const [filter, setFilter] = useState('');
  const [cursor, setCursor] = useState(0);
  const [colOffset, setColOffset] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('inputPrice');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>('none');
  const { stdout } = useStdout();
  const termCols = stdout?.columns ?? 120;
  const maxRows = Math.max(3, (stdout?.rows ?? 24) - HEADER_LINES);

  // Colunas visiveis: base sempre + benchmark/speed apenas com AA data
  const availableCols = useMemo(() =>
    COLUMNS.filter((c) => c.group === 'base' || hasAAData),
  [hasAAData]);

  // Calcular quantas colunas cabem na tela a partir do offset
  const visibleCols = useMemo(() => {
    let totalWidth = 0;
    const cols: ColumnDef[] = [];
    for (let i = colOffset; i < availableCols.length; i++) {
      const col = availableCols[i]!;
      if (totalWidth + col.width + 1 > termCols - 4) break;
      cols.push(col);
      totalWidth += col.width + 1;
    }
    return cols;
  }, [availableCols, colOffset, termCols]);

  const maxColOffset = Math.max(0, availableCols.length - visibleCols.length);

  // Filtrar por texto + preset
  const filtered = useMemo(() => {
    let result = [...models];

    // Filtro de texto
    if (filter.trim()) {
      const q = filter.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.tokenizer.toLowerCase().includes(q) ||
          (m.aa.creatorSlug?.toLowerCase().includes(q) ?? false),
      );
    }

    // Filtro preset
    switch (filterMode) {
      case 'has-benchmarks':
        result = result.filter((m) => m.aa.matched);
        break;
      case 'high-intel':
        result = result.filter((m) => (m.aa.benchmarks.intelligenceIndex ?? 0) >= 40);
        break;
      case 'best-value': {
        result = result.filter((m) => {
          const intel = m.aa.benchmarks.intelligenceIndex;
          const price = m.aa.pricing.blended3to1 ?? (m.inputPrice * 0.75 + m.outputPrice * 0.25);
          return intel !== null && price > 0 && intel / price >= 20;
        });
        break;
      }
      case 'fast':
        result = result.filter((m) => (m.aa.speed.outputTokensPerSecond ?? 0) > 80);
        break;
    }

    return result;
  }, [models, filter, filterMode]);

  // Ordenar
  const sorted = useMemo(() => {
    const col = availableCols.find((c) => c.key === sortKey);
    if (!col) return filtered;
    return [...filtered].sort((a, b) => {
      const va = col.getValue(a);
      const vb = col.getValue(b);
      // Nulls always go to the end
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const diff = va - vb;
      return sortAsc ? diff : -diff;
    });
  }, [filtered, sortKey, sortAsc, availableCols]);

  const safeCursor = Math.min(cursor, Math.max(0, sorted.length - 1));
  const scrollOffset = Math.max(0, safeCursor - maxRows + 1);
  const visible = sorted.slice(scrollOffset, scrollOffset + maxRows);

  useInput((input, key) => {
    // ESC to cancel
    if (key.escape && onCancel) {
      onCancel();
      return;
    }

    // Vertical navigation
    if (input === 'j' || key.downArrow) {
      setCursor((c) => Math.min(c + 1, sorted.length - 1));
    }
    if (input === 'k' || key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
    }

    // Horizontal scroll
    if (input === 'l' || (key.rightArrow && key.shift)) {
      setColOffset((c) => Math.min(c + 1, maxColOffset));
    }
    if (input === 'h' || (key.leftArrow && key.shift)) {
      setColOffset((c) => Math.max(c - 1, 0));
    }

    // Sort cycling
    if (input === 's' && !key.shift) {
      setSortKey((prev) => {
        const idx = SORT_CYCLE.indexOf(prev);
        return SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]!;
      });
    }
    if (input === 'S' || (input === 's' && key.shift)) {
      setSortAsc((prev) => !prev);
    }

    // Filter preset cycling
    if (input === 'f') {
      setFilterMode((prev) => {
        const idx = FILTER_CYCLE.indexOf(prev);
        return FILTER_CYCLE[(idx + 1) % FILTER_CYCLE.length]!;
      });
      setCursor(0);
    }

    // Select
    if (key.return && sorted[safeCursor]) {
      onSelect(sorted[safeCursor]!);
    }
  });

  const sortLabel = availableCols.find((c) => c.key === sortKey)?.label ?? sortKey;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header com filtro e info */}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column">
        {title && <Text bold color="cyan">{title}</Text>}
        <Box marginTop={1} gap={2}>
          <Box>
            <Text dimColor>Filtro: </Text>
            <TextInput
              value={filter}
              onChange={(v) => { setFilter(v); setCursor(0); }}
              placeholder="nome, provider, id..."
            />
          </Box>
          <Text dimColor>|</Text>
          <Text color="yellow">Sort: {sortLabel} {sortAsc ? '\u2191' : '\u2193'}</Text>
          <Text dimColor>|</Text>
          <Text color="magenta">F: {FILTER_LABELS[filterMode]}</Text>
        </Box>
      </Box>

      {/* Table */}
      <Box flexDirection="column" marginTop={1}>
        {/* Header row */}
        <Box>
          {visibleCols.map((col, i) => (
            <Text key={col.key} dimColor bold={col.key === sortKey}>
              {i > 0 ? ' ' : ''}
              {col.align === 'left' ? pad(col.label, col.width) : padR(col.label, col.width)}
            </Text>
          ))}
        </Box>
        <Text dimColor>{'─'.repeat(Math.min(termCols - 4, visibleCols.reduce((s, c) => s + c.width + 1, -1)))}</Text>

        {/* Data rows */}
        {visible.map((m, i) => {
          const idx = scrollOffset + i;
          const active = idx === safeCursor;
          return (
            <Box key={m.id}>
              {visibleCols.map((col, ci) => {
                const val = col.format(m);
                const colColor = active ? 'black' : col.color?.(m);
                const formatted = col.align === 'left' ? pad(val, col.width) : padR(val, col.width);
                return (
                  <Text
                    key={col.key}
                    backgroundColor={active ? 'cyan' : undefined}
                    color={colColor}
                    dimColor={!active && !colColor}
                  >
                    {ci > 0 ? ' ' : ''}{formatted}
                  </Text>
                );
              })}
              {active && <Text> {'<'}</Text>}
            </Box>
          );
        })}

        {sorted.length === 0 && (
          <Text dimColor>Nenhum modelo encontrado</Text>
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          j/k:navegar  h/l:scroll cols  s:ordenar  S:inverter  f:filtro  Enter:selecionar  {onCancel ? 'ESC:voltar  ' : ''}{sorted.length}/{models.length}
        </Text>
        {colOffset > 0 && (
          <Text dimColor color="yellow">{'<'} mais colunas a esquerda</Text>
        )}
        {colOffset < maxColOffset && (
          <Text dimColor color="yellow">{'>'} mais colunas a direita (h/l para scroll)</Text>
        )}
      </Box>
    </Box>
  );
};
