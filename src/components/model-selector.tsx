/**
 * Componente reutilizável para seleção de modelo LLM via OpenRouter.
 * Encapsula ModelTable + estados de loading/error + hook useModels.
 * Elimina duplicação (DRY) — usado em options-screen, ai-pipeline-builder, profile-select.
 *
 * @module
 */

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { ModelTable } from './model-table.js';
import { useModels } from '../hooks/use-models.js';
import type { ModelEntry } from '../data/models.js';

interface ModelSelectorProps {
  /** API key para carregar modelos da OpenRouter */
  readonly apiKey: string;
  /** Callback ao selecionar um modelo */
  readonly onSelect: (model: ModelEntry) => void;
  /** Título exibido no topo da tabela */
  readonly title?: string;
}

/**
 * Seletor de modelo completo com loading, erro e tabela filtrável.
 * Encapsula useModels + ModelTable em um único componente.
 *
 * @example
 * ```tsx
 * <ModelSelector
 *   apiKey="sk-or-..."
 *   onSelect={(m) => setModel(m.id)}
 *   title="Selecionar Modelo para Pipeline"
 * />
 * ```
 */
export const ModelSelector = ({ apiKey, onSelect, title }: ModelSelectorProps) => {
  const { state: modelsState } = useModels(apiKey);

  if (modelsState.status === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box gap={1}>
          <Text color="green"><Spinner type="dots" /></Text>
          <Text>Carregando modelos da OpenRouter...</Text>
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

  return (
    <ModelTable
      models={modelsState.models}
      onSelect={onSelect}
      title={title ?? `Selecionar Modelo (${modelsState.models.length} disponíveis)`}
    />
  );
};
