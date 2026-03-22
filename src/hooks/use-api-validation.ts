import { useState, useCallback } from 'react';
import type { ApiErrorKind } from '../schemas/errors.js';

type ValidationState =
  | { readonly status: 'idle' }
  | { readonly status: 'validating' }
  | { readonly status: 'valid' }
  | { readonly status: 'invalid'; readonly error: ApiErrorKind };

/** Endpoint de validacao de API key do OpenRouter */
const AUTH_URL = 'https://openrouter.ai/api/v1/auth/key';

/** Timeout para requisição de validação (10s) */
const VALIDATION_TIMEOUT_MS = 10_000;

/**
 * Classifica um erro de fetch em ApiErrorKind.
 *
 * @param err - Erro capturado no catch do fetch
 * @returns Variante tipada do erro com contexto para a UI
 */
const classifyFetchError = (err: unknown): ApiErrorKind => {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { kind: 'timeout' };
  }
  if (err instanceof TypeError) {
    // TypeError é lançado pelo fetch quando não consegue conectar
    return { kind: 'network_error', detail: 'Verifique sua conexão com a internet.' };
  }
  return { kind: 'network_error', detail: err instanceof Error ? err.message : 'Erro de conexão desconhecido' };
};

/**
 * Classifica um HTTP status code não-ok em ApiErrorKind.
 *
 * @param status - HTTP status code da resposta
 * @returns Variante tipada do erro
 */
const classifyHttpError = (status: number): ApiErrorKind => {
  if (status === 401 || status === 403) return { kind: 'invalid_key' };
  if (status === 429) return { kind: 'rate_limited' };
  if (status >= 500) return { kind: 'server_error', statusCode: status };
  // Qualquer outro 4xx — tratar como key inválida (mais provável)
  return { kind: 'invalid_key' };
};

/**
 * Hook para validar API key do OpenRouter via HEAD request.
 * Faz HEAD em /api/v1/auth/key; se receber 405, faz GET como fallback.
 *
 * Erros são classificados em variantes tipadas (ApiErrorKind) para que
 * a UI exiba mensagens acionáveis: key inválida, rate limit, timeout,
 * erro de rede ou indisponibilidade do servidor.
 *
 * @returns Estado de validacao, funcao validate e reset
 * @example
 * const { validation, validate } = useApiValidation();
 * const ok = await validate('sk-or-...');
 * if (ok) console.log('Key valida');
 */
export const useApiValidation = () => {
  const [validation, setValidation] = useState<ValidationState>({ status: 'idle' });

  const validate = useCallback(async (apiKey: string): Promise<boolean> => {
    if (!apiKey.trim()) {
      setValidation({ status: 'invalid', error: { kind: 'empty_key' } });
      return false;
    }

    setValidation({ status: 'validating' });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

      try {
        let response = await fetch(AUTH_URL, {
          method: 'HEAD',
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });

        // Fallback para GET se HEAD nao for suportado
        if (response.status === 405) {
          response = await fetch(AUTH_URL, {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
          });
        }

        if (response.ok) {
          setValidation({ status: 'valid' });
          return true;
        }

        setValidation({ status: 'invalid', error: classifyHttpError(response.status) });
        return false;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      setValidation({ status: 'invalid', error: classifyFetchError(err) });
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    setValidation({ status: 'idle' });
  }, []);

  return { validation, validate, reset } as const;
};

export type { ValidationState };
