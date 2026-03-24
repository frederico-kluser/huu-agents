/**
 * Visualizacao de pipeline no estilo git tree graph.
 * Renderiza steps como commits com branches visuais,
 * usando caracteres Unicode para linhas de conexao.
 *
 * Inspirado em `git log --graph --oneline`:
 * * abc123 feat: initial commit
 * * def456 fix: resolve issue
 * | \
 * |  * ghi789 chore: branch work
 * | /
 * * jkl012 merge: back to main
 *
 * @module
 */

import { Box, Text } from 'ink';
import { END_STEP_ID, type WorkerStep } from '../schemas/worker-profile.schema.js';
import { findStepTypeInfo } from './step-field-defs.js';

interface PipelineTreeGraphProps {
  readonly steps: readonly WorkerStep[];
  readonly entryStepId?: string;
  readonly selectedStepId?: string | null;
  /** Compacto: sem detalhes extras */
  readonly compact?: boolean;
}

/** Cor do "commit dot" por tipo de step */
const COMMIT_COLORS: Readonly<Record<string, string>> = {
  pi_agent: 'green',
  langchain_prompt: 'magenta',
  condition: 'yellow',
  goto: 'cyan',
  set_variable: 'blue',
  git_diff: 'white',
  fail: 'red',
};

/** Caracteres git-graph */
const GIT = {
  commit: '\u25CF',        // ● filled circle (commit node)
  line: '\u2502',          // │ vertical line
  branchRight: '\u251C',   // ├ tee right
  cornerDown: '\u2514',    // └ bottom-left corner
  horizontal: '\u2500',    // ─ horizontal line
  branchOut: '\u256E',     // ╮ top-right curve (branch starts)
  branchIn: '\u2570',      // ╰ bottom-left curve (branch merges)
  arrow: '\u25B8',         // ▸ right arrow
  end: '\u25C9',           // ◉ end marker
  loop: '\u21A9',          // ↩ loop back
} as const;

/**
 * Git-tree-style pipeline graph visualization.
 * Shows pipeline flow as a commit graph with branches for conditions.
 *
 * @example
 * <PipelineTreeGraph steps={profile.steps} entryStepId="init" />
 */
export function PipelineTreeGraph({
  steps,
  entryStepId,
  selectedStepId = null,
  compact = false,
}: PipelineTreeGraphProps) {
  if (steps.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>  {GIT.end} Pipeline vazia</Text>
      </Box>
    );
  }

  // Build execution order starting from entryStepId
  const ordered = buildExecutionOrder(steps, entryStepId);
  const stepIndex = new Map(ordered.map((s, i) => [s.id, i]));
  const branchPoints = findBranchPoints(ordered, stepIndex);

  return (
    <Box flexDirection="column">
      {ordered.map((step, idx) => {
        const isSelected = selectedStepId === step.id;
        const color = COMMIT_COLORS[step.type] ?? 'white';
        const info = findStepTypeInfo(step.type);
        const icon = info?.icon ?? '?';
        const isBranch = branchPoints.has(step.id);
        const isLast = idx === ordered.length - 1;
        const links = getLinks(step);
        const hasBackRef = links.some(
          (l) => l.target !== END_STEP_ID && stepIndex.has(l.target) && (stepIndex.get(l.target) ?? 0) <= idx,
        );

        return (
          <Box key={step.id} flexDirection="column">
            {/* Main commit line */}
            <Box>
              {/* Graph column */}
              <Box width={4}>
                <Text color={isSelected ? 'cyan' : color}>
                  {isSelected ? GIT.arrow : ' '}{GIT.commit}{' '}
                </Text>
              </Box>
              {/* Content */}
              <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                {icon} {step.id}
              </Text>
              <Text color={color}> {step.type}</Text>
              {!compact && (
                <Text dimColor> {stepOneLiner(step)}</Text>
              )}
              {hasBackRef && <Text color="yellow"> {GIT.loop}</Text>}
            </Box>

            {/* Branch visualization for conditions */}
            {isBranch && step.type === 'condition' && !compact && (
              <BranchLines step={step} stepIndex={stepIndex} currentIdx={idx} />
            )}

            {/* Connection line to next step */}
            {!isLast && !isBranch && (
              <Box>
                <Box width={4}>
                  <Text dimColor> {GIT.line} </Text>
                </Box>
              </Box>
            )}

            {/* End marker for steps pointing to __end__ */}
            {links.some((l) => l.target === END_STEP_ID) && isLast && (
              <Box>
                <Box width={4}>
                  <Text dimColor> {GIT.cornerDown}{GIT.horizontal}</Text>
                </Box>
                <Text color="green" bold>{GIT.end} END</Text>
              </Box>
            )}
          </Box>
        );
      })}

      {/* Terminal END if not already shown */}
      {!ordered.some((s) => {
        const links = getLinks(s);
        return links.some((l) => l.target === END_STEP_ID) && ordered.indexOf(s) === ordered.length - 1;
      }) && (
        <Box>
          <Box width={4}>
            <Text dimColor> {GIT.cornerDown}{GIT.horizontal}</Text>
          </Box>
          <Text color="green" bold>{GIT.end} END</Text>
        </Box>
      )}
    </Box>
  );
}

/** Renders branch lines for condition steps */
function BranchLines({
  step,
  stepIndex,
  currentIdx,
}: {
  readonly step: WorkerStep;
  readonly stepIndex: ReadonlyMap<string, number>;
  readonly currentIdx: number;
}) {
  if (step.type !== 'condition') return null;

  const trueTarget = step.whenTrue;
  const falseTarget = step.whenFalse;
  const trueIsEnd = trueTarget === END_STEP_ID;
  const falseIsEnd = falseTarget === END_STEP_ID;
  const trueIsBack = !trueIsEnd && (stepIndex.get(trueTarget) ?? Infinity) <= currentIdx;
  const falseIsBack = !falseIsEnd && (stepIndex.get(falseTarget) ?? Infinity) <= currentIdx;

  return (
    <Box flexDirection="column">
      {/* True branch */}
      <Box>
        <Box width={4}>
          <Text dimColor> {GIT.branchRight}{GIT.horizontal}</Text>
        </Box>
        <Text color="green">{'\u2714'} </Text>
        <Text dimColor>true {GIT.arrow} </Text>
        {trueIsEnd ? (
          <Text color="green">END</Text>
        ) : (
          <>
            <Text color="white">{trueTarget}</Text>
            {trueIsBack && <Text color="yellow"> {GIT.loop}</Text>}
          </>
        )}
      </Box>
      {/* False branch */}
      <Box>
        <Box width={4}>
          <Text dimColor> {GIT.cornerDown}{GIT.horizontal}</Text>
        </Box>
        <Text color="red">{'\u2716'} </Text>
        <Text dimColor>false {GIT.arrow} </Text>
        {falseIsEnd ? (
          <Text color="green">END</Text>
        ) : (
          <>
            <Text color="white">{falseTarget}</Text>
            {falseIsBack && <Text color="yellow"> {GIT.loop}</Text>}
          </>
        )}
      </Box>
      {/* Reconnection line */}
      <Box>
        <Box width={4}>
          <Text dimColor> {GIT.line} </Text>
        </Box>
      </Box>
    </Box>
  );
}

/** One-line summary of step content */
function stepOneLiner(step: WorkerStep): string {
  switch (step.type) {
    case 'pi_agent': return truncate(step.taskTemplate, 50);
    case 'langchain_prompt': return `$${step.outputTarget} <- ${truncate(step.inputTemplate, 40)}`;
    case 'condition': return truncate(step.expression, 40);
    case 'goto': return `-> ${step.target}`;
    case 'set_variable':
      return step.valueExpression
        ? `$${step.target} = ${truncate(step.valueExpression, 30)}`
        : `$${step.target} = ${truncate(String(step.value ?? ''), 30)}`;
    case 'git_diff': return `-> $${step.target}`;
    case 'fail': return truncate(step.messageTemplate, 50);
  }
  return '';
}

interface LinkInfo {
  readonly target: string;
  readonly label: string;
}

function getLinks(step: WorkerStep): readonly LinkInfo[] {
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
    default:
      return [];
  }
}

/**
 * Builds execution order by traversing from entryStepId.
 * Falls back to original order if entry not found.
 */
function buildExecutionOrder(
  steps: readonly WorkerStep[],
  entryStepId?: string,
): readonly WorkerStep[] {
  if (!entryStepId) return steps;

  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const ordered: WorkerStep[] = [];

  const visit = (id: string) => {
    if (visited.has(id) || id === END_STEP_ID || !stepMap.has(id)) return;
    visited.add(id);
    const step = stepMap.get(id)!;
    ordered.push(step);

    for (const link of getLinks(step)) {
      visit(link.target);
    }
  };

  visit(entryStepId);

  // Add any unreachable steps at the end
  for (const step of steps) {
    if (!visited.has(step.id)) {
      ordered.push(step);
    }
  }

  return ordered;
}

/** Identifies steps that are branch points (conditions with divergent targets) */
function findBranchPoints(
  steps: readonly WorkerStep[],
  _stepIndex: ReadonlyMap<string, number>,
): ReadonlySet<string> {
  const branches = new Set<string>();
  for (const step of steps) {
    if (step.type === 'condition') {
      branches.add(step.id);
    }
  }
  return branches;
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\n/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}\u2026`;
}
