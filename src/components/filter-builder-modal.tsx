/**
 * Modal visual para construir filtros compostos interativamente.
 * Permite adicionar/remover segmentos de filtro com navegacao por teclado.
 *
 * @module
 */

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { FilterSegment } from './composite-filter.js';
import { parseCompositeFilter, serializeFilter } from './composite-filter.js';

interface FilterBuilderModalProps {
  readonly filter: string;
  readonly onFilterChange: (filter: string) => void;
  readonly onClose: () => void;
}

/**
 * Modal interativo para construcao visual de filtros compostos.
 * Mostra segmentos parseados, permite navegar (↑↓), adicionar (a) e remover (d).
 *
 * @example
 * ```tsx
 * <FilterBuilderModal filter="$Intel>=40|gpt" onFilterChange={setFilter} onClose={close} />
 * ```
 */
export const FilterBuilderModal = ({ filter, onFilterChange, onClose }: FilterBuilderModalProps) => {
  const segments = parseCompositeFilter(filter);
  const [cursor, setCursor] = useState(0);
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState('');

  const updateSegments = (updated: readonly FilterSegment[]) => {
    onFilterChange(serializeFilter(updated));
  };

  const removeAt = (index: number) => {
    const updated = segments.filter((_, i) => i !== index);
    updateSegments(updated);
    if (cursor >= updated.length && updated.length > 0) setCursor(updated.length - 1);
    if (updated.length === 0) setCursor(0);
  };

  const addSegment = (raw: string) => {
    if (!raw.trim()) { setAdding(false); return; }
    const newSegs = parseCompositeFilter(raw);
    updateSegments([...segments, ...newSegs]);
    setAdding(false);
    setNewValue('');
  };

  const segLabel = (seg: FilterSegment): string =>
    seg.type === 'metric' ? `$${seg.alias} ${seg.op} ${seg.value}` : seg.raw;

  // Navigation mode (not adding)
  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow) setCursor((c) => Math.min(Math.max(0, segments.length - 1), c + 1));
    if ((input === 'd' || key.backspace || key.delete) && segments.length > 0) removeAt(cursor);
    if (input === 'a') setAdding(true);
  }, { isActive: !adding });

  // Adding mode — ESC to cancel
  useInput((_input, key) => {
    if (key.escape) { setAdding(false); setNewValue(''); }
  }, { isActive: adding });

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={2} paddingY={1}>
      <Text bold color="yellow">{'  Filtro Composto  '}</Text>

      <Box marginTop={1} gap={1}>
        <Text color="cyan">↑↓</Text><Text dimColor>navegar</Text>
        <Text color="red">d</Text><Text dimColor>remover</Text>
        <Text color="green">a</Text><Text dimColor>adicionar</Text>
        <Text color="cyan">ESC</Text><Text dimColor>fechar</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {segments.length === 0 && <Text dimColor>  (nenhum filtro ativo — pressione a para adicionar)</Text>}
        {segments.map((seg, i) => {
          const active = i === cursor;
          return (
            <Box key={`${seg.raw}-${i}`} gap={1}>
              <Text color={active ? 'cyan' : undefined} bold={active}>
                {active ? ' ▸ ' : '   '}
              </Text>
              <Text color={seg.type === 'metric' ? 'yellow' : 'white'} bold={active}>
                {segLabel(seg)}
              </Text>
              <Text dimColor>[{seg.type === 'metric' ? 'métrica' : 'texto'}]</Text>
            </Box>
          );
        })}
      </Box>

      {adding && (
        <Box marginTop={1}>
          <Text color="green" bold>Nova regra: </Text>
          <TextInput
            value={newValue}
            onChange={setNewValue}
            onSubmit={addSegment}
            placeholder="$Intel>=40, $MMLU>=75, gpt..."
            focus={true}
          />
        </Box>
      )}

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>Filtro: </Text>
        <Text color="cyan">{filter || '(vazio)'}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text dimColor>Sintaxe: </Text>
          <Text color="yellow">$Metrica</Text>
          <Text dimColor>{'>=valor  ou  texto livre  |  '}</Text>
          <Text color="yellow">|</Text>
          <Text dimColor> = OR entre regras</Text>
        </Text>
        <Text>
          <Text dimColor>Métricas: </Text>
          <Text color="yellow">Intel Code Math MMLU GPQA HLE LCB Sci M500 AIME Tok Speed TTFT I/$ Price Ctx</Text>
        </Text>
        <Text>
          <Text dimColor>Operadores: </Text>
          <Text color="yellow">{'>= <= > < ='}</Text>
          <Text dimColor>  Exemplo: </Text>
          <Text color="cyan">$Intel{'>='}40|$MMLU{'>='}75|gpt</Text>
        </Text>
      </Box>
    </Box>
  );
};
