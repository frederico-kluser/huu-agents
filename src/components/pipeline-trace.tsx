/**
 * Componente de visualização da trace de execução de pipeline.
 * Baseado em 6sD5N — reutilizável, com color-coding e formatação de duração.
 *
 * @module
 */

import { Box, Text } from 'ink';
import type { StepTraceEntry } from '../schemas/worker-pipeline-state.schema.js';

interface PipelineTraceProps {
  /** Lista ordenada de resultados de execução de steps */
  readonly trace: readonly StepTraceEntry[];
  /** Máximo de entries a exibir (default: 10) */
  readonly maxEntries?: number;
}

/**
 * Exibe trace step-by-step de uma pipeline de worker.
 * Mostra ID, tipo, outcome e duração para cada step executado.
 * Mantém apenas as entries mais recentes para caber no terminal.
 *
 * @example
 * <PipelineTrace trace={workerResult.pipelineTrace ?? []} />
 */
export const PipelineTrace = ({ trace, maxEntries = 10 }: PipelineTraceProps) => {
  if (trace.length === 0) return null;

  const visible = trace.slice(-maxEntries);
  const hidden = trace.length - visible.length;

  return (
    <Box flexDirection="column">
      <Text bold dimColor>Pipeline Trace ({trace.length} steps)</Text>
      {hidden > 0 && (
        <Text dimColor>  ... {hidden} earlier step(s) hidden</Text>
      )}
      {visible.map((entry, idx) => (
        <Box key={`${entry.stepId}-${idx}`} gap={1}>
          <Text dimColor>{formatDuration(entry.finishedAt - entry.startedAt)}</Text>
          <Text color={outcomeColor(entry.outcome)}>
            {outcomeIcon(entry.outcome)}
          </Text>
          <Text color="yellow">[{entry.type}]</Text>
          <Text>{entry.stepId}</Text>
          {entry.error && <Text color="red" dimColor> {entry.error.slice(0, 60)}</Text>}
        </Box>
      ))}
    </Box>
  );
};

function outcomeColor(outcome: string): string {
  switch (outcome) {
    case 'ok': return 'green';
    case 'error': return 'red';
    case 'skipped': return 'gray';
    default: return 'white';
  }
}

function outcomeIcon(outcome: string): string {
  switch (outcome) {
    case 'ok': return '\u2714';  // checkmark
    case 'error': return '\u2716';  // X mark
    case 'skipped': return '\u2500';  // horizontal line
    default: return '?';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
