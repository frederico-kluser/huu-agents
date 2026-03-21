import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { ConfigScreen } from './screens/config-screen.js';
import { ContextScreen } from './screens/context-screen.js';
import { TaskScreen } from './screens/task-screen.js';
import { ExecutionScreen } from './screens/execution-screen.js';
import { ResultScreen } from './screens/result-screen.js';
import { useConfig } from './hooks/use-config.js';
import type { Config } from './schemas/config.schema.js';
import type { DAGNode } from './schemas/dag.schema.js';
import type { WorkerResult } from './schemas/worker-result.schema.js';

type Screen = 'loading' | 'config' | 'context' | 'task' | 'executing' | 'result';

/** Resultado do pipeline para a tela de resultado */
interface PipelineResult {
  readonly nodes: readonly DAGNode[];
  readonly results: readonly WorkerResult[];
  readonly branch: string;
  readonly diffStat: string;
}

/** Estado acumulado ao longo das telas */
interface PipelineState {
  readonly config: Config | null;
  readonly contextFiles: readonly string[];
  readonly macroTask: string;
  readonly startTime: number;
  readonly result: PipelineResult | null;
}

const INITIAL_STATE: PipelineState = {
  config: null,
  contextFiles: [],
  macroTask: '',
  startTime: 0,
  result: null,
};

/**
 * Componente raiz do Pi DAG CLI.
 * Router de telas baseado em state machine simples:
 * loading → config → context → task → executing → result.
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
    setPipeline((prev) => ({ ...prev, macroTask: task, startTime: Date.now() }));
    setScreen('executing');
  }, []);

  const handleRetry = useCallback((_failedNodeIds: readonly string[]) => {
    setScreen('executing');
  }, []);

  const handleQuit = useCallback(() => {
    // exit é chamado dentro do ResultScreen via useApp
  }, []);

  const handleViewDiff = useCallback(() => {
    // Será implementado: exibe diff completo no terminal
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

  if (screen === 'result' && pipeline.result) {
    return (
      <ResultScreen
        nodes={pipeline.result.nodes}
        results={pipeline.result.results}
        branch={pipeline.result.branch}
        diffStat={pipeline.result.diffStat}
        onRetry={handleRetry}
        onQuit={handleQuit}
        onViewDiff={handleViewDiff}
      />
    );
  }

  // screen === 'executing'
  return (
    <ExecutionScreen
      macroTask={pipeline.macroTask}
      dag={null}
      logs={[]}
      results={[]}
      activeNodeId={null}
      startTime={pipeline.startTime}
    />
  );
};
