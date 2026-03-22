import { Box, Text, useApp, useInput } from 'ink';
import type { DAGNode } from '../schemas/dag.schema.js';
import type { WorkerResult } from '../schemas/worker-result.schema.js';

interface ResultScreenProps {
  readonly nodes: readonly DAGNode[];
  readonly results: readonly WorkerResult[];
  readonly branch: string;
  readonly diffStat: string;
  readonly onRetry: (failedNodeIds: readonly string[]) => void;
  readonly onQuit: () => void;
  readonly onViewDiff: () => void;
}

/**
 * Tela final do pipeline exibindo resumo do DAG, nodes falhados e diff total.
 * Keybindings: [r] retry falhados, [q] sair, [d] ver diff completo.
 *
 * @param props.nodes - Nodes do DAG com status final
 * @param props.results - Resultados dos workers executados
 * @param props.branch - Nome da branch final com as mudancas
 * @param props.diffStat - Resumo do diff total (ex: "12 files, +340 -45")
 * @param props.onRetry - Callback para re-executar nodes falhados
 * @param props.onQuit - Callback para encerrar o CLI
 * @param props.onViewDiff - Callback para exibir diff completo
 *
 * @example
 * ```tsx
 * <ResultScreen
 *   nodes={[
 *     { id: 'n1', task: 'Setup types', dependencies: [], status: 'done', files: ['src/types.ts'] },
 *     { id: 'n2', task: 'Add endpoint', dependencies: ['n1'], status: 'failed', files: [] },
 *   ]}
 *   results={[
 *     { nodeId: 'n1', status: 'success', filesModified: ['src/types.ts'], commitHash: 'a1b2c3d', error: null },
 *     { nodeId: 'n2', status: 'failure', filesModified: [], commitHash: null, error: 'Type error in handler' },
 *   ]}
 *   branch="feat/dag-run-42"
 *   diffStat="3 files, +120 -15"
 *   onRetry={(ids) => retryNodes(ids)}
 *   onQuit={() => exit()}
 *   onViewDiff={() => showDiff()}
 * />
 * ```
 */
export const ResultScreen = ({
  nodes,
  results,
  branch,
  diffStat,
  onRetry,
  onQuit,
  onViewDiff,
}: ResultScreenProps) => {
  const { exit } = useApp();

  const completed = nodes.filter((n) => n.status === 'done').length;
  const failed = nodes.filter((n) => n.status === 'failed').length;
  const blocked = nodes.filter((n) => n.status === 'pending').length;
  const allPassed = failed === 0 && blocked === 0;
  const failedNodeIds = nodes.filter((n) => n.status === 'failed').map((n) => n.id);

  useInput((input) => {
    if (input === 'q') {
      onQuit();
      exit();
    }
    if (input === 'r' && failedNodeIds.length > 0) {
      onRetry(failedNodeIds);
    }
    if (input === 'd') {
      onViewDiff();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor={allPassed ? 'green' : 'red'} paddingX={2} paddingY={1}>
        <Text bold color={allPassed ? 'green' : 'red'}>
          {allPassed ? 'Pipeline concluido com sucesso' : 'Pipeline concluido com falhas'}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1} gap={0}>
        <Box>
          <Text dimColor>{'Completed: '}</Text>
          <Text bold color="green">{completed}</Text>
          <Text dimColor>{'  Failed: '}</Text>
          <Text bold color={failed > 0 ? 'red' : 'green'}>{failed}</Text>
          <Text dimColor>{'  Blocked: '}</Text>
          <Text bold color={blocked > 0 ? 'yellow' : 'green'}>{blocked}</Text>
          <Text dimColor>{'  Total: '}</Text>
          <Text bold>{nodes.length}</Text>
        </Box>
        <Box>
          <Text dimColor>{'Branch:    '}</Text>
          <Text bold color="cyan">{branch}</Text>
        </Box>
        <Box>
          <Text dimColor>{'Diff:      '}</Text>
          <Text>{diffStat}</Text>
        </Box>
      </Box>

      {failedNodeIds.length > 0 && (
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="red" paddingX={1}>
          <Text bold color="red">Nodes falhados</Text>
          {failedNodeIds.map((nodeId) => {
            const node = nodes.find((n) => n.id === nodeId);
            const result = results.find((r) => r.nodeId === nodeId);
            return (
              <Box key={nodeId} marginTop={0}>
                <Text color="red">{'x '}</Text>
                <Text bold>{nodeId}</Text>
                <Text dimColor>{' — '}{node?.task ?? 'unknown'}</Text>
                {result?.error && <Text color="red">{'\n  '}{result.error}</Text>}
              </Box>
            );
          })}
        </Box>
      )}

      <Box marginTop={1} gap={2}>
        {failedNodeIds.length > 0 && <Text dimColor>[r] retry falhados</Text>}
        <Text dimColor>[d] ver diff</Text>
        <Text dimColor>[q] sair</Text>
      </Box>
    </Box>
  );
};
