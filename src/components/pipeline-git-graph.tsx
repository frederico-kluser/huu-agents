/**
 * Git-style tree graph visualization for pipeline steps.
 * Renders steps as commits in a git log --graph format,
 * with branching for conditions and loop-back arrows.
 *
 * @module
 */

import { Box, Text } from 'ink';
import { END_STEP_ID, type WorkerStep } from '../schemas/worker-profile.schema.js';

interface PipelineGitGraphProps {
  readonly steps: readonly WorkerStep[];
  readonly entryStepId: string;
  /** Highlight a specific step (e.g., during generation preview) */
  readonly highlightStepId?: string;
}

/** Step type icon and color for the git graph nodes */
const STEP_STYLE: Record<string, { icon: string; color: string }> = {
  pi_agent:         { icon: '\u{1F916}', color: 'green' },
  langchain_prompt: { icon: '\u{1F4AC}', color: 'magenta' },
  condition:        { icon: '\u{1F500}', color: 'yellow' },
  goto:             { icon: '\u27A1\uFE0F', color: 'cyan' },
  set_variable:     { icon: '\u{1F4DD}', color: 'blue' },
  git_diff:         { icon: '\u{1F4CB}', color: 'white' },
  fail:             { icon: '\u{1F6D1}', color: 'red' },
};

/**
 * Renders a pipeline as a git-style tree graph.
 * Follows topological order from entryStepId, showing branches
 * for conditions and loop-back arrows for backward references.
 *
 * @example
 * <PipelineGitGraph steps={profile.steps} entryStepId={profile.entryStepId} />
 */
export function PipelineGitGraph({ steps, entryStepId, highlightStepId }: PipelineGitGraphProps) {
  if (steps.length === 0) {
    return <Text dimColor>Pipeline vazio</Text>;
  }

  const ordered = buildExecutionOrder(steps, entryStepId);
  const orderIndex = new Map(ordered.map((s, i): [string, number] => [s.id, i]));

  return (
    <Box flexDirection="column">
      {ordered.map((step, idx) => {
        const isLast = idx === ordered.length - 1;
        const isHighlighted = step.id === highlightStepId;
        const style = STEP_STYLE[step.type] ?? { icon: '?', color: 'white' };

        return (
          <Box key={step.id} flexDirection="column">
            {/* Commit node */}
            <Box>
              <Text color={isHighlighted ? 'cyan' : 'yellow'}>{'\u2502'} </Text>
              <Text> </Text>
            </Box>
            <Box>
              <Text color={isHighlighted ? 'cyan' : 'yellow'}>{'\u25CF'} </Text>
              <Text color={style.color}>{style.icon} </Text>
              <Text color={isHighlighted ? 'cyan' : 'white'} bold={isHighlighted}>
                [{step.id}]
              </Text>
              <Text color="gray"> {step.type} </Text>
              <Text dimColor>{stepSummary(step)}</Text>
            </Box>

            {/* Branch lines */}
            {renderBranches(step, orderIndex, isLast)}
          </Box>
        );
      })}

      {/* END node */}
      <Box>
        <Text color="yellow">{'\u2502'} </Text>
      </Box>
      <Box>
        <Text color="green">{'\u25C9'} </Text>
        <Text color="green" bold>END</Text>
        <Text dimColor> (pipeline concluída com sucesso)</Text>
      </Box>
    </Box>
  );
}

/**
 * Renders branch lines from a step to its targets.
 * Delegates to single-link or multi-link renderer.
 */
function renderBranches(
  step: WorkerStep,
  orderIndex: ReadonlyMap<string, number>,
  isLast: boolean,
): React.ReactNode {
  const links = getLinks(step);
  if (links.length === 0) return null;

  const currentIdx = orderIndex.get(step.id) ?? 0;

  if (links.length === 1) {
    return renderSingleLink(links[0]!, currentIdx, orderIndex, isLast);
  }

  return renderConditionLinks(links, currentIdx, orderIndex);
}

/** Renders a single forward link, back-reference, or END connection */
function renderSingleLink(
  link: StepLink,
  currentIdx: number,
  orderIndex: ReadonlyMap<string, number>,
  isLast: boolean,
): React.ReactNode {
  const isEnd = link.target === END_STEP_ID;
  const targetIdx = orderIndex.get(link.target) ?? -1;
  const isBackRef = !isEnd && targetIdx <= currentIdx;

  if (isEnd && isLast) return null;

  if (isBackRef) {
    return (
      <Box>
        <Text color="yellow">{'\u2502'} </Text>
        <Text color="yellow">{'\u21B0'} </Text>
        <Text dimColor>loop {'\u2192'} </Text>
        <Text color="cyan">[{link.target}]</Text>
      </Box>
    );
  }

  if (isEnd) {
    return (
      <Box>
        <Text color="yellow">{'\u251C\u2500'}</Text>
        <Text color="green"> END</Text>
      </Box>
    );
  }

  return null;
}

/** Renders condition branches with ✓/✗ labels and loop-back arrows */
function renderConditionLinks(
  links: readonly StepLink[],
  currentIdx: number,
  orderIndex: ReadonlyMap<string, number>,
): React.ReactNode {
  return (
    <Box flexDirection="column">
      {links.map((link, i) => {
        const prefix = i === links.length - 1 ? '\u2514' : '\u251C';
        const isEnd = link.target === END_STEP_ID;
        const targetIdx = orderIndex.get(link.target) ?? -1;
        const isBackRef = !isEnd && targetIdx <= currentIdx;

        return (
          <Box key={`${link.target}-${link.label}`}>
            <Text color="yellow">{prefix}{'\u2500'}</Text>
            <Text color={link.label === 'true' ? 'green' : 'red'}>
              {link.label === 'true' ? ' \u2714 ' : ' \u2716 '}
            </Text>
            <Text dimColor>{link.label}: </Text>
            {isEnd ? (
              <Text color="green">END</Text>
            ) : (
              <>
                <Text color="cyan">[{link.target}]</Text>
                {isBackRef && <Text color="yellow"> {'\u21B0'} loop</Text>}
              </>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

interface StepLink {
  readonly target: string;
  readonly label: string;
}

/** Extract navigation links from a step */
function getLinks(step: WorkerStep): readonly StepLink[] {
  switch (step.type) {
    case 'pi_agent':
    case 'langchain_prompt':
    case 'set_variable':
    case 'git_diff':
      return [{ target: step.next, label: 'next' }];
    case 'condition':
      return [
        { target: step.whenTrue, label: 'true' },
        { target: step.whenFalse, label: 'false' },
      ];
    case 'goto':
      return [{ target: step.target, label: 'goto' }];
    case 'fail':
      return [];
  }
}

/**
 * Builds execution order starting from entryStepId via BFS.
 * Steps not reachable from entry are appended at the end.
 */
function buildExecutionOrder(
  steps: readonly WorkerStep[],
  entryStepId: string,
): readonly WorkerStep[] {
  const stepMap = new Map(steps.map((s): [string, WorkerStep] => [s.id, s]));
  const visited = new Set<string>();
  const ordered: WorkerStep[] = [];
  const queue: string[] = [entryStepId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id) || id === END_STEP_ID) continue;
    visited.add(id);

    const step = stepMap.get(id);
    if (!step) continue;
    ordered.push(step);

    // Enqueue targets in order
    for (const link of getLinks(step)) {
      if (!visited.has(link.target)) {
        queue.push(link.target);
      }
    }
  }

  // Append unreachable steps (orphans)
  for (const step of steps) {
    if (!visited.has(step.id)) {
      ordered.push(step);
    }
  }

  return ordered;
}

/** Generate one-line summary for a step */
function stepSummary(step: WorkerStep): string {
  switch (step.type) {
    case 'pi_agent':
      return `"${truncate(step.taskTemplate, 50)}"`;
    case 'langchain_prompt':
      return `\u2192 $${step.outputTarget}  "${truncate(step.inputTemplate, 35)}"`;
    case 'condition':
      return truncate(step.expression, 45);
    case 'goto':
      return `\u2192 ${step.target}`;
    case 'set_variable':
      if (step.valueExpression) return `$${step.target} = ${truncate(step.valueExpression, 35)}`;
      return `$${step.target} = ${truncate(String(step.value ?? ''), 35)}`;
    case 'git_diff':
      return `\u2192 $${step.target}`;
    case 'fail':
      return `"${truncate(step.messageTemplate, 50)}"`;
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}\u2026`;
}
