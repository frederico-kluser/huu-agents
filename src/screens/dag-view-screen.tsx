import { useMemo } from 'react';
import { Box, Text, Spacer } from 'ink';
import type { DAG, DAGNode } from '../schemas/dag.schema.js';
import { DAGNodeRow } from '../components/dag-node-row.js';

interface DAGViewScreenProps {
  readonly dag: DAG;
}

/** Conta nodes por status */
const countByStatus = (
  nodes: readonly DAGNode[],
  status: DAGNode['status'],
): number => nodes.filter((n) => n.status === status).length;

/** Verifica se um node esta bloqueado (dependencia nao concluida) */
const isNodeBlocked = (
  node: DAGNode,
  nodeMap: ReadonlyMap<string, DAGNode>,
): boolean =>
  node.dependencies.some((depId) => {
    const dep = nodeMap.get(depId);
    return !dep || dep.status !== 'done';
  });

/**
 * Barra de progresso textual com blocos preenchidos/vazios e percentual.
 *
 * @example
 * ```tsx
 * <ProgressBar done={3} total={5} />
 * ```
 */
const ProgressBar = ({ done, total }: { done: number; total: number }) => {
  const width = 20;
  const filled = total > 0 ? Math.round((done / total) * width) : 0;
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <Text>
      <Text color="green">{bar}</Text>
      <Text dimColor> {pct}%</Text>
    </Text>
  );
};

/**
 * Tela de visualizacao do DAG de subtasks.
 * Renderiza cada node com status colorido, dependencias e barra de progresso.
 * Atualiza automaticamente quando o DAG recebido via props muda
 * (e.g. workers completando tarefas).
 *
 * @example
 * ```tsx
 * const dag: DAG = {
 *   action: 'decompose',
 *   nodes: [
 *     { id: '1', task: 'Setup database', dependencies: [], status: 'done', files: ['db.ts'] },
 *     { id: '2', task: 'Create API', dependencies: ['1'], status: 'running', files: [] },
 *   ],
 *   metadata: { macroTask: 'Build backend', totalNodes: 2, parallelizable: 1 },
 * };
 * <DAGViewScreen dag={dag} />
 * ```
 */
export const DAGViewScreen = ({ dag }: DAGViewScreenProps) => {
  const { nodes, metadata } = dag;

  if (nodes.length === 0) {
    return (
      <Box padding={1}>
        <Text color="yellow">DAG vazio — nenhum node para executar.</Text>
      </Box>
    );
  }

  const nodeMap = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes],
  );

  const done = countByStatus(nodes, 'done');
  const running = countByStatus(nodes, 'running');
  const failed = countByStatus(nodes, 'failed');

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        flexDirection="row"
      >
        <Text bold color="cyan">
          DAG: &quot;{metadata.macroTask}&quot;
        </Text>
        <Spacer />
        <Text dimColor>
          {metadata.totalNodes} nodes | {metadata.parallelizable} paralelizaveis
        </Text>
      </Box>

      {/* Node list */}
      <Box flexDirection="column" marginTop={1} paddingX={1} gap={0}>
        {nodes.map((node) => (
          <DAGNodeRow
            key={node.id}
            node={node}
            isBlocked={isNodeBlocked(node, nodeMap)}
          />
        ))}
      </Box>

      {/* Progress footer */}
      <Box
        marginTop={1}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        gap={2}
      >
        <ProgressBar done={done} total={nodes.length} />
        <Text>
          <Text bold color="green">{done}</Text>
          <Text dimColor>/{nodes.length} completos</Text>
        </Text>
        {running > 0 && (
          <Text>
            <Text bold color="yellow">{running}</Text>
            <Text dimColor> rodando</Text>
          </Text>
        )}
        {failed > 0 && (
          <Text>
            <Text bold color="red">{failed}</Text>
            <Text dimColor> falhas</Text>
          </Text>
        )}
      </Box>
    </Box>
  );
};
