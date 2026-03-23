import {
  END_STEP_ID,
  VariableNameSchema,
  type StepType,
  type WorkerStep,
} from '../schemas/worker-profile.schema.js';

export interface StepTypeItem {
  readonly label: string;
  readonly value: StepType;
  readonly description: string;
}

export interface StepFieldDef {
  readonly key: string;
  readonly label: string;
  readonly placeholder: string;
  readonly required: boolean;
}

export interface StepValidationResult {
  readonly valid: boolean;
  readonly errors: Readonly<Record<string, string>>;
}

export interface VariableUsage {
  readonly reads: readonly string[];
  readonly writes: readonly string[];
}

export const STEP_TYPE_ITEMS: readonly StepTypeItem[] = [
  { label: 'Pi Agent', value: 'pi_agent', description: 'Executa agente IA no worktree' },
  { label: 'LangChain Prompt', value: 'langchain_prompt', description: 'Gera/refina texto via LLM' },
  { label: 'Condition', value: 'condition', description: 'Avalia expressao e bifurca' },
  { label: 'Goto', value: 'goto', description: 'Salto incondicional' },
  { label: 'Set Variable', value: 'set_variable', description: 'Define variavel' },
  { label: 'Git Diff', value: 'git_diff', description: 'Captura diff do worktree' },
  { label: 'Fail', value: 'fail', description: 'Encerra com erro de negocio' },
];

export const VARIABLE_DOCS = {
  reserved: '$task, $diff, $error',
  custom: '$custom_*',
} as const;

/**
 * Retorna campos editaveis para cada tipo de step.
 *
 * @param type - Tipo de step
 * @param targetOptions - IDs validos de alvo
 * @returns Lista de campos de edicao
 *
 * @example
 * getFieldDefs('pi_agent', ['1', '2', '__end__'])
 */
export function getFieldDefs(type: StepType, targetOptions: readonly string[]): readonly StepFieldDef[] {
  const targetHint = `(${targetOptions.join(', ')})`;
  switch (type) {
    case 'pi_agent':
      return [
        { key: 'taskTemplate', label: 'Task template', placeholder: 'Write tests for: $task', required: true },
      ];
    case 'langchain_prompt':
      return [
        { key: 'inputTemplate', label: 'Prompt template', placeholder: 'Summarize: $task', required: true },
        { key: 'outputTarget', label: 'Output variable', placeholder: 'custom_summary', required: true },
      ];
    case 'condition':
      return [
        { key: 'expression', label: 'Expression', placeholder: '$custom_tries >= 3', required: true },
        { key: 'whenTrue', label: `When true ${targetHint}`, placeholder: END_STEP_ID, required: true },
        { key: 'whenFalse', label: `When false ${targetHint}`, placeholder: END_STEP_ID, required: true },
      ];
    case 'goto':
      return [{ key: 'target', label: `Target ${targetHint}`, placeholder: END_STEP_ID, required: true }];
    case 'set_variable':
      return [
        { key: 'target', label: 'Variable target', placeholder: 'custom_tries', required: true },
        { key: 'value', label: 'Literal value (optional)', placeholder: '0', required: false },
        { key: 'valueExpression', label: 'Value expression (optional)', placeholder: '$custom_tries + 1', required: false },
      ];
    case 'git_diff':
      return [{ key: 'target', label: 'Output variable', placeholder: 'diff', required: true }];
    case 'fail':
      return [{ key: 'messageTemplate', label: 'Error message', placeholder: 'Failed after retries: $error', required: true }];
  }
}

/**
 * Extrai campos editaveis de um step para formulario.
 *
 * @param step - Step existente
 * @returns Mapa campo->valor
 *
 * @example
 * const fields = extractFields(step);
 */
export function extractFields(step: WorkerStep): Readonly<Record<string, string>> {
  switch (step.type) {
    case 'pi_agent':
      return { taskTemplate: step.taskTemplate };
    case 'langchain_prompt':
      return { inputTemplate: step.inputTemplate, outputTarget: step.outputTarget };
    case 'condition':
      return { expression: step.expression, whenTrue: step.whenTrue, whenFalse: step.whenFalse };
    case 'goto':
      return { target: step.target };
    case 'set_variable':
      return {
        target: step.target,
        value: step.value === undefined ? '' : String(step.value),
        valueExpression: step.valueExpression ?? '',
      };
    case 'git_diff':
      return { target: step.target };
    case 'fail':
      return { messageTemplate: step.messageTemplate };
  }
}

/**
 * Cria step a partir dos campos do editor.
 *
 * @param type - Tipo do step
 * @param id - ID final do step
 * @param fields - Campos editados
 * @param nextTarget - Proximo step no fluxo sequencial
 * @returns Step construido
 *
 * @example
 * const step = buildStepFromFields('goto', '4', { target: '__end__' }, '__end__');
 */
export function buildStepFromFields(
  type: StepType,
  id: string,
  fields: Readonly<Record<string, string>>,
  nextTarget: string,
): WorkerStep {
  switch (type) {
    case 'pi_agent':
      return { id, type, taskTemplate: fields.taskTemplate ?? '', next: nextTarget };
    case 'langchain_prompt':
      return {
        id,
        type,
        inputTemplate: fields.inputTemplate ?? '',
        outputTarget: fields.outputTarget ?? '',
        next: nextTarget,
      };
    case 'condition':
      return {
        id,
        type,
        expression: fields.expression ?? '',
        whenTrue: fields.whenTrue || END_STEP_ID,
        whenFalse: fields.whenFalse || END_STEP_ID,
      };
    case 'goto':
      return { id, type, target: fields.target || END_STEP_ID };
    case 'set_variable': {
      const rawValue = fields.value?.trim() ?? '';
      const valueExpression = fields.valueExpression?.trim() ?? '';
      if (valueExpression.length > 0) {
        return { id, type, target: fields.target ?? '', valueExpression, next: nextTarget };
      }
      return { id, type, target: fields.target ?? '', value: parseLiteral(rawValue), next: nextTarget };
    }
    case 'git_diff':
      return { id, type, target: fields.target ?? 'diff', next: nextTarget };
    case 'fail':
      return { id, type, messageTemplate: fields.messageTemplate ?? '' };
  }
}

/**
 * Valida campos editados de um step.
 *
 * @param type - Tipo do step
 * @param fields - Campos preenchidos
 * @param validTargets - Targets validos para referencias
 * @returns Resultado de validacao
 *
 * @example
 * const result = validateStepFields('pi_agent', { taskTemplate: '' }, new Set(['1', '__end__']));
 */
export function validateStepFields(
  type: StepType,
  fields: Readonly<Record<string, string>>,
  validTargets: ReadonlySet<string>,
): StepValidationResult {
  const errors: Record<string, string> = {};
  const requireText = (key: string, label: string) => {
    if ((fields[key] ?? '').trim().length === 0) {
      errors[key] = `${label} is required`;
    }
  };

  switch (type) {
    case 'pi_agent':
      requireText('taskTemplate', 'Task template');
      break;
    case 'langchain_prompt':
      requireText('inputTemplate', 'Prompt template');
      requireText('outputTarget', 'Output variable');
      validateVariableField('outputTarget');
      break;
    case 'condition':
      requireText('expression', 'Expression');
      requireText('whenTrue', 'When true target');
      requireText('whenFalse', 'When false target');
      validateTarget('whenTrue');
      validateTarget('whenFalse');
      break;
    case 'goto':
      requireText('target', 'Target');
      validateTarget('target');
      break;
    case 'set_variable': {
      requireText('target', 'Variable target');
      validateVariableField('target');
      const hasValue = (fields.value ?? '').trim().length > 0;
      const hasExpression = (fields.valueExpression ?? '').trim().length > 0;
      if (!hasValue && !hasExpression) {
        errors.value = 'Either literal value or value expression is required';
      }
      if (hasValue && hasExpression) {
        errors.valueExpression = 'Use only one of value or valueExpression';
      }
      break;
    }
    case 'git_diff':
      requireText('target', 'Output variable');
      validateVariableField('target');
      break;
    case 'fail':
      requireText('messageTemplate', 'Error message');
      break;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };

  function validateTarget(key: string): void {
    const target = (fields[key] ?? '').trim();
    if (target.length > 0 && !validTargets.has(target)) {
      errors[key] = `Unknown target "${target}"`;
    }
  }

  function validateVariableField(key: string): void {
    const rawValue = fields[key] ?? '';
    if (rawValue.trim().length === 0) {
      return;
    }
    const parsed = VariableNameSchema.safeParse(rawValue.trim());
    if (!parsed.success) {
      errors[key] = parsed.error.issues[0]?.message ?? 'Invalid variable';
    }
  }
}

/**
 * Opcoes de targets para condition/goto.
 *
 * @param steps - Steps atuais
 * @returns Lista de IDs + __end__
 *
 * @example
 * const options = buildTargetOptions(steps);
 */
export function buildTargetOptions(steps: readonly WorkerStep[]): readonly string[] {
  return [...steps.map((step) => step.id), END_STEP_ID];
}

/**
 * Identifica variaveis lidas e escritas por um step.
 *
 * @param step - Step para analise
 * @returns Listas de reads e writes
 *
 * @example
 * extractVariableUsage(step)
 */
export function extractVariableUsage(step: WorkerStep): VariableUsage {
  switch (step.type) {
    case 'pi_agent':
      return { reads: readVars(step.taskTemplate), writes: [] };
    case 'langchain_prompt':
      return { reads: readVars(step.inputTemplate), writes: [normalizeVar(step.outputTarget)] };
    case 'condition':
      return { reads: readVars(step.expression), writes: [] };
    case 'set_variable':
      return {
        reads: step.valueExpression ? readVars(step.valueExpression) : [],
        writes: [normalizeVar(step.target)],
      };
    case 'git_diff':
      return { reads: [], writes: [normalizeVar(step.target)] };
    case 'goto':
    case 'fail':
      return {
        reads: step.type === 'fail' ? readVars(step.messageTemplate) : [],
        writes: [],
      };
  }
}

function parseLiteral(value: string): string | number | boolean {
  if (value.length === 0) {
    return '';
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return value;
}

function readVars(template: string): readonly string[] {
  const matches = template.match(/\$[a-z_]+/g) ?? [];
  return uniq(matches.map((token) => token.slice(1)));
}

function normalizeVar(name: string): string {
  return name.startsWith('$') ? name.slice(1) : name;
}

function uniq(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
