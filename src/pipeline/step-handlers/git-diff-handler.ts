/**
 * Step handler para git_diff — arquivo dedicado (6sD5N).
 * Single responsibility: captura diff do worktree.
 *
 * @module
 */

import { execGit } from '../../git/git-wrapper.js';
import type { GitDiffStep } from '../../schemas/worker-profile.schema.js';
import { END_STEP_ID } from '../../schemas/worker-profile.schema.js';
import type { StepHandler } from './types.js';

/**
 * Handles git_diff steps: captura diff do worktree e armazena na variável target.
 * Usa `git diff HEAD` para capturar staged e unstaged changes.
 *
 * @example
 * // Step: { id: 'snap', type: 'git_diff', target: 'diff', next: 'check' }
 * // Resultado: state.reservedVars.diff = "diff --git a/..."
 */
export const handleGitDiff: StepHandler = async (step, _state, ctx) => {
  const s = step as GitDiffStep;

  const result = await execGit(['diff', 'HEAD'], ctx.worktreePath);
  const diff = result.ok ? result.value : '';

  const reservedKeys = ['task', 'diff', 'error'] as const;
  if ((reservedKeys as readonly string[]).includes(s.target)) {
    return {
      nextStepId: s.next === END_STEP_ID ? null : s.next,
      stateUpdates: {
        reservedVars: { [s.target]: diff },
      },
    };
  }

  return {
    nextStepId: s.next === END_STEP_ID ? null : s.next,
    stateUpdates: {
      customVars: { [s.target]: diff },
    },
  };
};
