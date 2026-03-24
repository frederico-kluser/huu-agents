/**
 * Modal visual para construcao de filtros compostos na tabela de modelos.
 * Permite adicionar/remover regras de filtro (texto ou metrica) via interface
 * navegavel por teclado, refletindo alteracoes no filtro pipe-separated.
 *
 * @module
 */

import { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { FilterRule, ComparisonOp } from './model-table-filter.js';
import type { ColumnDef } from './model-table-columns.js';

// ── Types ───────────────────────────────────────────────────────────

interface FilterBuilderModalProps {
  readonly rules: readonly FilterRule[];
  readonly columns: readonly ColumnDef[];
  readonly onApply: (rules: readonly FilterRule[]) => void;
  readonly onCancel: () => void;
}

type Phase = 'list' | 'pick-type' | 'text-input' | 'metric-col' | 'metric-op' | 'metric-val';

const OPERATORS: readonly ComparisonOp[] = ['>=', '<=', '>', '<', '=='];

// ── Component ───────────────────────────────────────────────────────

/**
 * Modal overlay para construcao visual de filtros compostos.
 * Mostra regras atuais e permite adicionar/remover individualmente.
 *
 * Keybindings (list phase):
 * - Up/Down: navegar regras
 * - d/Delete: remover regra selecionada
 * - a: adicionar nova regra
 * - Enter: aplicar filtros
 * - ESC: cancelar
 *
 * @example
 * ```tsx
 * <FilterBuilderModal
 *   rules={currentRules}
 *   columns={COLUMNS}
 *   onApply={(r) => setFilterText(serializeFilterRules(r))}
 *   onCancel={() => setShowBuilder(false)}
 * />
 * ```
 */
export const FilterBuilderModal = ({
  rules: initialRules,
  columns,
  onApply,
  onCancel,
}: FilterBuilderModalProps) => {
  const [rules, setRules] = useState<readonly FilterRule[]>([...initialRules]);
  const [cursor, setCursor] = useState(0);
  const [phase, setPhase] = useState<Phase>('list');

  // Estado para adicionar nova regra
  const [textValue, setTextValue] = useState('');
  const [metricColIdx, setMetricColIdx] = useState(0);
  const [metricOpIdx, setMetricOpIdx] = useState(0);
  const [metricVal, setMetricVal] = useState('');

  // Colunas numericas (que tem getValue retornando numero)
  const numericCols = useMemo(
    () => columns.filter((c) => c.group === 'benchmark' || c.group === 'speed'),
    [columns],
  );

  const removeRule = (idx: number) => {
    setRules((prev) => prev.filter((_, i) => i !== idx));
    setCursor((c) => Math.min(c, Math.max(0, rules.length - 2)));
  };

  const addTextRule = (query: string) => {
    if (!query.trim()) return;
    setRules((prev) => [...prev, { type: 'text', query: query.toLowerCase().trim() }]);
    setPhase('list');
    setCursor(rules.length);
    setTextValue('');
  };

  const addMetricRule = () => {
    const col = numericCols[metricColIdx];
    const op = OPERATORS[metricOpIdx];
    const val = Number(metricVal);
    if (!col || !op || isNaN(val)) return;
    setRules((prev) => [...prev, {
      type: 'metric',
      metricName: col.filterAlias,
      operator: op,
      value: val,
    }]);
    setPhase('list');
    setCursor(rules.length);
    setMetricVal('');
  };

  // ── List phase input ──
  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.return) { onApply(rules); return; }
    if (key.downArrow) setCursor((c) => Math.min(c + 1, rules.length - 1));
    if (key.upArrow) setCursor((c) => Math.max(c - 1, 0));
    if ((input === 'd' || key.delete || key.backspace) && rules.length > 0) {
      removeRule(cursor);
    }
    if (input === 'a') { setPhase('pick-type'); }
  }, { isActive: phase === 'list' });

  // ── Pick type phase ──
  useInput((input, key) => {
    if (key.escape) { setPhase('list'); return; }
    if (input === 't' || input === '1') { setPhase('text-input'); }
    if (input === 'm' || input === '2') {
      setMetricColIdx(0);
      setMetricOpIdx(0);
      setPhase('metric-col');
    }
  }, { isActive: phase === 'pick-type' });

  // ── Text input phase ──
  useInput((_input, key) => {
    if (key.escape) { setPhase('list'); setTextValue(''); return; }
    if (key.return) { addTextRule(textValue); }
  }, { isActive: phase === 'text-input' });

  // ── Metric column select ──
  useInput((_input, key) => {
    if (key.escape) { setPhase('list'); return; }
    if (key.downArrow) setMetricColIdx((c) => Math.min(c + 1, numericCols.length - 1));
    if (key.upArrow) setMetricColIdx((c) => Math.max(c - 1, 0));
    if (key.return) { setPhase('metric-op'); }
  }, { isActive: phase === 'metric-col' });

  // ── Metric operator select ──
  useInput((_input, key) => {
    if (key.escape) { setPhase('metric-col'); return; }
    if (key.downArrow) setMetricOpIdx((c) => Math.min(c + 1, OPERATORS.length - 1));
    if (key.upArrow) setMetricOpIdx((c) => Math.max(c - 1, 0));
    if (key.return) { setPhase('metric-val'); }
  }, { isActive: phase === 'metric-op' });

  // ── Metric value input ──
  useInput((_input, key) => {
    if (key.escape) { setPhase('metric-op'); return; }
    if (key.return) { addMetricRule(); }
  }, { isActive: phase === 'metric-val' });

  // ── Render helpers ──

  const ruleLabel = (r: FilterRule): string => {
    if (r.type === 'text') return `texto: "${r.query}"`;
    return `$${r.metricName} ${r.operator} ${r.value}`;
  };

  const previewStr = rules.map((r) => {
    if (r.type === 'text') return r.query;
    return `$${r.metricName}${r.operator}${r.value}`;
  }).join('|');

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="magenta" paddingX={2} paddingY={1}>
      <Text bold color="magenta">Construtor de Filtros Compostos</Text>

      {/* Preview do filtro resultante */}
      <Box marginTop={1}>
        <Text dimColor>Filtro: </Text>
        <Text color="cyan">{previewStr || '(vazio)'}</Text>
      </Box>

      {/* Lista de regras */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold dimColor>Regras ({rules.length}):</Text>
        {rules.length === 0 && <Text dimColor>  Nenhuma regra. Pressione [a] para adicionar.</Text>}
        {rules.map((r, i) => (
          <Box key={`${r.type}-${i}`}>
            <Text color={i === cursor && phase === 'list' ? 'cyan' : undefined}
                  bold={i === cursor && phase === 'list'}>
              {i === cursor && phase === 'list' ? ' > ' : '   '}
              {r.type === 'metric' ? <Text color="yellow">$</Text> : <Text color="green">T</Text>}
              {' '}{ruleLabel(r)}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Fases de adicao */}
      {phase === 'pick-type' && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text bold color="cyan">Tipo de regra:</Text>
          <Text>  [t/1] Texto (busca por nome/provider)</Text>
          <Text>  [m/2] Metrica (benchmark/velocidade)</Text>
          <Text dimColor>  ESC: voltar</Text>
        </Box>
      )}

      {phase === 'text-input' && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="green" paddingX={1}>
          <Text bold color="green">Texto de busca:</Text>
          <Box>
            <Text color="green">{'> '}</Text>
            <TextInput value={textValue} onChange={setTextValue} focus={true} placeholder="nome, provider..." />
          </Box>
          <Text dimColor>Enter: adicionar  ESC: cancelar</Text>
        </Box>
      )}

      {phase === 'metric-col' && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text bold color="yellow">Selecione a metrica:</Text>
          {numericCols.map((c, i) => (
            <Text key={c.key} color={i === metricColIdx ? 'cyan' : undefined} bold={i === metricColIdx}>
              {i === metricColIdx ? ' > ' : '   '}{c.filterAlias} ({c.label})
            </Text>
          ))}
          <Text dimColor>Setas: navegar  Enter: confirmar  ESC: voltar</Text>
        </Box>
      )}

      {phase === 'metric-op' && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text bold color="yellow">Operador para ${numericCols[metricColIdx]?.filterAlias}:</Text>
          {OPERATORS.map((op, i) => (
            <Text key={op} color={i === metricOpIdx ? 'cyan' : undefined} bold={i === metricOpIdx}>
              {i === metricOpIdx ? ' > ' : '   '}{op}
            </Text>
          ))}
          <Text dimColor>Setas: navegar  Enter: confirmar  ESC: voltar</Text>
        </Box>
      )}

      {phase === 'metric-val' && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text bold color="yellow">
            Valor para ${numericCols[metricColIdx]?.filterAlias} {OPERATORS[metricOpIdx]}:
          </Text>
          <Box>
            <Text color="yellow">{'> '}</Text>
            <TextInput value={metricVal} onChange={setMetricVal} focus={true} placeholder="ex: 40" />
          </Box>
          <Text dimColor>Enter: adicionar  ESC: voltar</Text>
        </Box>
      )}

      {/* Footer do modal */}
      {phase === 'list' && (
        <Box marginTop={1}>
          <Text dimColor>
            a:adicionar  d:remover  Enter:aplicar  ESC:cancelar
          </Text>
        </Box>
      )}
    </Box>
  );
};
