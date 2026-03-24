/**
 * Tabela avancada de modelos LLM com:
 * - Filtros compostos via pipe `|` (ex: `$Intel>=40|$MMLU>=20|gpt`)
 * - Modal visual de filtros compostos (F maiusculo)
 * - Scroll horizontal (setas esquerda/direita) e vertical (setas cima/baixo)
 * - Shift+setas para page up/down
 * - Ordenacao por qualquer coluna (s para ciclar, S para inverter)
 * - Footer com 3 linhas de legendas de benchmarks
 * - Header e footer sempre visiveis, tabela com altura variavel
 *
 * @module
 */

import { useState, useMemo, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import type { EnrichedModel } from '../data/enriched-model.js';
import { formatPrice, formatContext } from '../data/models.js';
import {
  applyCompositeFilter,
  parseCompositeFilter,
  serializeSegments,
} from './composite-filter.js';

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

// ── Helpers ─────────────────────────────────────────────────────────

const pad = (str: string, len: number): string =>
  str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);

const padR = (str: string, len: number): string =>
  str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;

// Header (border + title + filter bar + gap) = ~6 lines
// Footer (3 legend lines + keybindings + scroll indicators) = ~7 lines
// Table header (col labels + separator) = 2 lines
// Padding = 2 lines
const FIXED_CHROME_LINES = 17;
const PAGE_SIZE = 10;

// ── UI mode ─────────────────────────────────────────────────────────

type UIMode = 'navigate' | 'filter-text' | 'filter-modal';

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
 * scroll horizontal/vertical, ordenacao e legendas de benchmarks.
 *
 * Keybindings:
 * - Setas cima/baixo: navegar verticalmente
 * - Shift+setas cima/baixo: page up/down
 * - Setas esquerda/direita: scroll horizontal (colunas)
 * - s: ciclar ordenacao
 * - S: inverter direcao da ordenacao
 * - f: ativar filtro de texto composto (suporta `$Metric>=val|texto`)
 * - F: abrir modal visual de filtros compostos
 * - p: ciclar filtro preset
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
  const [uiMode, setUIMode] = useState<UIMode>('navigate');
  const [cursor, setCursor] = useState(0);
  const [colOffset, setColOffset] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('inputPrice');
  const [sortAsc, setSortAsc] = useState(true);
  // Modal: input de novo segmento
  const [modalInput, setModalInput] = useState('');
  // Modal: cursor de selecao de regras existentes
  const [modalCursor, setModalCursor] = useState(0);

  const { stdout } = useStdout();
  const termCols = stdout?.columns ?? 120;
  const termRows = stdout?.rows ?? 24;
  const maxRows = Math.max(3, termRows - FIXED_CHROME_LINES);

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

  // Segmentos parseados do filtro atual (para o modal)
  const filterSegments = useMemo(() => parseCompositeFilter(filter), [filter]);

  // Aplicar filtro composto
  const filtered = useMemo(() =>
    applyCompositeFilter(models, filter),
  [models, filter]);

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
      const diff = va - vb;
      return sortAsc ? diff : -diff;
    });
  }, [filtered, sortKey, sortAsc, availableCols]);

  const safeCursor = Math.min(cursor, Math.max(0, sorted.length - 1));
  const scrollOffset = Math.max(0, safeCursor - maxRows + 1);
  const visible = sorted.slice(scrollOffset, scrollOffset + maxRows);

  // ── Modal helpers ──
  const addSegmentFromModal = useCallback(() => {
    const trimmed = modalInput.trim();
    if (!trimmed) return;
    const newFilter = filter ? `${filter}|${trimmed}` : trimmed;
    setFilter(newFilter);
    setModalInput('');
  }, [modalInput, filter]);

  const removeSegmentAtIndex = useCallback((idx: number) => {
    const segs = parseCompositeFilter(filter);
    const newSegs = segs.filter((_, i) => i !== idx);
    setFilter(serializeSegments(newSegs));
    setModalCursor((c) => Math.min(c, Math.max(0, newSegs.length - 1)));
  }, [filter]);

  // ── Navigation mode ──
  useInput((input, key) => {
    if (key.escape) {
      if (onCancel) onCancel();
      return;
    }

    // f: ativar filtro texto
    if (input === 'f' && !key.shift) {
      setUIMode('filter-text');
      return;
    }
    // F: abrir modal visual
    if (input === 'F' || (input === 'f' && key.shift)) {
      setUIMode('filter-modal');
      setModalInput('');
      setModalCursor(0);
      return;
    }

    // Vertical navigation (setas)
    if (key.downArrow && key.shift) {
      setCursor((c) => Math.min(c + PAGE_SIZE, sorted.length - 1));
    } else if (key.downArrow) {
      setCursor((c) => Math.min(c + 1, sorted.length - 1));
    }
    if (key.upArrow && key.shift) {
      setCursor((c) => Math.max(c - PAGE_SIZE, 0));
    } else if (key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
    }

    // Horizontal scroll (setas esquerda/direita)
    if (key.rightArrow) {
      setColOffset((c) => Math.min(c + 1, maxColOffset));
    }
    if (key.leftArrow) {
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

    // Select
    if (key.return && sorted[safeCursor]) {
      onSelect(sorted[safeCursor]!);
    }
  }, { isActive: uiMode === 'navigate' });

  // ── Filter text input mode ──
  useInput((_input, key) => {
    if (key.escape || key.return) {
      setUIMode('navigate');
      setCursor(0);
    }
  }, { isActive: uiMode === 'filter-text' });

  // ── Filter modal mode ──
  useInput((input, key) => {
    if (key.escape) {
      setUIMode('navigate');
      return;
    }
    // Enter: adicionar novo segmento
    if (key.return) {
      addSegmentFromModal();
      return;
    }
    // d ou Delete/Backspace (sem input no campo): remover segmento selecionado
    if (input === 'd' && filterSegments.length > 0) {
      removeSegmentAtIndex(modalCursor);
      return;
    }
    // Navegar entre regras existentes
    if (key.downArrow) {
      setModalCursor((c) => Math.min(c + 1, filterSegments.length - 1));
    }
    if (key.upArrow) {
      setModalCursor((c) => Math.max(c - 1, 0));
    }
  }, { isActive: uiMode === 'filter-modal' });

  const sortLabel = availableCols.find((c) => c.key === sortKey)?.label ?? sortKey;

  // ── Render ──
  return (
    <Box flexDirection="column" padding={1}>
      {/* Header com filtro e info */}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column">
        {title && <Text bold color="cyan">{title}</Text>}
        <Box marginTop={1} gap={2}>
          <Box>
            {uiMode === 'filter-text' ? (
              <>
                <Text color="green" bold>Filtro: </Text>
                <TextInput
                  value={filter}
                  onChange={(v) => { setFilter(v); setCursor(0); }}
                  placeholder="$Intel>=40|gpt|$MMLU>=20..."
                  focus={true}
                />
              </>
            ) : (
              <Text dimColor>
                Filtro: {filter || '(f para digitar, F para visual)'}
              </Text>
            )}
          </Box>
          <Text dimColor>|</Text>
          <Text color="yellow">Sort: {sortLabel} {sortAsc ? '\u2191' : '\u2193'}</Text>
          <Text dimColor>|</Text>
          <Text color="magenta">{sorted.length}/{models.length}</Text>
        </Box>
      </Box>

      {/* Filter modal overlay */}
      {uiMode === 'filter-modal' && (
        <Box
          borderStyle="bold"
          borderColor="magenta"
          flexDirection="column"
          paddingX={2}
          paddingY={1}
          marginTop={1}
        >
          <Text bold color="magenta">Filtros Compostos (visual)</Text>
          <Text dimColor>Segmentos combinados com OR (uniao). Use $ para metricas.</Text>
          <Box marginTop={1} flexDirection="column">
            {filterSegments.length === 0 && (
              <Text dimColor italic>Nenhum filtro ativo</Text>
            )}
            {filterSegments.map((seg, i) => (
              <Box key={`${seg.raw}-${i}`} gap={1}>
                <Text color={i === modalCursor ? 'cyan' : undefined} bold={i === modalCursor}>
                  {i === modalCursor ? '\u25B8 ' : '  '}
                  {seg.type === 'metric'
                    ? <Text color="yellow">${seg.metricKey}{seg.op}{seg.value}</Text>
                    : <Text color="green">{seg.query}</Text>}
                </Text>
                {i === modalCursor && (
                  <Text dimColor>(d para remover)</Text>
                )}
              </Box>
            ))}
          </Box>
          <Box marginTop={1} gap={1}>
            <Text color="cyan" bold>+ </Text>
            <TextInput
              value={modalInput}
              onChange={setModalInput}
              placeholder="$Intel>=40 ou gpt..."
              focus={uiMode === 'filter-modal'}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>
              Enter:adicionar  d:remover selecionado  ESC:fechar
            </Text>
          </Box>
          <Box>
            <Text dimColor>
              Metricas: </Text>
            <Text color="yellow" dimColor>
              $intel $code $math $mmlu $gpqa $hle $lcb $sci $m500 $aime $tok/s $ttft $price $i/$
            </Text>
          </Box>
          <Box>
            <Text dimColor>
              Operadores: </Text>
            <Text color="cyan" dimColor>
              {'>'}= {'<'}= {'>'} {'<'} == !=
            </Text>
          </Box>
        </Box>
      )}

      {/* Table (so aparece se nao esta no modal) */}
      {uiMode !== 'filter-modal' && (
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
      )}

      {/* Footer — sempre visivel (3 linhas de legendas + keybindings) */}
      <Box marginTop={1} flexDirection="column">
        {/* Linha 1: Keybindings */}
        <Box gap={1}>
          <Text color="cyan">{'\u2191\u2193'}:navegar</Text>
          <Text color="cyan">Shift+{'\u2191\u2193'}:pagina</Text>
          <Text color="cyan">{'\u2190\u2192'}:scroll cols</Text>
          <Text color="yellow">s:ordenar</Text>
          <Text color="yellow">S:inverter</Text>
          <Text color="green">f:filtro</Text>
          <Text color="magenta">F:visual</Text>
          <Text dimColor>Enter:selecionar</Text>
          {onCancel && <Text dimColor>ESC:voltar</Text>}
        </Box>

        {/* Linha 2: Legendas benchmarks (indices e qualidade) */}
        <Box gap={1}>
          <Text color="blue" bold>Benchmarks:</Text>
          <Text color="yellow">Intel</Text><Text dimColor>=Indice Inteligencia(0-100)</Text>
          <Text color="yellow">Code</Text><Text dimColor>=Codigo</Text>
          <Text color="yellow">Math</Text><Text dimColor>=Matematica</Text>
          <Text color="yellow">MMLU</Text><Text dimColor>=Conhecimento multi-dominio</Text>
          <Text color="yellow">GPQA</Text><Text dimColor>=Raciocinio PhD</Text>
        </Box>

        {/* Linha 3: Legendas benchmarks (avancados + speed + custo) */}
        <Box gap={1}>
          <Text color="yellow">HLE</Text><Text dimColor>=Frontier reasoning</Text>
          <Text color="yellow">LCB</Text><Text dimColor>=Codigo competitivo</Text>
          <Text color="yellow">Sci</Text><Text dimColor>=Codigo cientifico</Text>
          <Text color="yellow">M500</Text><Text dimColor>=Matematica competicao</Text>
          <Text color="yellow">AIME</Text><Text dimColor>=Olimpiada matematica</Text>
          <Text color="green">Tok/s</Text><Text dimColor>=Velocidade</Text>
          <Text color="green">I/$</Text><Text dimColor>=Custo-beneficio</Text>
        </Box>

        {/* Indicadores de scroll horizontal */}
        {(colOffset > 0 || colOffset < maxColOffset) && (
          <Box gap={2}>
            {colOffset > 0 && (
              <Text color="yellow">{'\u2190'} mais colunas a esquerda</Text>
            )}
            {colOffset < maxColOffset && (
              <Text color="yellow">{'\u2192'} mais colunas a direita</Text>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};
