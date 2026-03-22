import { useState, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import type { ModelEntry } from '../data/models.js';
import { formatPrice, formatContext } from '../data/models.js';

interface ModelTableProps {
  readonly models: readonly ModelEntry[];
  readonly onSelect: (model: ModelEntry) => void;
  readonly title?: string;
}

const HEADER_LINES = 6;

const speedColor = (s: number): string =>
  s >= 150 ? 'green' : s >= 50 ? 'yellow' : 'red';

const sweColor = (s: number | null): string | undefined =>
  s === null ? undefined : s >= 78 ? 'green' : s >= 70 ? 'yellow' : undefined;

const pcColor = (r: number): string | undefined =>
  r >= 200 ? 'green' : r >= 50 ? 'yellow' : undefined;

const pad = (str: string, len: number): string =>
  str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);

const padR = (str: string, len: number): string =>
  str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;

/**
 * Tabela filtrável de modelos LLM para seleção no terminal.
 * Suporta filtro por texto, navegação j/k, e seleção via Enter.
 *
 * @example
 * ```tsx
 * <ModelTable models={getPlannerModels()} onSelect={handleSelect} title="Planner" />
 * ```
 */
export const ModelTable = ({ models, onSelect, title }: ModelTableProps) => {
  const [filter, setFilter] = useState('');
  const [cursor, setCursor] = useState(0);
  const { stdout } = useStdout();
  const maxRows = Math.max(3, (stdout?.rows ?? 24) - HEADER_LINES);

  const filtered = useMemo(() => {
    if (!filter.trim()) return [...models];
    const q = filter.toLowerCase();
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q),
    );
  }, [models, filter]);

  const safeCursor = Math.min(cursor, Math.max(0, filtered.length - 1));
  const scrollOffset = Math.max(0, safeCursor - maxRows + 1);
  const visible = filtered.slice(scrollOffset, scrollOffset + maxRows);

  useInput((input, key) => {
    if (input === 'j' || key.downArrow) {
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    }
    if (input === 'k' || key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
    }
    if (key.return && filtered[safeCursor]) {
      onSelect(filtered[safeCursor]!);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column">
        {title && <Text bold color="cyan">{title}</Text>}
        <Box marginTop={1}>
          <Text dimColor>Filtro: </Text>
          <TextInput value={filter} onChange={(v) => { setFilter(v); setCursor(0); }} placeholder="nome, provider ou id..." />
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text dimColor>{pad('Nome', 22)}{pad('Provider', 12)}{padR('t/s', 5)} {padR('Ctx', 5)} {padR('$In', 6)} {padR('$Out', 6)} {padR('SWE%', 6)} {padR('P/C', 5)}</Text>
        </Box>
        <Text dimColor>{'─'.repeat(72)}</Text>

        {visible.map((m, i) => {
          const idx = scrollOffset + i;
          const active = idx === safeCursor;
          return (
            <Box key={m.id}>
              <Text backgroundColor={active ? 'cyan' : undefined} color={active ? 'black' : undefined}>
                {pad(m.name, 22)}
                {pad(m.provider, 12)}
              </Text>
              <Text backgroundColor={active ? 'cyan' : undefined} color={active ? 'black' : speedColor(m.speed)}>
                {padR(String(m.speed), 5)}
              </Text>
              <Text backgroundColor={active ? 'cyan' : undefined} color={active ? 'black' : undefined}>
                {' '}{padR(formatContext(m.contextWindow), 5)}
              </Text>
              <Text backgroundColor={active ? 'cyan' : undefined} color={active ? 'black' : undefined} dimColor={!active}>
                {' '}{padR(formatPrice(m.inputPrice), 6)}
                {' '}{padR(formatPrice(m.outputPrice), 6)}
              </Text>
              <Text backgroundColor={active ? 'cyan' : undefined} color={active ? 'black' : sweColor(m.sweBench)}>
                {' '}{padR(m.sweBench !== null ? `${m.sweBench}%` : '—', 6)}
              </Text>
              <Text backgroundColor={active ? 'cyan' : undefined} color={active ? 'black' : pcColor(m.perfCostRatio)} bold={!active && m.perfCostRatio >= 200}>
                {' '}{padR(String(m.perfCostRatio), 5)}
              </Text>
              {active && <Text> {'<'}</Text>}
            </Box>
          );
        })}

        {filtered.length === 0 && (
          <Text dimColor>Nenhum modelo encontrado para "{filter}"</Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>j/k:navegar  Enter:selecionar  {filtered.length}/{models.length} modelos</Text>
      </Box>
    </Box>
  );
};
