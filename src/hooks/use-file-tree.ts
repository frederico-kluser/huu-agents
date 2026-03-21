import { useState, useEffect, useMemo, useCallback } from 'react';
import type { FileNode, FlatNode } from '../utils/file-tree.js';
import {
  listGitFiles,
  getFileSizes,
  buildTree,
  flattenTree,
  collectFilePaths,
  estimateTokens,
} from '../utils/file-tree.js';

/** Resultado do hook useFileTree */
export interface UseFileTreeResult {
  readonly loading: boolean;
  readonly error: string | null;
  readonly flatNodes: readonly FlatNode[];
  readonly cursor: number;
  readonly selected: ReadonlySet<string>;
  readonly selectedCount: number;
  readonly totalTokens: number;
  readonly moveUp: () => void;
  readonly moveDown: () => void;
  readonly toggleExpand: () => void;
  readonly toggleSelect: () => void;
}

/** Alterna presença de um path no Set, retornando cópia imutável */
const toggleInSet = (
  set: ReadonlySet<string>,
  path: string,
): ReadonlySet<string> => {
  const next = new Set(set);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  return next;
};

/** Adiciona ou remove batch de paths no Set baseado no estado atual */
const togglePaths = (
  set: ReadonlySet<string>,
  paths: readonly string[],
): ReadonlySet<string> => {
  const next = new Set(set);
  const allSelected = paths.every(p => set.has(p));
  for (const p of paths) {
    if (allSelected) {
      next.delete(p);
    } else {
      next.add(p);
    }
  }
  return next;
};

/** Constrói mapa de caminho para tamanho em bytes */
const buildFileSizeMap = (
  nodes: readonly FileNode[],
): ReadonlyMap<string, number> => {
  const sizes = new Map<string, number>();
  const walk = (ns: readonly FileNode[]): void => {
    for (const n of ns) {
      if (n.type === 'file') sizes.set(n.path, n.sizeBytes);
      if (n.children.length > 0) walk(n.children);
    }
  };
  walk(nodes);
  return sizes;
};

/** Soma tokens estimados para paths selecionados */
const sumSelectedTokens = (
  selected: ReadonlySet<string>,
  fileSizes: ReadonlyMap<string, number>,
): number => {
  let tokens = 0;
  for (const path of selected) {
    tokens += estimateTokens(fileSizes.get(path) ?? 0);
  }
  return tokens;
};

/** Hook interno: carrega árvore do repositório via git ls-files */
const useTreeLoader = (cwd: string) => {
  const [tree, setTree] = useState<readonly FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const paths = await listGitFiles(cwd);
        const sizes = await getFileSizes(cwd, paths);
        if (!cancelled) { setTree(buildTree(paths, sizes)); setLoading(false); }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar arquivos');
          setLoading(false);
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [cwd]);

  return { tree, loading, error } as const;
};

/**
 * Hook que carrega árvore de arquivos do repositório e gerencia navegação.
 * Respeita .gitignore via git ls-files, limita profundidade a 4 níveis.
 *
 * @param cwd - Diretório raiz (padrão: process.cwd())
 * @returns Estado e ações da árvore de arquivos
 * @example
 * const { flatNodes, cursor, toggleSelect } = useFileTree();
 */
export const useFileTree = (cwd?: string): UseFileTreeResult => {
  const { tree, loading, error } = useTreeLoader(cwd ?? process.cwd());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [cursor, setCursor] = useState(0);

  const flatNodes = useMemo(() => flattenTree(tree, expanded), [tree, expanded]);

  useEffect(() => {
    if (flatNodes.length > 0 && cursor >= flatNodes.length) {
      setCursor(flatNodes.length - 1);
    }
  }, [flatNodes.length, cursor]);

  const fileSizes = useMemo(() => buildFileSizeMap(tree), [tree]);
  const totalTokens = useMemo(() => sumSelectedTokens(selected, fileSizes), [selected, fileSizes]);
  const moveUp = useCallback(() => setCursor(c => Math.max(0, c - 1)), []);
  const moveDown = useCallback(
    () => setCursor(c => Math.min(flatNodes.length - 1, c + 1)),
    [flatNodes.length],
  );

  const toggleExpand = useCallback(() => {
    const flatNode = flatNodes[cursor];
    if (!flatNode || flatNode.node.type !== 'directory') return;
    setExpanded(prev => toggleInSet(prev, flatNode.node.path));
  }, [flatNodes, cursor]);

  const toggleSelect = useCallback(() => {
    const flatNode = flatNodes[cursor];
    if (!flatNode) return;
    const paths = flatNode.node.type === 'file'
      ? [flatNode.node.path]
      : collectFilePaths(flatNode.node);
    setSelected(prev => togglePaths(prev, paths));
  }, [flatNodes, cursor]);

  return {
    loading, error, flatNodes, cursor, selected,
    selectedCount: selected.size, totalTokens,
    moveUp, moveDown, toggleExpand, toggleSelect,
  };
};
