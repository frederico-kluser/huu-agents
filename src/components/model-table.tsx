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

const priceColor = (price: number): string | undefined =>
  price <= 0.5 ? 'green' : price <= 5 ? 'yellow' : 'red';

const ctxColor = (k: number): string | undefined =>
  k >= 200 ? 'green' : k >= 100 ? 'yellow' : undefined;

const pad = (str: string, len: number): string =>
  str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);

const padR = (str: string, len: number): string =>
  str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;

/**
 * Tabela filtrável de modelos LLM da OpenRouter para seleção no terminal.
 * Exibe: Nome, Provider, Contexto, Preço In/Out, Tools, Reasoning, Moderado.
 * Suporta filtro por texto, navegação j/k, e seleção via Enter.
 *
 * @example
 * ```tsx
 * <ModelTable models={allModels} onSelect={handleSelect} title="Selecionar Modelo" />
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
        m.id.toLowerCase().includes(q) ||
        m.tokenizer.toLowerCase().includes(q),
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
          <TextInput value={filter} onChange={(v) => { setFilter(v); setCursor(0); }} placeholder="nome, provider, id ou tokenizer..." />
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text dimColor>
            {pad('Nome', 28)}{pad('Provider', 14)}{padR('Ctx', 6)} {padR('$In/M', 8)} {padR('$Out/M', 8)} {padR('Tools', 5)} {padR('Reas', 5)} {padR('Mod', 3)}
          </Text>
        </Box>
        <Text dimColor>{'─'.repeat(82)}</Text>

        {visible.map((m, i) => {
          const idx = scrollOffset + i;
          const active = idx === safeCursor;
          return (
            <Box key={m.id}>
              <Text backgroundColor={active ? 'cyan' : undefined} color={active ? 'black' : undefined}>
                {pad(m.name.slice(0, 27), 28)}
                {pad(m.provider.slice(0, 13), 14)}
              </Text>
              <Text backgroundColor={active ? 'cyan' : undefined} color={active ? 'black' : ctxColor(m.contextWindow)}>
                {padR(formatContext(m.contextWindow), 6)}
              </Text>
              <Text backgroundColor={active ? 'cyan' : undefined} color={active ? 'black' : priceColor(m.inputPrice)} dimColor={!active}>
                {' '}{padR(formatPrice(m.inputPrice), 8)}
              </Text>
              <Text backgroundColor={active ? 'cyan' : undefined} color={active ? 'black' : priceColor(m.outputPrice)} dimColor={!active}>
                {' '}{padR(formatPrice(m.outputPrice), 8)}
              </Text>
              <Text backgroundColor={active ? 'cyan' : undefined} color={active ? 'black' : m.hasTools ? 'green' : undefined}>
                {' '}{padR(m.hasTools ? 'Y' : '-', 5)}
              </Text>
              <Text backgroundColor={active ? 'cyan' : undefined} color={active ? 'black' : m.hasReasoning ? 'green' : undefined}>
                {' '}{padR(m.hasReasoning ? 'Y' : '-', 5)}
              </Text>
              <Text backgroundColor={active ? 'cyan' : undefined} color={active ? 'black' : undefined} dimColor={!active}>
                {' '}{padR(m.isModerated ? 'Y' : '-', 3)}
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
