/**
 * Hook React para carregar dados da Artificial Analysis API.
 * Gerencia loading, erro e cache transparentemente.
 *
 * Estratégia: API-first em cada run (quando há apiKey).
 * 1. Sempre tenta a API AA primeiro (invalidando cache em memória).
 * 2. Em sucesso: atualiza disco para sempre ter snapshot recente.
 * 3. Em falha: fallback para cache em disco (qualquer idade) → bundled.
 * 4. Sem apiKey: usa apenas cache em disco/bundled (não há API a chamar).
 *
 * @module
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AAModel } from '../data/artificial-analysis-client.js';
import {
  fetchAAModels,
  getCachedAAModels,
  seedAACache,
  invalidateAACache,
} from '../data/artificial-analysis-client.js';
import {
  loadGlobalCacheIgnoreTTL,
  loadBundledData,
  saveAAToCache,
} from '../services/offline-benchmark-cache.js';

/** Estado do carregamento de dados AA */
export type AAState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly models: readonly AAModel[]; readonly cacheAge: number | null }
  | { readonly status: 'error'; readonly error: string };

/**
 * Hook para carregar benchmarks da Artificial Analysis API.
 * Quando há apiKey: sempre tenta a API primeiro a cada run; só usa cache se a API falhar.
 * Quando não há apiKey: tenta cache em disco/bundled (idle se nada disponível).
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

  const initRef = useRef(false);

  /** Carrega fallback offline: disco (qualquer idade) → bundled. */
  const loadOfflineFallback = useCallback(async (): Promise<boolean> => {
    const diskCache = await loadGlobalCacheIgnoreTTL();
    if (diskCache && diskCache.aaModels.length > 0) {
      seedAACache(diskCache.aaModels, diskCache.timestamp);
      setState({ status: 'loaded', models: diskCache.aaModels, cacheAge: diskCache.timestamp });
      return true;
    }

    const bundled = loadBundledData();
    if (bundled && bundled.aaModels.length > 0) {
      seedAACache(bundled.aaModels, bundled.timestamp);
      setState({ status: 'loaded', models: bundled.aaModels, cacheAge: bundled.timestamp });
      return true;
    }

    return false;
  }, []);

  /** API-first: invalida memória, busca API, persiste em disco; em erro vai para fallback. */
  const fetchFromAPI = useCallback(async (): Promise<boolean> => {
    if (!apiKey) {
      const fellBack = await loadOfflineFallback();
      if (!fellBack) setState({ status: 'idle' });
      return false;
    }

    invalidateAACache();
    const result = await fetchAAModels(apiKey);

    if (result.ok) {
      setState({ status: 'loaded', models: result.models, cacheAge: Date.now() });
      void saveAAToCache(result.models);
      return true;
    }

    const fellBack = await loadOfflineFallback();
    if (!fellBack) {
      setState({ status: 'error', error: result.error });
    }
    return false;
  }, [apiKey, loadOfflineFallback]);

  /** Reload: novo fetch da API (mesmo fluxo do load inicial). */
  const reload = useCallback(async () => {
    setState((prev) => (prev.status === 'loaded' ? prev : { status: 'loading' }));
    await fetchFromAPI();
  }, [fetchFromAPI]);

  /** Force refresh: idêntico ao reload — sempre vai para a API. */
  const forceRefresh = useCallback(async () => {
    setState((prev) => (prev.status === 'loaded' ? prev : { status: 'loading' }));
    return await fetchFromAPI();
  }, [fetchFromAPI]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    void fetchFromAPI();
  }, [fetchFromAPI]);

  return { state, reload, forceRefresh } as const;
};
