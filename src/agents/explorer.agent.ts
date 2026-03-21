/**
 * Explorer ReAct agent — investiga o codebase para fornecer contexto ao Planner.
 *
 * Implementa o ciclo Thought→Action→Observation via loop manual com bindTools().
 * Circuit breaker em 10 iterações. Output condensado em max 2.000 tokens.
 * Segue constraint de max 250 LOC.
 */

import {
  HumanMessage,
  AIMessage,
  ToolMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import {
  explorerTools,
  invokeExplorerTool,
  EXPLORER_TOOL_NAMES,
} from './explorer-tools.js';
import { setAllowedRoot } from '../utils/path-guard.js';
import { buildExplorerPrompt, CIRCUIT_BREAKER_PROMPT } from '../prompts/explorer.prompt.js';

/** Configuração do Explorer agent */
export interface ExplorerConfig {
  /** Modelo LLM via OpenRouter (ex: "openai/gpt-4.1") */
  readonly model: string;
  /** API key do OpenRouter */
  readonly apiKey: string;
  /** Base URL da API (default: OpenRouter) */
  readonly baseUrl?: string;
  /** Máximo de iterações do loop ReAct */
  readonly maxIterations?: number;
}

/** Resultado da exploração retornado ao Planner */
export interface ExplorerResult {
  /** Resumo condensado da exploração (max ~2.000 tokens) */
  readonly summary: string;
  /** Número de iterações do loop ReAct executadas */
  readonly iterations: number;
  /** Se o circuit breaker foi acionado */
  readonly hitCircuitBreaker: boolean;
}

/** Erro lançado quando o Explorer falha após todas as tentativas */
export class ExplorerError extends Error {
  constructor(message: string, public readonly iterations: number) {
    super(message);
    this.name = 'ExplorerError';
  }
}

const MAX_OUTPUT_CHARS = 6_000; // ~2.000 tokens
const DEFAULT_MAX_ITERATIONS = 10;

/**
 * Executa o Explorer ReAct agent para investigar o codebase.
 *
 * Ciclo: SystemPrompt → [Thought→Action→Observation]* → Resposta condensada.
 * Circuit breaker em maxIterations (default 10). Retorna max ~2.000 tokens.
 *
 * @param query - Pergunta do Planner sobre o codebase
 * @param rootPath - Caminho raiz do repositório a investigar
 * @param config - Configuração do modelo e limites
 * @returns Resultado da exploração com resumo condensado
 * @throws {ExplorerError} Modelo falhou em produzir resposta
 * @throws {Error} Query vazia ou config inválida
 * @example
 * const result = await runExplorer(
 *   "Quais testes existem no projeto e qual framework usam?",
 *   "/home/user/repo",
 *   { model: "openai/gpt-4.1", apiKey: "sk-or-..." }
 * );
 * console.log(result.summary); // "Encontrados 12 arquivos .test.ts usando vitest..."
 * console.log(result.iterations); // 4
 */
export async function runExplorer(
  query: string,
  rootPath: string,
  config: ExplorerConfig,
): Promise<ExplorerResult> {
  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  // Configura path traversal guard para todas as tools
  setAllowedRoot(rootPath);

  const systemPrompt = buildExplorerPrompt(query, rootPath);

  const model = new ChatOpenAI({
    model: config.model,
    temperature: 0,
    apiKey: config.apiKey,
    configuration: { baseURL: config.baseUrl ?? 'https://openrouter.ai/api/v1' },
  }).bindTools(explorerTools);

  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    new HumanMessage(query),
  ];

  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const response = await model.invoke(messages);
    if (!(response instanceof AIMessage)) {
      throw new ExplorerError('Modelo retornou tipo de mensagem inesperado', iterations);
    }
    messages.push(response);

    // Sem tool calls = resposta final
    if (!response.tool_calls || response.tool_calls.length === 0) {
      const content = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

      return {
        summary: truncateOutput(content),
        iterations,
        hitCircuitBreaker: false,
      };
    }

    // Executar cada tool call e injetar ToolMessage com resultado
    for (const toolCall of response.tool_calls) {
      const callId = toolCall.id;
      if (!callId) {
        continue; // Sem ID válido, não é possível criar ToolMessage
      }

      if (!EXPLORER_TOOL_NAMES.has(toolCall.name)) {
        messages.push(
          new ToolMessage({
            tool_call_id: callId,
            content: `Erro: tool "${toolCall.name}" não existe. Disponíveis: ${[...EXPLORER_TOOL_NAMES].join(', ')}`,
          }),
        );
        continue;
      }

      const args = toolCall.args;
      if (typeof args !== 'object' || args === null) {
        messages.push(
          new ToolMessage({
            tool_call_id: callId,
            content: 'Erro: argumentos da tool devem ser um objeto JSON válido',
          }),
        );
        continue;
      }

      try {
        const output = await invokeExplorerTool(
          toolCall.name,
          args as Record<string, unknown>,
        );

        messages.push(
          new ToolMessage({ tool_call_id: callId, content: output, name: toolCall.name }),
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        messages.push(
          new ToolMessage({
            tool_call_id: callId,
            content: `Erro ao executar "${toolCall.name}": ${errorMsg}`,
          }),
        );
      }
    }
  }

  // Circuit breaker: forçar síntese do que foi coletado
  messages.push(new HumanMessage(CIRCUIT_BREAKER_PROMPT));

  const fallbackModel = new ChatOpenAI({
    model: config.model,
    temperature: 0,
    apiKey: config.apiKey,
    configuration: { baseURL: config.baseUrl ?? 'https://openrouter.ai/api/v1' },
  });

  const fallback = await fallbackModel.invoke(messages);
  const fallbackContent = fallback instanceof AIMessage && typeof fallback.content === 'string'
    ? fallback.content
    : '';

  if (!fallbackContent.trim()) {
    throw new ExplorerError(
      'Explorer não produziu resposta após circuit breaker',
      iterations,
    );
  }

  return {
    summary: truncateOutput(fallbackContent),
    iterations,
    hitCircuitBreaker: true,
  };
}

/** Trunca output para respeitar o limite de ~2.000 tokens. */
function truncateOutput(content: string): string {
  if (content.length <= MAX_OUTPUT_CHARS) return content;
  return content.slice(0, MAX_OUTPUT_CHARS - 50) + '\n\n[... truncado — limite de 2.000 tokens]';
}
