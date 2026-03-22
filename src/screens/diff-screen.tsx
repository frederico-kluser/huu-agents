import { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { execGit } from '../git/git-wrapper.js';

interface DiffScreenProps {
  readonly branch: string;
  readonly onBack: () => void;
}

/** Retorna cor para uma linha de diff unified */
const lineColor = (line: string): string | undefined => {
  if (line.startsWith('+++') || line.startsWith('---')) return undefined;
  if (line.startsWith('+')) return 'green';
  if (line.startsWith('-')) return 'red';
  if (line.startsWith('@@')) return 'cyan';
  if (line.startsWith('diff ')) return 'yellow';
  return undefined;
};

/**
 * Tela de visualizacao do diff completo da branch final.
 * Viewer scrollavel com keybindings vim-like.
 *
 * @param props.branch - Nome da branch para calcular diff vs main
 * @param props.onBack - Callback para voltar a tela de resultado
 *
 * @example
 * ```tsx
 * <DiffScreen branch="task-20260321-143000" onBack={() => setScreen('result')} />
 * ```
 */
export const DiffScreen = ({ branch, onBack }: DiffScreenProps) => {
  const { stdout } = useStdout();
  const [diff, setDiff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  const viewportHeight = Math.max((stdout?.rows ?? 24) - 4, 5);

  useEffect(() => {
    const fetch = async () => {
      const result = await execGit(
        ['diff', `main...${branch}`],
        process.cwd(),
      );
      if (result.ok) {
        setDiff(result.value || '(nenhuma diferenca)');
      } else {
        setError(result.error.message);
      }
    };
    void fetch();
  }, [branch]);

  const lines = diff?.split('\n') ?? [];
  const maxOffset = Math.max(0, lines.length - viewportHeight);

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      onBack();
      return;
    }
    if (key.downArrow || input === 'j') {
      setScrollOffset((prev) => Math.min(prev + 1, maxOffset));
    }
    if (key.upArrow || input === 'k') {
      setScrollOffset((prev) => Math.max(prev - 1, 0));
    }
    if (input === ' ') {
      setScrollOffset((prev) => Math.min(prev + viewportHeight, maxOffset));
    }
    if (input === 'b') {
      setScrollOffset((prev) => Math.max(prev - viewportHeight, 0));
    }
  });

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Erro ao obter diff: {error}</Text>
        <Text dimColor>[q] voltar</Text>
      </Box>
    );
  }

  if (diff === null) {
    return (
      <Box padding={1}>
        <Text dimColor>Carregando diff...</Text>
      </Box>
    );
  }

  const visible = lines.slice(scrollOffset, scrollOffset + viewportHeight);
  const position = `${scrollOffset + 1}-${Math.min(scrollOffset + viewportHeight, lines.length)}/${lines.length}`;

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text bold>Diff: main...{branch}</Text>
        <Text dimColor>  ({position})</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {visible.map((line, i) => (
          <Text key={`${scrollOffset + i}`} color={lineColor(line)}>
            {line}
          </Text>
        ))}
      </Box>
      <Box paddingX={1}>
        <Text dimColor>[j/k] scroll  [space/b] page  [q] voltar</Text>
      </Box>
    </Box>
  );
};
