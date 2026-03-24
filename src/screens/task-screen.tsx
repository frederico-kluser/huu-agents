/**
 * Tela de input da macro-task com suporte multi-linha.
 * Exibe resumo da configuração e aceita paste de conteúdo extenso.
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
  readonly onCancel: () => void;
  readonly initialTask?: string;
}

/**
 * Tela de input onde o usuário digita a macro-task antes de iniciar o pipeline.
 * Usa MultiLineInput para suportar paste de texto longo e descrições detalhadas.
 * Exibe resumo da configuração (modelos, contexto) acima do input.
 *
 * @param props.config - Configuração validada do Pi DAG CLI
 * @param props.contextFiles - Lista de arquivos selecionados como contexto
 * @param props.onSubmit - Callback disparado com a task ao confirmar
 * @param props.onCancel - Callback ao cancelar (ESC)
 *
 * @example
 * ```tsx
 * <TaskScreen
 *   config={cfg}
 *   contextFiles={['src/app.tsx']}
 *   onSubmit={(task) => console.log('Iniciando:', task)}
 *   onCancel={() => goBack()}
 * />
 * ```
 */
export const TaskScreen = ({ config, contextFiles, onSubmit, onCancel }: TaskScreenProps) => {
  return (
    <Box flexDirection="column" padding={1}>
      <ConfigSummary config={config} contextFileCount={contextFiles.length} />

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Macro-task:</Text>
        <Text dimColor>Descreva a tarefa com contexto detalhado. Suporta múltiplas linhas e paste.</Text>
      </Box>

      <Box marginTop={1}>
        <MultiLineInput
          onSubmit={onSubmit}
          onCancel={onCancel}
          placeholder="Descreva a macro-task para decompor em DAG..."
        />
      </Box>

      <Box marginTop={1} gap={2}>
        <Text dimColor>[o] opcoes</Text>
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
