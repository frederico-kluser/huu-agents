/**
 * Visualizacao em arvore do pipeline de steps.
 * Renderiza fluxo com cores por tipo, icones, variaveis e conexoes.
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

/**
 * Grafo textual navegavel de steps com arvore visual.
 * Cores por tipo: AI=green, control=yellow/cyan, data=blue/white, error=red.
 *
 * @param props - Steps e selecao atual
 * @returns Componente de visualizacao do grafo
 *
 * @example
 * <PipelineGraph steps={steps} selectedStepId="2" />
 */
export function PipelineGraph({ steps, selectedStepId, compact = false }: PipelineGraphProps) {
  if (steps.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Nenhum step ainda. Use [a] para adicionar o primeiro.</Text>
        <Text dimColor>  {'\u25C9'} END</Text>
      </Box>
    );
  }

  const stepMap = new Map(steps.map((step): [string, WorkerStep] => [step.id, step]));
  const ordered = [...steps].sort((left, right) => compareIds(left.id, right.id));

  return (
    <Box flexDirection="column">
      {ordered.map((step, index) => {
        const isSelected = selectedStepId === step.id;
        const isLast = index === ordered.length - 1;
        const info = findStepTypeInfo(step.type);
        const icon = info?.icon ?? '?';
        const color = info?.color ?? 'white';

        return (
          <Box key={step.id} flexDirection="column">
            {/* Step principal */}
            <Box>
              <Text color={isSelected ? 'cyan' : 'gray'}>
                {isSelected ? '\u25B6 ' : '  '}
              </Text>
              <Text color={color}>{icon} </Text>
              <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                [{step.id}]
              </Text>
              <Text color={color}> {step.type} </Text>
              <Text dimColor>{stepSummary(step)}</Text>
            </Box>

            {/* Detalhe de variaveis (modo nao-compacto) */}
            {!compact && isSelected && (
              <Box marginLeft={5} flexDirection="column">
                {renderVariableInfo(step)}
              </Box>
            )}

            {/* Conexoes / links */}
            {renderTreeLinks(step, stepMap, isLast)}
          </Box>
        );
      })}
      <Box>
        <Text dimColor>  {'\u25C9'} </Text>
        <Text color="green" bold>END</Text>
        <Text dimColor> (pipeline concluida com sucesso)</Text>
      </Box>
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

/** Renderiza linhas de conexao entre steps */
function renderTreeLinks(
  step: WorkerStep,
  stepMap: ReadonlyMap<string, WorkerStep>,
  isLast: boolean,
) {
  const links = getStepLinks(step);

  if (links.length === 0) {
    // fail step — sem conexao
    return isLast ? null : <Text dimColor color="red">  {'\u2502'}</Text>;
  }

  if (links.length === 1) {
    const link = links[0]!;
    const isEnd = link.target === END_STEP_ID;
    const isBackRef = !isEnd && stepMap.has(link.target);
    return (
      <Box flexDirection="column">
        <Box marginLeft={2}>
          <Text dimColor>{'\u2502'}</Text>
        </Box>
        {isEnd ? (
          <Box marginLeft={2}>
            <Text dimColor>{isLast ? '\u2514' : '\u251C'}{'\u2500\u2500\u25B6'} </Text>
            <Text color="green">END</Text>
          </Box>
        ) : (
          <Box marginLeft={2}>
            <Text dimColor>{isLast ? '\u2514' : '\u251C'}{'\u2500\u2500\u25B6'} </Text>
            <Text color="white">[{link.target}]</Text>
            {isBackRef && <Text color="yellow"> {'\u21A9'} loop</Text>}
          </Box>
        )}
      </Box>
    );
  }

  // Multiple links (condition)
  return (
    <Box flexDirection="column">
      <Box marginLeft={2}>
        <Text dimColor>{'\u2502'}</Text>
      </Box>
      {links.map((link, index) => {
        const isLastLink = index === links.length - 1;
        const prefix = isLastLink ? '\u2514' : '\u251C';
        const isEnd = link.target === END_STEP_ID;
        const isBackRef = !isEnd && stepMap.has(link.target);
        return (
          <Box key={`${link.target}-${link.label}`} marginLeft={2}>
            <Text dimColor>{prefix}{'\u2500'}</Text>
            <Text color={link.label === 'true' ? 'green' : 'red'}>
              {link.label === 'true' ? '\u2714' : '\u2716'}{' '}
            </Text>
            <Text dimColor>{link.label}: </Text>
            {isEnd ? (
              <Text color="green">END</Text>
            ) : (
              <>
                <Text color="white">[{link.target}]</Text>
                {isBackRef && <Text color="yellow"> {'\u21A9'}</Text>}
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

/** Extrai links de navegacao de um step */
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
      return [];
  }
}

/** Renderiza info de variaveis do step selecionado */
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

/** Gera resumo de uma linha para cada step */
function stepSummary(step: WorkerStep): string {
  switch (step.type) {
    case 'pi_agent':
      return `"${truncate(step.taskTemplate, 40)}"`;
    case 'langchain_prompt':
      return `-> $${step.outputTarget}  "${truncate(step.inputTemplate, 30)}"`;
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
      return `"${truncate(step.messageTemplate, 40)}"`;
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}\u2026`;
}

function compareIds(left: string, right: string): number {
  const leftNum = Number.parseInt(left, 10);
  const rightNum = Number.parseInt(right, 10);
  const leftNumeric = Number.isFinite(leftNum);
  const rightNumeric = Number.isFinite(rightNum);
  if (leftNumeric && rightNumeric) return leftNum - rightNum;
  if (leftNumeric && !rightNumeric) return -1;
  if (!leftNumeric && rightNumeric) return 1;
  return left.localeCompare(right);
}
