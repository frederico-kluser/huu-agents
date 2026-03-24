/**
 * Componente reutilizável de seleção de modelo LLM via OpenRouter.
 * Encapsula useModels + ModelTable + estados de loading/error em um único
 * componente DRY, eliminando duplicação em config-screen, options-screen
 * e ai-pipeline-builder-screen.
 *
 * @module
 */

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { ModelTable } from './model-table.js';
import { useModels } from '../hooks/use-models.js';
import type { ModelEntry } from '../data/models.js';

interface ModelSelectorProps {
  /** API key para autenticação na OpenRouter */
  readonly apiKey: string;
  /** Callback ao selecionar um modelo */
  readonly onSelect: (model: ModelEntry) => void;
  /** Callback ao cancelar (ESC) — tratado internamente pelo ModelTable */
  readonly onCancel?: () => void;
  /** Título exibido acima da tabela */
  readonly title?: string;
  /** Texto exibido durante loading */
  readonly loadingText?: string;
}

/**
 * Seletor de modelo LLM que carrega catálogo completo da OpenRouter.
 * Gerencia loading, erro e exibição da tabela automaticamente.
 * Componente DRY: substitui a tríade useModels+loading+ModelTable
 * que estava duplicada em 3+ telas.
 *
 * @example
 * <ModelSelector
 *   apiKey={config.openrouterApiKey}
 *   onSelect={(m) => handleModel(m)}
 *   title="Selecionar Modelo"
 * />
 */
export function ModelSelector({
  apiKey,
  onSelect,
  title,
  loadingText = 'Carregando modelos da OpenRouter...',
}: ModelSelectorProps) {
  const { state: modelsState } = useModels(apiKey);

  if (modelsState.status === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box gap={1}>
          <Text color="green"><Spinner type="dots" /></Text>
          <Text>{loadingText}</Text>
        </Box>
      </Box>
    );
  }

  if (modelsState.status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Erro ao carregar modelos: {modelsState.error}</Text>
        <Text dimColor>Pressione ESC para voltar</Text>
      </Box>
    );
  }

  const models = modelsState.models;
  const displayTitle = title
    ? `${title} (${models.length} modelos)`
    : `Selecionar Modelo (${models.length} modelos)`;

  return (
    <ModelTable
      models={models}
      onSelect={onSelect}
      title={displayTitle}
    />
  );
}
