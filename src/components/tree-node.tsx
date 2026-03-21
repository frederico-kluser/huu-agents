import { Box, Text } from 'ink';
import type { FileNode } from '../utils/file-tree.js';

type SelectionState = 'none' | 'partial' | 'all';

interface TreeNodeProps {
  readonly node: FileNode;
  readonly depth: number;
  readonly isActive: boolean;
  readonly selectionState: SelectionState;
  readonly isExpanded: boolean;
}

const CHECKBOX: Record<SelectionState, string> = {
  none: '[ ]',
  partial: '[-]',
  all: '[x]',
};

const INDENT = '  ';

/**
 * Renderiza uma linha da árvore de arquivos com checkbox e indentação.
 * Diretórios mostram indicador de expansão, arquivos exibem nome simples.
 *
 * @example
 * <TreeNodeRow node={fileNode} depth={1} isActive selectionState="all" isExpanded={false} />
 */
export const TreeNodeRow = ({
  node,
  depth,
  isActive,
  selectionState,
  isExpanded,
}: TreeNodeProps) => {
  const prefix = INDENT.repeat(depth);
  const checkbox = CHECKBOX[selectionState];
  const dirIndicator = node.type === 'directory'
    ? (isExpanded ? ' \u25BC ' : ' \u25B6 ')
    : '  ';
  const label = node.type === 'directory' ? `${node.name}/` : node.name;

  const nameColor = isActive
    ? 'cyan'
    : node.type === 'directory' ? 'blue' : undefined;

  return (
    <Box>
      <Text color={isActive ? 'cyan' : undefined}>
        {prefix}{checkbox}{dirIndicator}
      </Text>
      <Text bold={isActive} color={nameColor}>
        {label}
      </Text>
    </Box>
  );
};
