/**
 * Tabela avancada de modelos LLM com:
 * - Filtros compostos pipe-separated ($Metric>=val|texto) com UNION
 * - Scroll horizontal (setas esquerda/direita)
 * - Scroll vertical (setas cima/baixo, Shift para pagina)
 * - Ordenacao multi-criterio (s para ciclar, S para inverter)
 * - Modal visual de filtros (F)
 * - Footer com legendas de benchmarks em 3 linhas coloridas
 *
 * @module
 */

import { useState, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import type { EnrichedModel } from '../data/enriched-model.js';
import { parseFilterString, applyFilters } from './filter-parser.js';
import { FilterBuilderModal } from './filter-builder-modal.js';
import {
  COLUMNS, SORT_CYCLE, FILTER_LABELS, FILTER_CYCLE,
  pad, padR,
  type ColumnDef, type SortKey, type FilterMode,
} from './table-columns.js';

// Header (border+title+filter+border) + table header + separator
const FIXED_HEADER = 7;
// Footer: nav + 2 benchmark lines + scroll indicators
const FIXED_FOOTER = 5;

// ── Props ───────────────────────────────────────────────────────────

interface EnhancedModelTableProps {
  readonly models: readonly EnrichedModel[];
  readonly onSelect: (model: EnrichedModel) => void;
  readonly title?: string;
  readonly hasAAData?: boolean;
  readonly onCancel?: () => void;
}

/**
 * Tabela avancada de selecao de modelos com filtros compostos,
 * scroll bidirecional e legendas de benchmark.
 *
 * Navegacao:
 * - Setas cima/baixo: navegar verticalmente
 * - Shift+setas ou PageUp/PageDown: pagina inteira
 * - Setas esquerda/direita: scroll horizontal (colunas)
 * - s: ciclar ordenacao | S: inverter direcao
 * - f: filtro texto (pipe-separated: $Intel>=40|gpt)
 * - F: modal visual de filtros compostos
 * - p: ciclar filtro preset | Enter: selecionar | ESC: voltar
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
  const [filterActive, setFilterActive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [colOffset, setColOffset] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('inputPrice');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>('none');
  const { stdout } = useStdout();
  const termCols = stdout?.columns ?? 120;
  const termRows = stdout?.rows ?? 24;
  const maxRows = Math.max(3, termRows - FIXED_HEADER - FIXED_FOOTER);

  const availableCols = useMemo(() =>
    COLUMNS.filter((c) => c.group === 'base' || hasAAData),
  [hasAAData]);

  const visibleCols = useMemo(() => {
    let w = 0;
    const cols: ColumnDef[] = [];
    for (let i = colOffset; i < availableCols.length; i++) {
      const col = availableCols[i]!;
      if (w + col.width + 1 > termCols - 4) break;
      cols.push(col);
      w += col.width + 1;
    }
    return cols;
  }, [availableCols, colOffset, termCols]);

  const maxColOffset = Math.max(0, availableCols.length - visibleCols.length);

  // Filtrar: pipe rules (UNION) + preset (AND)
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
  const pageSize = maxRows;

  // Navegacao da tabela
  useInput((input, key) => {
    if (key.escape && onCancel) { onCancel(); return; }
    if (input === 'f' && !key.shift) { setFilterActive(true); return; }
    if (input === 'F' || (input === 'f' && key.shift)) { setModalOpen(true); return; }

    // Vertical
    if (key.downArrow) setCursor((c) => Math.min(c + (key.shift ? pageSize : 1), sorted.length - 1));
    if (key.upArrow) setCursor((c) => Math.max(c - (key.shift ? pageSize : 1), 0));
    if (key.pageDown) setCursor((c) => Math.min(c + pageSize, sorted.length - 1));
    if (key.pageUp) setCursor((c) => Math.max(c - pageSize, 0));

    // Horizontal
    if (key.rightArrow) setColOffset((c) => Math.min(c + 1, maxColOffset));
    if (key.leftArrow) setColOffset((c) => Math.max(c - 1, 0));

    // Sort
    if (input === 's' && !key.shift) {
      setSortKey((prev) => {
        const idx = SORT_CYCLE.indexOf(prev);
        return SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]!;
      });
    }
    if (input === 'S' || (input === 's' && key.shift)) setSortAsc((prev) => !prev);

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
  }, { isActive: !filterActive && !modalOpen });

  // Filtro texto: ESC/Enter sai
  useInput((_input, key) => {
    if (key.escape || key.return) { setFilterActive(false); setCursor(0); }
  }, { isActive: filterActive });

  const sortLabel = availableCols.find((c) => c.key === sortKey)?.label ?? sortKey;
  const filterRules = parseFilterString(filter);
  const hasMetricF = filterRules.some((r) => r.type === 'metric');
  const hasTextF = filterRules.some((r) => r.type === 'text');

  return (
    <Box flexDirection="column" padding={1}>
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
                  placeholder="$Intel>=40|gpt|$MMLU>=70..."
                  focus={true}
                />
              </>
            ) : (
              <Box gap={1}>
                <Text dimColor>Filtro:</Text>
                {filter ? (
                  <Box gap={1}>
                    {hasMetricF && <Text color="yellow">{filterRules.filter((r) => r.type === 'metric').map((r) => r.type === 'metric' ? `$${r.metric}${r.operator}${r.value}` : '').join('|')}</Text>}
                    {hasMetricF && hasTextF && <Text dimColor>|</Text>}
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
      {modalOpen ? (
        <Box marginTop={1}>
          <FilterBuilderModal
            filterText={filter}
            maxHeight={maxRows}
            onClose={(newText) => { setFilter(newText); setModalOpen(false); setCursor(0); }}
          />
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            {visibleCols.map((col, i) => (
              <Text key={col.key} dimColor bold={col.key === sortKey}>
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

      {/* ── Footer (sempre visivel) ── */}
      <Box marginTop={1} flexDirection="column">
        <Box gap={1}>
          <Text color="cyan">{'\u2191\u2193'}</Text><Text dimColor>navegar</Text>
          <Text color="cyan">Shift+{'\u2191\u2193'}</Text><Text dimColor>pagina</Text>
          <Text color="cyan">{'\u2190\u2192'}</Text><Text dimColor>colunas</Text>
          <Text color="green">s/S</Text><Text dimColor>ordenar</Text>
          <Text color="green">f</Text><Text dimColor>filtro</Text>
          <Text color="green">F</Text><Text dimColor>construtor</Text>
          <Text color="green">p</Text><Text dimColor>preset</Text>
          <Text color="white">Enter</Text><Text dimColor>selecionar</Text>
          {onCancel && <><Text color="red">ESC</Text><Text dimColor>voltar</Text></>}
          <Text dimColor>{sorted.length}/{models.length}</Text>
        </Box>

        <Box gap={1}>
          <Text color="cyan" bold>Intel</Text><Text dimColor>Composto 0-100</Text>
          <Text color="cyan" bold>Code</Text><Text dimColor>Codigo 0-100</Text>
          <Text color="cyan" bold>Math</Text><Text dimColor>Mat 0-100</Text>
          <Text dimColor>|</Text>
          <Text color="yellow" bold>MMLU</Text><Text dimColor>Multi-dominio PhD</Text>
          <Text color="yellow" bold>GPQA</Text><Text dimColor>Q&A PhD-level</Text>
          <Text color="yellow" bold>HLE</Text><Text dimColor>Frontier reasoning</Text>
        </Box>

        <Box gap={1}>
          <Text color="green" bold>LCB</Text><Text dimColor>Codigo competitivo</Text>
          <Text color="green" bold>Sci</Text><Text dimColor>Python cientifico</Text>
          <Text dimColor>|</Text>
          <Text color="magenta" bold>M500</Text><Text dimColor>Mat competicao</Text>
          <Text color="magenta" bold>AIME</Text><Text dimColor>Olimpiada 2025</Text>
          <Text dimColor>|</Text>
          <Text color="blue" bold>Tok/s</Text><Text dimColor>Velocidade</Text>
          <Text color="blue" bold>TTFT</Text><Text dimColor>Latencia</Text>
          <Text dimColor>|</Text>
          <Text color="white" bold>I/$</Text><Text dimColor>Intel/preco</Text>
        </Box>

        {(colOffset > 0 || colOffset < maxColOffset) && (
          <Box gap={2}>
            {colOffset > 0 && <Text color="yellow">{'\u25C0'} colunas a esquerda</Text>}
            {colOffset < maxColOffset && <Text color="yellow">colunas a direita {'\u25B6'}</Text>}
          </Box>
        )}
      </Box>
    </Box>
  );
};
