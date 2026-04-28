/**
 * Hook React para carregar modelos da OpenRouter de forma assíncrona.
 * Gerencia loading, erro e cache transparentemente.
 *
 * Estratégia: API-first em cada run.
 * 1. Sempre tenta a API OpenRouter primeiro (invalidando cache em memória).
 * 2. Em sucesso: atualiza disco para sempre ter snapshot recente.
 * 3. Em falha: fallback para cache em disco (qualquer idade) → bundled → erro.
 *
 * @module
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ModelEntry } from '../data/models.js';
import { loadModels, getModelsCached, toModelEntry } from '../data/models.js';
import {
  seedCache,
  invalidateCache,
  getCachedModels as getCachedRawModels,
} from '../data/openrouter-client.js';
import {
  loadGlobalCacheIgnoreTTL,
  loadBundledData,
  saveOpenRouterToCache,
} from '../services/offline-benchmark-cache.js';

/** Estado do carregamento de modelos */
export type ModelsState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly models: readonly ModelEntry[]; readonly cacheAge: number | null }
  | { readonly status: 'error'; readonly error: string };

/**
 * Hook para carregar modelos da OpenRouter API.
 * Sempre tenta a API primeiro a cada run; só usa cache se a API falhar.
 * Retorna estado reativo com loading/loaded/error.
 *
 * @param apiKey - API key para autenticação (opcional)
 * @returns Estado dos modelos, funcao de reload e force refresh
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

  const initRef = useRef(false);

  /** Carrega fallback offline: disco (qualquer idade) → bundled. */
  const loadOfflineFallback = useCallback(async (): Promise<boolean> => {
    const diskCache = await loadGlobalCacheIgnoreTTL();
    if (diskCache && diskCache.openRouterModels.length > 0) {
      seedCache(diskCache.openRouterModels, diskCache.timestamp);
      const models = diskCache.openRouterModels.map(toModelEntry);
      setState({ status: 'loaded', models, cacheAge: diskCache.timestamp });
      return true;
    }

    const bundled = loadBundledData();
    if (bundled && bundled.openRouterModels.length > 0) {
      seedCache(bundled.openRouterModels, bundled.timestamp);
      const models = bundled.openRouterModels.map(toModelEntry);
      setState({ status: 'loaded', models, cacheAge: bundled.timestamp });
      return true;
    }

    return false;
  }, []);

  /** API-first: invalida memória, busca API, persiste em disco; em erro vai para fallback. */
  const fetchFromAPI = useCallback(async (): Promise<boolean> => {
    invalidateCache();
    const result = await loadModels(apiKey);

    if (result.ok) {
      setState({ status: 'loaded', models: result.models, cacheAge: Date.now() });
      // Atualiza cache em disco com snapshot fresco
      const raw = getCachedRawModels();
      if (raw && raw.length > 0) {
        void saveOpenRouterToCache(raw);
      }
      return true;
    }

    // API falhou — usa cache em disco (qualquer idade) ou bundled
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
