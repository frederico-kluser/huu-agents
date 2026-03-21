import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const TOKENS_PER_LINE = 8;
const AVG_BYTES_PER_LINE = 40;
const MAX_DEPTH = 4;

/** Nó imutável da árvore de arquivos do repositório */
export interface FileNode {
  readonly name: string;
  readonly path: string;
  readonly type: 'file' | 'directory';
  readonly children: readonly FileNode[];
  readonly sizeBytes: number;
}

/** Nó achatado para renderização sequencial com estado de expansão */
export interface FlatNode {
  readonly node: FileNode;
  readonly depth: number;
  readonly isExpanded: boolean;
}

/**
 * Estima tokens de contexto a partir do tamanho do arquivo.
 * Usa ~40 bytes/linha e 8 tokens/linha (média JS/TS).
 *
 * @param sizeBytes - Tamanho em bytes
 * @returns Estimativa de tokens
 * @example
 * estimateTokens(4000); // 800
 */
export const estimateTokens = (sizeBytes: number): number =>
  Math.ceil(sizeBytes / AVG_BYTES_PER_LINE) * TOKENS_PER_LINE;

/**
 * Lista arquivos no repositório git, respeitando .gitignore.
 *
 * @param cwd - Raiz do repositório
 * @returns Caminhos relativos dos arquivos
 * @throws {Error} Diretório não é repositório git
 * @example
 * const files = await listGitFiles(process.cwd());
 * // ['src/app.tsx', 'package.json']
 */
export const listGitFiles = async (
  cwd: string,
): Promise<readonly string[]> => {
  const { stdout } = await execFileAsync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd, maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout.trim().split('\n').filter(Boolean);
};

/**
 * Obtém tamanhos de arquivos via fs.stat.
 *
 * @param cwd - Diretório base
 * @param paths - Caminhos relativos
 * @returns Mapa de caminho para tamanho em bytes
 * @example
 * const sizes = await getFileSizes('/repo', ['src/app.tsx']);
 */
export const getFileSizes = async (
  cwd: string,
  paths: readonly string[],
): Promise<ReadonlyMap<string, number>> => {
  const entries = await Promise.all(
    paths.map(async (p): Promise<readonly [string, number]> => {
      try {
        const s = await stat(join(cwd, p));
        return [p, s.size] as const;
      } catch {
        return [p, 0] as const;
      }
    }),
  );
  return new Map(entries);
};

/** Ordena: diretórios primeiro, depois alfabético */
const sortNodes = (a: FileNode, b: FileNode): number => {
  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
  return a.name.localeCompare(b.name);
};

/**
 * Constrói árvore hierárquica a partir de caminhos planos.
 *
 * @param paths - Caminhos relativos dos arquivos
 * @param sizes - Mapa de tamanhos em bytes
 * @returns Árvore ordenada de FileNode
 * @example
 * const tree = buildTree(['src/a.ts', 'b.ts'], new Map([['src/a.ts', 100], ['b.ts', 50]]));
 */
export const buildTree = (
  paths: readonly string[],
  sizes: ReadonlyMap<string, number>,
): readonly FileNode[] => {
  type BuildNode = { children: Map<string, BuildNode>; size: number };
  const root: BuildNode = { children: new Map(), size: 0 };

  for (const filePath of paths) {
    const parts = filePath.split('/');
    let current = root;
    for (const part of parts) {
      let child = current.children.get(part);
      if (!child) {
        child = { children: new Map(), size: 0 };
        current.children.set(part, child);
      }
      current = child;
    }
    current.size = sizes.get(filePath) ?? 0;
  }

  const convert = (
    node: BuildNode,
    prefix: string,
  ): readonly FileNode[] =>
    [...node.children.entries()]
      .map(([name, child]): FileNode => {
        const path = prefix ? `${prefix}/${name}` : name;
        const isDir = child.children.size > 0;
        return {
          name,
          path,
          type: isDir ? 'directory' : 'file',
          children: isDir ? convert(child, path) : [],
          sizeBytes: isDir ? 0 : child.size,
        };
      })
      .sort(sortNodes);

  return convert(root, '');
};

/**
 * Achata a árvore em lista sequencial baseada no estado de expansão.
 *
 * @param nodes - Nós raiz da árvore
 * @param expanded - Set de caminhos de diretórios expandidos
 * @param maxDepth - Profundidade máxima (padrão 4)
 * @param currentDepth - Profundidade atual na recursão
 * @returns Lista achatada para renderização
 * @example
 * const flat = flattenTree(tree, new Set(['src']));
 */
export const flattenTree = (
  nodes: readonly FileNode[],
  expanded: ReadonlySet<string>,
  maxDepth: number = MAX_DEPTH,
  currentDepth: number = 0,
): readonly FlatNode[] => {
  if (currentDepth >= maxDepth) return [];
  return nodes.flatMap((node): readonly FlatNode[] => {
    const isExp = node.type === 'directory' && expanded.has(node.path);
    const flat: FlatNode = { node, depth: currentDepth, isExpanded: isExp };
    if (isExp) {
      return [flat, ...flattenTree(node.children, expanded, maxDepth, currentDepth + 1)];
    }
    return [flat];
  });
};

/**
 * Coleta caminhos de todos os arquivos sob um nó recursivamente.
 *
 * @param node - Nó raiz
 * @returns Caminhos de todos os arquivos descendentes
 * @example
 * collectFilePaths(srcNode); // ['src/app.tsx', 'src/cli.tsx']
 */
export const collectFilePaths = (
  node: FileNode,
): readonly string[] => {
  if (node.type === 'file') return [node.path];
  return node.children.flatMap(collectFilePaths);
};

/**
 * Determina estado de seleção de um nó na árvore.
 *
 * @param node - Nó a verificar
 * @param selected - Set de caminhos selecionados
 * @returns 'none', 'partial' ou 'all'
 * @example
 * getSelectionState(dirNode, new Set(['src/app.tsx'])); // 'partial'
 */
export const getSelectionState = (
  node: FileNode,
  selected: ReadonlySet<string>,
): 'none' | 'partial' | 'all' => {
  if (node.type === 'file') {
    return selected.has(node.path) ? 'all' : 'none';
  }
  const files = collectFilePaths(node);
  if (files.length === 0) return 'none';
  const count = files.filter(f => selected.has(f)).length;
  if (count === 0) return 'none';
  return count === files.length ? 'all' : 'partial';
};
