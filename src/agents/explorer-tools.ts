/** Tools do Explorer ReAct agent — funções puras de leitura do codebase. */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { assertWithinRoot } from '../utils/path-guard.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next']);
const TEXT_EXTS = /\.(ts|tsx|js|jsx|json|md)$/;

/** Lista arquivos e diretórios em um caminho, com profundidade opcional. */
export const listDirectory = tool(
  async ({ path, depth = 1 }: { path: string; depth?: number }): Promise<string> => {
    try {
      const safePath = assertWithinRoot(path);
      const entries: string[] = [];

      const walk = async (dir: string, currentDepth: number): Promise<void> => {
        if (currentDepth > depth) return;
        const items = await readdir(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = join(dir, item.name);
          const rel = relative(safePath, fullPath);
          const suffix = item.isDirectory() ? '/' : '';
          entries.push(`${rel}${suffix}`);
          if (item.isDirectory() && currentDepth < depth && !SKIP_DIRS.has(item.name)) {
            await walk(fullPath, currentDepth + 1);
          }
        }
      };

      await walk(safePath, 1);
      if (entries.length === 0) return 'Diretório vazio ou não encontrado.';
      return entries.slice(0, 200).join('\n');
    } catch (error) {
      return `Erro: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: 'list_directory',
    description: 'Lista arquivos e diretórios em um caminho. Retorna paths relativos.',
    schema: z.object({
      path: z.string().describe('Caminho absoluto do diretório a listar'),
      depth: z.number().int().min(1).max(3).default(1)
        .describe('Profundidade de recursão (1-3, default 1)'),
    }),
  },
);

/** Lê as primeiras N linhas de um arquivo. */
export const readFileHead = tool(
  async ({ path, lines = 50 }: { path: string; lines?: number }): Promise<string> => {
    try {
      const safePath = assertWithinRoot(path);
      const fileStat = await stat(safePath);
      if (fileStat.isDirectory()) return 'Erro: caminho é um diretório, não um arquivo.';
      if (fileStat.size > 512_000) return 'Erro: arquivo muito grande (>500KB). Use search_content.';

      const allLines = (await readFile(safePath, 'utf-8')).split('\n');
      const head = allLines.slice(0, lines).join('\n');
      return allLines.length > lines
        ? `${head}\n... (${allLines.length - lines} linhas omitidas)` : head;
    } catch (error) {
      return `Erro: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: 'read_file_head',
    description: 'Lê as primeiras N linhas de um arquivo. Útil para entender propósito e exports.',
    schema: z.object({
      path: z.string().describe('Caminho absoluto do arquivo'),
      lines: z.number().int().min(1).max(100).default(50)
        .describe('Número de linhas a ler (1-100, default 50)'),
    }),
  },
);

/** Conta arquivos que casam com um glob pattern em um diretório (recursivo). */
export const countFiles = tool(
  async ({ path: dirPath, pattern }: { path: string; pattern: string }): Promise<string> => {
    try {
      const safePath = assertWithinRoot(dirPath);
      let count = 0;
      const regexStr = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexStr}$`);

      const walk = async (dir: string): Promise<void> => {
        const items = await readdir(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = join(dir, item.name);
          if (item.isDirectory() && !SKIP_DIRS.has(item.name)) {
            await walk(fullPath);
          } else if (item.isFile() && regex.test(item.name)) {
            count++;
          }
        }
      };

      await walk(safePath);
      return `${count} arquivo(s) casando com "${pattern}" em ${dirPath}`;
    } catch (error) {
      return `Erro: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: 'count_files',
    description: 'Conta arquivos recursivamente que casam com um padrão (ex: "*.ts", "*.test.ts").',
    schema: z.object({
      path: z.string().describe('Caminho absoluto do diretório'),
      pattern: z.string().describe('Glob pattern simples (ex: "*.ts", "*.test.ts")'),
    }),
  },
);

/** Busca texto em arquivos dentro de um diretório (recursivo). */
export const searchContent = tool(
  async ({ path: dirPath, query }: { path: string; query: string }): Promise<string> => {
    try {
      const safePath = assertWithinRoot(dirPath);
      const matches: { file: string; line: number; content: string }[] = [];
      const MAX_MATCHES = 30;

      const walk = async (dir: string): Promise<void> => {
        if (matches.length >= MAX_MATCHES) return;
        const items = await readdir(dir, { withFileTypes: true });
        for (const item of items) {
          if (matches.length >= MAX_MATCHES) return;
          const fullPath = join(dir, item.name);
          if (item.isDirectory() && !SKIP_DIRS.has(item.name)) {
            await walk(fullPath);
          } else if (item.isFile() && TEXT_EXTS.test(item.name)) {
            const fileStat = await stat(fullPath);
            if (fileStat.size > 256_000) continue;
            const content = await readFile(fullPath, 'utf-8');
            for (const [i, line] of content.split('\n').entries()) {
              if (line.includes(query)) {
                matches.push({
                  file: relative(safePath, fullPath),
                  line: i + 1,
                  content: line.trim().slice(0, 120),
                });
                if (matches.length >= MAX_MATCHES) return;
              }
            }
          }
        }
      };

      await walk(safePath);
      if (matches.length === 0) return `Nenhum resultado para "${query}" em ${dirPath}`;
      return matches.map((m) => `${m.file}:${m.line} — ${m.content}`).join('\n');
    } catch (error) {
      return `Erro: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: 'search_content',
    description: 'Busca texto em arquivos (.ts, .tsx, .js, .json, .md). Retorna arquivo, linha e trecho.',
    schema: z.object({
      path: z.string().describe('Caminho absoluto do diretório para buscar'),
      query: z.string().describe('Texto a buscar nos arquivos'),
    }),
  },
);

/** Todas as tools do Explorer em array para bindTools() */
export const explorerTools = [listDirectory, readFileHead, countFiles, searchContent];

/** Schemas de validação por tool — previnem casts inseguros no dispatch */
const schemas = {
  list_directory: z.object({ path: z.string(), depth: z.number().optional() }),
  read_file_head: z.object({ path: z.string(), lines: z.number().optional() }),
  count_files: z.object({ path: z.string(), pattern: z.string() }),
  search_content: z.object({ path: z.string(), query: z.string() }),
};

/** Executa uma tool pelo nome com validação Zod dos args. */
export async function invokeExplorerTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const schema = schemas[name as keyof typeof schemas];
  if (!schema) throw new Error(`Tool "${name}" não encontrada`);
  const v = schema.parse(args);

  const toolFn = { list_directory: listDirectory, read_file_head: readFileHead,
    count_files: countFiles, search_content: searchContent }[name];
  if (!toolFn) throw new Error(`Tool "${name}" não encontrada`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dispatch dinâmico entre tools com schemas distintos
  const result = await (toolFn as any).invoke(v);
  return typeof result === 'string' ? result : JSON.stringify(result);
}

/** Nomes válidos de tools para validação */
export const EXPLORER_TOOL_NAMES: ReadonlySet<string> = new Set(
  explorerTools.map((t) => t.name),
);
