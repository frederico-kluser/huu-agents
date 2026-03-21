import { Box, Text } from 'ink';

/** Entrada de log de worker para exibicao em tempo real */
export interface LogEntry {
  readonly id: string;
  readonly nodeId: string;
  readonly message: string;
  readonly timestamp: number;
}

interface WorkerLogProps {
  readonly logs: readonly LogEntry[];
  readonly maxLines: number;
}

/**
 * Painel de logs do worker ativo com auto-scroll.
 * Exibe as ultimas N linhas de log, truncando automaticamente
 * para manter apenas as entradas mais recentes visiveis.
 *
 * @param props.logs - Lista de entradas de log a exibir
 * @param props.maxLines - Maximo de linhas visiveis (auto-scroll)
 *
 * @example
 * ```tsx
 * <WorkerLog
 *   logs={[{ id: "1", nodeId: "task-1", message: "Lendo arquivo...", timestamp: Date.now() }]}
 *   maxLines={10}
 * />
 * ```
 */
export const WorkerLog = ({ logs, maxLines }: WorkerLogProps) => {
  const visible = logs.slice(-maxLines);

  if (logs.length === 0) {
    return (
      <Box>
        <Text dimColor>Aguardando logs...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {visible.map((log) => (
        <Box key={log.id}>
          <Text dimColor>{'> '}</Text>
          <Text wrap="truncate">{log.message}</Text>
        </Box>
      ))}
    </Box>
  );
};
