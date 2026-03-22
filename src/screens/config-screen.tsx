import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useApiValidation, type ValidationState } from '../hooks/use-api-validation.js';
import { ModelTable } from '../components/model-table.js';
import { getPlannerModels, getWorkerModels, findModel, formatPrice } from '../data/models.js';
import type { ModelEntry } from '../data/models.js';
import type { Config } from '../schemas/config.schema.js';

type ConfigStep = 'api-key' | 'planner-model' | 'worker-model' | 'concurrency';

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
  if (validation.status === 'invalid') return <Text color="red">Erro: {validation.error}</Text>;
  return null;
};

/** Resumo compacto do modelo selecionado */
const ModelSummary = ({ label, modelId }: { readonly label: string; readonly modelId: string }) => {
  const model = findModel(modelId);
  const name = model?.name ?? modelId;
  const price = model ? `${formatPrice(model.inputPrice)}/${formatPrice(model.outputPrice)}` : '';
  const swe = model?.sweBench !== null && model?.sweBench !== undefined ? ` | SWE: ${model.sweBench}%` : '';
  return (
    <Box marginTop={1}>
      <Text bold>{label}: </Text>
      <Text color="green">{name} ({price}{swe}) </Text>
      <Text color="green">✓</Text>
    </Box>
  );
};

/**
 * Tela de configuração do Pi DAG CLI.
 * Coleta API key, e permite seleção de modelos Planner e Worker
 * via tabela filtrável com 18 modelos (preço, velocidade, benchmarks).
 *
 * @param props.onComplete - Callback com Config validada
 * @param props.skipApiKey - Pular API key (reconfiguração via [m])
 * @param props.existingConfig - Config existente (preserva worktreeBasePath e modelos atuais)
 *
 * @example
 * ```tsx
 * <ConfigScreen onComplete={(config) => saveConfig(config)} />
 * <ConfigScreen skipApiKey existingConfig={currentConfig} onComplete={handleModelChange} />
 * ```
 */
export const ConfigScreen = ({ onComplete, skipApiKey, existingConfig }: ConfigScreenProps) => {
  const initialStep: ConfigStep = skipApiKey ? 'planner-model' : 'api-key';
  const [step, setStep] = useState<ConfigStep>(initialStep);
  const [apiKey, setApiKey] = useState(existingConfig?.openrouterApiKey ?? '');
  const [plannerModelId, setPlannerModelId] = useState(existingConfig?.selectedAgents?.planner ?? '');
  const [workerModelId, setWorkerModelId] = useState(existingConfig?.selectedAgents?.worker ?? '');
  const [concurrency, setConcurrency] = useState(String(existingConfig?.maxConcurrency ?? 4));
  const { validation, validate } = useApiValidation();

  const handleApiKeySubmit = useCallback((value: string) => {
    if (!value.trim()) return;
    void validate(value).then((isValid) => {
      if (isValid) setStep('planner-model');
    });
  }, [validate]);

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

  // Step: Planner Model
  if (step === 'planner-model') {
    return (
      <ModelTable
        models={getPlannerModels()}
        onSelect={handlePlannerSelect}
        title="Modelo Planner (raciocinio)"
      />
    );
  }

  // Step: Worker Model
  if (step === 'worker-model') {
    return (
      <Box flexDirection="column">
        <ModelSummary label="Planner" modelId={plannerModelId} />
        <ModelTable
          models={getWorkerModels()}
          onSelect={handleWorkerSelect}
          title="Modelo Worker (execucao rapida)"
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
