/**
 * Script CLI para buscar dados da OpenRouter e Artificial Analysis,
 * cruzar os modelos e salvar como JSON bundled para uso offline.
 *
 * Uso:
 *   npm run fetch-benchmarks
 *   npm run fetch-benchmarks -- --output ./src/data/bundled-benchmarks.json
 *
 * O JSON gerado serve como fallback offline quando:
 * 1. Nao ha cache global em disco (~/.pi-dag-cli/benchmark-cache.json)
 * 2. Nao ha conectividade com as APIs
 * 3. O app esta sendo usado pela primeira vez
 *
 * Tambem salva no cache global para uso imediato pelo app.
 *
 * @module
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { saveGlobalCache } from '../services/offline-benchmark-cache.js';

// ── Config ────────────────────────────────────────────────────────

const CONFIG_PATH = join(homedir(), '.pi-dag-cli.json');
const OR_API_URL = 'https://openrouter.ai/api/v1/models';
const AA_BASE_URL = 'https://artificialanalysis.ai/api/v2';
const FETCH_TIMEOUT_MS = 20_000;
const YEAR_2025_UNIX = 1735689600;

const DEFAULT_OUTPUT = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..', 'data', 'bundled-benchmarks.json',
);

// ── Schemas ───────────────────────────────────────────────────────

const ConfigSchema = z.object({
  openrouterApiKey: z.string().optional(),
  artificialAnalysisApiKey: z.string().optional(),
}).passthrough();

const ORPricingSchema = z.object({
  prompt: z.string().default('0'),
  completion: z.string().default('0'),
  request: z.string().default('0'),
  image: z.string().default('0'),
});

const ORArchSchema = z.object({
  modality: z.string().default('text->text'),
  input_modalities: z.array(z.string()).default(['text']),
  output_modalities: z.array(z.string()).default(['text']),
  tokenizer: z.string().default('unknown'),
  instruct_type: z.string().nullable().default(null),
});

const ORTopProviderSchema = z.object({
  context_length: z.number().nullable().default(null),
  max_completion_tokens: z.number().nullable().default(null),
  is_moderated: z.boolean().default(false),
});

const ORModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  created: z.number(),
  description: z.string().default(''),
  context_length: z.number().default(0),
  architecture: ORArchSchema.default({}),
  pricing: ORPricingSchema.default({}),
  top_provider: ORTopProviderSchema.default({}),
  supported_parameters: z.array(z.string()).default([]),
  per_request_limits: z.record(z.string()).nullable().default(null),
});

const ORResponseSchema = z.object({
  data: z.array(ORModelSchema),
});

const AAModelCreatorSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

const AAEvalSchema = z.object({
  artificial_analysis_intelligence_index: z.number().nullable().catch(null),
  artificial_analysis_coding_index: z.number().nullable().catch(null),
  artificial_analysis_math_index: z.number().nullable().catch(null),
  mmlu_pro: z.number().nullable().catch(null),
  gpqa: z.number().nullable().catch(null),
  hle: z.number().nullable().catch(null),
  livecodebench: z.number().nullable().catch(null),
  scicode: z.number().nullable().catch(null),
  math_500: z.number().nullable().catch(null),
  aime: z.number().nullable().catch(null),
});

const AAPricingSchema = z.object({
  price_1m_blended_3_to_1: z.number().nullable().catch(null),
  price_1m_input_tokens: z.number().nullable().catch(null),
  price_1m_output_tokens: z.number().nullable().catch(null),
});

const AAModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  model_creator: AAModelCreatorSchema,
  evaluations: AAEvalSchema.catch({
    artificial_analysis_intelligence_index: null,
    artificial_analysis_coding_index: null,
    artificial_analysis_math_index: null,
    mmlu_pro: null, gpqa: null, hle: null,
    livecodebench: null, scicode: null, math_500: null, aime: null,
  }),
  pricing: AAPricingSchema.catch({
    price_1m_blended_3_to_1: null,
    price_1m_input_tokens: null,
    price_1m_output_tokens: null,
  }),
  median_output_tokens_per_second: z.number().nullable().catch(null),
  median_time_to_first_token_seconds: z.number().nullable().catch(null),
  median_time_to_first_answer_token: z.number().nullable().catch(null),
});

const AAResponseSchema = z.object({
  status: z.number(),
  data: z.array(AAModelSchema),
});

// ── Helpers ───────────────────────────────────────────────────────

const stderr = (msg: string): void => { process.stderr.write(`${msg}\n`); };
const stdout = (msg: string): void => { process.stdout.write(`${msg}\n`); };

interface ApiKeys {
  readonly orKey: string | undefined;
  readonly aaKey: string | undefined;
}

const resolveApiKeys = async (): Promise<ApiKeys> => {
  const envOrKey = process.env.OPENROUTER_API_KEY?.trim();
  const envAaKey = process.env.AA_API_KEY?.trim();

  let configOrKey: string | undefined;
  let configAaKey: string | undefined;

  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const config = ConfigSchema.parse(JSON.parse(raw));
    configOrKey = config.openrouterApiKey?.trim() || undefined;
    configAaKey = config.artificialAnalysisApiKey?.trim() || undefined;
  } catch {
    // Config nao encontrada ou invalida — usar apenas env vars
  }

  return {
    orKey: envOrKey || configOrKey,
    aaKey: envAaKey || configAaKey,
  };
};

const fetchWithTimeout = async (
  url: string,
  headers: Record<string, string>,
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

// ── Fetch OpenRouter ──────────────────────────────────────────────

const fetchOpenRouter = async (apiKey?: string): Promise<z.infer<typeof ORModelSchema>[]> => {
  stderr('Buscando modelos da OpenRouter...');

  const headers: Record<string, string> = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetchWithTimeout(OR_API_URL, headers);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Timeout ao buscar modelos da OpenRouter (20s).');
    }
    throw err;
  }

  if (!response.ok) {
    throw new Error(`OpenRouter retornou HTTP ${response.status}.`);
  }

  const json: unknown = await response.json();
  const parsed = ORResponseSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error(`Resposta invalida da OpenRouter: ${parsed.error.message}`);
  }

  // Filtrar: texto, 2025+, nao :free, com preco
  const filtered = parsed.data.data.filter((m) => {
    const isText = m.architecture.output_modalities.includes('text');
    const is2025 = m.created >= YEAR_2025_UNIX;
    const isFree = m.id.endsWith(':free');
    const hasPrice = parseFloat(m.pricing.prompt) > 0 || parseFloat(m.pricing.completion) > 0;
    return isText && is2025 && !isFree && hasPrice;
  });

  // Ordenar por preco input
  filtered.sort((a, b) => parseFloat(a.pricing.prompt) - parseFloat(b.pricing.prompt));

  stderr(`  ${filtered.length} modelos filtrados (de ${parsed.data.data.length} total).`);
  return filtered;
};

// ── Fetch Artificial Analysis ─────────────────────────────────────

const fetchAA = async (apiKey: string): Promise<z.infer<typeof AAModelSchema>[]> => {
  stderr('Buscando benchmarks da Artificial Analysis...');

  const url = `${AA_BASE_URL}/data/llms/models?prompt_length=medium&parallel_queries=1`;
  let response: Response;

  try {
    response = await fetchWithTimeout(url, { 'x-api-key': apiKey });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Timeout ao buscar benchmarks da Artificial Analysis (20s).');
    }
    throw err;
  }

  if (response.status === 401) {
    throw new Error('API key da Artificial Analysis invalida ou ausente.');
  }
  if (response.status === 429) {
    throw new Error('Rate limit da Artificial Analysis atingido (1000 req/dia).');
  }
  if (!response.ok) {
    throw new Error(`Artificial Analysis retornou HTTP ${response.status}.`);
  }

  const json: unknown = await response.json();
  const parsed = AAResponseSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error(`Resposta invalida da Artificial Analysis: ${parsed.error.message}`);
  }

  stderr(`  ${parsed.data.data.length} modelos com benchmarks.`);
  return parsed.data.data;
};

// ── Args ──────────────────────────────────────────────────────────

const parseArgs = (argv: readonly string[]): { output: string } => {
  let output = DEFAULT_OUTPUT;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--output' || arg === '-o') {
      const next = argv[i + 1];
      if (!next) throw new Error('--output requer um caminho.');
      output = resolve(next);
      i++;
    }
  }

  return { output };
};

// ── Main ──────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const keys = await resolveApiKeys();

  // OpenRouter e obrigatoria para o script
  const orModels = await fetchOpenRouter(keys.orKey);

  // AA e opcional — sem key, salva array vazio
  let aaModels: z.infer<typeof AAModelSchema>[] = [];
  if (keys.aaKey) {
    try {
      aaModels = await fetchAA(keys.aaKey);
    } catch (err) {
      stderr(`Aviso: falha ao buscar AA (${err instanceof Error ? err.message : 'erro'}). Salvando sem benchmarks.`);
    }
  } else {
    stderr('Aviso: AA API key nao encontrada. Salvando sem benchmarks AA.');
    stderr('  Configure AA_API_KEY ou artificialAnalysisApiKey em ~/.pi-dag-cli.json.');
  }

  // Salvar JSON bundled
  const cache = {
    timestamp: Date.now(),
    openRouterModels: orModels,
    aaModels,
  };

  await writeFile(args.output, JSON.stringify(cache, null, 2), 'utf-8');
  stderr(`Bundled salvo em: ${args.output}`);
  stderr(`  ${orModels.length} modelos OR + ${aaModels.length} modelos AA`);

  // Tambem salvar no cache global
  const globalResult = await saveGlobalCache(orModels, aaModels);
  if (globalResult.ok) {
    stderr('Cache global salvo em: ~/.pi-dag-cli/benchmark-cache.json');
  } else {
    stderr(`Aviso: falha ao salvar cache global: ${globalResult.error}`);
  }

  stdout('OK');
};

const isExecutedDirectly = (): boolean => {
  const executedPath = process.argv[1];
  if (!executedPath) return false;
  return resolve(executedPath) === fileURLToPath(import.meta.url);
};

if (isExecutedDirectly()) {
  main().catch((err: unknown) => {
    stderr(err instanceof Error ? err.message : 'Erro desconhecido ao buscar benchmarks.');
    process.exitCode = 1;
  });
}
