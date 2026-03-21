import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { ConfigScreen } from './screens/config-screen.js';
import { ContextScreen } from './screens/context-screen.js';
import { TaskScreen } from './screens/task-screen.js';
import { useConfig } from './hooks/use-config.js';
import type { Config } from './schemas/config.schema.js';

type Screen = 'loading' | 'config' | 'context' | 'task' | 'executing';

/** Estado acumulado ao longo das telas */
interface PipelineState {
  readonly config: Config | null;
  readonly contextFiles: readonly string[];
  readonly macroTask: string;
}

const INITIAL_STATE: PipelineState = {
  config: null,
  contextFiles: [],
  macroTask: '',
};

/**
 * Componente raiz do Pi DAG CLI.
 * Router de telas baseado em state machine simples:
 * loading → config → context → task → executing.
 *
 * Cada tela passa dados via callback para a próxima,
 * acumulando no PipelineState imutável.
 *
 * @example
 * ```tsx
 * import { render } from 'ink';
 * import { App } from './app.js';
 * render(<App />);
 * ```
 */
export const App = () => {
  const { state: configState, saveConfig } = useConfig();
  const [screen, setScreen] = useState<Screen>(
    configState.status === 'loading' ? 'loading' : 'config',
  );
  const [pipeline, setPipeline] = useState<PipelineState>(INITIAL_STATE);

  // Se useConfig terminou de carregar e já tem config, pular para context
  if (configState.status === 'loaded' && screen === 'loading') {
    setScreen('context');
    setPipeline((prev) => ({ ...prev, config: configState.config }));
  }
  if (configState.status === 'missing' && screen === 'loading') {
    setScreen('config');
  }
  if (configState.status === 'error' && screen === 'loading') {
    setScreen('config');
  }

  const handleConfigComplete = useCallback((config: Config) => {
    void saveConfig(config);
    setPipeline((prev) => ({ ...prev, config }));
    setScreen('context');
  }, [saveConfig]);

  const handleContextComplete = useCallback((selectedPaths: string[]) => {
    setPipeline((prev) => ({ ...prev, contextFiles: selectedPaths }));
    setScreen('task');
  }, []);

  const handleTaskSubmit = useCallback((task: string) => {
    setPipeline((prev) => ({ ...prev, macroTask: task }));
    setScreen('executing');
  }, []);

  if (screen === 'loading') {
    return (
      <Box padding={1}>
        <Text dimColor>Carregando configuracao...</Text>
      </Box>
    );
  }

  if (screen === 'config') {
    return (
      <Box flexDirection="column">
        {configState.status === 'error' && (
          <Box padding={1}>
            <Text color="red">Erro: {configState.error}</Text>
          </Box>
        )}
        <ConfigScreen onComplete={handleConfigComplete} />
      </Box>
    );
  }

  if (screen === 'context') {
    return <ContextScreen onComplete={handleContextComplete} />;
  }

  if (screen === 'task' && pipeline.config) {
    return (
      <TaskScreen
        config={pipeline.config}
        contextFiles={[...pipeline.contextFiles]}
        onSubmit={handleTaskSubmit}
      />
    );
  }

  // screen === 'executing'
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
        <Text bold color="yellow">Pi DAG CLI — Executando</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>Task: <Text bold>{pipeline.macroTask}</Text></Text>
        <Text>Contexto: <Text bold>{pipeline.contextFiles.length}</Text> arquivos</Text>
        <Text>Planner: <Text color="green">{pipeline.config?.plannerModel}</Text></Text>
        <Text>Worker: <Text color="green">{pipeline.config?.workerModel}</Text></Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Planner pipeline sera implementado na Fase 2...</Text>
      </Box>
    </Box>
  );
};
