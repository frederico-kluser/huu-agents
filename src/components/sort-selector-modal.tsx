/**
 * Modal de selecao de criterio de ordenacao.
 * Lista colunas sortable/visiveis e permite escolher a metrica de sort.
 *
 * @module
 */

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ColumnDef } from './table-columns.js';

export interface SortSelectorModalProps {
  /** Colunas sortable atualmente disponiveis */
  readonly columns: readonly ColumnDef[];
  /** Key da ordenacao atual */
  readonly currentKey: string;
  /** Direcao atual */
  readonly ascending: boolean;
  /** Callback quando usuario seleciona criterio */
  readonly onSelect: (key: string, ascending: boolean) => void;
  /** Callback quando usuario cancela */
  readonly onCancel: () => void;
}

/**
 * Modal para escolher criterio de ordenacao da tabela de modelos.
 *
 * @example
 * ```tsx
 * <SortSelectorModal
 *   columns={sortableCols}
 *   currentKey="intelligence"
 *   ascending={false}
 *   onSelect={(k, asc) => { setSortKey(k); setSortAsc(asc); }}
 *   onCancel={() => setOpen(false)}
 * />
 * ```
 */
export const SortSelectorModal = ({
  columns, currentKey, ascending, onSelect, onCancel,
}: SortSelectorModalProps) => {
  const initIdx = Math.max(0, columns.findIndex((c) => c.key === currentKey));
  const [cursor, setCursor] = useState(initIdx);
  const [asc, setAsc] = useState(ascending);

  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.downArrow) setCursor((c) => Math.min(c + 1, columns.length - 1));
    if (key.upArrow) setCursor((c) => Math.max(c - 1, 0));
    if (input === 'S' || (input === 's' && key.shift)) setAsc((prev) => !prev);
    if (key.return) {
      const col = columns[cursor];
      if (col) onSelect(col.key, asc);
    }
  });

  const focusedCol = columns[cursor];

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
      <Box gap={2}>
        <Text bold color="yellow">Ordenar por</Text>
        <Text dimColor>Direcao: {asc ? '\u2191 Ascendente' : '\u2193 Descendente'} (S inverte)</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {columns.map((col, i) => {
          const active = i === cursor;
          const isCurrent = col.key === currentKey;
          return (
            <Box key={col.key}>
              <Text
                backgroundColor={active ? 'yellow' : undefined}
                color={active ? 'black' : isCurrent ? 'yellow' : 'white'}
                bold={isCurrent}
              >
                {active ? ' \u25B8 ' : '   '}{col.label}
                {isCurrent ? ` ${asc ? '\u2191' : '\u2193'}` : ''}
              </Text>
            </Box>
          );
        })}
      </Box>

      {focusedCol && (
        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text dimColor>{focusedCol.description}</Text>
        </Box>
      )}

      <Box marginTop={1} gap={2}>
        <Text color="cyan">{'\u2191\u2193'}</Text><Text dimColor>navegar</Text>
        <Text color="green">Enter</Text><Text dimColor>selecionar</Text>
        <Text color="yellow">S</Text><Text dimColor>direcao</Text>
        <Text color="red">ESC</Text><Text dimColor>cancelar</Text>
      </Box>
    </Box>
  );
};
