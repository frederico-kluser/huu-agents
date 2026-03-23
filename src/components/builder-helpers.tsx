import { Box, Text } from 'ink';
import { findModel } from '../data/models.js';
import {
  END_STEP_ID,
  WorkerProfileSchema,
  validateProfileReferences,
  type ProfileScope,
  type WorkerProfile,
  type WorkerStep,
} from '../schemas/worker-profile.schema.js';

export type HeaderFieldKey =
  | 'id'
  | 'description'
  | 'scope'
  | 'entryStepId'
  | 'maxStepExecutions'
  | 'seats'
  | 'workerModel'
  | 'langchainModel';

export interface BuilderMeta {
  readonly id: string;
  readonly description: string;
  readonly scope: ProfileScope;
  readonly maxStepExecutions: number;
  readonly seats: number;
  readonly workerModel: string;
  readonly langchainModel: string;
}

export interface BuilderDraft {
  readonly meta: BuilderMeta;
  readonly steps: readonly WorkerStep[];
  readonly initialVariables: Readonly<Record<string, string | number>>;
}

interface ValidationSuccess {
  readonly valid: true;
  readonly profile: WorkerProfile;
  readonly errors: readonly string[];
  readonly fieldErrors: Readonly<Record<string, string>>;
}

interface ValidationFailure {
  readonly valid: false;
  readonly errors: readonly string[];
  readonly fieldErrors: Readonly<Record<string, string>>;
}

export type BuilderValidation = ValidationSuccess | ValidationFailure;

export const HEADER_FIELD_DESCRIPTIONS: Readonly<Record<HeaderFieldKey, string>> = {
  id: 'Identificador unico exibido em selecao e trace. Formato: kebab-case.',
  description: 'Descricao opcional para lembrar quando usar o perfil.',
  scope: 'Global = todos os projetos. Local = apenas este repositorio.',
  entryStepId: 'Step inicial da pipeline. Definido automaticamente.',
  maxStepExecutions: 'Loop guard: limite de iteracoes do runtime em uma execucao.',
  seats: 'Assentos de paralelismo por wave. 1 = sequencial para este perfil.',
  workerModel: 'Modelo padrao usado pelos steps pi_agent.',
  langchainModel: 'Modelo padrao usado pelos steps langchain_prompt.',
};

interface ConfigRowProps {
  readonly label: string;
  readonly value: string;
  readonly selected: boolean;
  readonly required?: boolean;
  readonly invalid?: boolean;
}

/**
 * Row de campo textual no card de configuracao.
 *
 * @param props - Propriedades de renderizacao da linha
 * @returns Linha formatada para o builder
 *
 * @example
 * <ConfigRow label="Profile ID" value="test-driven-fixer" selected />
 */
export function ConfigRow({
  label,
  value,
  selected,
  required = false,
  invalid = false,
}: ConfigRowProps) {
  const marker = selected ? '> ' : '  ';
  const valueColor = invalid ? 'red' : 'white';
  return (
    <Box>
      <Text color={selected ? 'cyan' : 'gray'}>
        {marker}
        {padLabel(label)}
      </Text>
      <Text color={valueColor} underline={invalid}>
        [{value.length > 0 ? value : ' '}]
      </Text>
      {required && value.trim().length === 0 && <Text color="yellow"> *</Text>}
      {invalid && <Text color="red"> !</Text>}
    </Box>
  );
}

interface SelectorRowProps {
  readonly label: string;
  readonly value: string;
  readonly selected: boolean;
  readonly invalid?: boolean;
}

/**
 * Row de campo seletor no card de configuracao.
 *
 * @param props - Propriedades de renderizacao da linha
 * @returns Linha formatada para seletores
 *
 * @example
 * <SelectorRow label="Scope" value="project" selected={false} />
 */
export function SelectorRow({ label, value, selected, invalid = false }: SelectorRowProps) {
  const marker = selected ? '> ' : '  ';
  return (
    <Box>
      <Text color={selected ? 'cyan' : 'gray'}>
        {marker}
        {padLabel(label)}
      </Text>
      <Text color={invalid ? 'red' : 'white'} underline={invalid}>
        [{value}]
      </Text>
      <Text dimColor>{' <Enter>'}</Text>
    </Box>
  );
}

/**
 * Busca label curto de modelo para exibicao no builder.
 *
 * @param id - ID completo do modelo
 * @returns Nome amigavel do modelo ou o proprio ID
 *
 * @example
 * modelLabel('openai/gpt-5.4')
 */
export function modelLabel(id: string): string {
  if (id.trim().length === 0) {
    return '(inherit from current worker config)';
  }
  const model = findModel(id);
  return model?.name ?? id;
}

/**
 * Calcula o proximo ID de step incremental.
 * Mantem IDs existentes sem renumerar.
 *
 * @param steps - Steps existentes
 * @returns Proximo ID como string numerica
 *
 * @example
 * nextStepId([{ id: '1', ... }, { id: '3', ... }]) // '4'
 */
export function nextStepId(steps: readonly WorkerStep[]): string {
  const maxId = steps.reduce((maxValue, step) => {
    const numeric = Number.parseInt(step.id, 10);
    if (!Number.isFinite(numeric)) {
      return maxValue;
    }
    return numeric > maxValue ? numeric : maxValue;
  }, 0);
  return String(maxId + 1);
}

/**
 * Relinka referencias de navegacao ao remover um step.
 *
 * @param steps - Lista completa de steps
 * @param deletedStepId - ID do step removido
 * @returns Nova lista com referencias ajustadas
 *
 * @example
 * const updated = relinkStepsAfterDelete(steps, '2');
 */
export function relinkStepsAfterDelete(
  steps: readonly WorkerStep[],
  deletedStepId: string,
): readonly WorkerStep[] {
  const deletedStep = steps.find((step) => step.id === deletedStepId);
  const fallbackTarget = deletedStep ? primaryTargetOf(deletedStep) : END_STEP_ID;
  const survivors = steps.filter((step) => step.id !== deletedStepId);

  return survivors.map((step) => {
    switch (step.type) {
      case 'pi_agent':
      case 'langchain_prompt':
      case 'set_variable':
      case 'git_diff':
        return step.next === deletedStepId
          ? { ...step, next: fallbackTarget }
          : step;
      case 'condition':
        return {
          ...step,
          ...(step.whenTrue === deletedStepId ? { whenTrue: fallbackTarget } : {}),
          ...(step.whenFalse === deletedStepId ? { whenFalse: fallbackTarget } : {}),
        };
      case 'goto':
        return step.target === deletedStepId
          ? { ...step, target: fallbackTarget }
          : step;
      case 'fail':
        return step;
    }
  });
}

/**
 * Construtor de perfil final com defaults e normalizacoes.
 *
 * @param draft - Estado do builder
 * @returns Perfil ou null se invalido
 *
 * @example
 * const profile = buildProfile({ meta, steps, initialVariables });
 */
export function buildProfile(draft: BuilderDraft): WorkerProfile | null {
  const validation = validateBuilder(draft);
  if (!validation.valid) {
    return null;
  }
  return validation.profile;
}

/**
 * Executa validacao completa do builder.
 *
 * @param draft - Estado atual do builder
 * @returns Resultado com erros e fieldErrors
 *
 * @example
 * const result = validateBuilder({ meta, steps, initialVariables });
 * if (!result.valid) console.error(result.errors);
 */
export function validateBuilder(draft: BuilderDraft): BuilderValidation {
  const candidate = {
    id: draft.meta.id.trim(),
    description: draft.meta.description.trim(),
    scope: draft.meta.scope,
    workerModel: draft.meta.workerModel.trim() || undefined,
    langchainModel: draft.meta.langchainModel.trim() || undefined,
    entryStepId: deriveEntryStepId(draft.steps),
    maxStepExecutions: draft.meta.maxStepExecutions,
    seats: draft.meta.seats,
    initialVariables: draft.initialVariables,
    steps: draft.steps,
  };

  const fieldErrors: Record<string, string> = {};
  const errors: string[] = [];

  const parsed = WorkerProfileSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      const key = path.length > 0 ? path : 'profile';
      if (!fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
      errors.push(issue.message);
    }
    return { valid: false, errors, fieldErrors };
  }

  const refErrors = validateProfileReferences(parsed.data);
  if (refErrors.length > 0) {
    for (const message of refErrors) {
      errors.push(message);
    }
    return { valid: false, errors, fieldErrors };
  }

  return {
    valid: true,
    profile: parsed.data,
    errors: [],
    fieldErrors: {},
  };
}

/**
 * Deriva entry step automaticamente pelo menor ID numerico.
 *
 * @param steps - Lista de steps do perfil
 * @returns ID do step inicial ou string vazia
 *
 * @example
 * deriveEntryStepId([{ id: '3', ... }, { id: '1', ... }]) // '1'
 */
export function deriveEntryStepId(steps: readonly WorkerStep[]): string {
  if (steps.length === 0) {
    return '';
  }
  const ordered = [...steps].sort(compareStepIds);
  return ordered[0]?.id ?? '';
}

function padLabel(label: string): string {
  const width = 26;
  return label.length >= width
    ? `${label.slice(0, width - 1)} `
    : `${label}${' '.repeat(width - label.length)}`;
}

function compareStepIds(left: WorkerStep, right: WorkerStep): number {
  const leftNum = Number.parseInt(left.id, 10);
  const rightNum = Number.parseInt(right.id, 10);
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
  return left.id.localeCompare(right.id);
}

function primaryTargetOf(step: WorkerStep): string {
  switch (step.type) {
    case 'pi_agent':
    case 'langchain_prompt':
    case 'set_variable':
    case 'git_diff':
      return step.next;
    case 'goto':
      return step.target;
    case 'condition':
      return step.whenFalse;
    case 'fail':
      return END_STEP_ID;
  }
}
