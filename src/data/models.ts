/**
 * Catálogo estático de modelos LLM disponíveis via OpenRouter.
 * Dados da LLM Cost-Performance Matrix, Março 2026.
 * Preços em USD por milhão de tokens. Velocidades em tokens/segundo (média do range).
 */

/** Entrada do catálogo de modelos */
export interface ModelEntry {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly tier: 'planner' | 'worker' | 'both';
  readonly speed: number;
  readonly contextWindow: number;
  readonly inputPrice: number;
  readonly outputPrice: number;
  readonly cachePrice: number;
  readonly sweBench: number | null;
  readonly perfCostRatio: number;
}

/**
 * Catálogo completo de 18 modelos ordenados por tier e perfCostRatio.
 *
 * @example
 * ```ts
 * const planners = MODEL_CATALOG.filter(m => m.tier === 'planner' || m.tier === 'both');
 * const cheapest = MODEL_CATALOG.toSorted((a, b) => a.outputPrice - b.outputPrice)[0];
 * ```
 */
export const MODEL_CATALOG: readonly ModelEntry[] = [
  // --- PLANNER (reasoning pesado) ---
  { id: 'google/gemini-3.1-pro', name: 'Gemini 3.1 Pro', provider: 'Google', tier: 'planner', speed: 50, contextWindow: 1000, inputPrice: 2.00, outputPrice: 12.00, cachePrice: 0.20, sweBench: 80.6, perfCostRatio: 24 },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4', provider: 'OpenAI', tier: 'planner', speed: 55, contextWindow: 1050, inputPrice: 2.50, outputPrice: 15.00, cachePrice: 0.25, sweBench: 80.0, perfCostRatio: 19 },
  { id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'Anthropic', tier: 'planner', speed: 45, contextWindow: 1000, inputPrice: 5.00, outputPrice: 25.00, cachePrice: 0.50, sweBench: 80.8, perfCostRatio: 11 },
  { id: 'openai/gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'OpenAI', tier: 'planner', speed: 68, contextWindow: 400, inputPrice: 1.75, outputPrice: 14.00, cachePrice: 0.175, sweBench: null, perfCostRatio: 0 },

  // --- BOTH (planner ou worker) ---
  { id: 'minimax/minimax-m2.5', name: 'MiniMax M2.5', provider: 'MiniMax', tier: 'both', speed: 50, contextWindow: 196, inputPrice: 0.15, outputPrice: 1.20, cachePrice: 0.015, sweBench: 80.2, perfCostRatio: 242 },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3.2', provider: 'DeepSeek', tier: 'both', speed: 27, contextWindow: 128, inputPrice: 0.28, outputPrice: 0.42, cachePrice: 0.028, sweBench: 70.4, perfCostRatio: 396 },
  { id: 'moonshot/kimi-k2.5', name: 'Kimi K2.5', provider: 'Moonshot', tier: 'both', speed: 80, contextWindow: 256, inputPrice: 0.60, outputPrice: 2.50, cachePrice: 0.10, sweBench: 76.8, perfCostRatio: 99 },
  { id: 'anthropic/claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'Anthropic', tier: 'both', speed: 116, contextWindow: 200, inputPrice: 1.00, outputPrice: 5.00, cachePrice: 0.10, sweBench: 73.3, perfCostRatio: 50 },
  { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'Anthropic', tier: 'both', speed: 62, contextWindow: 1000, inputPrice: 3.00, outputPrice: 15.00, cachePrice: 0.30, sweBench: 79.6, perfCostRatio: 18 },

  // --- WORKER (execução rápida) ---
  { id: 'xiaomi/mimo-v2-flash', name: 'MiMo-V2-Flash', provider: 'Xiaomi', tier: 'worker', speed: 135, contextWindow: 256, inputPrice: 0.10, outputPrice: 0.30, cachePrice: 0, sweBench: 73.4, perfCostRatio: 757 },
  { id: 'stepfun/step-3.5-flash', name: 'Step 3.5 Flash', provider: 'StepFun', tier: 'worker', speed: 230, contextWindow: 262, inputPrice: 0.10, outputPrice: 0.30, cachePrice: 0.02, sweBench: 74.4, perfCostRatio: 709 },
  { id: 'mistral/devstral-small-2', name: 'Devstral Small 2', provider: 'Mistral', tier: 'worker', speed: 198, contextWindow: 256, inputPrice: 0.10, outputPrice: 0.30, cachePrice: 0, sweBench: 68.0, perfCostRatio: 702 },
  { id: 'alibaba/qwen3-coder-480b', name: 'Qwen3-Coder 480B', provider: 'Alibaba', tier: 'worker', speed: 115, contextWindow: 262, inputPrice: 0.22, outputPrice: 1.00, cachePrice: 0, sweBench: 55.0, perfCostRatio: 184 },
  { id: 'google/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', provider: 'Google', tier: 'worker', speed: 300, contextWindow: 1000, inputPrice: 0.25, outputPrice: 1.50, cachePrice: 0.025, sweBench: null, perfCostRatio: 168 },
  { id: 'xai/grok-code-fast-1', name: 'Grok Code Fast 1', provider: 'xAI', tier: 'worker', speed: 155, contextWindow: 256, inputPrice: 0.20, outputPrice: 1.50, cachePrice: 0.02, sweBench: 64.2, perfCostRatio: 156 },
  { id: 'mistral/devstral-2', name: 'Devstral 2', provider: 'Mistral', tier: 'worker', speed: 60, contextWindow: 256, inputPrice: 0.40, outputPrice: 2.00, cachePrice: 0, sweBench: 72.2, perfCostRatio: 122 },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', tier: 'worker', speed: 110, contextWindow: 1000, inputPrice: 0.30, outputPrice: 2.50, cachePrice: 0.03, sweBench: 64.0, perfCostRatio: 93 },
  { id: 'google/gemini-3-flash', name: 'Gemini 3 Flash', provider: 'Google', tier: 'worker', speed: 164, contextWindow: 1000, inputPrice: 0.50, outputPrice: 3.00, cachePrice: 0.05, sweBench: 78.0, perfCostRatio: 91 },
] as const;

/** Modelos elegíveis como Planner (tier planner ou both) */
export const getPlannerModels = (): readonly ModelEntry[] =>
  MODEL_CATALOG.filter((m) => m.tier === 'planner' || m.tier === 'both');

/** Modelos elegíveis como Worker (tier worker ou both) */
export const getWorkerModels = (): readonly ModelEntry[] =>
  MODEL_CATALOG.filter((m) => m.tier === 'worker' || m.tier === 'both');

/** Busca modelo por ID exato */
export const findModel = (id: string): ModelEntry | undefined =>
  MODEL_CATALOG.find((m) => m.id === id);

/** Formata preço: <1 com 2 casas, >=1 sem casas */
export const formatPrice = (price: number): string =>
  price < 1 ? `$${price.toFixed(2)}` : `$${price.toFixed(0)}`;

/** Formata contexto em K ou M */
export const formatContext = (k: number): string =>
  k >= 1000 ? `${(k / 1000).toFixed(1)}M` : `${k}K`;

/** Formata velocidade com unidade */
export const formatSpeed = (speed: number): string => `${speed} t/s`;
