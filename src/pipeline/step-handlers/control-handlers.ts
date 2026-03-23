/**
 * Step handlers de controle de fluxo: condition, goto, set_variable, fail.
 * Baseado em 6sD5N com resolução via variable-resolver dedicado (dWvt6).
 *
 * @module
 */

import type {
  ConditionStep,
  GotoStep,
  SetVariableStep,
  FailStep,
} from '../../schemas/worker-profile.schema.js';
import { END_STEP_ID } from '../../schemas/worker-profile.schema.js';
import { resolveTemplate, evaluateExpression, evaluateArithmetic } from '../variable-resolver.js';
import type { StepHandler } from './types.js';

/**
 * Erro de negócio explícito de um fail step.
 * Distinguido de erros técnicos pelo runtime.
 */
export class PipelineFailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipelineFailError';
  }
}

/**
 * Handles condition steps: avalia expressão e bifurca.
 */
export const handleCondition: StepHandler = async (step, state) => {
  const s = step as ConditionStep;
  const result = evaluateExpression(s.expression, state);
  const target = result ? s.whenTrue : s.whenFalse;
  return { nextStepId: target === END_STEP_ID ? null : target };
};

/**
 * Handles goto steps: salto incondicional para target ou __end__.
 */
export const handleGoto: StepHandler = async (step) => {
  const s = step as GotoStep;
  return { nextStepId: s.target === END_STEP_ID ? null : s.target };
};

/**
 * Handles set_variable steps: define variável a partir de literal ou expressão.
 */
export const handleSetVariable: StepHandler = async (step, state) => {
  const s = step as SetVariableStep;
  let value: string | number | boolean;

  if (s.valueExpression !== undefined) {
    const resolved = resolveTemplate(s.valueExpression, state);
    // Tenta aritmética: "number op number"
    const arith = resolved.match(/^\s*(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (arith) {
      const [, a, op, b] = arith as [string, string, string, string];
      const left = Number(a);
      const right = Number(b);
      switch (op) {
        case '+': value = left + right; break;
        case '-': value = left - right; break;
        case '*': value = left * right; break;
        case '/': value = right !== 0 ? left / right : 0; break;
        default: value = resolved;
      }
    } else {
      // Tenta evaluateArithmetic se ainda contém $var
      try {
        value = evaluateArithmetic(s.valueExpression, state);
      } catch {
        value = resolved;
      }
    }
  } else {
    value = s.value!; // Validado pelo schema: value ou valueExpression obrigatório
  }

  // Rota para reserved ou custom vars
  const reservedKeys = ['task', 'diff', 'error'] as const;
  if ((reservedKeys as readonly string[]).includes(s.target)) {
    return {
      nextStepId: s.next === END_STEP_ID ? null : s.next,
      stateUpdates: {
        reservedVars: { [s.target]: String(value) },
      },
    };
  }

  return {
    nextStepId: s.next === END_STEP_ID ? null : s.next,
    stateUpdates: {
      customVars: { [s.target]: value },
    },
  };
};

/**
 * Handles fail steps: termina pipeline com erro de negócio explícito.
 * @throws {PipelineFailError} Sempre — sinaliza falha de negócio ao runtime
 */
export const handleFail: StepHandler = async (step, state) => {
  const s = step as FailStep;
  const message = resolveTemplate(s.messageTemplate, state);
  throw new PipelineFailError(message);
};
