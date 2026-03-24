import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { useApiValidation, type ValidationState } from '../hooks/use-api-validation.js';
import { useModels } from '../hooks/use-models.js';
import { ModelTable } from '../components/model-table.js';
import { findModel, formatPrice } from '../data/models.js';
import type { ModelEntry } from '../data/models.js';
import type { Config } from '../schemas/config.schema.js';
import { getApiErrorMessage } from '../schemas/errors.js';

type ConfigStep = 'api-key' | 'loading-models' | 'planner-model' | 'worker-model' | 'concurrency';

interface ConfigScreenProps {
  readonly onComplete: (config: Config) => void;
  /** Pular etapa de API key (para reconfiguração de modelos via [m]) */
  readonly skipApiKey?: boolean;
  /** Config existente (preserva worktreeBasePath e pré-seleciona modelos ao reabrir via [m]) */
  readonly existingConfig?: Config;
}

/** Feedback visual do status de validação da API key */
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
 * Tela de configuração do Pi DAG CLI.
 * Coleta API key, carrega modelos da OpenRouter em tempo real,
 * e permite seleção de modelos Planner e Worker via tabela filtrável.
 *
 * @param props.onComplete - Callback com Config validada
 * @param props.skipApiKey - Pular API key (reconfiguração via [m])
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
  const [plannerModelId, setPlannerModelId] = useState(existingConfig?.selectedAgents?.planner ?? '');
  const [workerModelId, setWorkerModelId] = useState(existingConfig?.selectedAgents?.worker ?? '');
  const [concurrency, setConcurrency] = useState(String(existingConfig?.maxConcurrency ?? 4));
  const { validation, validate } = useApiValidation();

  // Carrega modelos quando tem API key
  const activeApiKey = skipApiKey ? existingConfig?.openrouterApiKey : apiKey;
  const { state: modelsState } = useModels(activeApiKey);

  const handleApiKeySubmit = useCallback((value: string) => {
    if (!value.trim()) return;
    void validate(value).then((isValid) => {
      if (isValid) {
        setStep('loading-models');
      }
    });
  }, [validate]);

  // Avança automaticamente quando modelos carregarem
  if (step === 'loading-models' && modelsState.status === 'loaded') {
    setStep('planner-model');
  }

  const handlePlannerSelect = useCallback((model: ModelEntry) => {
    setPlannerModelId(model.id);
    setStep('worker-model');
  }, []);

  const worktreeBasePath = existingConfig?.worktreeBasePath ?? '.pi-dag-worktrees';

  const handleWorkerSelect = useCallback((model: ModelEntry) => {
    setWorkerModelId(model.id);
    setStep('concurrency');
  }, []);

  const handleConcurrencySubmit = useCallback((value: string) => {
    const parsed = parseInt(value, 10);
    const valid = !isNaN(parsed) && parsed >= 1 && parsed <= 16 ? parsed : 4;
    onComplete({
      openrouterApiKey: apiKey,
      plannerModel: plannerModelId,
      workerModel: workerModelId,
      selectedAgents: { planner: plannerModelId, worker: workerModelId },
      maxConcurrency: valid,
      worktreeBasePath,
    });
  }, [apiKey, plannerModelId, workerModelId, worktreeBasePath, onComplete]);

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
        </Box>
      </Box>
    );
  }

  const allModels = modelsState.status === 'loaded' ? modelsState.models : [];

  // Step: Planner Model
  if (step === 'planner-model') {
    return (
      <ModelTable
        models={allModels}
        onSelect={handlePlannerSelect}
        title={`Modelo Planner (${allModels.length} modelos da OpenRouter)`}
      />
    );
  }

  // Step: Worker Model
  if (step === 'worker-model') {
    return (
      <Box flexDirection="column">
        <ModelSummary label="Planner" modelId={plannerModelId} />
        <ModelTable
          models={allModels}
          onSelect={handleWorkerSelect}
          title={`Modelo Worker (${allModels.length} modelos da OpenRouter)`}
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
