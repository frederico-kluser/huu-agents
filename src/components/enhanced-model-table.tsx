/**
 * Tabela avancada de modelos LLM com:
 * - Filtros compostos: $metrica>=valor e texto, concatenados com | (OR)
 * - Modo visual de filtros (F) para compor filtros interativamente
 * - Scroll horizontal (←→) e vertical (↑↓, Shift/PgUp/PgDn para paginar)
 * - Ordenacao por qualquer coluna (s/S)
 * - Footer com legendas coloridas dos benchmarks
 * - Header e footer sempre visiveis, altura da tabela variavel
 *
 * @module
 */

import { useState, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import type { EnrichedModel } from '../data/enriched-model.js';
import { formatPrice, formatContext } from '../data/models.js';
import {
  parseFilterString, matchesCompositeFilter, segmentsToString,
  METRIC_NAMES, type FilterSegment,
} from './filter-parser.js';

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
    getValue: () => null, format: (m) => m.name.slice(0, 25),
  },
  {
    key: 'provider', label: 'Provider', width: 12, align: 'left', group: 'base',
    getValue: () => null, format: (m) => m.provider.slice(0, 11),
  },
  {
    key: 'context', label: 'Ctx', width: 6, align: 'right', group: 'base',
    getValue: (m) => m.contextWindow, format: (m) => formatContext(m.contextWindow),
    color: (m) => m.contextWindow >= 200 ? 'green' : m.contextWindow >= 100 ? 'yellow' : undefined,
  },
  {
    key: 'inputPrice', label: '$In/M', width: 8, align: 'right', group: 'base',
    getValue: (m) => m.inputPrice, format: (m) => formatPrice(m.inputPrice),
    color: (m) => priceColor(m.inputPrice),
  },
  {
    key: 'outputPrice', label: '$Out/M', width: 8, align: 'right', group: 'base',
    getValue: (m) => m.outputPrice, format: (m) => formatPrice(m.outputPrice),
    color: (m) => priceColor(m.outputPrice),
  },
  {
    key: 'tools', label: 'Tools', width: 5, align: 'right', group: 'base',
    getValue: (m) => m.hasTools ? 1 : 0, format: (m) => m.hasTools ? 'Y' : '-',
    color: (m) => m.hasTools ? 'green' : undefined,
  },
  {
    key: 'reasoning', label: 'Reas', width: 5, align: 'right', group: 'base',
    getValue: (m) => m.hasReasoning ? 1 : 0, format: (m) => m.hasReasoning ? 'Y' : '-',
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

// ── Filter presets ──────────────────────────────────────────────────

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

type UIMode = 'table' | 'filter-input' | 'visual-filter';

/** Linhas reservadas para header (5) + col header (2) + footer (5) + padding (2) */
const OVERHEAD_LINES = 14;

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
 * Tabela avancada de selecao de modelos com filtros compostos,
 * scroll horizontal/vertical, ordenacao e modo visual de filtros.
 *
 * Navegacao: ↑↓ (item), Shift+↑↓ ou PgUp/PgDn (pagina), ←→ (colunas)
 * Filtro: f (texto com $metrica>=valor|texto), F (visual), p (preset)
 *
 * @example
 * ```tsx
 * <EnhancedModelTable models={enriched} onSelect={handleSelect} hasAAData={true} />
 * ```
 */
export const EnhancedModelTable = ({
  models, onSelect, title, hasAAData, onCancel,
}: EnhancedModelTableProps) => {
  const [filter, setFilter] = useState('');
  const [mode, setMode] = useState<UIMode>('table');
  const [cursor, setCursor] = useState(0);
  const [colOffset, setColOffset] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('inputPrice');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>('none');
  // Visual filter builder state
  const [vfCursor, setVfCursor] = useState(0);
  const [vfAdding, setVfAdding] = useState(false);
  const [vfNewText, setVfNewText] = useState('');
  const [vfSegments, setVfSegments] = useState<FilterSegment[]>([]);

  const { stdout } = useStdout();
  const termCols = stdout?.columns ?? 120;
  const termRows = stdout?.rows ?? 24;
  const maxRows = Math.max(3, termRows - OVERHEAD_LINES);

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

  // Parse composite filter segments
  const filterSegments = useMemo(() => parseFilterString(filter), [filter]);

  // Filtrar por filtro composto + preset
  const filtered = useMemo(() => {
    let result = [...models];
    // Filtro composto (semantica OR entre segmentos)
    if (filterSegments.length > 0) {
      result = result.filter((m) => matchesCompositeFilter(m, filterSegments));
    }
    // Filtro preset (AND com o composto)
    switch (filterMode) {
      case 'has-benchmarks':
        result = result.filter((m) => m.aa.matched); break;
      case 'high-intel':
        result = result.filter((m) => (m.aa.benchmarks.intelligenceIndex ?? 0) >= 40); break;
      case 'best-value':
        result = result.filter((m) => {
          const intel = m.aa.benchmarks.intelligenceIndex;
          const price = m.aa.pricing.blended3to1 ?? (m.inputPrice * 0.75 + m.outputPrice * 0.25);
          return intel !== null && price > 0 && intel / price >= 20;
        }); break;
      case 'fast':
        result = result.filter((m) => (m.aa.speed.outputTokensPerSecond ?? 0) > 80); break;
    }
    return result;
  }, [models, filterSegments, filterMode]);

  // Ordenar
  const sorted = useMemo(() => {
    const col = availableCols.find((c) => c.key === sortKey);
    if (!col) return filtered;
    return [...filtered].sort((a, b) => {
      const va = col.getValue(a);
      const vb = col.getValue(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return sortAsc ? va - vb : vb - va;
    });
  }, [filtered, sortKey, sortAsc, availableCols]);

  const safeCursor = Math.min(cursor, Math.max(0, sorted.length - 1));
  const scrollOffset = Math.max(0, safeCursor - maxRows + 1);
  const visible = sorted.slice(scrollOffset, scrollOffset + maxRows);

  // ── Table mode input (↑↓←→, Shift+↑↓, PgUp/PgDn, s, S, f, F, p, Enter, ESC)
  useInput((input, key) => {
    if (key.escape && onCancel) { onCancel(); return; }

    // Abrir filtro texto
    if (input === 'f' && !key.shift) { setMode('filter-input'); return; }

    // Abrir filtro visual
    if (input === 'F' || (input === 'f' && key.shift)) {
      setVfSegments([...parseFilterString(filter)]);
      setVfCursor(0);
      setVfAdding(false);
      setMode('visual-filter');
      return;
    }

    // Navegacao vertical: ↑↓ (1 item), Shift+↑↓ ou PgUp/PgDn (1 pagina)
    if (key.downArrow) {
      const step = key.shift ? maxRows : 1;
      setCursor((c) => Math.min(c + step, sorted.length - 1));
    }
    if (key.upArrow) {
      const step = key.shift ? maxRows : 1;
      setCursor((c) => Math.max(c - step, 0));
    }
    if (key.pageDown) setCursor((c) => Math.min(c + maxRows, sorted.length - 1));
    if (key.pageUp) setCursor((c) => Math.max(c - maxRows, 0));

    // Scroll horizontal de colunas: ←→
    if (key.rightArrow) setColOffset((c) => Math.min(c + 1, maxColOffset));
    if (key.leftArrow) setColOffset((c) => Math.max(c - 1, 0));

    // Ciclar ordenacao
    if (input === 's' && !key.shift) {
      setSortKey((prev) => {
        const idx = SORT_CYCLE.indexOf(prev);
        return SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]!;
      });
    }
    if (input === 'S' || (input === 's' && key.shift)) setSortAsc((prev) => !prev);

    // Ciclar preset filter
    if (input === 'p') {
      setFilterMode((prev) => {
        const idx = FILTER_CYCLE.indexOf(prev);
        return FILTER_CYCLE[(idx + 1) % FILTER_CYCLE.length]!;
      });
      setCursor(0);
    }

    // Selecionar modelo
    if (key.return && sorted[safeCursor]) onSelect(sorted[safeCursor]!);
  }, { isActive: mode === 'table' });

  // ── Filter text input exit (ESC/Enter volta ao modo tabela)
  useInput((_input, key) => {
    if (key.escape || key.return) { setMode('table'); setCursor(0); }
  }, { isActive: mode === 'filter-input' });

  // ── Visual filter navigation (↑↓, d/Delete, a, ESC/Enter)
  useInput((input, key) => {
    if (key.escape || key.return) {
      setFilter(segmentsToString(vfSegments));
      setMode('table');
      setCursor(0);
      return;
    }
    if (key.upArrow) setVfCursor((c) => Math.max(c - 1, 0));
    if (key.downArrow) setVfCursor((c) => Math.min(c + 1, vfSegments.length - 1));
    if ((input === 'd' || key.delete || key.backspace) && vfSegments.length > 0) {
      const idx = Math.min(vfCursor, vfSegments.length - 1);
      setVfSegments((prev) => prev.filter((_, i) => i !== idx));
      setVfCursor((c) => Math.min(c, Math.max(0, vfSegments.length - 2)));
    }
    if (input === 'a') { setVfAdding(true); setVfNewText(''); }
  }, { isActive: mode === 'visual-filter' && !vfAdding });

  // ── Visual filter add segment (ESC cancela, Enter adiciona)
  useInput((_input, key) => {
    if (key.escape) { setVfAdding(false); setVfNewText(''); return; }
    if (key.return && vfNewText.trim()) {
      const newSegs = parseFilterString(vfNewText.trim());
      setVfSegments((prev) => [...prev, ...newSegs]);
      setVfAdding(false);
      setVfNewText('');
    }
  }, { isActive: mode === 'visual-filter' && vfAdding });

  const sortLabel = availableCols.find((c) => c.key === sortKey)?.label ?? sortKey;

  // ── Render: Visual filter builder ─────────────────────────────────
  if (mode === 'visual-filter') {
    const safeVfCursor = Math.min(vfCursor, Math.max(0, vfSegments.length - 1));
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="yellow" paddingX={2} flexDirection="column">
          <Text bold color="yellow">Filtros Compostos (modo visual)</Text>
          <Box marginTop={1} gap={2}>
            <Text><Text color="cyan">↑↓</Text><Text dimColor>:navegar</Text></Text>
            <Text><Text color="red">d</Text><Text dimColor>:remover</Text></Text>
            <Text><Text color="green">a</Text><Text dimColor>:adicionar</Text></Text>
            <Text><Text color="white">ESC/Enter</Text><Text dimColor>:aplicar</Text></Text>
          </Box>
          <Text dimColor>Metricas: {METRIC_NAMES.join(', ')}</Text>
          <Text dimColor>Formato: $metrica{'>'}=valor (ex: $Intel{'>'}=40, $MMLU{'>'}=60)</Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          {vfSegments.length === 0 && !vfAdding && (
            <Text dimColor>Nenhum filtro ativo. Pressione &apos;a&apos; para adicionar.</Text>
          )}
          {vfSegments.map((seg, i) => {
            const active = i === safeVfCursor;
            const label = seg.type === 'metric'
              ? `${seg.raw}`
              : `"${seg.query}"`;
            return (
              <Box key={`${seg.raw}-${i}`}>
                <Text
                  backgroundColor={active ? 'yellow' : undefined}
                  color={active ? 'black' : seg.type === 'metric' ? 'cyan' : 'green'}
                >
                  {active ? ' \u25B8 ' : '   '}{label}
                </Text>
                <Text dimColor> ({seg.type === 'metric' ? 'metrica' : 'texto'})</Text>
              </Box>
            );
          })}
        </Box>

        {vfAdding && (
          <Box marginTop={1}>
            <Text color="green" bold>Novo filtro: </Text>
            <TextInput
              value={vfNewText}
              onChange={setVfNewText}
              focus={true}
              placeholder="$Intel>=40, $MMLU>=60, gpt..."
            />
          </Box>
        )}

        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text dimColor>Preview: </Text>
          <Text color="white">{segmentsToString(vfSegments) || '(vazio)'}</Text>
        </Box>
      </Box>
    );
  }

  // ── Render: Table ─────────────────────────────────────────────────
  return (
    <Box flexDirection="column" padding={1}>
      {/* Header com filtro e info */}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column">
        {title && <Text bold color="cyan">{title}</Text>}
        <Box marginTop={1} gap={2}>
          <Box>
            {mode === 'filter-input' ? (
              <>
                <Text color="green" bold>Filtro: </Text>
                <TextInput
                  value={filter}
                  onChange={(v) => { setFilter(v); setCursor(0); }}
                  placeholder="$Intel>=40|gpt|$MMLU>=60..."
                  focus={true}
                />
              </>
            ) : (
              <Text dimColor>Filtro: {filter || '(f para digitar, F visual)'}</Text>
            )}
          </Box>
          <Text dimColor>|</Text>
          <Text color="yellow">Sort: {sortLabel} {sortAsc ? '\u2191' : '\u2193'}</Text>
          <Text dimColor>|</Text>
          <Text color="magenta">P: {FILTER_LABELS[filterMode]}</Text>
        </Box>
      </Box>

      {/* Tabela de dados */}
      <Box flexDirection="column" marginTop={1}>
        {/* Header das colunas */}
        <Box>
          {visibleCols.map((col, i) => (
            <Text key={col.key} dimColor bold={col.key === sortKey}>
              {i > 0 ? ' ' : ''}
              {col.align === 'left' ? pad(col.label, col.width) : padR(col.label, col.width)}
            </Text>
          ))}
        </Box>
        <Text dimColor>{'─'.repeat(Math.min(termCols - 4, visibleCols.reduce((s, c) => s + c.width + 1, -1)))}</Text>

        {/* Linhas de dados */}
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

      {/* Footer - 3 linhas com legendas coloridas */}
      <Box marginTop={1} flexDirection="column">
        {/* Linha 1: Navegacao + contagem + indicadores de scroll */}
        <Text>
          <Text color="cyan">↑↓</Text><Text dimColor>:navegar </Text>
          <Text color="cyan">Shift+↑↓</Text><Text dimColor>:paginar </Text>
          <Text color="cyan">←→</Text><Text dimColor>:colunas </Text>
          <Text color="green">s/S</Text><Text dimColor>:ordenar </Text>
          <Text color="yellow">f</Text><Text dimColor>:filtro </Text>
          <Text color="yellow">F</Text><Text dimColor>:visual </Text>
          <Text color="magenta">p</Text><Text dimColor>:preset </Text>
          <Text color="white">Enter</Text><Text dimColor>:ok</Text>
          {onCancel && <Text dimColor> ESC:voltar</Text>}
          <Text dimColor> </Text>
          <Text color="white">{sorted.length}/{models.length}</Text>
          {colOffset > 0 && <Text color="yellow"> ◀</Text>}
          {colOffset < maxColOffset && <Text color="yellow"> ▶</Text>}
        </Text>
        {/* Linha 2: Benchmarks - indices compostos + conhecimento */}
        <Text>
          <Text color="yellow">Intel</Text><Text dimColor>=Indice Composto(0-100) </Text>
          <Text color="yellow">Code</Text><Text dimColor>=Coding(TermBench+Sci) </Text>
          <Text color="yellow">Math</Text><Text dimColor>=Raciocinio Matematico </Text>
          <Text color="yellow">MMLU</Text><Text dimColor>=Multi-dominio Pro </Text>
          <Text color="yellow">GPQA</Text><Text dimColor>=Ciencia PhD </Text>
          <Text color="yellow">HLE</Text><Text dimColor>=Humanity&apos;s Last Exam</Text>
        </Text>
        {/* Linha 3: Benchmarks - codigo + velocidade + custo */}
        <Text>
          <Text color="magenta">LCB</Text><Text dimColor>=LiveCodeBench </Text>
          <Text color="magenta">Sci</Text><Text dimColor>=Codigo Cientifico </Text>
          <Text color="magenta">M500</Text><Text dimColor>=MATH-500(competicao) </Text>
          <Text color="magenta">AIME</Text><Text dimColor>=Olimpiada Mat 2025 </Text>
          <Text color="cyan">Tok/s</Text><Text dimColor>=Velocidade </Text>
          <Text color="cyan">TTFT</Text><Text dimColor>=Latencia 1o token </Text>
          <Text color="green">I/$</Text><Text dimColor>=Intel/Preco</Text>
        </Text>
      </Box>
    </Box>
  );
};
