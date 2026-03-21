/**
 * Resolução de conflitos de merge entre branches de worktrees.
 * Estratégia: merge normal -> fallback -X theirs (last writer wins) -> abort com log.
 * Nunca deleta source files, nunca force push, nunca reset --hard.
 */
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { CommitHash, GitError, MergeResult, Result } from './git-types.js';
import { WORKTREE_BASE_DIR, err, ok } from './git-types.js';
import { execGit, getRepoRoot } from './git-wrapper.js';

// --- Tipos ---

/** Estrategia de resolucao aplicada durante merge */
export type MergeStrategy = 'normal' | 'theirs';

/** Log detalhado de conflitos para debugging */
export interface ConflictLog {
  readonly files: readonly string[];
  readonly strategy: MergeStrategy;
  readonly stderr: string;
}

/** Resultado de merge com informacao de resolucao de conflitos */
export interface ResolvedMergeResult extends MergeResult {
  readonly strategy: MergeStrategy;
  readonly conflictLog?: ConflictLog;
}

/** Erro de conflito irrecuperavel (ambas estrategias falharam) */
export interface ConflictError extends GitError {
  readonly code: 'merge_conflict';
  readonly conflictLogs: readonly ConflictLog[];
}

// --- Helpers internos ---

/** Extrai lista de arquivos conflitantes do worktree via diff filter */
const getConflictFiles = async (cwd: string): Promise<readonly string[]> => {
  const result = await execGit(['diff', '--name-only', '--diff-filter=U'], cwd);
  if (!result.ok) return [];
  return result.value.split('\n').filter(Boolean);
};

/** Cria worktree temporario para operacao de merge isolada */
const createMergeTmpDir = async (
  repoRoot: string,
  target: string,
): Promise<Result<string, GitError>> => {
  const tmpDir = join(repoRoot, WORKTREE_BASE_DIR, `_merge-${Date.now()}`);
  await mkdir(join(repoRoot, WORKTREE_BASE_DIR), { recursive: true });
  const result = await execGit(['worktree', 'add', tmpDir, target]);
  if (!result.ok) return result;
  return ok(tmpDir);
};

/** Limpa worktree temporario com fallback para remocao manual */
const cleanupTmpWorktree = async (tmpDir: string): Promise<void> => {
  const res = await execGit(['worktree', 'remove', tmpDir, '--force']);
  if (!res.ok) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    await execGit(['worktree', 'prune']);
  }
};

/**
 * Tenta merge com estrategia especificada.
 * Coleta arquivos conflitantes e aborta merge parcial em caso de falha.
 */
const tryMerge = async (
  tmpDir: string,
  sources: readonly string[],
  strategy: MergeStrategy,
): Promise<Result<CommitHash, ConflictLog>> => {
  const strategyArgs = strategy === 'theirs' ? ['-X', 'theirs'] : [];
  const label = strategy === 'theirs' ? 'merge (theirs)' : 'merge';
  const msg = `${label}: ${sources.join(', ')}`;

  const mergeResult = await execGit(
    ['merge', '--no-ff', '-m', msg, ...strategyArgs, ...sources],
    tmpDir,
  );

  if (!mergeResult.ok) {
    const files = await getConflictFiles(tmpDir);
    const log: ConflictLog = { files, strategy, stderr: mergeResult.error.stderr };
    await execGit(['merge', '--abort'], tmpDir);
    return err(log);
  }

  const hashResult = await execGit(['rev-parse', 'HEAD'], tmpDir);
  if (!hashResult.ok) {
    return err({ files: [], strategy, stderr: hashResult.error.stderr });
  }

  return ok(hashResult.value as CommitHash);
};

// --- API publica ---

/**
 * Merge com resolucao automatica de conflitos em duas etapas.
 * 1) Tenta merge normal (--no-ff).
 * 2) Se conflitar, retenta com -X theirs (last writer wins).
 * 3) Se ambos falharem, aborta e retorna erro com logs detalhados.
 *
 * Opera exclusivamente em worktrees temporarios — nunca toca o working tree do usuario.
 * Nunca deleta source files, nunca force push, nunca reset --hard.
 *
 * @param target - Branch destino do merge
 * @param sources - Branches a serem mergeadas no target
 * @returns Resultado com hash, branches mergeadas, estrategia usada e log de conflitos
 * @throws {ConflictError} Conflito irrecuperavel — ambas estrategias falharam
 * @throws {GitError} code='branch_not_found' — target ou source nao existe
 * @throws {GitError} code='unknown' — nenhuma source fornecida
 * @example
 * const result = await mergeWithResolution('task-20260321-143000', [
 *   'task-20260321-143000-subtask-1',
 *   'task-20260321-143000-subtask-2',
 * ]);
 * if (result.ok) {
 *   console.log(result.value.strategy);   // 'normal' ou 'theirs'
 *   console.log(result.value.commitHash); // 'a1b2c3d...'
 * } else if (result.error.code === 'merge_conflict') {
 *   console.error(result.error.conflictLogs); // detalhes dos conflitos
 * }
 */
export const mergeWithResolution = async (
  target: string,
  sources: readonly string[],
): Promise<Result<ResolvedMergeResult, ConflictError | GitError>> => {
  if (sources.length === 0) {
    return err({
      code: 'unknown' as const,
      message: 'Nenhuma branch source fornecida para merge',
      stderr: '',
    });
  }

  const rootResult = await getRepoRoot();
  if (!rootResult.ok) return rootResult;

  // --- Tentativa 1: merge normal ---
  const tmp1 = await createMergeTmpDir(rootResult.value, target);
  if (!tmp1.ok) return tmp1;

  const attempt1 = await tryMerge(tmp1.value, sources, 'normal');
  await cleanupTmpWorktree(tmp1.value);

  if (attempt1.ok) {
    return ok({
      commitHash: attempt1.value,
      mergedBranches: [...sources],
      strategy: 'normal' as const,
    });
  }

  const log1 = attempt1.error;

  // --- Tentativa 2: merge -X theirs (last writer wins) ---
  const tmp2 = await createMergeTmpDir(rootResult.value, target);
  if (!tmp2.ok) return tmp2;

  const attempt2 = await tryMerge(tmp2.value, sources, 'theirs');
  await cleanupTmpWorktree(tmp2.value);

  if (attempt2.ok) {
    return ok({
      commitHash: attempt2.value,
      mergedBranches: [...sources],
      strategy: 'theirs' as const,
      conflictLog: log1,
    });
  }

  const log2 = attempt2.error;

  // --- Ambas falharam: erro detalhado ---
  return err({
    code: 'merge_conflict' as const,
    message: `Conflito irrecuperavel mergeando [${sources.join(', ')}] em ${target}. `
      + `${log1.files.length} arquivo(s) na tentativa normal, `
      + `${log2.files.length} na tentativa theirs.`,
    stderr: log2.stderr,
    conflictLogs: [log1, log2],
  });
};
