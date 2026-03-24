/**
 * Hook React para carregar dados da Artificial Analysis API.
 * Gerencia loading, erro e cache transparentemente.
 *
 * @module
 */

import { useState, useEffect, useCallback } from 'react';
import type { AAModel } from '../data/artificial-analysis-client.js';
import { fetchAAModels, getCachedAAModels } from '../data/artificial-analysis-client.js';

/** Estado do carregamento de dados AA */
export type AAState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly models: readonly AAModel[] }
  | { readonly status: 'error'; readonly error: string };

/**
 * Hook para carregar benchmarks da Artificial Analysis API.
 * Retorna 'idle' se nenhuma apiKey for fornecida.
 * Tenta cache primeiro, depois faz fetch se necessario.
 *
 * @param apiKey - API key da Artificial Analysis (opcional)
 * @returns Estado dos dados AA e funcao de reload
 * @example
 * ```ts
 * const { state, reload } = useArtificialAnalysis('aa-key-...');
 * if (state.status === 'loaded') console.log(state.models.length);
 * ```
 */
export const useArtificialAnalysis = (apiKey?: string) => {
  const cached = apiKey ? getCachedAAModels() : null;
  const [state, setState] = useState<AAState>(
    !apiKey
      ? { status: 'idle' }
      : cached
        ? { status: 'loaded', models: cached }
        : { status: 'loading' },
  );

  const fetchData = useCallback(async () => {
    if (!apiKey) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    const result = await fetchAAModels(apiKey);
    if (result.ok) {
      setState({ status: 'loaded', models: result.models });
    } else {
      setState({ status: 'error', error: result.error });
    }
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) {
      setState({ status: 'idle' });
      return;
    }
    if (cached) return;
    void fetchData();
  }, [apiKey, fetchData, cached]);

  return { state, reload: fetchData } as const;
};
