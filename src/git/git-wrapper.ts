import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { CommitHash, GitError, GitErrorCode, MergeResult, Result } from './git-types.js';
import { WORKTREE_BASE_DIR, err, ok } from './git-types.js';

const execFileAsync = promisify(execFile);

// --- Helpers internos ---

/**
 * Classifica stderr/message do git em código de erro semântico.
 * Ordem importa: matches mais específicos primeiro.
 */
const classifyError = (stderr: string, message: string): GitErrorCode => {
  const text = `${stderr}\n${message}`.toLowerCase();
  if (text.includes('already exists') && text.includes('branch')) return 'branch_exists';
  if (text.includes('not found') && text.includes('branch')) return 'branch_not_found';
  if (text.includes('already exists') || text.includes('already checked out')) return 'worktree_exists';
  if (text.includes('not a working tree')) return 'worktree_not_found';
  if (text.includes('conflict (') || text.includes('merge failed')) return 'merge_conflict';
  if (text.includes('not a git repository')) return 'not_a_repo';
  if (text.includes('nothing to commit')) return 'no_changes';
  if (text.includes('uncommitted changes') || text.includes('changes not staged')) return 'dirty_worktree';
  return 'unknown';
};

/**
 * Executa comando git via execFile (seguro contra shell injection).
 * Retorna Result com stdout trimado ou GitError classificado.
 *
 * @param args - Argumentos para o comando git
 * @param cwd - Diretório de trabalho (default: process.cwd())
 * @returns stdout trimado ou GitError
 */
export const execGit = async (
  args: readonly string[],
  cwd?: string,
): Promise<Result<string, GitError>> => {
  try {
    const { stdout } = await execFileAsync('git', [...args], {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000,
    });
    return ok(stdout.trim());
  } catch (error: unknown) {
    const e = error as { stderr?: string; message?: string; code?: string };
    if (e.code === 'ENOENT') {
      return err({
        code: 'not_a_repo' as const,
        message: 'git não encontrado no PATH ou diretório inexistente',
        stderr: '',
      });
    }
    const stderr = e.stderr ?? '';
    return err({
      code: classifyError(stderr, e.message ?? ''),
      message: e.message ?? 'Erro desconhecido no git',
      stderr,
    });
  }
};

/**
 * Retorna o caminho absoluto da raiz do repositório git.
 *
 * @returns Caminho absoluto do repo root
 * @throws {GitError} code='not_a_repo' — diretório atual não é repositório git
 * @example
 * const root = await getRepoRoot();
 * if (root.ok) console.log(root.value); // '/home/user/project'
 */
export const getRepoRoot = async (): Promise<Result<string, GitError>> =>
  execGit(['rev-parse', '--show-toplevel']);

// --- API pública ---

/**
 * Cria uma nova branch git sem checkout.
 * Não modifica o working tree — apenas cria a referência.
 *
 * @param name - Nome da branch a criar
 * @param from - Branch ou commit de origem (default: HEAD)
 * @returns Nome da branch criada
 * @throws {GitError} code='branch_exists' — branch já existe
 * @throws {GitError} code='not_a_repo' — não é repositório git
 * @example
 * const result = await createBranch('task-20260321-143000');
 * if (result.ok) console.log(result.value); // 'task-20260321-143000'
 *
 * @example
 * const result = await createBranch('feature', 'main');
 * if (!result.ok) console.error(result.error.code);
 */
export const createBranch = async (
  name: string,
  from?: string,
): Promise<Result<string, GitError>> => {
  const args = from
    ? ['branch', name, from]
    : ['branch', name];

  const result = await execGit(args);
  if (!result.ok) return result;

  return ok(name);
};

/**
 * Deleta uma branch local. Usa -D (force) para branches não-mergeadas.
 *
 * @param name - Nome da branch a deletar
 * @returns void em caso de sucesso
 * @throws {GitError} code='branch_not_found' — branch não existe
 * @throws {GitError} code='not_a_repo' — não é repositório git
 * @example
 * const result = await deleteBranch('task-20260321-143000-subtask-1');
 * if (result.ok) console.log('Branch removida');
 */
export const deleteBranch = async (
  name: string,
): Promise<Result<void, GitError>> => {
  const result = await execGit(['branch', '-D', name]);
  if (!result.ok) return result;

  return ok(undefined);
};

/**
 * Faz stage de todas as mudanças e commit no worktree especificado.
 * Usa `git add -A` para incluir arquivos novos, modificados e deletados.
 * Nunca opera no working tree do usuário — apenas em worktrees isolados.
 *
 * @param worktreePath - Caminho absoluto do worktree
 * @param message - Mensagem de commit (conventional commits)
 * @returns Hash SHA-1 do commit criado
 * @throws {GitError} code='no_changes' — nenhuma mudança para commitar
 * @throws {GitError} code='not_a_repo' — caminho não é worktree válido
 * @example
 * const result = await commit('/repo/.pi-dag-worktrees/task-abc-subtask-1', 'feat: add auth module');
 * if (result.ok) console.log(result.value); // 'a1b2c3d...'
 */
export const commit = async (
  worktreePath: string,
  message: string,
): Promise<Result<CommitHash, GitError>> => {
  const addResult = await execGit(['add', '-A'], worktreePath);
  if (!addResult.ok) return addResult;

  const commitResult = await execGit(['commit', '-m', message], worktreePath);
  if (!commitResult.ok) return commitResult;

  const hashResult = await execGit(['rev-parse', 'HEAD'], worktreePath);
  if (!hashResult.ok) return hashResult;

  return ok(hashResult.value as CommitHash);
};

/**
 * Merge múltiplas branches source na branch target.
 * Cria worktree temporário para a operação — nunca toca o working tree do usuário.
 * Em caso de conflito, aborta o merge e limpa o worktree temporário.
 *
 * @param target - Branch destino do merge
 * @param sources - Branches a serem mergeadas no target
 * @returns Hash do merge commit e lista de branches mergeadas
 * @throws {GitError} code='merge_conflict' — conflito detectado, merge abortado
 * @throws {GitError} code='branch_not_found' — target ou source não existe
 * @throws {GitError} code='unknown' — nenhuma source fornecida
 * @example
 * const result = await merge('task-20260321-143000', [
 *   'task-20260321-143000-subtask-1',
 *   'task-20260321-143000-subtask-2',
 * ]);
 * if (result.ok) console.log(result.value.commitHash);
 */
export const merge = async (
  target: string,
  sources: readonly string[],
): Promise<Result<MergeResult, GitError>> => {
  if (sources.length === 0) {
    return err({
      code: 'unknown' as const,
      message: 'Nenhuma branch source fornecida para merge',
      stderr: '',
    });
  }

  const rootResult = await getRepoRoot();
  if (!rootResult.ok) return rootResult;

  const tmpDir = join(
    rootResult.value,
    WORKTREE_BASE_DIR,
    `_merge-${Date.now()}`,
  );

  // Garantir que diretório base existe
  await mkdir(join(rootResult.value, WORKTREE_BASE_DIR), { recursive: true });

  // Criar worktree temporário para a branch target
  const addResult = await execGit(['worktree', 'add', tmpDir, target]);
  if (!addResult.ok) return addResult;

  // Merge das source branches
  const mergeResult = await execGit(
    ['merge', '--no-ff', '-m', `merge: ${sources.join(', ')}`, ...sources],
    tmpDir,
  );

  if (!mergeResult.ok) {
    // Abortar merge parcial e limpar worktree
    await execGit(['merge', '--abort'], tmpDir);
    const cleanupRes = await execGit(['worktree', 'remove', tmpDir, '--force']);
    if (!cleanupRes.ok) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      await execGit(['worktree', 'prune']);
    }
    return mergeResult;
  }

  // Capturar hash do merge commit
  const hashResult = await execGit(['rev-parse', 'HEAD'], tmpDir);

  // Sempre limpar o worktree temporário (com fallback)
  const removeRes = await execGit(['worktree', 'remove', tmpDir, '--force']);
  if (!removeRes.ok) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    await execGit(['worktree', 'prune']);
  }

  if (!hashResult.ok) return hashResult;

  return ok({
    commitHash: hashResult.value as CommitHash,
    mergedBranches: [...sources],
  });
};

/**
 * Retorna o nome da branch atual (HEAD).
 *
 * @returns Nome da branch ou 'HEAD' se detached
 * @throws {GitError} code='not_a_repo' — não é repositório git
 * @example
 * const result = await getCurrentBranch();
 * if (result.ok) console.log(result.value); // 'main'
 */
export const getCurrentBranch = async (): Promise<Result<string, GitError>> =>
  execGit(['rev-parse', '--abbrev-ref', 'HEAD']);
