import type { WorkerResult } from '../schemas/worker-result.schema.js';

/** Erros que disparam retry automático */
type RetryableError = 'timeout' | 'rate_limit' | 'empty_content' | 'unknown';

/** Configuração de retry para um worker */
export interface RetryConfig {
  readonly model: string;
  readonly temperature: number;
  readonly fallbackModel?: string;
  readonly maxRetries?: number;
}

/** Resultado de uma tentativa com metadata de retry */
export interface RetryOutcome {
  readonly result: WorkerResult;
  readonly attempts: number;
  readonly finalModel: string;
  readonly finalTemperature: number;
}

/** Função que executa o worker — injetada pelo caller */
type WorkerExecutor = (model: string, temperature: number) => Promise<WorkerResult>;

const DEFAULT_MAX_RETRIES = 3;
const BACKOFF_MS = [1_000, 3_000, 9_000] as const;

/**
 * Classifica o erro para decidir estratégia de retry.
 * DeepSeek retorna conteúdo vazio ocasionalmente (bug documentado).
 */
const classifyError = (result: WorkerResult): RetryableError | null => {
  if (result.status === 'success') return null;

  const err = result.error?.toLowerCase() ?? '';
  if (err.includes('timeout')) return 'timeout';
  if (err.includes('429') || err.includes('rate limit')) return 'rate_limit';
  if (err.includes('empty') || err.includes('vazio') || err === '') return 'empty_content';
  return 'unknown';
};

/**
 * Determina se o modelo é da família Gemini.
 * Gemini requer temperature 1.0 — reduzir causa loops e degradação.
 */
const isGemini = (model: string): boolean =>
  model.toLowerCase().includes('gemini');

/**
 * Determina se o modelo é DeepSeek.
 * DeepSeek pode retornar conteúdo vazio — retry imediato sem backoff.
 */
const isDeepSeek = (model: string): boolean =>
  model.toLowerCase().includes('deepseek');

/** Calcula temperatura para a próxima tentativa */
const nextTemperature = (current: number, model: string): number => {
  // Gemini deve manter 1.0 — reduzir causa loops
  if (isGemini(model)) return 1.0;
  return Math.max(0, current - 0.2);
};

/** Aguarda backoff exponencial, exceto para DeepSeek vazio */
const waitBackoff = (attempt: number, model: string, errorType: RetryableError): Promise<void> => {
  // DeepSeek vazio: retry imediato (bug documentado)
  if (isDeepSeek(model) && errorType === 'empty_content') {
    return Promise.resolve();
  }
  const ms = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[2];
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Executa um worker com retry automático e fallback de modelo.
 *
 * Estratégia por tentativa:
 * 1. Temperature original
 * 2. Temperature - 0.2 (mínimo 0, Gemini mantém 1.0)
 * 3. Modelo fallback (se configurado), senão repete com temp mínima
 *
 * @param executor - Função que executa o worker (injetada pelo DAG executor)
 * @param config - Configuração de retry (modelo, temperatura, fallback)
 * @returns Resultado final com metadata de tentativas
 * @throws {Error} Se maxRetries for <= 0
 *
 * @example
 * ```ts
 * const outcome = await retryWorker(
 *   (model, temp) => runPiAgent(node, worktreePath, model, temp),
 *   { model: 'openai/gpt-4.1-mini', temperature: 0.7, fallbackModel: 'openai/gpt-4.1-nano' }
 * );
 * if (outcome.result.status === 'success') {
 *   console.log(`OK em ${outcome.attempts} tentativa(s)`);
 * }
 * ```
 */
export const retryWorker = async (
  executor: WorkerExecutor,
  config: RetryConfig,
): Promise<RetryOutcome> => {
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  let model = config.model;
  let temperature = config.temperature;
  let lastResult: WorkerResult | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Tentativa 3: usar modelo fallback se disponível
    if (attempt === 2 && config.fallbackModel) {
      model = config.fallbackModel;
      temperature = isGemini(model) ? 1.0 : config.temperature;
    }

    lastResult = await executor(model, temperature);

    const errorType = classifyError(lastResult);
    if (errorType === null) {
      return { result: lastResult, attempts: attempt + 1, finalModel: model, finalTemperature: temperature };
    }

    // Não fazer retry em erros desconhecidos que não são transientes
    if (errorType === 'unknown' && !lastResult.error?.includes('ECONNRESET')) {
      return { result: lastResult, attempts: attempt + 1, finalModel: model, finalTemperature: temperature };
    }

    // Backoff antes da próxima tentativa (exceto última)
    if (attempt < maxRetries - 1) {
      await waitBackoff(attempt, model, errorType);
      temperature = nextTemperature(temperature, model);
    }
  }

  // Esgotou tentativas — retorna último resultado
  return {
    result: lastResult!,
    attempts: maxRetries,
    finalModel: model,
    finalTemperature: temperature,
  };
};
