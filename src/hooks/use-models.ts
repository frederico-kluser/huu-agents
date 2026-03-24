/**
 * Hook React para carregar modelos da OpenRouter de forma assíncrona.
 * Gerencia loading, erro e cache transparentemente.
 *
 * @module
 */

import { useState, useEffect, useCallback } from 'react';
import type { ModelEntry } from '../data/models.js';
import { loadModels, getModelsCached } from '../data/models.js';

/** Estado do carregamento de modelos */
export type ModelsState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly models: readonly ModelEntry[] }
  | { readonly status: 'error'; readonly error: string };

/**
 * Hook para carregar modelos da OpenRouter API.
 * Tenta cache primeiro, depois faz fetch se necessário.
 * Retorna estado reativo com loading/loaded/error.
 *
 * @param apiKey - API key para autenticação (opcional)
 * @returns Estado dos modelos e função de reload
 * @example
 * ```ts
 * const { state, reload } = useModels('sk-or-...');
 * if (state.status === 'loaded') {
 *   console.log(state.models.length);
 * }
 * ```
 */
export const useModels = (apiKey?: string) => {
  const cached = getModelsCached();
  const [state, setState] = useState<ModelsState>(
    cached.length > 0
      ? { status: 'loaded', models: cached }
      : { status: 'loading' },
  );

  const fetchModels = useCallback(async () => {
    setState({ status: 'loading' });
    const result = await loadModels(apiKey);
    if (result.ok) {
      setState({ status: 'loaded', models: result.models });
    } else {
      setState({ status: 'error', error: result.error });
    }
  }, [apiKey]);

  useEffect(() => {
    // Se já temos cache, não faz fetch
    if (cached.length > 0) return;
    void fetchModels();
  }, [fetchModels, cached.length]);

  return { state, reload: fetchModels } as const;
};
