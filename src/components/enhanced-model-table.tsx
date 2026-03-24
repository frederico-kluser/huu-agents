/**
 * Tabela avancada de modelos LLM com:
 * - Filtros compostos pipe-separated ($metric>=val|texto) com semantica OR
 * - Scroll horizontal (setas esquerda/direita) e vertical (setas cima/baixo)
 * - Shift+setas para page up/down
 * - Ordenacao por qualquer coluna (s para ciclar, S para inverter)
 * - Filtros preset (p) e texto livre (f)
 * - Construtor visual de filtros (F)
 * - Dados de benchmark da Artificial Analysis quando disponiveis
 * - Header e footer sempre visiveis, tabela com altura dinamica
 *
 * @module
 */

import { useState, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import type { EnrichedModel } from '../data/enriched-model.js';
import {
  COLUMNS, pad, padR,
  SORT_CYCLE, FILTER_LABELS, FILTER_CYCLE,
  type SortKey, type FilterMode,
} from './model-table-columns.js';
import {
  parseFilterRules, serializeFilterRules,
  applyFilterRules, applyPresetFilter,
} from './model-table-filter.js';
import { FilterBuilderModal } from './filter-builder-modal.js';

// ── Layout constants ────────────────────────────────────────────────

/** Header (border+title+filter bar) = ~5 lines, footer = 5 lines, table header = 2, padding = 2 */
const CHROME_LINES = 14;

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
 * ordenacao multi-criterio, filtros compostos pipe-separated e dados AA.
 *
 * Keybindings:
 * - Setas cima/baixo: navegar verticalmente
 * - Shift+setas cima/baixo: page up/down
 * - Setas esquerda/direita: scroll horizontal (colunas)
 * - s: ciclar ordenacao | S: inverter direcao
 * - f: ativar filtro texto (pipe syntax: $Intel>=40|gpt)
 * - F: abrir construtor visual de filtros
 * - p: ciclar filtro preset
 * - Enter: selecionar modelo | ESC: cancelar
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
  const [filterText, setFilterText] = useState('');
  const [filterActive, setFilterActive] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [colOffset, setColOffset] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('inputPrice');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>('none');
  const { stdout } = useStdout();
  const termCols = stdout?.columns ?? 120;
  const termRows = stdout?.rows ?? 24;
  const maxRows = Math.max(3, termRows - CHROME_LINES);

  // Colunas disponiveis: base sempre + benchmark/speed apenas com AA data
  const availableCols = useMemo(() =>
    COLUMNS.filter((c) => c.group === 'base' || hasAAData),
  [hasAAData]);

  // Colunas visiveis na tela a partir do offset horizontal
  const visibleCols = useMemo(() => {
    let totalWidth = 0;
    const cols: typeof availableCols[number][] = [];
    for (let i = colOffset; i < availableCols.length; i++) {
      const col = availableCols[i]!;
      if (totalWidth + col.width + 1 > termCols - 4) break;
      cols.push(col);
      totalWidth += col.width + 1;
    }
    return cols;
  }, [availableCols, colOffset, termCols]);

  const maxColOffset = Math.max(0, availableCols.length - visibleCols.length);

  // Parse regras do filtro texto
  const filterRules = useMemo(() => parseFilterRules(filterText), [filterText]);

  // Pipeline: preset -> pipe filter rules -> sort
  const filtered = useMemo(() => {
    const presetFiltered = applyPresetFilter([...models], filterMode);
    return applyFilterRules(presetFiltered, filterRules, availableCols);
  }, [models, filterMode, filterRules, availableCols]);

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

  // ── Navigation mode (table active, filter NOT focused, builder NOT open) ──
  const tableActive = !filterActive && !showBuilder;

  useInput((input, key) => {
    if (key.escape && onCancel) { onCancel(); return; }

    // f: ativar filtro texto
    if (input === 'f' && !key.shift) { setFilterActive(true); return; }

    // F: abrir construtor visual
    if (input === 'F' || (input === 'f' && key.shift)) { setShowBuilder(true); return; }

    // Navegacao vertical: setas cima/baixo
    if (key.downArrow && !key.shift) {
      setCursor((c) => Math.min(c + 1, sorted.length - 1));
    }
    if (key.upArrow && !key.shift) {
      setCursor((c) => Math.max(c - 1, 0));
    }

    // Page up/down: Shift+setas
    if (key.downArrow && key.shift) {
      setCursor((c) => Math.min(c + maxRows, sorted.length - 1));
    }
    if (key.upArrow && key.shift) {
      setCursor((c) => Math.max(c - maxRows, 0));
    }

    // Scroll horizontal: setas esquerda/direita
    if (key.rightArrow) {
      setColOffset((c) => Math.min(c + 1, maxColOffset));
    }
    if (key.leftArrow) {
      setColOffset((c) => Math.max(c - 1, 0));
    }

    // Sort
    if (input === 's' && !key.shift) {
      setSortKey((prev) => {
        const idx = SORT_CYCLE.indexOf(prev);
        return SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]!;
      });
    }
    if (input === 'S' || (input === 's' && key.shift)) {
      setSortAsc((prev) => !prev);
    }

    // Preset filter
    if (input === 'p') {
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
  }, { isActive: tableActive });

  // ── Filter text input mode ──
  useInput((_input, key) => {
    if (key.escape || key.return) {
      setFilterActive(false);
      setCursor(0);
    }
  }, { isActive: filterActive });

  // ── Builder callbacks ──
  const handleBuilderApply = (rules: readonly import('./model-table-filter.js').FilterRule[]) => {
    setFilterText(serializeFilterRules(rules));
    setShowBuilder(false);
    setCursor(0);
  };

  const sortLabel = availableCols.find((c) => c.key === sortKey)?.label ?? sortKey;

  return (
    <Box flexDirection="column" padding={1}>
      {/* ── Header ── */}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column">
        {title && <Text bold color="cyan">{title}</Text>}
        <Box marginTop={1} gap={2}>
          <Box>
            {filterActive ? (
              <>
                <Text color="green" bold>Filtro: </Text>
                <TextInput
                  value={filterText}
                  onChange={(v) => { setFilterText(v); setCursor(0); }}
                  placeholder="$Intel>=40|gpt|$MMLU>=20"
                  focus={true}
                />
              </>
            ) : (
              <Text dimColor>Filtro: {filterText || '(f para digitar, F para construtor)'}</Text>
            )}
          </Box>
          <Text dimColor>|</Text>
          <Text color="yellow">Sort: {sortLabel} {sortAsc ? '\u2191' : '\u2193'}</Text>
          <Text dimColor>|</Text>
          <Text color="magenta">P: {FILTER_LABELS[filterMode]}</Text>
        </Box>
      </Box>

      {/* ── Filter builder modal (replaces table body when open) ── */}
      {showBuilder ? (
        <Box marginTop={1}>
          <FilterBuilderModal
            rules={filterRules}
            columns={availableCols}
            onApply={handleBuilderApply}
            onCancel={() => setShowBuilder(false)}
          />
        </Box>
      ) : (
        /* ── Table body ── */
        <Box flexDirection="column" marginTop={1}>
          {/* Column headers */}
          <Box>
            {visibleCols.map((col, i) => (
              <Text key={col.key} dimColor bold={col.key === sortKey}>
                {i > 0 ? ' ' : ''}
                {col.align === 'left' ? pad(col.label, col.width) : padR(col.label, col.width)}
              </Text>
            ))}
          </Box>
          <Text dimColor>
            {'\u2500'.repeat(Math.min(termCols - 4, visibleCols.reduce((s, c) => s + c.width + 1, -1)))}
          </Text>

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

          {sorted.length === 0 && <Text dimColor>Nenhum modelo encontrado</Text>}
        </Box>
      )}

      {/* ── Footer (always visible) ── */}
      <Box marginTop={1} flexDirection="column">
        {/* Line 1: Keybindings + count + scroll indicators */}
        <Box gap={1}>
          <Text dimColor>
            {'\u2191\u2193'}:navegar  Shift+{'\u2191\u2193'}:pagina  {'\u2190\u2192'}:scroll cols  s/S:ordenar  f:filtro  F:construtor  p:preset  Enter:selecionar{onCancel ? '  ESC:voltar' : ''}
          </Text>
          <Text color="cyan" bold> {sorted.length}/{models.length}</Text>
        </Box>
        {(colOffset > 0 || colOffset < maxColOffset) && (
          <Box gap={1}>
            {colOffset > 0 && <Text color="yellow">{'\u25C0'} colunas a esquerda</Text>}
            {colOffset < maxColOffset && <Text color="yellow">{'\u25B6'} colunas a direita</Text>}
          </Box>
        )}

        {/* Line 2: Benchmark legends (row 1) */}
        <Box gap={1} marginTop={0}>
          <Text color="cyan" bold>Intel</Text><Text dimColor>=Intelligence Index</Text>
          <Text color="cyan" bold>Code</Text><Text dimColor>=Coding (Terminal-Bench+SciCode)</Text>
          <Text color="cyan" bold>Math</Text><Text dimColor>=Math Index</Text>
          <Text color="yellow" bold>MMLU</Text><Text dimColor>=MMLU-Pro (multi-domain)</Text>
          <Text color="yellow" bold>GPQA</Text><Text dimColor>=PhD-level Q&A</Text>
        </Box>

        {/* Line 3: Benchmark legends (row 2) */}
        <Box gap={1}>
          <Text color="yellow" bold>HLE</Text><Text dimColor>=Humanity's Last Exam</Text>
          <Text color="green" bold>LCB</Text><Text dimColor>=LiveCodeBench</Text>
          <Text color="green" bold>Sci</Text><Text dimColor>=SciCode (scientific)</Text>
          <Text color="green" bold>M500</Text><Text dimColor>=MATH-500</Text>
          <Text color="green" bold>AIME</Text><Text dimColor>=AIME'25 (olympiad math)</Text>
          <Text color="magenta" bold>I/$</Text><Text dimColor>=Intel/Price</Text>
        </Box>
      </Box>
    </Box>
  );
};
