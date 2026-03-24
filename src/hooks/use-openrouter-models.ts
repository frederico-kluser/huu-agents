/**
 * Hook React para buscar modelos OpenRouter em tempo real.
 * Gerencia estados de loading, erro e cache em memória por sessão.
 *
 * @module
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchOpenRouterModels, type OpenRouterModel } from '../services/openrouter-models.js';

/** Estados possíveis do hook */
type ModelsState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly models: readonly OpenRouterModel[] }
  | { readonly status: 'error'; readonly message: string };

/** Cache em memória — evita refetch dentro da mesma sessão */
let sessionCache: readonly OpenRouterModel[] | null = null;

/**
 * Hook para buscar e cachear modelos da OpenRouter dentro da sessão.
 * O fetch acontece uma vez e fica em cache de memória.
 * Chamadas subsequentes retornam o cache imediatamente.
 *
 * @param apiKey - Chave da API OpenRouter (opcional)
 * @returns Estado dos modelos e função para forçar refresh
 *
 * @example
 * ```tsx
 * const { state, refresh } = useOpenRouterModels('sk-or-...');
 * if (state.status === 'loaded') {
 *   return <ModelTable models={state.models} onSelect={handleSelect} />;
 * }
 * ```
 */
export const useOpenRouterModels = (apiKey?: string) => {
  const [state, setState] = useState<ModelsState>(
    sessionCache ? { status: 'loaded', models: sessionCache } : { status: 'idle' },
  );
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (sessionCache) {
      setState({ status: 'loaded', models: sessionCache });
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    setState({ status: 'loading' });

    void fetchOpenRouterModels(apiKey).then((result) => {
      if (result.ok) {
        sessionCache = result.models;
        setState({ status: 'loaded', models: result.models });
      } else {
        setState({ status: 'error', message: result.error });
      }
    });
  }, [apiKey]);

  const refresh = useCallback(() => {
    sessionCache = null;
    fetchedRef.current = false;
    setState({ status: 'loading' });

    void fetchOpenRouterModels(apiKey).then((result) => {
      if (result.ok) {
        sessionCache = result.models;
        setState({ status: 'loaded', models: result.models });
      } else {
        setState({ status: 'error', message: result.error });
      }
    });
  }, [apiKey]);

  return { state, refresh } as const;
};

/**
 * Busca um modelo pelo ID no cache de sessão.
 * Retorna undefined se o cache não estiver carregado ou modelo não encontrado.
 *
 * @param id - ID do modelo (formato "provider/model-name")
 * @returns Modelo encontrado ou undefined
 */
export const findCachedModel = (id: string): OpenRouterModel | undefined =>
  sessionCache?.find((m) => m.id === id);

/**
 * Retorna todos os modelos no cache de sessão.
 * Retorna array vazio se o cache não estiver carregado.
 */
export const getCachedModels = (): readonly OpenRouterModel[] =>
  sessionCache ?? [];

export type { ModelsState };
