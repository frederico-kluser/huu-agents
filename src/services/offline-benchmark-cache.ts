/**
 * Cache offline de benchmarks em disco (~/.pi-dag-cli/benchmark-cache.json).
 * Armazena dados brutos da OpenRouter e Artificial Analysis para
 * disponibilizar offline sem consumir requests desnecessarios.
 *
 * Hierarquia de fallback:
 * 1. Cache em memoria (nos clients)
 * 2. Cache global em disco (~/.pi-dag-cli/benchmark-cache.json)
 * 3. Bundled fallback (src/data/bundled-benchmarks.json — commitado no repo)
 * 4. Fetch das APIs (ultima opcao)
 *
 * @module
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';

// ── Paths ─────────────────────────────────────────────────────────

const GLOBAL_DIR = '.pi-dag-cli';
const CACHE_FILENAME = 'benchmark-cache.json';

/** Caminho absoluto do cache global de benchmarks */
export const getGlobalCachePath = (): string =>
  join(homedir(), GLOBAL_DIR, CACHE_FILENAME);

// ── Schemas ───────────────────────────────────────────────────────

/**
 * Schema do cache de modelos OpenRouter armazenado em disco.
 * Subset dos campos necessarios para reconstruir ModelEntry.
 */
const CachedORModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  created: z.number(),
  description: z.string().default(''),
  context_length: z.number().default(0),
  architecture: z.object({
    modality: z.string().default('text->text'),
    input_modalities: z.array(z.string()).default(['text']),
    output_modalities: z.array(z.string()).default(['text']),
    tokenizer: z.string().default('unknown'),
    instruct_type: z.string().nullable().default(null),
  }).default({}),
  pricing: z.object({
    prompt: z.string().default('0'),
    completion: z.string().default('0'),
    request: z.string().default('0'),
    image: z.string().default('0'),
  }).default({}),
  top_provider: z.object({
    context_length: z.number().nullable().default(null),
    max_completion_tokens: z.number().nullable().default(null),
    is_moderated: z.boolean().default(false),
  }).default({}),
  supported_parameters: z.array(z.string()).default([]),
  per_request_limits: z.record(z.string()).nullable().default(null),
});

const CachedAAModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  model_creator: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
  }),
  evaluations: z.object({
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
  }).catch({
    artificial_analysis_intelligence_index: null,
    artificial_analysis_coding_index: null,
    artificial_analysis_math_index: null,
    mmlu_pro: null, gpqa: null, hle: null,
    livecodebench: null, scicode: null, math_500: null, aime: null,
  }),
  pricing: z.object({
    price_1m_blended_3_to_1: z.number().nullable().catch(null),
    price_1m_input_tokens: z.number().nullable().catch(null),
    price_1m_output_tokens: z.number().nullable().catch(null),
  }).catch({
    price_1m_blended_3_to_1: null,
    price_1m_input_tokens: null,
    price_1m_output_tokens: null,
  }),
  median_output_tokens_per_second: z.number().nullable().catch(null),
  median_time_to_first_token_seconds: z.number().nullable().catch(null),
  median_time_to_first_answer_token: z.number().nullable().catch(null),
});

const BenchmarkCacheSchema = z.object({
  timestamp: z.number(),
  openRouterModels: z.array(CachedORModelSchema),
  aaModels: z.array(CachedAAModelSchema),
});

// ── Types ─────────────────────────────────────────────────────────

export type CachedORModel = z.infer<typeof CachedORModelSchema>;
export type CachedAAModel = z.infer<typeof CachedAAModelSchema>;

export interface BenchmarkCache {
  readonly timestamp: number;
  readonly openRouterModels: readonly CachedORModel[];
  readonly aaModels: readonly CachedAAModel[];
}

/** Resultado tipado para operacoes de cache */
export type CacheResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

// ── TTL ───────────────────────────────────────────────────────────

/** TTL do cache em disco: 24 horas (benchmarks mudam lentamente) */
const DISK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ── Read ──────────────────────────────────────────────────────────

/**
 * Le o cache global de benchmarks do disco.
 * Retorna null se arquivo nao existe, expirou ou esta corrompido.
 *
 * @returns Cache validado ou null
 * @example
 * ```ts
 * const cache = await loadGlobalCache();
 * if (cache) console.log(`${cache.openRouterModels.length} modelos OR`);
 * ```
 */
export const loadGlobalCache = async (): Promise<BenchmarkCache | null> => {
  try {
    const raw = await readFile(getGlobalCachePath(), 'utf-8');
    const json: unknown = JSON.parse(raw);
    const parsed = BenchmarkCacheSchema.safeParse(json);

    if (!parsed.success) return null;

    // Verificar TTL
    if (Date.now() - parsed.data.timestamp > DISK_CACHE_TTL_MS) {
      return null;
    }

    return parsed.data;
  } catch {
    // ENOENT, EACCES, SyntaxError — todos retornam null
    return null;
  }
};

/**
 * Le o cache global ignorando TTL (para fallback quando API falha).
 * Util quando nao ha conectividade mas existe cache antigo.
 *
 * @returns Cache validado (mesmo expirado) ou null
 */
export const loadGlobalCacheIgnoreTTL = async (): Promise<BenchmarkCache | null> => {
  try {
    const raw = await readFile(getGlobalCachePath(), 'utf-8');
    const json: unknown = JSON.parse(raw);
    const parsed = BenchmarkCacheSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

// ── Write ─────────────────────────────────────────────────────────

/**
 * Salva cache de benchmarks no disco global (~/.pi-dag-cli/).
 * Cria o diretorio se nao existir.
 *
 * @param orModels - Modelos brutos da OpenRouter
 * @param aaModels - Modelos brutos da Artificial Analysis
 * @returns Result com sucesso ou erro
 * @example
 * ```ts
 * const result = await saveGlobalCache(orModels, aaModels);
 * if (!result.ok) console.error(result.error);
 * ```
 */
export const saveGlobalCache = async (
  orModels: readonly CachedORModel[],
  aaModels: readonly CachedAAModel[],
): Promise<CacheResult<void>> => {
  try {
    const dirPath = join(homedir(), GLOBAL_DIR);
    await mkdir(dirPath, { recursive: true });

    const cache: BenchmarkCache = {
      timestamp: Date.now(),
      openRouterModels: [...orModels],
      aaModels: [...aaModels],
    };

    await writeFile(
      getGlobalCachePath(),
      JSON.stringify(cache, null, 2),
      'utf-8',
    );

    return { ok: true, value: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido ao salvar cache',
    };
  }
};

// ── Bundled fallback ──────────────────────────────────────────────

/**
 * Le o JSON bundled de fallback (gerado pelo script npm run fetch-benchmarks).
 * Este arquivo contem dados pre-cruzados para uso offline na primeira execucao.
 *
 * @param bundledPath - Caminho para o arquivo bundled JSON
 * @returns Cache validado ou null se arquivo nao existe/invalido
 */
export const loadBundledFallback = async (
  bundledPath: string,
): Promise<BenchmarkCache | null> => {
  try {
    const raw = await readFile(bundledPath, 'utf-8');
    const json: unknown = JSON.parse(raw);
    const parsed = BenchmarkCacheSchema.safeParse(json);
    // Bundled nao tem TTL — sempre valido como ultimo fallback
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

// ── Cache age ─────────────────────────────────────────────────────

/**
 * Retorna a idade do cache em minutos legivel para UI.
 *
 * @param timestamp - Timestamp epoch do cache
 * @returns String formatada (ex: "2h 15min", "5min", "agora")
 */
export const formatCacheAge = (timestamp: number): string => {
  const ageMs = Date.now() - timestamp;
  const minutes = Math.floor(ageMs / 60_000);

  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}min`;

  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return remainMin > 0 ? `${hours}h ${remainMin}min` : `${hours}h`;
};

/**
 * Verifica se o cache em disco esta fresco (dentro do TTL).
 *
 * @param timestamp - Timestamp epoch do cache
 * @returns true se dentro do TTL de 24h
 */
export const isDiskCacheFresh = (timestamp: number): boolean =>
  Date.now() - timestamp < DISK_CACHE_TTL_MS;
