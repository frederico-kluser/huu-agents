/**
 * Tabela avancada de modelos LLM com:
 * - Filtros compostos pipe-separated (texto: OR | metricas: AND)
 * - Scroll horizontal (setas esquerda/direita)
 * - Scroll vertical (setas cima/baixo, <> para pagina)
 * - Seletor de ordenacao (s) e inversao de direcao (S)
 * - Seletor de colunas de metricas (c)
 * - Modal visual de filtros (F)
 *
 * @module
 */

import { useState, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import type { EnrichedModel } from '../data/enriched-model.js';
import { parseFilterString, applyFilters } from './filter-parser.js';
import { FilterBuilderModal } from './filter-builder-modal.js';
import { ColumnSelectorModal } from './column-selector-modal.js';
import { SortSelectorModal } from './sort-selector-modal.js';
import {
  COLUMNS, DEFAULT_VISIBLE_METRICS, FILTER_LABELS, FILTER_CYCLE,
  pad, padR,
  type SortKey, type FilterMode,
} from './table-columns.js';
import { formatCacheAge } from '../services/offline-benchmark-cache.js';

// Lines above data rows (without title):
//   padding-top(1) + border-top(1) + filter-row(1) + border-bottom(1)
//   + content-marginTop(1) + col-header(1) + separator(1) = 7
// With title: +title-line(1) + marginTop-on-filter(1) = 9
const HEADER_BASE = 7;
const HEADER_TITLE_EXTRA = 2;

// ── Props ───────────────────────────────────────────────────────────

export interface EnhancedModelTableProps {
  readonly models: readonly EnrichedModel[];
  readonly onSelect: (model: EnrichedModel) => void;
  readonly title?: string;
  readonly hasAAData?: boolean;
  readonly onCancel?: () => void;
  /** Callback para atualizar dados das APIs (tecla u) */
  readonly onRefresh?: () => void;
  /** Indica que um refresh esta em andamento */
  readonly refreshing?: boolean;
  /** Idade do cache em timestamp epoch (para exibir no footer) */
  readonly cacheAge?: number | null;
  /** Percentage of terminal width to use (1-100, default: 100) */
  readonly widthPercent?: number;
  /** Percentage of terminal height to use (1-100, default: 100) */
  readonly heightPercent?: number;
}

/**
 * Tabela avancada de selecao de modelos com filtros compostos,
 * scroll bidirecional, seletor de colunas e ordenacao.
 *
 * @example
 * ```tsx
 * <EnhancedModelTable models={enriched} onSelect={handleSelect} hasAAData={true} />
 * ```
 */
export const EnhancedModelTable = ({
  models, onSelect, title, hasAAData, onCancel,
  onRefresh, refreshing, cacheAge,
  widthPercent, heightPercent,
}: EnhancedModelTableProps) => {
  // Core state
  const [filter, setFilter] = useState('');
  const [filterActive, setFilterActive] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [colOffset, setColOffset] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('inputPrice');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>('none');

  // Modal state
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [columnSelectorOpen, setColumnSelectorOpen] = useState(false);
  const [sortSelectorOpen, setSortSelectorOpen] = useState(false);

  // Column visibility (only metric/speed columns toggleable)
  const [visibleMetrics, setVisibleMetrics] = useState<ReadonlySet<string>>(DEFAULT_VISIBLE_METRICS);

  // Terminal dimensions (apply percentage constraints)
  const { stdout } = useStdout();
  const rawCols = stdout?.columns ?? 120;
  const rawRows = stdout?.rows ?? 24;
  const wp = Math.max(1, Math.min(100, widthPercent ?? 100));
  const hp = Math.max(1, Math.min(100, heightPercent ?? 100));
  const termCols = Math.max(40, Math.floor(rawCols * wp / 100));
  const termRows = Math.max(10, Math.floor(rawRows * hp / 100));
  const anyModalOpen = filterModalOpen || columnSelectorOpen || sortSelectorOpen;
  // Footer: marginTop(1) + nav-row(1) + col-indicator(1) + padding-bottom(1) = 4
  // When hidden (modal/filter): just padding-bottom(1)
  const footerLines = (filterActive || anyModalOpen) ? 1 : 4;
  const headerLines = HEADER_BASE + (title ? HEADER_TITLE_EXTRA : 0);
  const maxRows = Math.max(1, termRows - headerLines - footerLines);

  // Available columns: base always + visible metrics when hasAAData
  const availableCols = useMemo(() =>
    COLUMNS.filter((c) => c.group === 'base' || (hasAAData && visibleMetrics.has(c.key))),
  [hasAAData, visibleMetrics]);

  // Sortable columns for the selector
  const sortableCols = useMemo(() =>
    availableCols.filter((c) => c.sortable),
  [availableCols]);

  // Reset sort key if it became invisible
  const effectiveSortKey = useMemo(() => {
    if (availableCols.some((c) => c.key === sortKey)) return sortKey;
    return 'inputPrice';
  }, [sortKey, availableCols]);

  // Visible columns (horizontal scroll window)
  const visibleCols = useMemo(() => {
    let w = 0;
    const cols: typeof availableCols[number][] = [];
    for (let i = colOffset; i < availableCols.length; i++) {
      const col = availableCols[i]!;
      if (w + col.width + 1 > termCols - 4) break;
      cols.push(col);
      w += col.width + 1;
    }
    return cols;
  }, [availableCols, colOffset, termCols]);

  const maxColOffset = Math.max(0, availableCols.length - visibleCols.length);

  // Filtrar: text OR + metric AND + preset (all AND'd)
  const filtered = useMemo(() => {
    const rules = parseFilterString(filter);
    let result = rules.length > 0 ? [...applyFilters(models, rules)] : [...models];
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
  }, [models, filter, filterMode]);

  // Ordenar
  const sorted = useMemo(() => {
    const col = availableCols.find((c) => c.key === effectiveSortKey);
    if (!col) return filtered;
    return [...filtered].sort((a, b) => {
      const va = col.getValue(a);
      const vb = col.getValue(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return sortAsc ? va - vb : vb - va;
    });
  }, [filtered, effectiveSortKey, sortAsc, availableCols]);

  const safeCursor = Math.min(cursor, Math.max(0, sorted.length - 1));
  const scrollOffset = Math.max(0, safeCursor - maxRows + 1);
  const visible = sorted.slice(scrollOffset, scrollOffset + maxRows);
  const pageSize = maxRows;

  // Navegacao da tabela
  useInput((input, key) => {
    if (key.escape && onCancel) { onCancel(); return; }
    if (input === 'f' && !key.shift) { setFilterActive(true); return; }
    if (input === 'F' || (input === 'f' && key.shift)) { setFilterModalOpen(true); return; }
    if (input === 'c') { setColumnSelectorOpen(true); return; }
    if (input === 's' && !key.shift) { setSortSelectorOpen(true); return; }
    if (input === 'S' || (input === 's' && key.shift)) setSortAsc((prev) => !prev);
    if (input === 'u' && onRefresh && !refreshing) { onRefresh(); return; }

    // Vertical
    if (key.downArrow) setCursor((c) => Math.min(c + 1, sorted.length - 1));
    if (key.upArrow) setCursor((c) => Math.max(c - 1, 0));

    // Page navigation: < > and PageUp/PageDown
    if (input === '<' || input === ',') setCursor((c) => Math.max(c - pageSize, 0));
    if (input === '>' || input === '.') setCursor((c) => Math.min(c + pageSize, sorted.length - 1));
    if (key.pageDown) setCursor((c) => Math.min(c + pageSize, sorted.length - 1));
    if (key.pageUp) setCursor((c) => Math.max(c - pageSize, 0));

    // Horizontal
    if (key.rightArrow) setColOffset((c) => Math.min(c + 1, maxColOffset));
    if (key.leftArrow) setColOffset((c) => Math.max(c - 1, 0));

    // Preset
    if (input === 'p') {
      setFilterMode((prev) => {
        const idx = FILTER_CYCLE.indexOf(prev);
        return FILTER_CYCLE[(idx + 1) % FILTER_CYCLE.length]!;
      });
      setCursor(0);
    }

    // Select
    if (key.return && sorted[safeCursor]) onSelect(sorted[safeCursor]!);
  }, { isActive: !filterActive && !anyModalOpen });

  // Filtro texto: ESC/Enter sai
  useInput((_input, key) => {
    if (key.escape || key.return) { setFilterActive(false); setCursor(0); }
  }, { isActive: filterActive });

  const sortLabel = availableCols.find((c) => c.key === effectiveSortKey)?.label ?? effectiveSortKey;
  const filterRules = parseFilterString(filter);
  const hasMetricF = filterRules.some((r) => r.type === 'metric');
  const hasTextF = filterRules.some((r) => r.type === 'text');

  return (
    <Box
      flexDirection="column"
      padding={1}
      height={hp < 100 ? termRows : undefined}
      width={wp < 100 ? termCols : undefined}
      overflowX={wp < 100 ? 'hidden' : undefined}
      overflowY={hp < 100 ? 'hidden' : undefined}
    >
      {/* ── Header ── */}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column">
        {title && <Text bold color="cyan">{title}</Text>}
        <Box marginTop={title ? 1 : 0} gap={2}>
          <Box>
            {filterActive ? (
              <>
                <Text color="green" bold>Filtro: </Text>
                <TextInput
                  value={filter}
                  onChange={(v) => { setFilter(v); setCursor(0); }}
                  placeholder="openai|google|$Intel>=40|$MMLU>=70..."
                  focus={true}
                />
              </>
            ) : (
              <Box gap={1}>
                <Text dimColor>Filtro:</Text>
                {filter ? (
                  <Box gap={1}>
                    {hasMetricF && <Text color="yellow">{filterRules.filter((r) => r.type === 'metric').map((r) => r.type === 'metric' ? `$${r.metric}${r.operator}${r.value}` : '').join('&')}</Text>}
                    {hasMetricF && hasTextF && <Text dimColor>+</Text>}
                    {hasTextF && <Text color="white">{filterRules.filter((r) => r.type === 'text').map((r) => r.value).join('|')}</Text>}
                  </Box>
                ) : (
                  <Text dimColor>(f para digitar, F para construtor)</Text>
                )}
              </Box>
            )}
          </Box>
          <Text dimColor>|</Text>
          <Text color="yellow">Sort: {sortLabel} {sortAsc ? '\u2191' : '\u2193'}</Text>
          <Text dimColor>|</Text>
          <Text color="magenta">P: {FILTER_LABELS[filterMode]}</Text>
        </Box>
      </Box>

      {/* ── Content ── */}
      {filterModalOpen ? (
        <Box marginTop={1}>
          <FilterBuilderModal
            filterText={filter}
            maxHeight={maxRows}
            onClose={(newText) => { setFilter(newText); setFilterModalOpen(false); setCursor(0); }}
          />
        </Box>
      ) : columnSelectorOpen ? (
        <Box marginTop={1}>
          <ColumnSelectorModal
            visibleKeys={visibleMetrics}
            maxHeight={maxRows}
            onClose={(keys) => { setVisibleMetrics(keys); setColumnSelectorOpen(false); }}
          />
        </Box>
      ) : sortSelectorOpen ? (
        <Box marginTop={1}>
          <SortSelectorModal
            columns={sortableCols}
            currentKey={effectiveSortKey}
            ascending={sortAsc}
            maxHeight={maxRows}
            onSelect={(key, asc) => {
              setSortKey(key);
              setSortAsc(asc);
              setSortSelectorOpen(false);
            }}
            onCancel={() => setSortSelectorOpen(false)}
          />
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            {visibleCols.map((col, i) => (
              <Text key={col.key} dimColor bold={col.key === effectiveSortKey}>
                {i > 0 ? ' ' : ''}{col.align === 'left' ? pad(col.label, col.width) : padR(col.label, col.width)}
              </Text>
            ))}
          </Box>
          <Text dimColor>{'\u2500'.repeat(Math.min(termCols - 4, visibleCols.reduce((s, c) => s + c.width + 1, -1)))}</Text>

          {visible.map((m, i) => {
            const idx = scrollOffset + i;
            const active = idx === safeCursor;
            return (
              <Box key={m.id}>
                {visibleCols.map((col, ci) => {
                  const val = col.format(m);
                  const clr = active ? 'black' : col.color?.(m);
                  const txt = col.align === 'left' ? pad(val, col.width) : padR(val, col.width);
                  return (
                    <Text key={col.key} backgroundColor={active ? 'cyan' : undefined}
                      color={clr} dimColor={!active && !clr}>
                      {ci > 0 ? ' ' : ''}{txt}
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

      {/* ── Footer (hidden during filter/modal modes) ── */}
      {!filterActive && !anyModalOpen && (
        <Box marginTop={1} flexDirection="column">
          <Box gap={1} flexWrap="wrap">
            <Text color="cyan">{'\u2191\u2193'}</Text><Text dimColor>navegar</Text>
            <Text color="cyan">{'<>'}</Text><Text dimColor>pagina</Text>
            <Text color="cyan">{'\u2190\u2192'}</Text><Text dimColor>colunas</Text>
            <Text color="green">s</Text><Text dimColor>ordenar</Text>
            <Text color="green">S</Text><Text dimColor>direcao</Text>
            <Text color="green">c</Text><Text dimColor>metricas</Text>
            <Text color="green">f</Text><Text dimColor>filtro</Text>
            <Text color="green">F</Text><Text dimColor>construtor</Text>
            <Text color="green">p</Text><Text dimColor>preset</Text>
            <Text color="white">Enter</Text><Text dimColor>selecionar</Text>
            {onRefresh && <><Text color="green">u</Text><Text dimColor>{refreshing ? 'atualizando...' : 'atualizar'}</Text></>}
            {onCancel && <><Text color="red">ESC</Text><Text dimColor>voltar</Text></>}
            <Text dimColor>{sorted.length}/{models.length}</Text>
            {cacheAge != null && <Text dimColor>cache: {formatCacheAge(cacheAge)}</Text>}
          </Box>

          {(colOffset > 0 || colOffset < maxColOffset) && (
            <Box gap={2}>
              {colOffset > 0 && <Text color="yellow">{'\u25C0'} colunas a esquerda</Text>}
              {colOffset < maxColOffset && <Text color="yellow">colunas a direita {'\u25B6'}</Text>}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
