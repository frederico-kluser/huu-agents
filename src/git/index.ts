/** Módulo Git — wrapper seguro e gerenciador de worktrees para o Pi DAG CLI */

export type {
  CommitHash,
  GitError,
  GitErrorCode,
  MergeResult,
  Result,
  Worktree,
  WorktreePath,
} from './git-types.js';
export { err, ok, WORKTREE_BASE_DIR } from './git-types.js';

export {
  commit,
  createBranch,
  deleteBranch,
  getCurrentBranch,
  getRepoRoot,
  merge,
} from './git-wrapper.js';

export type {
  ConflictError,
  ConflictLog,
  MergeStrategy,
  ResolvedMergeResult,
} from './conflict-resolver.js';
export { mergeWithResolution } from './conflict-resolver.js';

export {
  cleanupAll,
  createWorktree,
  listWorktrees,
  removeWorktree,
} from './worktree-manager.js';
