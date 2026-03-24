/**
 * Resolução de variáveis para templates de pipeline.
 * Módulo dedicado com funções puras — baseado em dWvt6.
 *
 * Suporta variáveis reservadas ($task, $diff, $error, $context)
 * e custom ($custom_*). Variáveis não resolvidas são deixadas
 * como estão (degradação graciosa, sem crash).
 *
 * @module
 */

import type { WorkerPipelineState } from '../schemas/worker-pipeline-state.schema.js';
import { CUSTOM_VAR_PREFIX } from '../schemas/worker-profile.schema.js';

/**
 * Resolve todas as referências $variable em um template contra o pipeline state.
 * Variáveis não encontradas são mantidas inalteradas ($var permanece $var).
 *
 * @param template - String com placeholders $variable
 * @param state - Estado atual do pipeline
 * @returns Template com variáveis substituídas por seus valores
 *
 * @example
 * resolveTemplate('Task: $task, tries: $custom_tries', state);
 * // "Task: Fix login bug, tries: 0"
 */
export function resolveTemplate(template: string, state: WorkerPipelineState): string {
  return template.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, varName: string) => {
    const value = resolveVariable(varName, state);
    if (value === undefined) return `$${varName}`;
    return String(value);
  });
}

/**
 * Lê o valor de uma variável do pipeline state.
 *
 * @param name - Nome da variável (sem prefixo $)
 * @param state - Estado atual do pipeline
 * @returns Valor da variável, ou undefined se não encontrada
 */
export function resolveVariable(
  name: string,
  state: WorkerPipelineState,
): string | number | boolean | null | undefined {
  if (name === 'task') return state.reservedVars.task;
  if (name === 'diff') return state.reservedVars.diff;
  if (name === 'error') return state.reservedVars.error;
  if (name === 'context') return state.reservedVars.context;

  if (name.startsWith(CUSTOM_VAR_PREFIX)) {
    const val = state.customVars[name];
    return val as string | number | boolean | null | undefined;
  }

  return undefined;
}

/**
 * Avalia expressão de comparação simples contra o pipeline state.
 * Operadores suportados: ==, !=, >=, <=, >, <
 *
 * @param expression - Expressão como "$custom_pass == true"
 * @param state - Estado atual do pipeline
 * @returns Resultado booleano da comparação
 * @throws {Error} Se o formato da expressão é inválido
 *
 * @example
 * evaluateExpression('$custom_tries >= 1', state); // true se custom_tries >= 1
 */
export function evaluateExpression(expression: string, state: WorkerPipelineState): boolean {
  const match = expression.match(/^\$([a-zA-Z_][a-zA-Z0-9_]*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!match) {
    throw new Error(`Invalid condition expression: "${expression}". Expected: $variable operator value`);
  }

  const [, varName, operator, rawRight] = match as [string, string, string, string];
  const leftRaw = resolveVariable(varName, state);
  const left = leftRaw ?? '';
  const right = rawRight.trim();

  const leftNum = Number(left);
  const rightNum = Number(right);
  const bothNumeric = !isNaN(leftNum) && !isNaN(rightNum) && left !== '' && right !== '';

  if (bothNumeric) {
    switch (operator) {
      case '==': return leftNum === rightNum;
      case '!=': return leftNum !== rightNum;
      case '>=': return leftNum >= rightNum;
      case '<=': return leftNum <= rightNum;
      case '>':  return leftNum > rightNum;
      case '<':  return leftNum < rightNum;
    }
  }

  const leftStr = String(left);
  switch (operator) {
    case '==': return leftStr === right;
    case '!=': return leftStr !== right;
    default:
      throw new Error(`Operator "${operator}" requires numeric operands, got: "${left}" and "${right}"`);
  }
}

/**
 * Avalia expressão aritmética simples para set_variable.
 * Suporta: $variable + number, $variable - number
 *
 * @param expression - Expressão como "$custom_tries + 1"
 * @param state - Estado atual do pipeline
 * @returns Resultado numérico
 * @throws {Error} Se o formato ou operandos são inválidos
 */
export function evaluateArithmetic(expression: string, state: WorkerPipelineState): number {
  const match = expression.match(/^\$([a-zA-Z_][a-zA-Z0-9_]*)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    throw new Error(`Invalid arithmetic expression: "${expression}". Expected: $variable +/-/*// number`);
  }

  const [, varName, operator, rawRight] = match as [string, string, string, string];
  const left = Number(resolveVariable(varName, state) ?? 0);
  const right = Number(rawRight);

  if (isNaN(left)) {
    throw new Error(`Variable $${varName} is not numeric: "${resolveVariable(varName, state)}"`);
  }

  switch (operator) {
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/': return right !== 0 ? left / right : 0;
    default: return left;
  }
}
