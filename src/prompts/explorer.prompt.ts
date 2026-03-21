/**
 * System prompt do Explorer ReAct agent.
 *
 * Segue as constraints de file-agent-patterns.md:
 * - Max 150 LOC
 * - Max 300 palavras de instrução
 * - Catálogo de ações tipado com fallback explícito
 * - Sem CoT genérico — passos concretos
 */

/** Nomes das tools disponíveis para o Explorer (para referência de tipo) */
export const EXPLORER_TOOL_LIST = [
  'list_directory',
  'read_file_head',
  'count_files',
  'search_content',
] as const;

export type ExplorerToolName = (typeof EXPLORER_TOOL_LIST)[number];

/**
 * Gera o system prompt do Explorer com a query do Planner injetada.
 *
 * @param query - Pergunta do Planner sobre o codebase
 * @param rootPath - Caminho raiz do repositório
 * @returns System prompt formatado
 * @throws {Error} Query vazia
 * @example
 * const prompt = buildExplorerPrompt(
 *   "Quais frameworks de teste existem no projeto?",
 *   "/home/user/repo"
 * );
 */
export function buildExplorerPrompt(query: string, rootPath: string): string {
  if (!query.trim()) {
    throw new Error('Query do Planner não pode ser vazia');
  }
  if (query.length > 1000) {
    throw new Error('Query excede limite de 1000 caracteres');
  }

  return `Você é um Explorador de Codebase. Investigue a estrutura e conteúdo do repositório em "${rootPath}" para responder a pergunta abaixo.

FERRAMENTAS DISPONÍVEIS:
- list_directory(path, depth?) — lista arquivos e diretórios
- read_file_head(path, lines?) — lê as primeiras N linhas de um arquivo
- count_files(path, pattern) — conta arquivos que casam com glob pattern
- search_content(path, query) — busca texto em arquivos, retorna matches com linha

REGRAS:
1. Use APENAS as ferramentas listadas acima. NUNCA invente ferramentas.
2. Máximo 10 ações. Planeje antes de agir para minimizar iterações.
3. Retorne APENAS dados concretos encontrados. NUNCA invente informação.
4. Se uma busca não retornar resultado, tente uma abordagem diferente.
5. Se a pergunta não pode ser respondida com as ferramentas, diga explicitamente.
6. Comece listando a raiz para entender a estrutura geral.

FORMATO DE RESPOSTA FINAL:
Ao concluir, responda com um resumo estruturado:
- Arquivos relevantes: [paths encontrados]
- Contagens: [métricas coletadas]
- Trechos relevantes: [código ou config encontrados]
- Conclusão: [resposta direta à pergunta]

Limite: máximo 2.000 tokens na resposta final.

PERGUNTA DO PLANNER:
${query}`;
}

/**
 * Prompt de fallback injetado quando o circuit breaker atinge max iterações.
 * Força o modelo a sintetizar o que coletou até o momento.
 */
export const CIRCUIT_BREAKER_PROMPT =
  'Você atingiu o limite de iterações. Sintetize sua melhor resposta com as informações já coletadas. Seja conciso e factual.';
