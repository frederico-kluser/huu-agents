/**
 * Schemas Zod para Worker Pipeline Profiles V1.
 *
 * Define contratos para perfis reutilizáveis de worker, steps declarativos,
 * e helpers de validação. Perfis configuram pipelines multi-step dentro de
 * cada worker, sem alterar o DAG scheduler.
 *
 * Steps V1: pi_agent, langchain_prompt, condition, goto, set_variable, git_diff, fail.
 * Variáveis reservadas: task, diff, error. Namespace custom: custom_*.
 *
 * @module
 */

import { z } from 'zod';

// ── Constants ───────────────────────────────────────────────────────

/** Nomes de variáveis reservadas pelo runtime */
export const RESERVED_VARS = ['task', 'diff', 'error'] as const;
export type ReservedVar = (typeof RESERVED_VARS)[number];

/** Prefixo obrigatório para variáveis definidas pelo usuário */
export const CUSTOM_VAR_PREFIX = 'custom_';

/** Step target que sinaliza término bem-sucedido da pipeline */
export const END_STEP_ID = '__end__';

// ── Variable name validation ────────────────────────────────────────

/**
 * Valida nome de variável: reservada OU custom_*.
 * Baseado em tocNK — validação em parse-time garante integridade.
 *
 * @example
 * VariableNameSchema.parse('task');        // ok (reservada)
 * VariableNameSchema.parse('custom_pass'); // ok (custom)
 * VariableNameSchema.parse('foo');         // throws
 */
export const VariableNameSchema = z.string().min(1).refine(
  (v) => (RESERVED_VARS as readonly string[]).includes(v) || v.startsWith(CUSTOM_VAR_PREFIX),
  { message: `Variable name must be a reserved name (${RESERVED_VARS.join(', ')}) or start with ${CUSTOM_VAR_PREFIX}` },
);
export type VariableName = z.infer<typeof VariableNameSchema>;

// ── Step type discriminated union ───────────────────────────────────

const BaseStep = z.object({
  id: z.string().min(1).describe('Unique step identifier within the profile'),
});

/** Executa Pi Coding Agent no worktree atual */
export const PiAgentStepSchema = BaseStep.extend({
  type: z.literal('pi_agent'),
  taskTemplate: z.string().min(1).describe('Template com $vars interpoláveis'),
  next: z.string().min(1).describe('ID do próximo step ou __end__'),
});
export type PiAgentStep = z.infer<typeof PiAgentStepSchema>;

/** Gera ou refina texto via LangChain (ChatOpenAI + OpenRouter) */
export const LangchainPromptStepSchema = BaseStep.extend({
  type: z.literal('langchain_prompt'),
  inputTemplate: z.string().min(1).describe('Template de input com $vars'),
  outputTarget: VariableNameSchema.describe('Variável destino do resultado'),
  next: z.string().min(1).describe('ID do próximo step ou __end__'),
});
export type LangchainPromptStep = z.infer<typeof LangchainPromptStepSchema>;

/** Avalia expressão simples e bifurca execução */
export const ConditionStepSchema = BaseStep.extend({
  type: z.literal('condition'),
  expression: z.string().min(1).describe('Expressão simples com $vars (ex: $custom_pass == true)'),
  whenTrue: z.string().min(1).describe('Step ID se verdadeiro'),
  whenFalse: z.string().min(1).describe('Step ID se falso'),
});
export type ConditionStep = z.infer<typeof ConditionStepSchema>;

/** Salta incondicionalmente para outro step */
export const GotoStepSchema = BaseStep.extend({
  type: z.literal('goto'),
  target: z.string().min(1).describe('Step ID destino ou __end__'),
});
export type GotoStep = z.infer<typeof GotoStepSchema>;

/** Define ou atualiza variável */
export const SetVariableStepSchema = BaseStep.extend({
  type: z.literal('set_variable'),
  target: VariableNameSchema.describe('Variável a definir'),
  value: z.union([z.string(), z.number(), z.boolean()]).optional()
    .describe('Valor literal (mutuamente exclusivo com valueExpression)'),
  valueExpression: z.string().optional()
    .describe('Expressão aritmética simples com $vars (ex: $custom_tries + 1)'),
  next: z.string().min(1).describe('ID do próximo step ou __end__'),
});
export type SetVariableStep = z.infer<typeof SetVariableStepSchema>;

/** Materializa diff do worktree atual */
export const GitDiffStepSchema = BaseStep.extend({
  type: z.literal('git_diff'),
  target: VariableNameSchema.describe('Variável destino do diff'),
  next: z.string().min(1).describe('ID do próximo step ou __end__'),
});
export type GitDiffStep = z.infer<typeof GitDiffStepSchema>;

/** Encerra fluxo com erro de negócio explícito */
export const FailStepSchema = BaseStep.extend({
  type: z.literal('fail'),
  messageTemplate: z.string().min(1).describe('Mensagem de erro com $vars'),
});
export type FailStep = z.infer<typeof FailStepSchema>;

/**
 * Union discriminada de todos os step types da V1.
 *
 * @example
 * const step = WorkerStepSchema.parse({
 *   id: 'write-tests', type: 'pi_agent',
 *   taskTemplate: 'Escreva testes para $task', next: 'check-tests',
 * });
 */
export const WorkerStepSchema = z.discriminatedUnion('type', [
  PiAgentStepSchema,
  LangchainPromptStepSchema,
  ConditionStepSchema,
  GotoStepSchema,
  SetVariableStepSchema,
  GitDiffStepSchema,
  FailStepSchema,
]);
export type WorkerStep = z.infer<typeof WorkerStepSchema>;

/** Tipos de step disponíveis (para UI e registry) */
export const STEP_TYPES = [
  'pi_agent', 'langchain_prompt', 'condition', 'goto',
  'set_variable', 'git_diff', 'fail',
] as const;
export type StepType = (typeof STEP_TYPES)[number];

// ── Profile scope ───────────────────────────────────────────────────

export const ProfileScope = z.enum(['global', 'project']);
export type ProfileScope = z.infer<typeof ProfileScope>;

// ── Worker profile ──────────────────────────────────────────────────

/**
 * Perfil de worker reutilizável: define uma pipeline declarativa multi-step.
 * superRefine valida integridade referencial de entryStepId e set_variable.
 *
 * @example
 * const profile: WorkerProfile = {
 *   id: 'test-driven-fixer', name: 'Test Driven Fixer',
 *   description: 'Gera testes, corrige, valida.', scope: 'project',
 *   entryStepId: 'init', maxStepExecutions: 20,
 *   steps: [
 *     { id: 'init', type: 'set_variable', target: 'custom_tries', value: 0, next: 'done' },
 *     { id: 'done', type: 'goto', target: '__end__' },
 *   ],
 * };
 */
export const WorkerProfileSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'ID deve usar kebab-case')
    .describe('Identificador único do perfil'),
  name: z.string().min(1).describe('Nome legível do perfil'),
  description: z.string().default('').describe('Descrição opcional'),
  scope: ProfileScope.describe('Escopo do perfil'),
  workerModel: z.string().min(1).optional()
    .describe('Modelo override para steps pi_agent (usa config.workerModel se omitido)'),
  langchainModel: z.string().min(1).optional()
    .describe('Modelo para steps langchain_prompt'),
  entryStepId: z.string().min(1).describe('ID do step inicial'),
  maxStepExecutions: z.number().int().min(1).max(100).default(20)
    .describe('Limite de execuções para proteção contra loops'),
  steps: z.array(WorkerStepSchema).min(1).describe('Steps da pipeline'),
}).superRefine((data, ctx) => {
  // Valida que entryStepId aponta para step existente
  const stepIds = new Set(data.steps.map((s) => s.id));
  if (!stepIds.has(data.entryStepId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `entryStepId "${data.entryStepId}" does not match any step ID`,
      path: ['entryStepId'],
    });
  }

  // Valida que set_variable tem value OU valueExpression (XOR)
  for (const step of data.steps) {
    if (step.type === 'set_variable') {
      const hasValue = step.value !== undefined;
      const hasExpr = step.valueExpression !== undefined;
      if (!hasValue && !hasExpr) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step "${step.id}": set_variable requires "value" or "valueExpression"`,
          path: ['steps'],
        });
      }
    }
  }
});
export type WorkerProfile = z.infer<typeof WorkerProfileSchema>;

// ── Profile catalog ─────────────────────────────────────────────────

/**
 * Catálogo de perfis (formato do arquivo JSON persistido).
 * Mesmo schema para global (~/.pi-dag-cli/worker-profiles.json)
 * e local (.pi-dag/worker-profiles.json).
 */
export const ProfileCatalogSchema = z.object({
  version: z.literal(1).describe('Versão do schema do catálogo'),
  profiles: z.array(WorkerProfileSchema).describe('Lista de perfis'),
});
export type ProfileCatalog = z.infer<typeof ProfileCatalogSchema>;

// ── Validation helpers ──────────────────────────────────────────────

/**
 * Valida integridade referencial de um perfil: verifica que todos os
 * targets de goto/condition/next apontam para steps existentes ou __end__.
 * Baseado em tocNK — validação pós-parse complementar ao superRefine.
 *
 * @param profile - Perfil a validar
 * @returns Lista de erros (vazia = válido)
 *
 * @example
 * const errors = validateProfileReferences(profile);
 * if (errors.length > 0) throw new Error(errors.join('; '));
 */
export function validateProfileReferences(profile: WorkerProfile): readonly string[] {
  const stepIds = new Set(profile.steps.map((s) => s.id));
  stepIds.add(END_STEP_ID);
  const errors: string[] = [];

  if (!stepIds.has(profile.entryStepId)) {
    errors.push(`entryStepId "${profile.entryStepId}" does not match any step`);
  }

  for (const step of profile.steps) {
    const checkTarget = (field: string, target: string) => {
      if (!stepIds.has(target)) {
        errors.push(`Step "${step.id}" field "${field}" references unknown target "${target}"`);
      }
    };

    switch (step.type) {
      case 'pi_agent':
      case 'langchain_prompt':
      case 'set_variable':
      case 'git_diff':
        checkTarget('next', step.next);
        break;
      case 'condition':
        checkTarget('whenTrue', step.whenTrue);
        checkTarget('whenFalse', step.whenFalse);
        break;
      case 'goto':
        checkTarget('target', step.target);
        break;
      case 'fail':
        // fail has no navigation targets
        break;
    }
  }

  return errors;
}

// ── Lookup helpers ──────────────────────────────────────────────────

/**
 * Busca step por ID dentro de um perfil.
 *
 * @param profile - Perfil onde buscar
 * @param stepId - ID do step
 * @returns Step encontrado ou undefined
 */
export function findStep(profile: WorkerProfile, stepId: string): WorkerStep | undefined {
  return profile.steps.find((s) => s.id === stepId);
}
