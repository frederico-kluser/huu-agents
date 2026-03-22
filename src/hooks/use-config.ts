import { useState, useEffect, useCallback } from 'react';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfigSchema, type Config } from '../schemas/config.schema.js';
import type { ConfigErrorKind } from '../schemas/errors.js';

/** Caminho do arquivo de configuracao persistido */
const CONFIG_PATH = join(homedir(), '.pi-dag-cli.json');

/** Type guard para ZodError — funciona mesmo sem @types/zod instalado */
const isZodError = (err: unknown): err is Error & { issues: ReadonlyArray<{ message: string }> } =>
  err instanceof Error && 'issues' in err && Array.isArray((err as Record<string, unknown>).issues);

type ConfigState =
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | { readonly status: 'loaded'; readonly config: Config }
  | { readonly status: 'error'; readonly error: ConfigErrorKind };

/**
 * Classifica um erro de leitura/parse de config em ConfigErrorKind.
 *
 * @param err - Erro capturado no catch
 * @returns Variante tipada do erro com contexto para a UI
 */
const classifyLoadError = (err: unknown): ConfigErrorKind => {
  // Erro de filesystem com code (ENOENT, EACCES, EPERM, etc.)
  if (err instanceof Error && 'code' in err) {
    const code = (err as Error & { code?: string }).code;
    if (code === 'ENOENT') return { kind: 'file_not_found', path: CONFIG_PATH };
    if (code === 'EACCES' || code === 'EPERM') return { kind: 'permission_error', path: CONFIG_PATH };
    return { kind: 'io_error', path: CONFIG_PATH, detail: err.message };
  }

  // JSON.parse falhou
  if (err instanceof SyntaxError) return { kind: 'parse_error', path: CONFIG_PATH };

  // Zod validation falhou
  if (isZodError(err)) {
    const detail = err.issues.map((i) => i.message).join('; ');
    return { kind: 'schema_error', path: CONFIG_PATH, detail };
  }

  return { kind: 'io_error', path: CONFIG_PATH, detail: err instanceof Error ? err.message : 'Erro desconhecido' };
};

/**
 * Classifica um erro de escrita de config em ConfigErrorKind.
 *
 * @param err - Erro capturado no catch ao salvar
 * @returns Variante tipada do erro com contexto para a UI
 */
const classifyWriteError = (err: unknown): ConfigErrorKind => {
  if (isZodError(err)) {
    const detail = err.issues.map((i) => i.message).join('; ');
    return { kind: 'schema_error', path: CONFIG_PATH, detail };
  }

  if (err instanceof Error && 'code' in err) {
    const code = (err as Error & { code?: string }).code;
    if (code === 'EACCES' || code === 'EPERM') return { kind: 'permission_error', path: CONFIG_PATH };
    return { kind: 'write_error', path: CONFIG_PATH, detail: err.message };
  }

  return { kind: 'write_error', path: CONFIG_PATH, detail: err instanceof Error ? err.message : 'Erro desconhecido' };
};

/**
 * Hook para carregar e persistir configuracao do Pi DAG CLI em ~/.pi-dag-cli.json.
 * Valida o conteudo com Zod (ConfigSchema) antes de aceitar como valido.
 * Suporta migração automática de formato legado (plannerModel/workerModel)
 * para formato novo (selectedAgents), mantendo ambos sincronizados.
 *
 * Erros são classificados em variantes tipadas (ConfigErrorKind) para que
 * a UI exiba mensagens acionáveis sem expor detalhes internos.
 *
 * @returns Estado da config e funcao para salvar
 * @throws {z.ZodError} Se config nao passar na validacao Zod ao salvar
 * @example
 * const { state, saveConfig } = useConfig();
 * if (state.status === 'loaded') console.log(state.config.selectedAgents.planner);
 */
export const useConfig = () => {
  const [state, setState] = useState<ConfigState>({ status: 'loading' });

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await readFile(CONFIG_PATH, 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        // Transform do schema cuida da migração legado → selectedAgents
        const config = ConfigSchema.parse(parsed);
        setState({ status: 'loaded', config });
      } catch (err) {
        const classified = classifyLoadError(err);
        // file_not_found é esperado na primeira execução — tratar como 'missing'
        if (classified.kind === 'file_not_found') {
          setState({ status: 'missing' });
        } else {
          setState({ status: 'error', error: classified });
        }
      }
    };
    void load();
  }, []);

  const saveConfig = useCallback(async (config: Config): Promise<ConfigErrorKind | null> => {
    try {
      // Re-validar garante sincronização entre selectedAgents e campos legados
      const validated = ConfigSchema.parse(config);
      await writeFile(CONFIG_PATH, JSON.stringify(validated, null, 2), 'utf-8');
      setState({ status: 'loaded', config: validated });
      return null;
    } catch (err) {
      const classified = classifyWriteError(err);
      setState({ status: 'error', error: classified });
      return classified;
    }
  }, []);

  return { state, saveConfig } as const;
};

export type { ConfigState };
