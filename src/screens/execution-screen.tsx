import { Box, Text, Static, Spacer, useStdout } from 'ink';
import type { DAG, NodeStatus } from '../schemas/dag.schema.js';
import type { WorkerResult } from '../schemas/worker-result.schema.js';
import { DagNodeRow } from '../components/dag-node-row.js';
import { WorkerLog, type LogEntry } from '../components/worker-log.js';
import { useElapsedTime } from '../hooks/use-elapsed-time.js';

export type { LogEntry } from '../components/worker-log.js';

interface ExecutionScreenProps {
  readonly macroTask: string;
  readonly dag: DAG | null;
  readonly logs: readonly LogEntry[];
  readonly results: readonly WorkerResult[];
  readonly activeNodeId: string | null;
  readonly startTime: number;
}

/** Linhas reservadas para header + footer + margens */
const CHROME_LINES = 10;

/** Contagem de nos por status */
const countByStatus = (dag: DAG, status: NodeStatus): number =>
  dag.nodes.filter((n) => n.status === status).length;

/** Barra de progresso com estatisticas da execucao */
const ProgressFooter = ({
  dag,
  elapsed,
}: {
  readonly dag: DAG | null;
  readonly elapsed: string;
}) => {
  if (!dag) {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>Planejando DAG... | {elapsed}</Text>
      </Box>
    );
  }

  const done = countByStatus(dag, 'done');
  const running = countByStatus(dag, 'running');
  const failed = countByStatus(dag, 'failed');
  const total = dag.nodes.length;

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} gap={1}>
      <Text>
        <Text dimColor>Progresso: </Text>
        <Text bold color="green">{done}/{total} done</Text>
      </Text>
      {running > 0 && (
        <Text>
          <Text dimColor>| </Text>
          <Text color="yellow">{running} rodando</Text>
        </Text>
      )}
      {failed > 0 && (
        <Text>
          <Text dimColor>| </Text>
          <Text color="red">{failed} falhou</Text>
        </Text>
      )}
      <Spacer />
      <Text bold>{elapsed}</Text>
    </Box>
  );
};

/**
 * Tela de execucao do DAG em tempo real.
 * Exibe nos do DAG com status colorido no painel esquerdo,
 * logs do worker ativo no painel direito, resultados finalizados
 * via Static (nao re-renderizam), e barra de progresso no rodape.
 *
 * @param props.macroTask - Descricao da macro-task em execucao
 * @param props.dag - DAG planejado (null enquanto planeja)
 * @param props.logs - Entradas de log dos workers
 * @param props.results - Resultados finalizados dos workers (Static)
 * @param props.activeNodeId - ID do no com worker em execucao
 * @param props.startTime - Timestamp de inicio da execucao (ms)
 *
 * @example
 * ```tsx
 * <ExecutionScreen
 *   macroTask="Refactor auth module"
 *   dag={{
 *     action: "decompose",
 *     nodes: [{ id: "1", task: "format.js", dependencies: [], status: "running", files: [] }],
 *     metadata: { macroTask: "Refactor auth module", totalNodes: 1, parallelizable: 0 }
 *   }}
 *   logs={[{ id: "log-1", nodeId: "1", message: "Lendo format.js...", timestamp: Date.now() }]}
 *   results={[]}
 *   activeNodeId="1"
 *   startTime={Date.now()}
 * />
 * ```
 */
export const ExecutionScreen = ({
  macroTask,
  dag,
  logs,
  results,
  activeNodeId,
  startTime,
}: ExecutionScreenProps) => {
  const elapsed = useElapsedTime(startTime);
  const { stdout } = useStdout();
  const logMaxLines = Math.max(3, (stdout?.rows ?? 24) - CHROME_LINES);

  // Filtra logs do no ativo para o painel direito
  const activeLogs = activeNodeId
    ? logs.filter((l) => l.nodeId === activeNodeId)
    : logs;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Resultados finalizados — renderizam uma vez via Static */}
      <Static items={[...results]}>
        {(result) => (
          <Box key={result.nodeId}>
            <Text color={result.status === 'success' ? 'green' : 'red'}>
              {result.status === 'success' ? '\u2713' : '\u2717'}
            </Text>
            <Text>
              {' '}[{result.nodeId}]{' '}
              {result.status === 'success'
                ? `${result.filesModified.length} arquivo(s) | ${result.commitHash?.slice(0, 7) ?? ''}`
                : result.error ?? 'erro desconhecido'}
            </Text>
          </Box>
        )}
      </Static>

      {/* Header */}
      <Box borderStyle="round" borderColor="yellow" paddingX={2}>
        <Text bold color="yellow">Pi DAG CLI — Executando</Text>
        <Spacer />
        <Text dimColor wrap="truncate">{macroTask}</Text>
      </Box>

      {/* Painel principal: DAG (esquerda) + Logs (direita) */}
      <Box marginTop={1} minHeight={6}>
        {/* Lista de nos do DAG */}
        <Box
          flexDirection="column"
          width="40%"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
        >
          <Text bold dimColor>DAG</Text>
          {dag ? (
            <Box flexDirection="column" marginTop={1}>
              {dag.nodes.map((node) => (
                <DagNodeRow
                  key={node.id}
                  node={node}
                  isActive={node.id === activeNodeId}
                />
              ))}
            </Box>
          ) : (
            <Box marginTop={1}>
              <Text color="yellow">Planejando...</Text>
            </Box>
          )}
        </Box>

        {/* Log do worker ativo */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          marginLeft={1}
        >
          <Text bold dimColor>
            Log do Worker{activeNodeId ? ` [${activeNodeId}]` : ''}
          </Text>
          <Box flexDirection="column" marginTop={1}>
            <WorkerLog logs={activeLogs} maxLines={logMaxLines} />
          </Box>
        </Box>
      </Box>

      {/* Rodape com progresso */}
      <Box marginTop={1}>
        <ProgressFooter dag={dag} elapsed={elapsed} />
      </Box>
    </Box>
  );
};
