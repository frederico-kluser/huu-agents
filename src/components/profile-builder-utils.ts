import { END_STEP_ID, type WorkerStep } from '../schemas/worker-profile.schema.js';

/**
 * Ordena IDs de step numericos antes de IDs textuais.
 *
 * @param left - ID esquerdo
 * @param right - ID direito
 * @returns Ordem para sort
 *
 * @example
 * ['2', '10', 'a'].sort(compareStepIds)
 */
export function compareStepIds(left: string, right: string): number {
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

/**
 * Retorna o target principal de navegacao do step.
 *
 * @param step - Step analisado
 * @returns Target principal ou __end__
 *
 * @example
 * const target = primaryTarget(step);
 */
export function primaryTarget(step: WorkerStep): string {
  switch (step.type) {
    case 'pi_agent':
    case 'langchain_prompt':
    case 'set_variable':
    case 'git_diff':
      return step.next;
    case 'condition':
      return step.whenFalse;
    case 'goto':
      return step.target;
    case 'fail':
      return END_STEP_ID;
  }
}

/**
 * Faz parse de valor inicial de variavel custom.
 *
 * @param value - Texto informado no builder
 * @returns Numero quando possivel, senao string
 *
 * @example
 * parseVariableValue('12') // 12
 */
export function parseVariableValue(value: string): string | number {
  const trimmed = value.trim();
  const numeric = Number(trimmed);
  if (trimmed.length > 0 && Number.isFinite(numeric)) {
    return numeric;
  }
  return trimmed;
}

/**
 * Valida e normaliza criacao de variavel custom.
 *
 * @param rawName - Nome informado
 * @param rawValue - Valor informado
 * @returns Resultado tipado de sucesso/erro
 *
 * @example
 * const result = createCustomVariable('custom_tries', '0');
 */
export function createCustomVariable(
  rawName: string,
  rawValue: string,
): { readonly ok: true; readonly name: string; readonly value: string | number } | { readonly ok: false; readonly error: string } {
  const name = rawName.trim();
  if (!name.startsWith('custom_')) {
    return { ok: false, error: 'Nome deve iniciar com custom_' };
  }
  if (name.length === 0) {
    return { ok: false, error: 'Nome da variavel e obrigatorio' };
  }
  const value = parseVariableValue(rawValue);
  if (String(value).trim().length === 0) {
    return { ok: false, error: 'Valor inicial e obrigatorio' };
  }
  return { ok: true, name, value };
}

/**
 * Insere step novo apos um step selecionado e relinka fluxo sequencial.
 *
 * @param steps - Steps atuais
 * @param selectedId - Step selecionado
 * @param newStep - Novo step a inserir
 * @returns Lista atualizada de steps
 *
 * @example
 * const updated = insertAfter(steps, '2', step);
 */
export function insertAfter(
  steps: readonly WorkerStep[],
  selectedId: string,
  newStep: WorkerStep,
): readonly WorkerStep[] {
  const selected = steps.find((step) => step.id === selectedId);
  if (!selected) {
    return [...steps, newStep];
  }
  const oldTarget = primaryTarget(selected);
  const linkedNewStep = withNext(newStep, oldTarget);
  const rewired = steps.map((step) => {
    if (step.id !== selectedId) {
      return step;
    }
    return updatePrimaryTarget(step, linkedNewStep.id);
  });
  return [...rewired, linkedNewStep];
}

function withNext(step: WorkerStep, next: string): WorkerStep {
  switch (step.type) {
    case 'pi_agent':
    case 'langchain_prompt':
    case 'set_variable':
    case 'git_diff':
      return { ...step, next };
    case 'goto':
    case 'condition':
    case 'fail':
      return step;
  }
}

function updatePrimaryTarget(step: WorkerStep, target: string): WorkerStep {
  switch (step.type) {
    case 'pi_agent':
    case 'langchain_prompt':
    case 'set_variable':
    case 'git_diff':
      return { ...step, next: target };
    case 'goto':
      return { ...step, target };
    case 'condition':
      return { ...step, whenFalse: target };
    case 'fail':
      return step;
  }
}
