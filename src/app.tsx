import { useCallback } from 'react';
import { Box, Text } from 'ink';
import { ConfigScreen } from './screens/config-screen.js';
import { useConfig } from './hooks/use-config.js';
import type { Config } from './schemas/config.schema.js';

/**
 * Componente raiz do Pi DAG CLI.
 * Router de telas baseado em state machine: loading -> config -> ready.
 * Na Fase 1 o estado "ready" sera expandido para as demais telas.
 *
 * @example
 * import { render } from 'ink';
 * render(<App />);
 */
export const App = () => {
  const { state, saveConfig } = useConfig();

  const handleConfigComplete = useCallback((config: Config) => {
    void saveConfig(config);
  }, [saveConfig]);

  if (state.status === 'loading') {
    return (
      <Box padding={1}>
        <Text dimColor>Carregando configuracao...</Text>
      </Box>
    );
  }

  if (state.status === 'loaded') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text bold color="cyan">Pi DAG CLI</Text>
          <Text> v0.1</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Configurado. Pronto para uso.</Text>
          <Box marginTop={1} gap={2}>
            <Text>Planner: <Text color="green">{state.config.plannerModel}</Text></Text>
            <Text>Worker: <Text color="green">{state.config.workerModel}</Text></Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // status === 'missing' ou 'error' -> tela de configuracao
  return (
    <Box flexDirection="column">
      {state.status === 'error' && (
        <Box padding={1}>
          <Text color="red">Erro: {state.error}</Text>
        </Box>
      )}
      <ConfigScreen onComplete={handleConfigComplete} />
    </Box>
  );
};
