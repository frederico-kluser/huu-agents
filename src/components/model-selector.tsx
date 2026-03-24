/**
 * Componente reutilizável de seleção de modelo LLM.
 * Combina carregamento via useModels + ModelTable em um único componente DRY.
 * Usa cache de modelos se disponível, senão carrega da OpenRouter API.
 *
 * Uso: qualquer tela que precise selecionar um modelo do catálogo OpenRouter.
 * Substitui listas fixas de modelos hardcoded.
 *
 * @module
 */

import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { ModelTable } from './model-table.js';
import { useModels } from '../hooks/use-models.js';
import type { ModelEntry } from '../data/models.js';

interface ModelSelectorProps {
  /** API key para carregar modelos (usa cache se disponível) */
  readonly apiKey: string;
  /** Callback ao selecionar um modelo */
  readonly onSelect: (modelId: string) => void;
  /** Callback ao cancelar (ESC) */
  readonly onCancel: () => void;
  /** Título exibido acima da tabela */
  readonly title?: string;
  /** Texto adicional de contexto */
  readonly subtitle?: string;
}

/**
 * Seletor de modelo LLM com tabela filtrável do catálogo OpenRouter.
 * Gerencia loading/error states. Componente DRY para uso em todo o app.
 *
 * @example
 * <ModelSelector
 *   apiKey="sk-or-..."
 *   onSelect={(id) => setModel(id)}
 *   onCancel={() => goBack()}
 *   title="Modelo para gerar pipeline"
 * />
 */
export function ModelSelector({
  apiKey, onSelect, onCancel, title, subtitle,
}: ModelSelectorProps) {
  const { state, reload } = useModels(apiKey);

  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  if (state.status === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        {title && <Text bold color="cyan">{title}</Text>}
        <Box gap={1} marginTop={1}>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text>Carregando modelos da OpenRouter...</Text>
        </Box>
        <Box paddingX={1}><Text dimColor>[ESC] cancelar</Text></Box>
      </Box>
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        title={title}
        error={state.error}
        onRetry={() => void reload()}
        onCancel={onCancel}
      />
    );
  }

  return (
    <Box flexDirection="column">
      {subtitle && (
        <Box paddingX={2}><Text dimColor>{subtitle}</Text></Box>
      )}
      <ModelTable
        models={state.models}
        onSelect={(model: ModelEntry) => onSelect(model.id)}
        title={title}
      />
      <Box paddingX={2}><Text dimColor>[ESC] cancelar</Text></Box>
    </Box>
  );
}

/** Estado de erro com opção de retry */
function ErrorState({ title, error, onRetry, onCancel }: {
  readonly title?: string;
  readonly error: string;
  readonly onRetry: () => void;
  readonly onCancel: () => void;
}) {
  useInput((input, key) => {
    if (input === 'r') onRetry();
    if (key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" padding={1}>
      {title && <Text bold color="cyan">{title}</Text>}
      <Box marginTop={1} flexDirection="column">
        <Text color="red">Erro ao carregar modelos: {error}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>[r] tentar novamente  |  [ESC] cancelar</Text>
      </Box>
    </Box>
  );
}
