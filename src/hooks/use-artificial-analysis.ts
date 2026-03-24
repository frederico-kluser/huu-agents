/**
 * Hook React para carregar dados da Artificial Analysis API.
 * Gerencia loading, erro e cache transparentemente.
 *
 * Hierarquia de cache:
 * 1. Cache em memória (no artificial-analysis-client)
 * 2. Cache global em disco (~/.pi-dag-cli/benchmark-cache.json)
 * 3. Bundled fallback (src/data/bundled-benchmarks.json)
 * 4. Fetch da API (ultima opcao)
 *
 * @module
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AAModel } from '../data/artificial-analysis-client.js';
import {
  fetchAAModels,
  getCachedAAModels,
  seedAACache,
  invalidateAACache,
} from '../data/artificial-analysis-client.js';
import {
  loadGlobalCache,
  loadGlobalCacheIgnoreTTL,
  loadBundledFallback,
} from '../services/offline-benchmark-cache.js';

/** Caminho do bundled fallback no source (commitado no repo) */
const BUNDLED_PATH = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..', '..', 'src', 'data', 'bundled-benchmarks.json',
);

/** Estado do carregamento de dados AA */
export type AAState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly models: readonly AAModel[]; readonly cacheAge: number | null }
  | { readonly status: 'error'; readonly error: string };

/**
 * Hook para carregar benchmarks da Artificial Analysis API.
 * Retorna 'idle' se nenhuma apiKey for fornecida E nao ha cache offline.
 * Tenta cache em memoria → disco → bundled → API, nessa ordem.
 *
 * @param apiKey - API key da Artificial Analysis (opcional)
 * @returns Estado dos dados AA, funcao de reload e force refresh
 * @example
 * ```ts
 * const { state, reload, forceRefresh } = useArtificialAnalysis('aa-key-...');
 * if (state.status === 'loaded') console.log(state.models.length);
 * ```
 */
export const useArtificialAnalysis = (apiKey?: string) => {
  const cached = apiKey ? getCachedAAModels() : null;
  const [state, setState] = useState<AAState>(
    !apiKey
      ? { status: 'idle' }
      : cached
        ? { status: 'loaded', models: cached, cacheAge: null }
        : { status: 'loading' },
  );

  const seededRef = useRef(false);

  /** Tenta semear cache de memória a partir do disco/bundled (funciona sem API key) */
  const seedFromDisk = useCallback(async (): Promise<boolean> => {
    const diskCache = await loadGlobalCache();
    if (diskCache && diskCache.aaModels.length > 0) {
      seedAACache(diskCache.aaModels, diskCache.timestamp);
      setState({ status: 'loaded', models: diskCache.aaModels, cacheAge: diskCache.timestamp });
      return true;
    }

    const bundled = await loadBundledFallback(BUNDLED_PATH);
    if (bundled && bundled.aaModels.length > 0) {
      seedAACache(bundled.aaModels, bundled.timestamp);
      setState({ status: 'loaded', models: bundled.aaModels, cacheAge: bundled.timestamp });
      return true;
    }

    return false;
  }, []);

  /** Busca dados da API AA */
  const fetchData = useCallback(async () => {
    if (!apiKey) {
      setState({ status: 'idle' });
      return;
    }

    setState((prev) => {
      if (prev.status === 'loaded') return prev;
      return { status: 'loading' };
    });

    const result = await fetchAAModels(apiKey);
    if (result.ok) {
      setState({ status: 'loaded', models: result.models, cacheAge: Date.now() });
      return;
    }

    // Se API falhou, tentar cache expirado
    const staleCache = await loadGlobalCacheIgnoreTTL();
    if (staleCache && staleCache.aaModels.length > 0) {
      seedAACache(staleCache.aaModels, staleCache.timestamp);
      setState({ status: 'loaded', models: staleCache.aaModels, cacheAge: staleCache.timestamp });
      return;
    }

    setState({ status: 'error', error: result.error });
  }, [apiKey]);

  /** Force refresh: invalida cache, busca da API */
  const forceRefresh = useCallback(async () => {
    if (!apiKey) return false;
    invalidateAACache();
    const result = await fetchAAModels(apiKey);
    if (result.ok) {
      setState({ status: 'loaded', models: result.models, cacheAge: Date.now() });
      return true;
    }
    setState({ status: 'error', error: result.error });
    return false;
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) {
      // Sem API key — tentar carregar do cache offline mesmo assim
      if (!seededRef.current) {
        seededRef.current = true;
        void seedFromDisk().then((seeded) => {
          if (!seeded) setState({ status: 'idle' });
        });
      }
      return;
    }

    if (cached) return;

    if (!seededRef.current) {
      seededRef.current = true;
      void seedFromDisk().then((seeded) => {
        if (!seeded) void fetchData();
      });
    }
  }, [apiKey, cached, seedFromDisk, fetchData]);

  return { state, reload: fetchData, forceRefresh } as const;
};
