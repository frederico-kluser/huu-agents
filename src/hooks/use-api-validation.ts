import { useState, useCallback } from 'react';

type ValidationState =
  | { readonly status: 'idle' }
  | { readonly status: 'validating' }
  | { readonly status: 'valid' }
  | { readonly status: 'invalid'; readonly error: string };

/** Endpoint de validacao de API key do OpenRouter */
const AUTH_URL = 'https://openrouter.ai/api/v1/auth/key';

/**
 * Hook para validar API key do OpenRouter via HEAD request.
 * Faz HEAD em /api/v1/auth/key; se receber 405, faz GET como fallback.
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
      setValidation({ status: 'invalid', error: 'API key vazia' });
      return false;
    }

    setValidation({ status: 'validating' });

    try {
      let response = await fetch(AUTH_URL, {
        method: 'HEAD',
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      // Fallback para GET se HEAD nao for suportado
      if (response.status === 405) {
        response = await fetch(AUTH_URL, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      }

      if (response.ok) {
        setValidation({ status: 'valid' });
        return true;
      }

      setValidation({ status: 'invalid', error: 'API key invalida' });
      return false;
    } catch {
      setValidation({ status: 'invalid', error: 'Falha na conexao com OpenRouter' });
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    setValidation({ status: 'idle' });
  }, []);

  return { validation, validate, reset } as const;
};

export type { ValidationState };
