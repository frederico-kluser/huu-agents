/**
 * Visualizacao de pipeline no estilo git tree graph.
 * Renderiza steps como commits com branches visuais para conditions.
 * Usado no profile-builder-screen (interativo) e profile-select-screen (preview).
 *
 * Estilo inspirado em `git log --graph --oneline`:
 *  ● init set_variable $custom_tries = 0
 *  │
 *  ● write-tests pi_agent "Write tests for: $task"
 *  │
 *  ● check condition $custom_tries >= 3
 *  ├─✔ true ▸ __end__
 *  └─✖ false ▸ increment
 *  │
 *  ● increment set_variable $custom_tries = $custom_tries + 1
 *  └─ ◉ END
 *
 * @module
 */

import { Box, Text } from 'ink';
import { END_STEP_ID, type WorkerStep } from '../schemas/worker-profile.schema.js';
import { findStepTypeInfo } from './step-field-defs.js';

interface PipelineGraphProps {
  readonly steps: readonly WorkerStep[];
  readonly selectedStepId: string | null;
  /** Exibir modo compacto (sem detalhes de variavel) */
  readonly compact?: boolean;
}

/** Caracteres git-graph Unicode */
const G = {
  commit: '\u25CF',       // ● filled circle
  line: '\u2502',         // │ vertical
  tee: '\u251C',          // ├ tee right
  corner: '\u2514',       // └ bottom corner
  dash: '\u2500',         // ─ horizontal
  arrow: '\u25B8',        // ▸ small arrow
  end: '\u25C9',          // ◉ end marker
  loop: '\u21A9',         // ↩ loop back
  checkTrue: '\u2714',    // ✔
  checkFalse: '\u2716',   // ✖
  selector: '\u25B6',     // ▶ selection indicator
} as const;

/**
 * Git-tree-style pipeline graph.
 * Supports interactive selection (for builder) and compact preview mode.
 *
 * @param props - Steps, selection state, display mode
 *
 * @example
 * <PipelineGraph steps={steps} selectedStepId="2" />
 * <PipelineGraph steps={steps} selectedStepId={null} compact />
 */
export function PipelineGraph({ steps, selectedStepId, compact = false }: PipelineGraphProps) {
  if (steps.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Nenhum step ainda. Use [a] para adicionar o primeiro.</Text>
        <Text dimColor>  {G.end} END</Text>
      </Box>
    );
  }

  const stepMap = new Map(steps.map((step): [string, WorkerStep] => [step.id, step]));
  const ordered = [...steps].sort(compareByIds);

  return (
    <Box flexDirection="column">
      {ordered.map((step, index) => {
        const isSelected = selectedStepId === step.id;
        const isLast = index === ordered.length - 1;
        const info = findStepTypeInfo(step.type);
        const icon = info?.icon ?? '?';
        const color = info?.color ?? 'white';
        const links = getStepLinks(step);
        const hasBackRef = links.some(
          (l) => l.target !== END_STEP_ID && stepMap.has(l.target) &&
            ordered.findIndex((s) => s.id === l.target) <= index,
        );

        return (
          <Box key={step.id} flexDirection="column">
            {/* Commit line */}
            <Box>
              <Text color={isSelected ? 'cyan' : 'gray'}>
                {isSelected ? G.selector : ' '}
              </Text>
              <Text color={isSelected ? 'cyan' : color}>{G.commit} </Text>
              <Text color={color}>{icon} </Text>
              <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                {step.id}
              </Text>
              <Text color={color}> {step.type}</Text>
              {!compact && <Text dimColor> {stepSummary(step)}</Text>}
              {hasBackRef && <Text color="yellow"> {G.loop}</Text>}
            </Box>

            {/* Variable detail (non-compact, selected) */}
            {!compact && isSelected && (
              <Box marginLeft={3} flexDirection="column">
                {renderVariableInfo(step)}
              </Box>
            )}

            {/* Branch visualization */}
            {step.type === 'condition' ? (
              renderConditionBranches(step, stepMap, ordered, index)
            ) : (
              /* Connection line */
              !isLast && links.length > 0 && (
                <Box>
                  <Text dimColor> {G.line}</Text>
                </Box>
              )
            )}

            {/* Direct END pointer for non-condition last steps */}
            {isLast && step.type !== 'condition' && links.some((l) => l.target === END_STEP_ID) && (
              <Box>
                <Text dimColor> {G.corner}{G.dash} </Text>
                <Text color="green" bold>{G.end} END</Text>
              </Box>
            )}
          </Box>
        );
      })}

      {/* Terminal END */}
      {!ordered.some((s, i) => {
        const links = getStepLinks(s);
        return i === ordered.length - 1 && links.some((l) => l.target === END_STEP_ID);
      }) && (
        <Box>
          <Text dimColor> {G.corner}{G.dash} </Text>
          <Text color="green" bold>{G.end} END</Text>
        </Box>
      )}

      {/* Builder shortcuts (non-compact) */}
      {!compact && (
        <Box marginTop={1} gap={2}>
          <Text dimColor>[a] add step</Text>
          <Text dimColor>[b] branch em condition</Text>
          <Text dimColor>[Enter] editar</Text>
          <Text dimColor>[x] deletar</Text>
        </Box>
      )}
    </Box>
  );
}

/** Renders condition branches in git-graph style */
function renderConditionBranches(
  step: WorkerStep,
  _stepMap: ReadonlyMap<string, WorkerStep>,
  ordered: readonly WorkerStep[],
  currentIdx: number,
) {
  if (step.type !== 'condition') return null;

  const trueTarget = step.whenTrue;
  const falseTarget = step.whenFalse;

  const renderTarget = (target: string, isTrue: boolean, isLast: boolean) => {
    const prefix = isLast ? G.corner : G.tee;
    const isEnd = target === END_STEP_ID;
    const isBack = !isEnd && ordered.findIndex((s) => s.id === target) <= currentIdx;

    return (
      <Box>
        <Text dimColor> {prefix}{G.dash}</Text>
        <Text color={isTrue ? 'green' : 'red'}>
          {isTrue ? G.checkTrue : G.checkFalse}{' '}
        </Text>
        <Text dimColor>{isTrue ? 'true' : 'false'} {G.arrow} </Text>
        {isEnd ? (
          <Text color="green" bold>END</Text>
        ) : (
          <>
            <Text color="white">{target}</Text>
            {isBack && <Text color="yellow"> {G.loop}</Text>}
          </>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      {renderTarget(trueTarget, true, false)}
      {renderTarget(falseTarget, false, true)}
      {currentIdx < ordered.length - 1 && (
        <Box>
          <Text dimColor> {G.line}</Text>
        </Box>
      )}
    </Box>
  );
}

interface StepLink {
  readonly target: string;
  readonly label: string;
}

function getStepLinks(step: WorkerStep): readonly StepLink[] {
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

function renderVariableInfo(step: WorkerStep) {
  const info = findStepTypeInfo(step.type);
  if (!info) return null;
  return (
    <Box flexDirection="column">
      <Text dimColor>Le: {info.canRead}</Text>
      <Text dimColor>Escreve: {info.canWrite}</Text>
    </Box>
  );
}

function stepSummary(step: WorkerStep): string {
  switch (step.type) {
    case 'pi_agent':
      return truncate(step.taskTemplate, 45);
    case 'langchain_prompt':
      return `$${step.outputTarget} <- ${truncate(step.inputTemplate, 35)}`;
    case 'condition':
      return truncate(step.expression, 40);
    case 'goto':
      return `-> ${step.target}`;
    case 'set_variable':
      if (step.valueExpression) return `$${step.target} = ${truncate(step.valueExpression, 30)}`;
      return `$${step.target} = ${truncate(String(step.value ?? ''), 30)}`;
    case 'git_diff':
      return `-> $${step.target}`;
    case 'fail':
      return truncate(step.messageTemplate, 45);
  }
  return '';
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\n/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}\u2026`;
}

function compareByIds(left: WorkerStep, right: WorkerStep): number {
  const leftNum = Number.parseInt(left.id, 10);
  const rightNum = Number.parseInt(right.id, 10);
  const leftNumeric = Number.isFinite(leftNum);
  const rightNumeric = Number.isFinite(rightNum);
  if (leftNumeric && rightNumeric) return leftNum - rightNum;
  if (leftNumeric && !rightNumeric) return -1;
  if (!leftNumeric && rightNumeric) return 1;
  return left.id.localeCompare(right.id);
}
