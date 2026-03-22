/**
 * Tipos de erro discriminados para configuração e validação de API.
 * Cada variante carrega contexto suficiente para a UI exibir mensagens acionáveis
 * sem expor stack traces ou detalhes internos ao usuário.
 *
 * @example
 * ```ts
 * const err: ConfigErrorKind = { kind: 'parse_error', path: '~/.pi-dag-cli.json' };
 * console.log(getConfigErrorMessage(err));
 * // → 'O arquivo ~/.pi-dag-cli.json contém JSON inválido. Corrija ou delete o arquivo.'
 * ```
 */

/** Erro ao carregar/salvar configuração */
export type ConfigErrorKind =
  | { readonly kind: 'file_not_found'; readonly path: string }
  | { readonly kind: 'parse_error'; readonly path: string }
  | { readonly kind: 'schema_error'; readonly path: string; readonly detail: string }
  | { readonly kind: 'permission_error'; readonly path: string }
  | { readonly kind: 'io_error'; readonly path: string; readonly detail: string }
  | { readonly kind: 'write_error'; readonly path: string; readonly detail: string };

/** Erro ao validar API key */
export type ApiErrorKind =
  | { readonly kind: 'empty_key' }
  | { readonly kind: 'invalid_key' }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'network_error'; readonly detail: string }
  | { readonly kind: 'server_error'; readonly statusCode: number };

/**
 * Retorna mensagem acionável para erro de configuração.
 *
 * @param error - Variante do erro de config
 * @returns Mensagem legível para exibir na UI
 *
 * @example
 * ```ts
 * getConfigErrorMessage({ kind: 'permission_error', path: '/etc/config.json' });
 * // → 'Sem permissão para acessar /etc/config.json. Verifique as permissões do arquivo.'
 * ```
 */
export const getConfigErrorMessage = (error: ConfigErrorKind): string => {
  switch (error.kind) {
    case 'file_not_found':
      return `Arquivo de configuração não encontrado em ${error.path}. Uma nova configuração será criada.`;
    case 'parse_error':
      return `O arquivo ${error.path} contém JSON inválido. Corrija ou delete o arquivo.`;
    case 'schema_error':
      return `Configuração inválida em ${error.path}: ${error.detail}`;
    case 'permission_error':
      return `Sem permissão para acessar ${error.path}. Verifique as permissões do arquivo.`;
    case 'io_error':
      return `Erro ao ler ${error.path}: ${error.detail}`;
    case 'write_error':
      return `Erro ao salvar ${error.path}: ${error.detail}`;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
};

/**
 * Retorna mensagem acionável para erro de validação de API.
 *
 * @param error - Variante do erro de API
 * @returns Mensagem legível para exibir na UI
 *
 * @example
 * ```ts
 * getApiErrorMessage({ kind: 'rate_limited' });
 * // → 'Rate limit atingido. Aguarde alguns segundos e tente novamente.'
 * ```
 */
export const getApiErrorMessage = (error: ApiErrorKind): string => {
  switch (error.kind) {
    case 'empty_key':
      return 'API key vazia. Cole sua chave OpenRouter e pressione Enter.';
    case 'invalid_key':
      return 'API key inválida. Verifique se a chave está correta em openrouter.ai/keys.';
    case 'rate_limited':
      return 'Rate limit atingido. Aguarde alguns segundos e tente novamente.';
    case 'timeout':
      return 'Timeout na conexão com OpenRouter. Verifique sua internet e tente novamente.';
    case 'network_error':
      return `Falha na conexão com OpenRouter: ${error.detail}`;
    case 'server_error':
      return `OpenRouter retornou erro ${error.statusCode}. O serviço pode estar indisponível — tente novamente em breve.`;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
};
