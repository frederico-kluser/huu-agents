import { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfigScreen } from './screens/config-screen.js';
import { ContextScreen } from './screens/context-screen.js';
import { TaskScreen } from './screens/task-screen.js';
import { ProfileSelectScreen } from './screens/profile-select-screen.js';
import { OptionsScreen } from './screens/options-screen.js';
import { ExecutionScreen } from './screens/execution-screen.js';
import { ResultScreen } from './screens/result-screen.js';
import { DiffScreen } from './screens/diff-screen.js';
import { StatusBar } from './components/status-bar.js';
import { useConfig } from './hooks/use-config.js';
import { runPipeline, retryPipeline, type PipelineProgress } from './pipeline/orchestrator.js';
import type { CliArgs } from './cli-args.js';
import type { Config } from './schemas/config.schema.js';
import { getConfigErrorMessage } from './schemas/errors.js';
import type { DAG, DAGNode } from './schemas/dag.schema.js';
import type { WorkerResult } from './schemas/worker-result.schema.js';
import type { WorkerProfile } from './schemas/worker-profile.schema.js';

type Screen = 'loading' | 'config' | 'context' | 'task' | 'profile-select' | 'executing' | 'result' | 'diff' | 'options';

interface PipelineResult {
  readonly dag: DAG;
  readonly nodes: readonly DAGNode[];
  readonly results: readonly WorkerResult[];
  readonly branch: string;
  readonly baseBranch: string;
  readonly diffStat: string;
}

/** Contexto para retry seletivo — preservado entre result → executing */
interface RetryContext {
  readonly dag: DAG;
  readonly branch: string;
  readonly baseBranch: string;
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
  readonly activeProfile: WorkerProfile | null;
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
  activeProfile: null,
};

/**
 * Componente raiz do Pi DAG CLI.
 * State machine: loading → config → context → task → executing → result.
 * Aceita cliArgs para pular telas e overridar modelos.
 * StatusBar visivel em todas as telas exceto loading/config.
 * [o] abre opcoes (modelos individuais + pipeline profiles) sem resetar estado.
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

  // Keybinding [o] para opcoes (exceto durante config/loading/executing)
  useInput((input) => {
    if (input === 'o' && pipeline.config && screen !== 'config' && screen !== 'loading' && screen !== 'executing' && screen !== 'options' && screen !== 'diff') {
      setPipeline((prev) => ({ ...prev, previousScreen: screen }));
      setScreen('options');
    }
  });

  const handleConfigComplete = useCallback(async (config: Config) => {
    // Persistir config original (sem overrides CLI — esses sao de sessao).
    // Aguarda o resultado: se falhar, nao navega — o erro aparece via configState.
    const saveError = await saveConfig(config);
    if (saveError) return;

    const mergedConfig = applyModelOverrides(config, cliArgs);
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

  const handleOptionsConfigChange = useCallback(async (config: Config) => {
    const saveError = await saveConfig(config);
    if (saveError) return;
    setPipeline((prev) => ({ ...prev, config }));
  }, [saveConfig]);

  const handleOptionsBack = useCallback(() => {
    const target = pipeline.previousScreen ?? 'context';
    setPipeline((prev) => ({ ...prev, previousScreen: null }));
    setScreen(target);
  }, [pipeline.previousScreen]);

  const handleContextComplete = useCallback((selectedPaths: string[]) => {
    const hasCliTask = Boolean(cliArgs?.task);
    setPipeline((prev) => ({
      ...prev,
      contextFiles: selectedPaths,
      ...(hasCliTask ? { startTime: Date.now() } : {}),
    }));
    setScreen(hasCliTask ? 'executing' : 'task');
  }, [cliArgs?.task]);

  const handleTaskSubmit = useCallback((task: string) => {
    setPipeline((prev) => ({ ...prev, macroTask: task }));
    setScreen('profile-select');
  }, []);

  const handleProfileSelect = useCallback((profile: WorkerProfile | null) => {
    setPipeline((prev) => ({ ...prev, activeProfile: profile, startTime: Date.now() }));
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
        result: { dag, nodes: dag.nodes, results: progress.results, branch: progress.branch, baseBranch: progress.baseBranch, diffStat: progress.diffStat },
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
          baseBranch: pipeline.retryContext.baseBranch,
          previousResults: pipeline.retryContext.previousResults,
          onProgress,
          activeProfile: pipeline.activeProfile ?? undefined,
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
          activeProfile: pipeline.activeProfile ?? undefined,
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
        baseBranch: prev.result.baseBranch,
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
    />
  ) : null;

  if (screen === 'loading') {
    return <Box padding={1}><Text dimColor>Carregando configuracao...</Text></Box>;
  }

  if (screen === 'config') {
    return (
      <Box flexDirection="column">
        {configState.status === 'error' && <Box padding={1}><Text color="red">{getConfigErrorMessage(configState.error)}</Text></Box>}
        <ConfigScreen onComplete={handleConfigComplete} />
      </Box>
    );
  }

  if (screen === 'options' && pipeline.config) {
    return (
      <Box flexDirection="column">
        {statusBarEl}
        <OptionsScreen
          config={pipeline.config}
          onConfigChange={handleOptionsConfigChange}
          onBack={handleOptionsBack}
          projectRoot={process.cwd()}
        />
      </Box>
    );
  }

  if (screen === 'context') {
    return <Box flexDirection="column">{statusBarEl}<ContextScreen onComplete={handleContextComplete} /></Box>;
  }

  if (screen === 'task' && pipeline.config) {
    return (
      <Box flexDirection="column">
        {statusBarEl}
        <TaskScreen config={pipeline.config} contextFiles={[...pipeline.contextFiles]} onSubmit={handleTaskSubmit} onCancel={() => setScreen('context')} />
      </Box>
    );
  }

  if (screen === 'profile-select') {
    return (
      <Box flexDirection="column">
        {statusBarEl}
        <ProfileSelectScreen
          projectRoot={process.cwd()}
          apiKey={pipeline.config!.openrouterApiKey}
          defaultWorkerModel={pipeline.config!.workerModel}
          onSelect={handleProfileSelect}
        />
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
        <DiffScreen branch={pipeline.result.branch} baseBranch={pipeline.result.baseBranch} onBack={() => setScreen('result')} />
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
