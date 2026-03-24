import { useState, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import type { ModelEntry } from '../data/models.js';
import { formatPrice, formatContext, formatMaxTokens } from '../data/models.js';

interface ModelTableProps {
  readonly models: readonly ModelEntry[];
  readonly onSelect: (model: ModelEntry) => void;
  readonly title?: string;
}

const HEADER_LINES = 6;

const priceColor = (p: number): string | undefined =>
  p <= 0.5 ? 'green' : p <= 3 ? 'yellow' : undefined;

const ctxColor = (ctx: number): string | undefined =>
  ctx >= 200_000 ? 'green' : ctx >= 100_000 ? 'yellow' : undefined;

const pad = (str: string, len: number): string =>
  str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);

const padR = (str: string, len: number): string =>
  str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;

/**
 * Tabela filtrável de modelos LLM com dados em tempo real da OpenRouter.
 * Exibe: nome, provider, contexto, preços, modalidade, tokenizer, tools, reasoning.
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
        m.tokenizer.toLowerCase().includes(q) ||
        m.modality.toLowerCase().includes(q),
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
          <TextInput value={filter} onChange={(v) => { setFilter(v); setCursor(0); }} placeholder="nome, provider, id, tokenizer..." />
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text dimColor>
            {pad('Nome', 26)}{pad('Provider', 12)}{padR('Ctx', 7)} {padR('$In/M', 8)} {padR('$Out/M', 8)} {padR('MaxOut', 6)} {pad('Tok', 8)} {pad('Tools', 5)} {pad('Reas', 4)} {pad('Desde', 10)}
          </Text>
        </Box>
        <Text dimColor>{'─'.repeat(100)}</Text>

        {visible.map((m, i) => {
          const idx = scrollOffset + i;
          const active = idx === safeCursor;
          const bg = active ? 'cyan' : undefined;
          const fg = active ? 'black' : undefined;

          return (
            <Box key={m.id}>
              <Text backgroundColor={bg} color={fg}>
                {pad(m.name.slice(0, 25), 26)}
                {pad(m.provider.slice(0, 11), 12)}
              </Text>
              <Text backgroundColor={bg} color={active ? 'black' : ctxColor(m.contextWindow)}>
                {padR(formatContext(m.contextWindow), 7)}
              </Text>
              <Text backgroundColor={bg} color={active ? 'black' : priceColor(m.inputPrice)}>
                {' '}{padR(formatPrice(m.inputPrice), 8)}
              </Text>
              <Text backgroundColor={bg} color={active ? 'black' : priceColor(m.outputPrice)}>
                {' '}{padR(formatPrice(m.outputPrice), 8)}
              </Text>
              <Text backgroundColor={bg} color={fg}>
                {' '}{padR(formatMaxTokens(m.maxCompletionTokens), 6)}
              </Text>
              <Text backgroundColor={bg} color={fg} dimColor={!active}>
                {' '}{pad(m.tokenizer.slice(0, 7), 8)}
              </Text>
              <Text backgroundColor={bg} color={active ? 'black' : m.hasTools ? 'green' : undefined}>
                {' '}{pad(m.hasTools ? 'Y' : '—', 5)}
              </Text>
              <Text backgroundColor={bg} color={active ? 'black' : m.hasReasoning ? 'green' : undefined}>
                {' '}{pad(m.hasReasoning ? 'Y' : '—', 4)}
              </Text>
              <Text backgroundColor={bg} color={fg} dimColor={!active}>
                {' '}{pad(m.createdAt, 10)}
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
