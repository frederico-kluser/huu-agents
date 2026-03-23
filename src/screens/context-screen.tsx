import { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { useFileTree } from '../hooks/use-file-tree.js';
import { TreeNodeRow } from '../components/tree-node.js';
import { getSelectionState } from '../utils/file-tree.js';

interface ContextScreenProps {
  readonly onComplete: (selectedPaths: string[]) => void;
}

/** Linhas reservadas para header + footer + padding */
const CHROME_LINES = 8;

/** Barra de status com contagem de arquivos e estimativa de tokens */
const StatusFooter = ({ count, tokens }: { count: number; tokens: number }) => (
  <Box flexDirection="column">
    <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} gap={2}>
      <Text><Text bold>{count}</Text><Text dimColor> arquivos</Text></Text>
      <Text>
        <Text dimColor>~</Text>
        <Text bold color="yellow">{tokens.toLocaleString()}</Text>
        <Text dimColor> tokens</Text>
      </Text>
    </Box>
    <Box>
      <Text dimColor>j/k:navegar  espaco:selecionar  enter:expandir  c:confirmar  [o] opcoes</Text>
    </Box>
  </Box>
);

/**
 * Tela de seleção de contexto do repositório.
 * Renderiza árvore de arquivos com checkboxes, navegação por teclado
 * e estimativa de tokens para a macro-task.
 *
 * @example
 * <ContextScreen onComplete={(paths) => handlePaths(paths)} />
 */
export const ContextScreen = ({ onComplete }: ContextScreenProps) => {
  const {
    loading, error, flatNodes, cursor, selected,
    selectedCount, totalTokens,
    moveUp, moveDown, toggleExpand, toggleSelect,
  } = useFileTree();
  const { stdout } = useStdout();
  const [scrollOffset, setScrollOffset] = useState(0);
  const viewportHeight = Math.max(5, (stdout?.rows ?? 24) - CHROME_LINES);

  useEffect(() => {
    if (cursor < scrollOffset) setScrollOffset(cursor);
    else if (cursor >= scrollOffset + viewportHeight) {
      setScrollOffset(cursor - viewportHeight + 1);
    }
  }, [cursor, scrollOffset, viewportHeight]);

  useInput((input, key) => {
    if (input === 'j' || key.downArrow) moveDown();
    if (input === 'k' || key.upArrow) moveUp();
    if (input === ' ') toggleSelect();
    if (key.return) toggleExpand();
    if (input === 'c' && selectedCount > 0) onComplete([...selected]);
  });

  if (loading) return <Box padding={1}><Text color="yellow">Carregando arquivos...</Text></Box>;
  if (error) return <Box padding={1}><Text color="red">Erro: {error}</Text></Box>;
  if (!flatNodes.length) return <Box padding={1}><Text dimColor>Nenhum arquivo.</Text></Box>;

  const visibleNodes = flatNodes.slice(scrollOffset, scrollOffset + viewportHeight);

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2}>
        <Text bold color="cyan">Selecionar Contexto</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {visibleNodes.map((fn, i) => (
          <TreeNodeRow
            key={fn.node.path} node={fn.node} depth={fn.depth}
            isActive={scrollOffset + i === cursor}
            selectionState={getSelectionState(fn.node, selected)}
            isExpanded={fn.isExpanded}
          />
        ))}
      </Box>
      <StatusFooter count={selectedCount} tokens={totalTokens} />
    </Box>
  );
};
