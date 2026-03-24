/**
 * Hook React para carregar modelos da OpenRouter de forma assíncrona.
 * Gerencia loading, erro e cache transparentemente.
 *
 * Hierarquia de cache:
 * 1. Cache em memória (no openrouter-client)
 * 2. Cache global em disco (~/.pi-dag-cli/benchmark-cache.json)
 * 3. Bundled fallback (src/data/bundled-benchmarks.json)
 * 4. Fetch da API (ultima opcao)
 *
 * @module
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelEntry } from '../data/models.js';
import { loadModels, getModelsCached, toModelEntry } from '../data/models.js';
import { seedCache, invalidateCache } from '../data/openrouter-client.js';
import {
  loadGlobalCache,
  loadGlobalCacheIgnoreTTL,
  loadBundledFallback,
} from '../services/offline-benchmark-cache.js';

/** Caminho do bundled fallback relativo ao modulo compilado */
const BUNDLED_PATH = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..', 'data', 'bundled-benchmarks.json',
);

/** Estado do carregamento de modelos */
export type ModelsState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly models: readonly ModelEntry[]; readonly cacheAge: number | null }
  | { readonly status: 'error'; readonly error: string };

/**
 * Hook para carregar modelos da OpenRouter API.
 * Tenta cache em memoria → disco → bundled → API, nessa ordem.
 * Retorna estado reativo com loading/loaded/error.
 *
 * @param apiKey - API key para autenticação (opcional)
 * @returns Estado dos modelos, funcao de reload e forcao de refresh
 * @example
 * ```ts
 * const { state, reload, forceRefresh } = useModels('sk-or-...');
 * if (state.status === 'loaded') {
 *   console.log(state.models.length);
 * }
 * ```
 */
export const useModels = (apiKey?: string) => {
  const cached = getModelsCached();
  const [state, setState] = useState<ModelsState>(
    cached.length > 0
      ? { status: 'loaded', models: cached, cacheAge: null }
      : { status: 'loading' },
  );

  const seededRef = useRef(false);

  /** Tenta semear cache de memória a partir do disco/bundled */
  const seedFromDisk = useCallback(async (): Promise<boolean> => {
    // Tentar cache global em disco (com TTL)
    const diskCache = await loadGlobalCache();
    if (diskCache && diskCache.openRouterModels.length > 0) {
      seedCache(diskCache.openRouterModels, diskCache.timestamp);
      const models = diskCache.openRouterModels.map(toModelEntry);
      setState({ status: 'loaded', models, cacheAge: diskCache.timestamp });
      return true;
    }

    // Tentar bundled fallback
    const bundled = await loadBundledFallback(BUNDLED_PATH);
    if (bundled && bundled.openRouterModels.length > 0) {
      seedCache(bundled.openRouterModels, bundled.timestamp);
      const models = bundled.openRouterModels.map(toModelEntry);
      setState({ status: 'loaded', models, cacheAge: bundled.timestamp });
      return true;
    }

    return false;
  }, []);

  /** Busca modelos da API e salva no cache global */
  const fetchAndSave = useCallback(async () => {
    setState((prev) => {
      // Manter modelos existentes durante refresh
      if (prev.status === 'loaded') return prev;
      return { status: 'loading' };
    });

    const result = await loadModels(apiKey);
    if (result.ok) {
      setState({ status: 'loaded', models: result.models, cacheAge: Date.now() });
      // Salvar no cache global em background (nao bloquear UI)
      // Dados AA serao salvos pelo hook de AA separadamente
      return true;
    }

    // Se API falhou, tentar cache expirado como ultimo recurso
    const staleCache = await loadGlobalCacheIgnoreTTL();
    if (staleCache && staleCache.openRouterModels.length > 0) {
      seedCache(staleCache.openRouterModels, staleCache.timestamp);
      const models = staleCache.openRouterModels.map(toModelEntry);
      setState({ status: 'loaded', models, cacheAge: staleCache.timestamp });
      return false;
    }

    setState({ status: 'error', error: result.error });
    return false;
  }, [apiKey]);

  /** Reload: busca da API sem invalidar cache */
  const reload = useCallback(async () => {
    await fetchAndSave();
  }, [fetchAndSave]);

  /** Force refresh: invalida cache, busca da API, salva em disco */
  const forceRefresh = useCallback(async () => {
    invalidateCache();
    const result = await loadModels(apiKey);
    if (result.ok) {
      setState({ status: 'loaded', models: result.models, cacheAge: Date.now() });
    } else {
      setState({ status: 'error', error: result.error });
    }
    return result.ok;
  }, [apiKey]);

  useEffect(() => {
    // Se ja temos cache em memoria, nao buscar
    if (cached.length > 0) return;

    // Seed unico a partir do disco
    if (!seededRef.current) {
      seededRef.current = true;
      void seedFromDisk().then((seeded) => {
        if (!seeded) {
          void fetchAndSave();
        }
      });
    }
  }, [cached.length, seedFromDisk, fetchAndSave]);

  return { state, reload, forceRefresh } as const;
};
