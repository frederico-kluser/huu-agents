import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { useApiValidation, type ValidationState } from '../hooks/use-api-validation.js';
import type { Config } from '../schemas/config.schema.js';

type ConfigStep = 'api-key' | 'planner-model' | 'worker-model';

interface ConfigScreenProps {
  readonly onComplete: (config: Config) => void;
}

/** Modelos com reasoning para planejamento de DAG */
const PLANNER_MODELS = [
  { label: 'GPT-4.1 (OpenAI)', value: 'openai/gpt-4.1' },
  { label: 'Gemini 2.5 Pro (Google)', value: 'google/gemini-2.5-pro' },
  { label: 'DeepSeek Chat', value: 'deepseek/deepseek-chat' },
];

/** Modelos rapidos para execucao de workers */
const WORKER_MODELS = [
  { label: 'GPT-4.1 Mini (OpenAI)', value: 'openai/gpt-4.1-mini' },
  { label: 'Gemini 2.5 Flash (Google)', value: 'google/gemini-2.5-flash' },
  { label: 'GPT-4.1 Nano (OpenAI)', value: 'openai/gpt-4.1-nano' },
];

/** Feedback visual do status de validacao da API key */
const ValidationFeedback = ({ validation }: { readonly validation: ValidationState }) => {
  if (validation.status === 'validating') return <Text color="yellow">Validando...</Text>;
  if (validation.status === 'valid') return <Text color="green">API key valida</Text>;
  if (validation.status === 'invalid') return <Text color="red">Erro: {validation.error}</Text>;
  return null;
};

/**
 * Tela de configuracao inicial do Pi DAG CLI.
 * Coleta API key OpenRouter, valida via HEAD request, e permite selecao
 * de modelos para Planner (reasoning) e Worker (fast).
 *
 * @param props.onComplete - Callback com Config validada ao finalizar setup
 * @example
 * <ConfigScreen onComplete={(config) => saveConfig(config)} />
 */
export const ConfigScreen = ({ onComplete }: ConfigScreenProps) => {
  const [step, setStep] = useState<ConfigStep>('api-key');
  const [apiKey, setApiKey] = useState('');
  const [plannerModel, setPlannerModel] = useState('');
  const { validation, validate } = useApiValidation();

  const handleApiKeySubmit = useCallback((value: string) => {
    if (!value.trim()) return;
    void validate(value).then((isValid) => {
      if (isValid) setStep('planner-model');
    });
  }, [validate]);

  const handlePlannerSelect = useCallback((item: { label: string; value: string }) => {
    setPlannerModel(item.value);
    setStep('worker-model');
  }, []);

  const handleWorkerSelect = useCallback((item: { label: string; value: string }) => {
    onComplete({
      openrouterApiKey: apiKey,
      plannerModel,
      workerModel: item.value,
      worktreeBasePath: '.pi-dag-worktrees',
    });
  }, [apiKey, plannerModel, onComplete]);

  const helpText = step === 'api-key'
    ? 'Cole sua API key e pressione Enter'
    : step === 'planner-model'
      ? 'Selecione o modelo para planejamento (setas + Enter)'
      : 'Selecione o modelo para execucao (setas + Enter)';

  return (
    <Box flexDirection="column" padding={1}>
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        flexDirection="column"
      >
        <Text bold color="cyan">Pi DAG CLI — Configuracao</Text>

        {/* API Key input */}
        <Box marginTop={1}>
          <Text>OpenRouter API Key: </Text>
          {step === 'api-key' ? (
            <TextInput
              value={apiKey}
              onChange={setApiKey}
              onSubmit={handleApiKeySubmit}
              mask="*"
              placeholder="sk-or-..."
            />
          ) : (
            <Text color="green">{'*'.repeat(Math.min(apiKey.length, 20))} ✓</Text>
          )}
        </Box>

        {/* Validation status (visivel apenas no step api-key) */}
        {step === 'api-key' && <ValidationFeedback validation={validation} />}

        {/* Planner model (visivel apos validacao) */}
        {(step === 'planner-model' || step === 'worker-model') && (
          <Box marginTop={1} flexDirection="column">
            <Text bold>Modelo Planner (reasoning):</Text>
            {step === 'planner-model' ? (
              <SelectInput items={PLANNER_MODELS} onSelect={handlePlannerSelect} />
            ) : (
              <Text color="green">  {plannerModel} ✓</Text>
            )}
          </Box>
        )}

        {/* Worker model (visivel apos planner) */}
        {step === 'worker-model' && (
          <Box marginTop={1} flexDirection="column">
            <Text bold>Modelo Worker (fast):</Text>
            <SelectInput items={WORKER_MODELS} onSelect={handleWorkerSelect} />
          </Box>
        )}
      </Box>

      {/* Help text */}
      <Box marginTop={1}>
        <Text dimColor>{helpText}</Text>
      </Box>
    </Box>
  );
};
