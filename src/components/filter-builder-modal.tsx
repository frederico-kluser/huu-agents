/**
 * Modal visual para construcao de filtros compostos.
 * Permite adicionar/remover regras de filtro com preview em tempo real.
 * Acessado via tecla 'F' na tabela de modelos.
 *
 * @module
 */

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { FilterRule } from './filter-parser.js';
import { parseFilterString, serializeFilters, AVAILABLE_METRICS } from './filter-parser.js';

interface FilterBuilderModalProps {
  readonly filterText: string;
  readonly onClose: (newFilterText: string) => void;
  readonly maxHeight?: number;
}

/**
 * Modal interativo para construir filtros compostos pipe-separated.
 * Parseia o texto de filtro existente em regras individuais editaveis.
 *
 * @example
 * ```tsx
 * <FilterBuilderModal filterText="$Intel>=40|gpt" onClose={setFilter} />
 * ```
 */
export const FilterBuilderModal = ({ filterText, onClose, maxHeight = 16 }: FilterBuilderModalProps) => {
  const [rules, setRules] = useState<FilterRule[]>(() => [...parseFilterString(filterText)]);
  const [cursor, setCursor] = useState(0);
  const [adding, setAdding] = useState(false);
  const [newRule, setNewRule] = useState('');

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
    setCursor((c) => Math.min(c, Math.max(0, rules.length - 2)));
  };

  const formatRule = (rule: FilterRule): string =>
    rule.type === 'text' ? rule.value : `$${rule.metric}${rule.operator}${rule.value}`;

  // Navegacao no modal (ativo quando NAO esta adicionando)
  useInput((input, key) => {
    if (key.escape) { onClose(serializeFilters(rules)); return; }
    if (key.downArrow) setCursor((c) => Math.min(c + 1, rules.length - 1));
    if (key.upArrow) setCursor((c) => Math.max(c - 1, 0));
    if ((input === 'd' || input === 'x') && rules.length > 0) removeRule(cursor);
    if (input === 'a' || (key.return && rules.length === 0)) setAdding(true);
  }, { isActive: !adding });

  // Modo de adicao: ESC cancela, Enter confirma
  useInput((_input, key) => {
    if (key.escape) { setAdding(false); setNewRule(''); return; }
    if (key.return && newRule.trim()) {
      const parsed = parseFilterString(newRule.trim());
      if (parsed.length > 0) {
        setRules((prev) => [...prev, ...parsed]);
        setCursor(rules.length + parsed.length - 1);
      }
      setAdding(false);
      setNewRule('');
    }
  }, { isActive: adding });

  const ruleListHeight = Math.min(rules.length, maxHeight - 8);
  const scrollStart = Math.max(0, cursor - ruleListHeight + 1);
  const visibleRules = rules.slice(scrollStart, scrollStart + ruleListHeight);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Box gap={2}>
        <Text bold color="cyan">Filtros Compostos</Text>
        <Text dimColor>(cada filtro expande resultados — OR/UNION)</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {rules.length === 0 && !adding && (
          <Text dimColor>Nenhum filtro ativo — pressione a para adicionar</Text>
        )}
        {visibleRules.map((rule, vi) => {
          const realIdx = scrollStart + vi;
          const active = realIdx === cursor && !adding;
          const label = formatRule(rule);
          return (
            <Box key={`${realIdx}-${label}`}>
              <Text
                backgroundColor={active ? 'cyan' : undefined}
                color={active ? 'black' : rule.type === 'metric' ? 'yellow' : 'white'}
              >
                {active ? ' \u25B8 ' : '   '}
                {label}
              </Text>
              {active && <Text dimColor>  (d:remover)</Text>}
            </Box>
          );
        })}
        {scrollStart + ruleListHeight < rules.length && (
          <Text dimColor>  \u2193 mais {rules.length - scrollStart - ruleListHeight} regra(s)</Text>
        )}
      </Box>

      {adding ? (
        <Box marginTop={1}>
          <Text color="green" bold>+ </Text>
          <TextInput
            value={newRule}
            onChange={setNewRule}
            placeholder="$Intel>=40, $MMLU>=20 ou gpt..."
            focus={true}
          />
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text dimColor>a:adicionar  d:remover  ESC:fechar e aplicar</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Box gap={1}>
          <Text dimColor>Metricas:</Text>
          <Text color="yellow">{AVAILABLE_METRICS.join('  ')}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Operadores:</Text>
          <Text color="green">{'>= <= > < =='}</Text>
          <Text dimColor>Exemplo:</Text>
          <Text color="cyan">$intel{'>='}40</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Resultado:</Text>
          <Text color="white" bold>{serializeFilters(rules) || '(sem filtros)'}</Text>
        </Box>
      </Box>
    </Box>
  );
};
