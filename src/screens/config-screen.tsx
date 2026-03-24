import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { useApiValidation, type ValidationState } from '../hooks/use-api-validation.js';
import { useModels } from '../hooks/use-models.js';
import { EnhancedModelTable } from '../components/enhanced-model-table.js';
import { findModel, formatPrice } from '../data/models.js';
import type { EnrichedModel } from '../data/enriched-model.js';
import type { Config } from '../schemas/config.schema.js';
import { getApiErrorMessage } from '../schemas/errors.js';
import { useArtificialAnalysis } from '../hooks/use-artificial-analysis.js';
import { buildEnrichedModels } from '../data/enriched-model.js';
import { saveGlobalCache } from '../services/offline-benchmark-cache.js';
import { getCachedModels } from '../data/openrouter-client.js';
import { getCachedAAModels } from '../data/artificial-analysis-client.js';

type ConfigStep =
  | 'api-key'
  | 'aa-key'
  | 'loading-models'
  | 'planner-model'
  | 'worker-model'
  | 'concurrency';

interface ConfigScreenProps {
  readonly onComplete: (config: Config) => void;
  /** Pular etapa de API key (para reconfiguracao de modelos via [m]) */
  readonly skipApiKey?: boolean;
  /** Config existente (preserva worktreeBasePath e pre-seleciona modelos ao reabrir via [m]) */
  readonly existingConfig?: Config;
}

/** Feedback visual do status de validacao da API key */
const ValidationFeedback = ({ validation }: { readonly validation: ValidationState }) => {
  if (validation.status === 'validating') return <Text color="yellow">Validando...</Text>;
  if (validation.status === 'valid') return <Text color="green">API key valida</Text>;
  if (validation.status === 'invalid') return <Text color="red">{getApiErrorMessage(validation.error)}</Text>;
  return null;
};

/** Resumo compacto do modelo selecionado */
const ModelSummary = ({ label, modelId }: { readonly label: string; readonly modelId: string }) => {
  const model = findModel(modelId);
  const name = model?.name ?? modelId;
  const price = model ? `${formatPrice(model.inputPrice)}/${formatPrice(model.outputPrice)}` : '';
  return (
    <Box marginTop={1}>
      <Text bold>{label}: </Text>
      <Text color="green">{name} ({price}) </Text>
      <Text color="green">✓</Text>
    </Box>
  );
};

/**
 * Tela de configuracao do Pi DAG CLI.
 * Coleta API keys (OpenRouter obrigatoria, Artificial Analysis opcional),
 * carrega modelos em tempo real, e permite selecao via tabela filtravel
 * com benchmarks quando AA key e fornecida.
 *
 * @param props.onComplete - Callback com Config validada
 * @param props.skipApiKey - Pular API key (reconfiguracao via [m])
 * @param props.existingConfig - Config existente
 *
 * @example
 * ```tsx
 * <ConfigScreen onComplete={(config) => saveConfig(config)} />
 * ```
 */
export const ConfigScreen = ({ onComplete, skipApiKey, existingConfig }: ConfigScreenProps) => {
  const initialStep: ConfigStep = skipApiKey ? 'loading-models' : 'api-key';
  const [step, setStep] = useState<ConfigStep>(initialStep);
  const [apiKey, setApiKey] = useState(existingConfig?.openrouterApiKey ?? '');
  const [aaApiKey, setAaApiKey] = useState(existingConfig?.artificialAnalysisApiKey ?? '');
  const [plannerModelId, setPlannerModelId] = useState(existingConfig?.selectedAgents?.planner ?? '');
  const [workerModelId, setWorkerModelId] = useState(existingConfig?.selectedAgents?.worker ?? '');
  const [concurrency, setConcurrency] = useState(String(existingConfig?.maxConcurrency ?? 4));
  const { validation, validate } = useApiValidation();

  const [refreshing, setRefreshing] = useState(false);

  // Carrega modelos quando tem API key
  const activeApiKey = skipApiKey ? existingConfig?.openrouterApiKey : apiKey;
  const { state: modelsState, forceRefresh: refreshOR } = useModels(activeApiKey);

  // Carrega dados AA se key disponivel
  const activeAaKey = skipApiKey ? existingConfig?.artificialAnalysisApiKey : (aaApiKey || undefined);
  const { state: aaState, forceRefresh: refreshAA } = useArtificialAnalysis(activeAaKey);

  const handleApiKeySubmit = useCallback((value: string) => {
    if (!value.trim()) return;
    void validate(value).then((isValid) => {
      if (isValid) {
        setStep('aa-key');
      }
    });
  }, [validate]);

  const handleAaKeySubmit = useCallback(() => {
    // AA key e opcional — Enter vazio pula
    setStep('loading-models');
  }, []);

  // Avanca automaticamente quando modelos carregarem
  if (step === 'loading-models' && modelsState.status === 'loaded') {
    setStep('planner-model');
  }

  /** Atualiza dados de ambas as APIs e salva no cache global */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshOR(), refreshAA()]);
      const orModels = getCachedModels();
      const aaModels = getCachedAAModels();
      if (orModels) await saveGlobalCache(orModels, aaModels ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [refreshOR, refreshAA]);

  const enrichedModels = buildEnrichedModels(
    modelsState.status === 'loaded' ? modelsState.models : [],
    aaState.status === 'loaded' ? aaState.models : [],
  );

  const cacheAge = (modelsState.status === 'loaded' ? modelsState.cacheAge : null)
    ?? (aaState.status === 'loaded' ? aaState.cacheAge : null);

  const handlePlannerSelect = useCallback((model: EnrichedModel) => {
    setPlannerModelId(model.id);
    setStep('worker-model');
  }, []);

  const worktreeBasePath = existingConfig?.worktreeBasePath ?? '.pi-dag-worktrees';

  const handleWorkerSelect = useCallback((model: EnrichedModel) => {
    setWorkerModelId(model.id);
    setStep('concurrency');
  }, []);

  const handleConcurrencySubmit = useCallback((value: string) => {
    const parsed = parseInt(value, 10);
    const valid = !isNaN(parsed) && parsed >= 1 && parsed <= 16 ? parsed : 4;
    onComplete({
      openrouterApiKey: apiKey,
      artificialAnalysisApiKey: aaApiKey || undefined,
      plannerModel: plannerModelId,
      workerModel: workerModelId,
      selectedAgents: { planner: plannerModelId, worker: workerModelId },
      maxConcurrency: valid,
      worktreeBasePath,
    });
  }, [apiKey, aaApiKey, plannerModelId, workerModelId, worktreeBasePath, onComplete]);

  // Step: API Key
  if (step === 'api-key') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="cyan">Pi DAG CLI — Configuracao</Text>
          <Box marginTop={1}>
            <Text>OpenRouter API Key: </Text>
            <TextInput
              value={apiKey}
              onChange={setApiKey}
              onSubmit={handleApiKeySubmit}
              mask="*"
              placeholder="sk-or-..."
            />
          </Box>
          <ValidationFeedback validation={validation} />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Cole sua API key e pressione Enter</Text>
        </Box>
      </Box>
    );
  }

  // Step: AA API Key (opcional)
  if (step === 'aa-key') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="cyan">Artificial Analysis API Key <Text dimColor>(opcional)</Text></Text>
          <Text dimColor>Adiciona benchmarks (Intelligence Index, Coding, Math, GPQA, HLE, etc.),</Text>
          <Text dimColor>velocidade (tokens/s) e pricing detalhado a tabela de modelos.</Text>
          <Box marginTop={1}>
            <Text>AA API Key: </Text>
            <TextInput
              value={aaApiKey}
              onChange={setAaApiKey}
              onSubmit={handleAaKeySubmit}
              mask="*"
              placeholder="Cole a key ou Enter para pular"
            />
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Obtenha em artificialanalysis.ai/login — Enter vazio para pular</Text>
        </Box>
      </Box>
    );
  }

  // Step: Loading Models
  if (step === 'loading-models') {
    if (modelsState.status === 'error') {
      return (
        <Box flexDirection="column" padding={1}>
          <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={1} flexDirection="column">
            <Text bold color="red">Erro ao carregar modelos</Text>
            <Text color="red">{modelsState.error}</Text>
            <Box marginTop={1}>
              <Text dimColor>Pressione Enter para tentar novamente</Text>
            </Box>
          </Box>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
          <Box gap={1}>
            <Text color="green"><Spinner type="dots" /></Text>
            <Text>Carregando modelos da OpenRouter...</Text>
          </Box>
          {aaApiKey && aaState.status === 'loading' && (
            <Box gap={1} marginTop={1}>
              <Text color="green"><Spinner type="dots" /></Text>
              <Text>Carregando benchmarks da Artificial Analysis...</Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  // Step: Planner Model
  if (step === 'planner-model') {
    const hasAA = aaState.status === 'loaded';
    return (
      <EnhancedModelTable
        models={enrichedModels}
        onSelect={handlePlannerSelect}
        title={`Modelo Planner (${enrichedModels.length} modelos${hasAA ? ' + benchmarks AA' : ''})`}
        hasAAData={hasAA}
        onRefresh={() => void handleRefresh()}
        refreshing={refreshing}
        cacheAge={cacheAge}
      />
    );
  }

  // Step: Worker Model
  if (step === 'worker-model') {
    const hasAA = aaState.status === 'loaded';
    return (
      <Box flexDirection="column">
        <ModelSummary label="Planner" modelId={plannerModelId} />
        <EnhancedModelTable
          models={enrichedModels}
          onSelect={handleWorkerSelect}
          title={`Modelo Worker (${enrichedModels.length} modelos${hasAA ? ' + benchmarks AA' : ''})`}
          hasAAData={hasAA}
          onRefresh={() => void handleRefresh()}
          refreshing={refreshing}
          cacheAge={cacheAge}
        />
      </Box>
    );
  }

  // Step: Concurrency
  return (
    <Box flexDirection="column" padding={1}>
      <ModelSummary label="Planner" modelId={plannerModelId} />
      <ModelSummary label="Worker" modelId={workerModelId} />
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column" marginTop={1}>
        <Text bold color="cyan">Concorrencia maxima</Text>
        <Text dimColor>Workers paralelos por wave (1-16, padrao: 4)</Text>
        <Box marginTop={1}>
          <Text>Max concorrencia: </Text>
          <TextInput
            value={concurrency}
            onChange={setConcurrency}
            onSubmit={handleConcurrencySubmit}
            placeholder="4"
          />
        </Box>
      </Box>
    </Box>
  );
};
