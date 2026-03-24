/**
 * Modal visual para construcao de filtros compostos.
 * Permite adicionar e remover regras de filtro interativamente.
 * Acessado via tecla `F` na tabela de modelos.
 *
 * @module
 */

import { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { parseCompositeFilter, serializeFilter, AVAILABLE_METRICS } from './composite-filter.js';

// ── Props ───────────────────────────────────────────────────

interface FilterBuilderModalProps {
  readonly filter: string;
  readonly onFilterChange: (filter: string) => void;
  readonly onClose: () => void;
}

/**
 * Modal para construcao visual de filtros compostos.
 * Exibe regras ativas como lista editavel e permite adicionar novas.
 * Segmentos sao OR (aditivos) — modelo aparece se satisfizer qualquer regra.
 *
 * @example
 * ```tsx
 * <FilterBuilderModal filter="$Intel>=40|gpt" onFilterChange={setFilter} onClose={close} />
 * ```
 */
export const FilterBuilderModal = ({
  filter,
  onFilterChange,
  onClose,
}: FilterBuilderModalProps) => {
  const segments = useMemo(() => parseCompositeFilter(filter), [filter]);
  const [inputValue, setInputValue] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(-1);

  const isInputFocused = selectedIdx === -1;

  const addSegment = (raw: string) => {
    if (!raw.trim()) return;
    const parsed = parseCompositeFilter(raw);
    if (parsed.length === 0) return;
    const all = [...segments, ...parsed];
    onFilterChange(serializeFilter(all));
    setInputValue('');
  };

  const removeSegment = (index: number) => {
    const remaining = segments.filter((_, i) => i !== index);
    onFilterChange(serializeFilter(remaining));
    if (remaining.length === 0) {
      setSelectedIdx(-1);
    } else if (selectedIdx >= remaining.length) {
      setSelectedIdx(remaining.length - 1);
    }
  };

  // Navegacao na lista de regras
  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.upArrow) {
      setSelectedIdx((i) => Math.max(0, i - 1));
    }
    if (key.downArrow) {
      if (selectedIdx >= segments.length - 1) {
        setSelectedIdx(-1);
      } else {
        setSelectedIdx((i) => i + 1);
      }
    }
    if ((input === 'd' || key.backspace || key.delete) && segments.length > 0) {
      removeSegment(selectedIdx);
    }
    if (key.return) {
      setSelectedIdx(-1);
    }
  }, { isActive: !isInputFocused });

  // Modo de input (digitando nova regra)
  useInput((_input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.upArrow && segments.length > 0) {
      setSelectedIdx(segments.length - 1);
      return;
    }
    if (key.return && inputValue.trim()) {
      addSegment(inputValue);
    }
  }, { isActive: isInputFocused });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1} marginTop={1}>
      <Text bold color="yellow">Construtor de Filtro Composto</Text>
      <Text dimColor>Regras OR — modelo aparece se satisfizer qualquer regra</Text>

      <Box flexDirection="column" marginTop={1}>
        {segments.length === 0 && <Text dimColor>  (nenhuma regra ativa)</Text>}
        {segments.map((seg, i) => {
          const active = !isInputFocused && selectedIdx === i;
          const label = seg.raw;
          const typeColor = seg.type === 'metric' ? 'cyan' : 'green';
          const typeLabel = seg.type === 'metric' ? 'metrica' : 'texto';
          return (
            <Box key={`${i}-${seg.raw}`} gap={1}>
              <Text color={active ? 'yellow' : typeColor} bold={active}>
                {active ? '>' : ' '} {i + 1}. {label}
              </Text>
              <Text dimColor>[{typeLabel}]</Text>
              {active && <Text color="red"> [d:remover]</Text>}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1} gap={1}>
        <Text color={isInputFocused ? 'green' : 'gray'} bold={isInputFocused}>
          {isInputFocused ? '>' : ' '} Adicionar:
        </Text>
        {isInputFocused ? (
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            placeholder="$Intel>=40  ou  gpt  ou  $MMLU>=60"
            focus={true}
          />
        ) : (
          <Text dimColor>(Enter para digitar)</Text>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          {'  '}
          <Text color="gray">{'↑↓'}:navegar</Text>
          {'  '}
          {isInputFocused
            ? <Text color="green">Enter:adicionar</Text>
            : <><Text color="red">d:remover</Text>{'  '}<Text color="green">Enter:digitar</Text></>}
          {'  '}
          <Text color="yellow">ESC:fechar</Text>
        </Text>
        <Text dimColor>
          {'  Sintaxe: '}
          <Text color="cyan">$metrica{'>='}valor</Text>
          {'  ou  '}
          <Text color="green">texto</Text>
          {'  |  Metricas: '}
          <Text color="cyan">{AVAILABLE_METRICS.join('  ')}</Text>
        </Text>
      </Box>
    </Box>
  );
};
