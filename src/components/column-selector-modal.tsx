/**
 * Modal de selecao de colunas de metricas.
 * Permite mostrar/ocultar colunas da tabela via checkboxes.
 * Exibe descricao da metrica focada na legenda inferior.
 *
 * @module
 */

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { METRIC_COLUMNS } from './table-columns.js';

export interface ColumnSelectorModalProps {
  /** Keys das metricas atualmente visiveis */
  readonly visibleKeys: ReadonlySet<string>;
  /** Callback ao fechar — retorna novo set de keys visiveis */
  readonly onClose: (newVisibleKeys: ReadonlySet<string>) => void;
  /** Altura maxima disponivel para o conteudo */
  readonly maxHeight?: number;
}

/**
 * Modal com checkboxes para selecionar quais metricas exibir na tabela.
 * A descricao da metrica focada aparece na legenda inferior.
 *
 * @example
 * ```tsx
 * <ColumnSelectorModal visibleKeys={visibleMetrics} onClose={setVisibleMetrics} />
 * ```
 */
export const ColumnSelectorModal = ({ visibleKeys, onClose, maxHeight = 16 }: ColumnSelectorModalProps) => {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(visibleKeys));
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.escape) { onClose(selected); return; }
    if (key.downArrow) setCursor((c) => Math.min(c + 1, METRIC_COLUMNS.length - 1));
    if (key.upArrow) setCursor((c) => Math.max(c - 1, 0));

    if (input === ' ' || key.return) {
      const col = METRIC_COLUMNS[cursor];
      if (!col) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(col.key)) next.delete(col.key);
        else next.add(col.key);
        return next;
      });
    }

    // Atalhos para selecionar/desmarcar todos
    if (input === 'a') {
      setSelected(new Set(METRIC_COLUMNS.map((c) => c.key)));
    }
    if (input === 'n') {
      setSelected(new Set());
    }
  });

  const focusedCol = METRIC_COLUMNS[cursor];
  const checkedCount = selected.size;

  // Scroll within column list: reserve 8 lines for modal chrome (borders, title, description, footer)
  const listHeight = Math.min(METRIC_COLUMNS.length, Math.max(3, maxHeight - 8));
  const scrollStart = Math.max(0, cursor - listHeight + 1);
  const visibleItems = METRIC_COLUMNS.slice(scrollStart, scrollStart + listHeight);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Box gap={2}>
        <Text bold color="cyan">Colunas de Metricas</Text>
        <Text dimColor>({checkedCount}/{METRIC_COLUMNS.length} visiveis)</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {scrollStart > 0 && <Text dimColor>  {'\u2191'} mais {scrollStart} acima</Text>}
        {visibleItems.map((col, vi) => {
          const realIdx = scrollStart + vi;
          const active = realIdx === cursor;
          const checked = selected.has(col.key);
          return (
            <Box key={col.key}>
              <Text
                backgroundColor={active ? 'cyan' : undefined}
                color={active ? 'black' : checked ? 'white' : 'gray'}
              >
                {checked ? '[x]' : '[ ]'} {col.label.padEnd(6)} {col.group === 'speed' ? '(speed)' : ''}
              </Text>
            </Box>
          );
        })}
        {scrollStart + listHeight < METRIC_COLUMNS.length && (
          <Text dimColor>  {'\u2193'} mais {METRIC_COLUMNS.length - scrollStart - listHeight} abaixo</Text>
        )}
      </Box>

      {focusedCol && (
        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="yellow" bold>{focusedCol.label}: </Text>
          <Text dimColor>{focusedCol.description}</Text>
        </Box>
      )}

      <Box marginTop={1} gap={2}>
        <Text color="cyan">{'\u2191\u2193'}</Text><Text dimColor>navegar</Text>
        <Text color="green">Space</Text><Text dimColor>toggle</Text>
        <Text color="green">a</Text><Text dimColor>todos</Text>
        <Text color="green">n</Text><Text dimColor>nenhum</Text>
        <Text color="red">ESC</Text><Text dimColor>aplicar</Text>
      </Box>
    </Box>
  );
};
