/**
 * Tela de input da macro-task com suporte a multi-linha e paste.
 * Exibe resumo da configuração e valida que a task não está vazia.
 *
 * @module
 */

import { Box, Text } from 'ink';
import { MultiLineInput } from '../components/multi-line-input.js';
import type { Config } from '../schemas/config.schema.js';

interface TaskScreenProps {
  readonly config: Config;
  readonly contextFiles: readonly string[];
  readonly onSubmit: (task: string) => void;
  readonly onCancel?: () => void;
  readonly initialTask?: string;
}

/**
 * Tela de input da macro-task com suporte a multi-linha e paste.
 * Exibe resumo da configuração (modelos, contexto) e valida que a task não está vazia.
 * Double-Enter submete; ESC volta.
 *
 * @param props.config - Configuração validada do Pi DAG CLI
 * @param props.contextFiles - Lista de arquivos selecionados como contexto
 * @param props.onSubmit - Callback disparado com a task ao confirmar
 * @param props.onCancel - Callback ao pressionar ESC (opcional)
 *
 * @example
 * ```tsx
 * <TaskScreen
 *   config={config}
 *   contextFiles={['src/app.tsx']}
 *   onSubmit={(task) => startPipeline(task)}
 * />
 * ```
 */
export const TaskScreen = ({ config, contextFiles, onSubmit, onCancel }: TaskScreenProps) => {
  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      onSubmit(trimmed);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <ConfigSummary config={config} contextFileCount={contextFiles.length} />

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Macro-task:</Text>
        <Box marginTop={1}>
          <MultiLineInput
            onSubmit={handleSubmit}
            onCancel={onCancel ?? (() => {})}
            placeholder="Descreva a macro-task para decompor em DAG... (suporta múltiplas linhas e paste)"
          />
        </Box>

        <Box marginTop={1}>
          <Text dimColor>[o] opcoes</Text>
        </Box>
      </Box>
    </Box>
  );
};

interface ConfigSummaryProps {
  readonly config: Config;
  readonly contextFileCount: number;
}

/**
 * Exibe resumo compacto da configuracao e contexto selecionados.
 *
 * @param props.config - Configuracao validada
 * @param props.contextFileCount - Quantidade de arquivos no contexto
 */
const ConfigSummary = ({ config, contextFileCount }: ConfigSummaryProps) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor="cyan"
    paddingX={2}
    paddingY={1}
  >
    <Text bold color="cyan">Resumo da Configuracao</Text>
    <Box flexDirection="column" marginTop={1} gap={0}>
      <Box>
        <Text dimColor>{'Planner:  '}</Text>
        <Text bold>{config.plannerModel}</Text>
      </Box>
      <Box>
        <Text dimColor>{'Worker:   '}</Text>
        <Text bold>{config.workerModel}</Text>
      </Box>
      <Box>
        <Text dimColor>{'Contexto: '}</Text>
        <Text bold>{contextFileCount}</Text>
        <Text dimColor>{contextFileCount === 1 ? ' arquivo' : ' arquivos'}</Text>
      </Box>
    </Box>
  </Box>
);
