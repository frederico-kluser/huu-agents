/**
 * Tipos compartilhados para operações Git do Pi DAG CLI.
 * Define o padrão Result<T, GitError> — operações nunca lançam exceções.
 */

/** Diretório base para worktrees criados pelo Pi DAG CLI */
export const WORKTREE_BASE_DIR = '.pi-dag-worktrees';

/** Códigos de erro classificados para operações Git */
export type GitErrorCode =
  | 'branch_exists'
  | 'branch_not_found'
  | 'worktree_exists'
  | 'worktree_not_found'
  | 'merge_conflict'
  | 'dirty_worktree'
  | 'no_changes'
  | 'not_a_repo'
  | 'unknown';

/** Erro estruturado de operação Git com código classificado e saída stderr */
export interface GitError {
  readonly code: GitErrorCode;
  readonly message: string;
  readonly stderr: string;
}

/**
 * Resultado discriminado para operações que nunca lançam exceções.
 * Toda operação Git retorna sucesso com valor ou falha com GitError.
 */
export type Result<T, E = GitError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Hash de commit Git (SHA-1, 40 caracteres hex) */
export type CommitHash = string & { readonly _tag: 'CommitHash' };

/** Informações de worktree criado (path absoluto + branch associada) */
export interface WorktreePath {
  readonly path: string;
  readonly branch: string;
}

/** Informações completas de um worktree existente */
export interface Worktree {
  readonly path: string;
  readonly branch: string;
  readonly head: string;
  readonly isBare: boolean;
}

/** Resultado de operação de merge com hash e branches mergeadas */
export interface MergeResult {
  readonly commitHash: CommitHash;
  readonly mergedBranches: readonly string[];
}

/** Cria resultado de sucesso tipado */
export const ok = <T>(value: T): Result<T, never> =>
  ({ ok: true, value }) as const;

/** Cria resultado de erro tipado */
export const err = <E>(error: E): Result<never, E> =>
  ({ ok: false, error }) as const;
