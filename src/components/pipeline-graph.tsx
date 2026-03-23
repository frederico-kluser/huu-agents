import { Box, Text } from 'ink';
import { END_STEP_ID, type WorkerStep } from '../schemas/worker-profile.schema.js';

interface PipelineGraphProps {
  readonly steps: readonly WorkerStep[];
  readonly selectedStepId: string | null;
}

interface GraphNode {
  readonly id: string;
  readonly title: string;
  readonly links: readonly string[];
}

/**
 * Grafo textual navegavel de steps.
 * Renderiza conexoes principais e branches de condition.
 *
 * @param props - Steps e selecao atual
 * @returns Componente de visualizacao do grafo
 *
 * @example
 * <PipelineGraph steps={steps} selectedStepId="2" />
 */
export function PipelineGraph({ steps, selectedStepId }: PipelineGraphProps) {
  if (steps.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Nenhum step ainda. Use [a] para adicionar o primeiro.</Text>
        <Text dimColor>◉ END</Text>
      </Box>
    );
  }

  const stepMap = new Map(steps.map((step): [string, WorkerStep] => [step.id, step]));
  const ordered = [...steps].sort((left, right) => compareIds(left.id, right.id));

  return (
    <Box flexDirection="column">
      {ordered.map((step, index) => {
        const graphNode = toGraphNode(step);
        const isSelected = selectedStepId === step.id;
        const marker = isSelected ? '▸ ' : '  ';
        return (
          <Box key={step.id} flexDirection="column">
            <Text color={isSelected ? 'cyan' : 'white'}>
              {marker}[{graphNode.id}] {graphNode.title}
            </Text>
            {renderLinks(graphNode.links, stepMap)}
            {index < ordered.length - 1 && <Text dimColor>  │</Text>}
          </Box>
        );
      })}
      <Text dimColor>  ◉ END</Text>
      <Text dimColor>[a] add after  [b] add branch  [Enter] edit  [x] delete</Text>
    </Box>
  );
}

function renderLinks(links: readonly string[], stepMap: ReadonlyMap<string, WorkerStep>) {
  if (links.length === 0) {
    return null;
  }
  return (
    <Box flexDirection="column" marginLeft={2}>
      {links.map((link, index) => {
        const prefix = index === links.length - 1 ? '└─' : '├─';
        const isEnd = link === END_STEP_ID;
        const isBackRef = !isEnd && stepMap.has(link);
        return (
          <Text key={`${link}-${index}`} dimColor>
            {prefix}→ {isEnd ? 'END' : `[${link}]${isBackRef ? ' ↩' : ''}`}
          </Text>
        );
      })}
    </Box>
  );
}

function toGraphNode(step: WorkerStep): GraphNode {
  switch (step.type) {
    case 'pi_agent':
      return {
        id: step.id,
        title: `pi_agent  "${truncate(step.taskTemplate)}"`,
        links: [step.next],
      };
    case 'langchain_prompt':
      return {
        id: step.id,
        title: `langchain_prompt  -> $${step.outputTarget}`,
        links: [step.next],
      };
    case 'condition':
      return {
        id: step.id,
        title: `condition  ${truncate(step.expression)}`,
        links: [step.whenTrue, step.whenFalse],
      };
    case 'goto':
      return {
        id: step.id,
        title: `goto  ${step.target}`,
        links: [step.target],
      };
    case 'set_variable':
      return {
        id: step.id,
        title: `set_variable  $${step.target}`,
        links: [step.next],
      };
    case 'git_diff':
      return {
        id: step.id,
        title: `git_diff  -> $${step.target}`,
        links: [step.next],
      };
    case 'fail':
      return {
        id: step.id,
        title: `fail  "${truncate(step.messageTemplate)}"`,
        links: [],
      };
  }
}

function truncate(value: string): string {
  const max = 36;
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function compareIds(left: string, right: string): number {
  const leftNum = Number.parseInt(left, 10);
  const rightNum = Number.parseInt(right, 10);
  const leftNumeric = Number.isFinite(leftNum);
  const rightNumeric = Number.isFinite(rightNum);
  if (leftNumeric && rightNumeric) {
    return leftNum - rightNum;
  }
  if (leftNumeric && !rightNumeric) {
    return -1;
  }
  if (!leftNumeric && rightNumeric) {
    return 1;
  }
  return left.localeCompare(right);
}
