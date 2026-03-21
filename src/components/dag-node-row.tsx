import { Box, Text } from 'ink';
import type { DAGNode, NodeStatus } from '../schemas/dag.schema.js';

const STATUS_ICON: Record<NodeStatus, string> = {
  pending: '\u25CB',
  running: '\u27F3',
  done: '\u2713',
  failed: '\u2717',
};

const STATUS_COLOR: Record<NodeStatus, string> = {
  pending: 'gray',
  running: 'yellow',
  done: 'green',
  failed: 'red',
};

interface DagNodeRowProps {
  readonly node: DAGNode;
  readonly isActive?: boolean;
  readonly isBlocked?: boolean;
}

/**
 * Renderiza uma linha do DAG com icone de status colorido.
 * O no ativo (worker em execucao) recebe destaque visual com cor cyan.
 *
 * @param props.node - No do DAG com status atual
 * @param props.isActive - Se este e o no com worker ativo
 *
 * @example
 * ```tsx
 * <DagNodeRow
 *   node={{ id: "1", task: "format.js", dependencies: [], status: "done", files: [] }}
 *   isActive={false}
 * />
 * ```
 */
export const DagNodeRow = ({ node, isActive = false, isBlocked = false }: DagNodeRowProps) => {
  const icon = STATUS_ICON[node.status];
  const displayColor = isBlocked ? 'gray' : STATUS_COLOR[node.status];

  return (
    <Box>
      <Text color={displayColor} bold={isActive} dimColor={isBlocked}>
        {icon} [{node.id}]
      </Text>
      <Text bold={isActive} color={isActive ? 'cyan' : undefined} dimColor={isBlocked} wrap="truncate">
        {' '}{node.task}
      </Text>
    </Box>
  );
};
