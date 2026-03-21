import { Box, Text } from 'ink';
import type { DAGNode } from '../schemas/dag.schema.js';

interface DAGNodeRowProps {
  readonly node: DAGNode;
  readonly isBlocked: boolean;
}

const STATUS_ICON: Record<DAGNode['status'], string> = {
  pending: '\u25CB',  // ○
  running: '\u25C9',  // ◉
  done: '\u2714',     // ✔
  failed: '\u2716',   // ✖
};

const STATUS_COLOR: Record<DAGNode['status'], string> = {
  pending: 'gray',
  running: 'yellow',
  done: 'green',
  failed: 'red',
};

/**
 * Renderiza uma linha do DAG com icone de status, descricao e dependencias.
 * Nodes bloqueados (dependencias nao concluidas) aparecem com dimColor.
 *
 * @example
 * ```tsx
 * <DAGNodeRow
 *   node={{ id: "1", task: "Converter format.js", dependencies: [], status: "running", files: [] }}
 *   isBlocked={false}
 * />
 * ```
 */
export const DAGNodeRow = ({ node, isBlocked }: DAGNodeRowProps) => {
  const color = STATUS_COLOR[node.status];
  const icon = STATUS_ICON[node.status];
  const dim = isBlocked && node.status === 'pending';

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text color={color}>{icon}</Text>
        <Text dimColor={dim} color={dim ? undefined : color}>
          [{node.id}]
        </Text>
        <Text dimColor={dim} wrap="truncate">
          {node.task}
        </Text>
        {node.status === 'done' && node.files.length > 0 && (
          <Text dimColor>({node.files.length} arquivos)</Text>
        )}
      </Box>
      {node.dependencies.length > 0 && (
        <Box marginLeft={3}>
          <Text dimColor>
            {'\u2514\u2500'} depende de: [{node.dependencies.join(', ')}]
          </Text>
        </Box>
      )}
    </Box>
  );
};
