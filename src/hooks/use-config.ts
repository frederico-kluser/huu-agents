import { useState, useEffect, useCallback } from 'react';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfigSchema, type Config } from '../schemas/config.schema.js';

/** Caminho do arquivo de configuracao persistido */
const CONFIG_PATH = join(homedir(), '.pi-dag-cli.json');

type ConfigState =
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | { readonly status: 'loaded'; readonly config: Config }
  | { readonly status: 'error'; readonly error: string };

/**
 * Hook para carregar e persistir configuracao do Pi DAG CLI em ~/.pi-dag-cli.json.
 * Valida o conteudo com Zod (ConfigSchema) antes de aceitar como valido.
 * Suporta migração automática de formato legado (plannerModel/workerModel)
 * para formato novo (selectedAgents), mantendo ambos sincronizados.
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
      } catch {
        setState({ status: 'missing' });
      }
    };
    void load();
  }, []);

  const saveConfig = useCallback(async (config: Config): Promise<void> => {
    try {
      // Re-validar garante sincronização entre selectedAgents e campos legados
      const validated = ConfigSchema.parse(config);
      await writeFile(CONFIG_PATH, JSON.stringify(validated, null, 2), 'utf-8');
      setState({ status: 'loaded', config: validated });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar configuracao';
      setState({ status: 'error', error: message });
    }
  }, []);

  return { state, saveConfig } as const;
};

export type { ConfigState };
