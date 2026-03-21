import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { GitError, Result, Worktree, WorktreePath } from './git-types.js';
import { WORKTREE_BASE_DIR, err, ok } from './git-types.js';
import { deleteBranch, execGit, getRepoRoot } from './git-wrapper.js';

// --- Parser interno ---

/**
 * Parseia saída porcelain de `git worktree list --porcelain`.
 * Cada worktree é separado por linha vazia.
 */
const parseWorktreeList = (output: string): readonly Worktree[] => {
  if (!output.trim()) return [];

  return output
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map((entry): Worktree => {
      const lines = entry.split('\n');
      const pathLine = lines.find(l => l.startsWith('worktree '));
      const headLine = lines.find(l => l.startsWith('HEAD '));
      const branchLine = lines.find(l => l.startsWith('branch '));
      const isBare = lines.some(l => l === 'bare');

      return {
        path: pathLine?.slice('worktree '.length) ?? '',
        head: headLine?.slice('HEAD '.length) ?? '',
        branch: branchLine?.slice('branch refs/heads/'.length) ?? '',
        isBare,
      };
    });
};

// --- API pública ---

/**
 * Cria worktree isolado para um nó do DAG.
 * Branch criada a partir da branch base task-{timestamp} com `git worktree add -b`.
 * Em caso de falha, limpa automaticamente branch e diretório parciais.
 *
 * @param nodeId - ID do nó no DAG (ex: "2")
 * @param taskTimestamp - Timestamp da task (ex: "20260321-143000")
 * @returns Objeto com path absoluto e nome da branch criada
 * @throws {GitError} code='branch_not_found' — branch base não existe
 * @throws {GitError} code='worktree_exists' — worktree ou branch já existe
 * @throws {GitError} code='not_a_repo' — não é repositório git
 * @example
 * const result = await createWorktree('2', '20260321-143000');
 * if (result.ok) {
 *   console.log(result.value.path);   // '/repo/.pi-dag-worktrees/task-20260321-143000-subtask-2'
 *   console.log(result.value.branch); // 'task-20260321-143000-subtask-2'
 * }
 */
export const createWorktree = async (
  nodeId: string,
  taskTimestamp: string,
): Promise<Result<WorktreePath, GitError>> => {
  const rootResult = await getRepoRoot();
  if (!rootResult.ok) return rootResult;

  const baseBranch = `task-${taskTimestamp}`;
  const branchName = `${baseBranch}-subtask-${nodeId}`;
  const wtPath = join(rootResult.value, WORKTREE_BASE_DIR, branchName);

  // Verificar se branch base existe
  const checkResult = await execGit(['rev-parse', '--verify', baseBranch]);
  if (!checkResult.ok) {
    return err({
      code: 'branch_not_found' as const,
      message: `Branch base '${baseBranch}' não existe. Crie com createBranch() primeiro.`,
      stderr: checkResult.error.stderr,
    });
  }

  // Garantir que diretório base existe
  await mkdir(join(rootResult.value, WORKTREE_BASE_DIR), { recursive: true });

  // Criar worktree com nova branch a partir da branch base
  const result = await execGit([
    'worktree', 'add', '-b', branchName, wtPath, baseBranch,
  ]);

  if (!result.ok) {
    // Cleanup de falha parcial (melhor esforço)
    await execGit(['worktree', 'remove', wtPath, '--force']);
    await execGit(['branch', '-D', branchName]);
    return result;
  }

  return ok({ path: wtPath, branch: branchName });
};

/**
 * Remove worktree e sua branch associada.
 * Se remoção via git falhar, faz fallback para remoção manual do diretório.
 * Só deleta branches que seguem o padrão task-* (proteção contra deleção acidental).
 *
 * @param path - Caminho absoluto do worktree a remover
 * @returns void em caso de sucesso
 * @throws {GitError} code='worktree_not_found' — worktree não existe
 * @throws {GitError} code='not_a_repo' — não é repositório git
 * @example
 * const result = await removeWorktree('/repo/.pi-dag-worktrees/task-abc-subtask-1');
 * if (result.ok) console.log('Worktree e branch removidos');
 */
export const removeWorktree = async (
  path: string,
): Promise<Result<void, GitError>> => {
  // Capturar branch antes da remoção (worktree pode ser inacessível depois)
  const branchResult = await execGit(
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    path,
  );
  const branchName = branchResult.ok ? branchResult.value : null;

  // Tentar remoção via git
  const removeResult = await execGit(['worktree', 'remove', path, '--force']);

  if (!removeResult.ok) {
    // Fallback: remover diretório manualmente e podar referências
    await rm(path, { recursive: true, force: true }).catch(() => {});
    await execGit(['worktree', 'prune']);
  }

  // Limpar branch associada (apenas branches de task, nunca main/master)
  if (branchName && branchName.startsWith('task-')) {
    await deleteBranch(branchName);
  }

  return ok(undefined);
};

/**
 * Lista todos os worktrees do repositório.
 * Inclui o worktree principal (bare) e todos os worktrees adicionais.
 *
 * @returns Lista imutável de worktrees com path, branch, head e status bare
 * @throws {GitError} code='not_a_repo' — não é repositório git
 * @example
 * const result = await listWorktrees();
 * if (result.ok) {
 *   result.value.forEach(wt => console.log(`${wt.branch} → ${wt.path}`));
 * }
 */
export const listWorktrees = async (): Promise<Result<readonly Worktree[], GitError>> => {
  const result = await execGit(['worktree', 'list', '--porcelain']);
  if (!result.ok) return result;

  return ok(parseWorktreeList(result.value));
};

/**
 * Remove todos os worktrees e branches associados a uma task específica.
 * Filtra por prefixo task-{timestamp} para evitar afetar outros worktrees.
 * Cada worktree é removido individualmente — falhas isoladas não interrompem o cleanup.
 *
 * @param taskTimestamp - Timestamp da task (ex: "20260321-143000")
 * @returns void em caso de sucesso (melhor esforço para cada worktree)
 * @throws {GitError} code='not_a_repo' — não é repositório git
 * @example
 * const result = await cleanupAll('20260321-143000');
 * if (result.ok) console.log('Todos os worktrees da task removidos');
 */
export const cleanupAll = async (
  taskTimestamp: string,
): Promise<Result<void, GitError>> => {
  const listResult = await listWorktrees();
  if (!listResult.ok) return listResult;

  const prefix = `task-${taskTimestamp}`;
  const taskWorktrees = listResult.value.filter(
    wt => wt.branch.startsWith(prefix) && !wt.isBare,
  );

  // Remover cada worktree isoladamente (falhas individuais não propagam)
  for (const wt of taskWorktrees) {
    await removeWorktree(wt.path);
  }

  // Remover branch base da task (se existir)
  await deleteBranch(prefix);

  return ok(undefined);
};
