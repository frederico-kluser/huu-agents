import { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfigScreen } from './screens/config-screen.js';
import { ContextScreen } from './screens/context-screen.js';
import { TaskScreen } from './screens/task-screen.js';
import { ExecutionScreen } from './screens/execution-screen.js';
import { ResultScreen } from './screens/result-screen.js';
import { DiffScreen } from './screens/diff-screen.js';
import { StatusBar } from './components/status-bar.js';
import { useConfig } from './hooks/use-config.js';
import { runPipeline, retryPipeline, type PipelineProgress } from './pipeline/orchestrator.js';
import type { CliArgs } from './cli-args.js';
import type { Config } from './schemas/config.schema.js';
import type { DAG, DAGNode } from './schemas/dag.schema.js';
import type { WorkerResult } from './schemas/worker-result.schema.js';

type Screen = 'loading' | 'config' | 'context' | 'task' | 'executing' | 'result' | 'diff' | 'model-change';

interface PipelineResult {
  readonly dag: DAG;
  readonly nodes: readonly DAGNode[];
  readonly results: readonly WorkerResult[];
  readonly branch: string;
  readonly diffStat: string;
}

/** Contexto para retry seletivo — preservado entre result → executing */
interface RetryContext {
  readonly dag: DAG;
  readonly branch: string;
  readonly previousResults: readonly WorkerResult[];
}

interface PipelineState {
  readonly config: Config | null;
  readonly contextFiles: readonly string[];
  readonly macroTask: string;
  readonly startTime: number;
  readonly result: PipelineResult | null;
  readonly progress: PipelineProgress | null;
  readonly previousScreen: Screen | null;
  readonly retryContext: RetryContext | null;
}

interface AppProps {
  readonly cliArgs?: CliArgs;
}

/**
 * Aplica overrides de modelo CLI sobre a config persistida.
 * Precedencia: CLI flags > config persistida > defaults.
 */
const applyModelOverrides = (config: Config, cliArgs?: CliArgs): Config => {
  if (!cliArgs?.planner && !cliArgs?.worker) return config;
  const planner = cliArgs.planner ?? config.selectedAgents.planner;
  const worker = cliArgs.worker ?? config.selectedAgents.worker;
  return {
    ...config,
    plannerModel: planner,
    workerModel: worker,
    selectedAgents: { planner, worker },
  };
};

/**
 * Determina a tela inicial apos config carregada, considerando CLI args.
 * --context fornecido: pula para task. --task + --context: pula para executing.
 */
const resolveInitialScreen = (cliArgs?: CliArgs): Screen => {
  if (cliArgs?.task && cliArgs.context?.length) return 'executing';
  if (cliArgs?.context?.length) return 'task';
  return 'context';
};

const INITIAL_STATE: PipelineState = {
  config: null, contextFiles: [], macroTask: '',
  startTime: 0, result: null, progress: null, previousScreen: null, retryContext: null,
};

/**
 * Componente raiz do Pi DAG CLI.
 * State machine: loading → config → context → task → executing → result.
 * Aceita cliArgs para pular telas e overridar modelos.
 * StatusBar visivel em todas as telas exceto loading/config.
 * [m] abre selecao de modelos sem resetar estado.
 *
 * @param props.cliArgs - Argumentos CLI parseados (opcional)
 * @example
 * ```tsx
 * render(<App cliArgs={{ task: "Refatorar auth", context: ["src/auth"] }} />);
 * ```
 */
export const App = ({ cliArgs }: AppProps) => {
  const { state: configState, saveConfig } = useConfig();
  const [screen, setScreen] = useState<Screen>(
    configState.status === 'loading' ? 'loading' : 'config',
  );
  const [pipeline, setPipeline] = useState<PipelineState>(INITIAL_STATE);
  const cliAppliedRef = useRef(false);

  if (configState.status === 'loaded' && screen === 'loading') {
    const mergedConfig = applyModelOverrides(configState.config, cliArgs);
    const targetScreen = resolveInitialScreen(cliArgs);
    setScreen(targetScreen);
    setPipeline((prev) => ({
      ...prev,
      config: mergedConfig,
      contextFiles: cliArgs?.context ?? prev.contextFiles,
      macroTask: cliArgs?.task ?? prev.macroTask,
      startTime: targetScreen === 'executing' ? Date.now() : prev.startTime,
    }));
    cliAppliedRef.current = true;
  }
  if ((configState.status === 'missing' || configState.status === 'error') && screen === 'loading') {
    setScreen('config');
  }

  // Keybinding [m] para trocar modelos (exceto durante config/loading/executing)
  useInput((input) => {
    if (input === 'm' && pipeline.config && screen !== 'config' && screen !== 'loading' && screen !== 'executing' && screen !== 'model-change' && screen !== 'diff') {
      setPipeline((prev) => ({ ...prev, previousScreen: screen }));
      setScreen('model-change');
    }
  });

  const handleConfigComplete = useCallback((config: Config) => {
    const mergedConfig = applyModelOverrides(config, cliArgs);
    void saveConfig(mergedConfig);
    const targetScreen = cliAppliedRef.current ? 'context' : resolveInitialScreen(cliArgs);
    setPipeline((prev) => ({
      ...prev,
      config: mergedConfig,
      contextFiles: !cliAppliedRef.current && cliArgs?.context ? cliArgs.context : prev.contextFiles,
      macroTask: !cliAppliedRef.current && cliArgs?.task ? cliArgs.task : prev.macroTask,
      startTime: targetScreen === 'executing' ? Date.now() : prev.startTime,
    }));
    cliAppliedRef.current = true;
    setScreen(targetScreen);
  }, [saveConfig, cliArgs]);

  const handleModelChange = useCallback((config: Config) => {
    void saveConfig(config);
    setPipeline((prev) => ({
      ...prev,
      config,
      previousScreen: null,
    }));
    setScreen(pipeline.previousScreen ?? 'context');
  }, [saveConfig, pipeline.previousScreen]);

  const handleContextComplete = useCallback((selectedPaths: string[]) => {
    setPipeline((prev) => ({ ...prev, contextFiles: selectedPaths }));
    setScreen('task');
  }, []);

  const handleTaskSubmit = useCallback((task: string) => {
    setPipeline((prev) => ({ ...prev, macroTask: task, startTime: Date.now() }));
    setScreen('executing');
  }, []);

  useEffect(() => {
    if (screen !== 'executing' || !pipeline.config) return;
    let cancelled = false;

    const onProgress = (progress: PipelineProgress) => {
      if (!cancelled) setPipeline((prev) => ({ ...prev, progress }));
    };

    const handleResult = (progress: PipelineProgress) => {
      if (cancelled) return;
      const dag = progress.dag ?? { action: 'decompose' as const, nodes: [], metadata: { macroTask: '', totalNodes: 0, parallelizable: 0 } };
      setPipeline((prev) => ({
        ...prev,
        retryContext: null,
        result: { dag, nodes: dag.nodes, results: progress.results, branch: progress.branch, diffStat: progress.diffStat },
      }));
      setScreen('result');
    };

    const run = async () => {
      if (pipeline.retryContext) {
        // Retry seletivo: reutiliza DAG/branch, pula planner
        const result = await retryPipeline({
          config: pipeline.config!,
          dag: pipeline.retryContext.dag,
          branch: pipeline.retryContext.branch,
          previousResults: pipeline.retryContext.previousResults,
          onProgress,
        });
        handleResult(result);
      } else {
        // Execução completa: planner → DAG → workers
        if (!pipeline.macroTask) return;
        const result = await runPipeline({
          config: pipeline.config!,
          macroTask: pipeline.macroTask,
          contextFiles: pipeline.contextFiles,
          rootPath: process.cwd(),
          onProgress,
        });
        if (cancelled) return;
        if ('type' in result && result.type === 'clarify') { setScreen('task'); return; }
        handleResult(result as PipelineProgress);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [screen, pipeline.config, pipeline.macroTask, pipeline.contextFiles, pipeline.retryContext]);

  const handleRetry = useCallback(() => {
    setPipeline((prev) => ({
      ...prev,
      startTime: Date.now(),
      progress: null,
      retryContext: prev.result ? {
        dag: prev.result.dag,
        branch: prev.result.branch,
        previousResults: prev.result.results,
      } : null,
    }));
    setScreen('executing');
  }, []);

  const showStatusBar = pipeline.config && screen !== 'loading' && screen !== 'config';
  const statusBarEl = showStatusBar ? (
    <StatusBar
      plannerModel={pipeline.config!.selectedAgents.planner}
      workerModel={pipeline.config!.selectedAgents.worker}
      onChangeModels={screen !== 'executing' ? () => {
        setPipeline((prev) => ({ ...prev, previousScreen: screen }));
        setScreen('model-change');
      } : undefined}
    />
  ) : null;

  if (screen === 'loading') {
    return <Box padding={1}><Text dimColor>Carregando configuracao...</Text></Box>;
  }

  if (screen === 'config') {
    return (
      <Box flexDirection="column">
        {configState.status === 'error' && <Box padding={1}><Text color="red">Erro: {configState.error}</Text></Box>}
        <ConfigScreen onComplete={handleConfigComplete} />
      </Box>
    );
  }

  if (screen === 'model-change' && pipeline.config) {
    return (
      <ConfigScreen
        skipApiKey
        existingConfig={pipeline.config}
        onComplete={handleModelChange}
      />
    );
  }

  if (screen === 'context') {
    return <Box flexDirection="column">{statusBarEl}<ContextScreen onComplete={handleContextComplete} /></Box>;
  }

  if (screen === 'task' && pipeline.config) {
    return (
      <Box flexDirection="column">
        {statusBarEl}
        <TaskScreen config={pipeline.config} contextFiles={[...pipeline.contextFiles]} onSubmit={handleTaskSubmit} />
      </Box>
    );
  }

  if (screen === 'result' && pipeline.result) {
    return (
      <Box flexDirection="column">
        {statusBarEl}
        <ResultScreen
          nodes={pipeline.result.nodes} results={pipeline.result.results}
          branch={pipeline.result.branch} diffStat={pipeline.result.diffStat}
          onRetry={handleRetry} onQuit={() => {}} onViewDiff={() => setScreen('diff')}
        />
      </Box>
    );
  }

  if (screen === 'diff' && pipeline.result) {
    return (
      <Box flexDirection="column">
        {statusBarEl}
        <DiffScreen branch={pipeline.result.branch} onBack={() => setScreen('result')} />
      </Box>
    );
  }

  const p = pipeline.progress;
  return (
    <Box flexDirection="column">
      {statusBarEl}
      <ExecutionScreen
        macroTask={pipeline.macroTask} dag={p?.dag ?? null}
        logs={p?.logs ?? []} results={p?.results ?? []}
        activeNodeId={p?.activeNodeId ?? null} startTime={pipeline.startTime}
      />
    </Box>
  );
};
