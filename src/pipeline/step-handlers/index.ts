/**
 * Registry imutável de step handlers.
 * Baseado em wXTUC (ReadonlyMap) — extensível e type-safe.
 *
 * @module
 */

import type { StepHandler } from './types.js';
import { handleCondition, handleGoto, handleSetVariable, handleFail } from './control-handlers.js';
import { handlePiAgent, handleLangchainPrompt } from './ai-handlers.js';
import { handleGitDiff } from './git-diff-handler.js';

export type { StepHandler, StepHandlerContext, StepHandlerResult } from './types.js';

/**
 * Registry imutável mapeando step type ao seu handler.
 *
 * @example
 * const handler = stepHandlerRegistry.get('condition');
 * if (handler) await handler(step, state, ctx);
 */
export const stepHandlerRegistry: ReadonlyMap<string, StepHandler> = new Map<string, StepHandler>([
  ['pi_agent', handlePiAgent],
  ['langchain_prompt', handleLangchainPrompt],
  ['condition', handleCondition],
  ['goto', handleGoto],
  ['set_variable', handleSetVariable],
  ['git_diff', handleGitDiff],
  ['fail', handleFail],
]);
