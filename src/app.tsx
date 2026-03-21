import { Box, Text } from 'ink';

/**
 * Componente raiz do Pi DAG CLI.
 *
 * Na Fase 1 será expandido para um router de telas (state machine)
 * que navega entre: config → contexto → task → executing.
 *
 * @example
 * ```tsx
 * import { render } from 'ink';
 * import { App } from './app.js';
 * render(<App />);
 * ```
 */
export const App = () => {
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
        <Text bold color="cyan">
          Pi DAG CLI
        </Text>
        <Text> v0.1</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Decompõe macro-tarefas em DAG e executa agentes IA em paralelo via Git Worktrees.
        </Text>
      </Box>
    </Box>
  );
};
