import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Config } from '../schemas/config.schema.js';

interface TaskScreenProps {
  readonly config: Config;
  readonly contextFiles: readonly string[];
  readonly onSubmit: (task: string) => void;
  readonly initialTask?: string;
}

/**
 * Tela final de input onde o usuário digita a macro-task antes de iniciar o pipeline.
 * Exibe resumo da configuração (modelos, contexto) e valida que a task não está vazia.
 *
 * @param props.config - Configuração validada do Pi DAG CLI
 * @param props.contextFiles - Lista de arquivos selecionados como contexto
 * @param props.onSubmit - Callback disparado com a task ao pressionar Enter
 *
 * @example
 * ```tsx
 * <TaskScreen
 *   config={{ openrouterApiKey: 'sk-or-...', plannerModel: 'openai/gpt-4.1', workerModel: 'openai/gpt-4.1-mini', worktreeBasePath: '.pi-dag-worktrees' }}
 *   contextFiles={['src/app.tsx', 'src/cli.tsx']}
 *   onSubmit={(task) => console.log('Iniciando:', task)}
 * />
 * ```
 */
export const TaskScreen = ({ config, contextFiles, onSubmit, initialTask = '' }: TaskScreenProps) => {
  const [task, setTask] = useState(initialTask);
  const [error, setError] = useState('');

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setError('Task nao pode estar vazia. Descreva a macro-task.');
      return;
    }
    setError('');
    onSubmit(trimmed);
  };

  useInput((_input, key) => {
    // Limpa erro ao digitar
    if (error && !key.return) {
      setError('');
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <ConfigSummary config={config} contextFileCount={contextFiles.length} />

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Macro-task:</Text>
        <Box marginTop={1}>
          <Text color="cyan" bold>{'> '}</Text>
          <TextInput
            value={task}
            onChange={setTask}
            onSubmit={handleSubmit}
            placeholder="Descreva a macro-task para decompor em DAG..."
          />
        </Box>

        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>[Enter] iniciar pipeline</Text>
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
 *
 * @example
 * ```tsx
 * <ConfigSummary
 *   config={{ openrouterApiKey: 'sk-...', plannerModel: 'openai/gpt-4.1', workerModel: 'openai/gpt-4.1-mini', worktreeBasePath: '.wt' }}
 *   contextFileCount={3}
 * />
 * ```
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
