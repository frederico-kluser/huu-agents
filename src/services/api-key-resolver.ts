/**
 * Resolucao de API keys com cadeia de prioridade documentada.
 *
 * Ordem (maior → menor prioridade):
 *   1. Argumento explicito (prop do componente, flag CLI, parametro de funcao)
 *   2. Arquivo `.env` no CWD (carregado on-demand, cacheado por CWD)
 *   3. `process.env` (variaveis ja exportadas no shell)
 *   4. Config global em ~/.model-selector-ink/config.json
 *
 * Variaveis suportadas: `OPENROUTER_API_KEY`, `ARTIFICIAL_ANALYSIS_API_KEY`.
 *
 * @module
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadGlobalConfigSync } from './global-config.js';

export interface ResolvedApiKeys {
  readonly openRouterApiKey?: string;
  readonly artificialAnalysisApiKey?: string;
  /** Onde cada key foi resolvida — util para debug/UI ("ENV"/"file"/"global"/"explicit"). */
  readonly sources: {
    readonly openRouter?: ApiKeySource;
    readonly artificialAnalysis?: ApiKeySource;
  };
}

export type ApiKeySource = 'explicit' | 'env-file' | 'process-env' | 'global-config';

export interface ResolveOptions {
  /** Override explicito da OpenRouter key (maior prioridade). */
  readonly openRouterApiKey?: string;
  /** Override explicito da AA key (maior prioridade). */
  readonly artificialAnalysisApiKey?: string;
  /** CWD onde procurar `.env` (default: `process.cwd()`). */
  readonly cwd?: string;
}

const ENV_VARS = {
  openRouter: 'OPENROUTER_API_KEY',
  aa: 'ARTIFICIAL_ANALYSIS_API_KEY',
} as const;

// ── .env parsing ──────────────────────────────────────────────────

/** Parser minimalista de .env: KEY=value, KEY="value", '#'-comments, linhas em branco. */
const parseEnvFile = (raw: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }
    result[key] = value;
  }
  return result;
};

const envFileCache = new Map<string, Record<string, string>>();

/** Le `.env` do CWD informado; cache por path para evitar I/O repetido em re-renders. */
const readEnvFile = (cwd: string): Record<string, string> => {
  const cached = envFileCache.get(cwd);
  if (cached) return cached;
  let result: Record<string, string> = {};
  try {
    const path = join(cwd, '.env');
    if (existsSync(path)) {
      result = parseEnvFile(readFileSync(path, 'utf-8'));
    }
  } catch {
    // ignore — falha silenciosa: keys nao resolvidas degradam graciosamente
  }
  envFileCache.set(cwd, result);
  return result;
};

/**
 * Limpa o cache de leituras de `.env`.
 * Util em testes ou quando o `.env` muda em runtime.
 */
export const clearEnvFileCache = (): void => {
  envFileCache.clear();
};

// ── Resolution ─────────────────────────────────────────────────────

interface SingleResolveInput {
  readonly explicit?: string;
  readonly envName: string;
  readonly envFile: Record<string, string>;
  readonly globalValue?: string;
}

interface SingleResolveResult {
  readonly value?: string;
  readonly source?: ApiKeySource;
}

const resolveSingle = (input: SingleResolveInput): SingleResolveResult => {
  if (input.explicit) return { value: input.explicit, source: 'explicit' };
  const fromFile = input.envFile[input.envName];
  if (fromFile) return { value: fromFile, source: 'env-file' };
  const fromProcess = process.env[input.envName];
  if (fromProcess) return { value: fromProcess, source: 'process-env' };
  if (input.globalValue) return { value: input.globalValue, source: 'global-config' };
  return {};
};

/**
 * Resolve as API keys aplicando a cadeia de prioridade.
 *
 * @param options - overrides explicitos e CWD opcional
 * @returns Keys resolvidas (cada uma pode ser undefined) e suas origens
 *
 * @example
 * ```ts
 * const { openRouterApiKey, artificialAnalysisApiKey } = resolveApiKeys();
 *
 * // Com override explicito (usado quando o consumidor passa props):
 * resolveApiKeys({ openRouterApiKey: 'sk-or-...' });
 * ```
 */
export const resolveApiKeys = (options: ResolveOptions = {}): ResolvedApiKeys => {
  const cwd = options.cwd ?? process.cwd();
  const envFile = readEnvFile(cwd);
  const globalConfig = loadGlobalConfigSync();

  const or = resolveSingle({
    explicit: options.openRouterApiKey,
    envName: ENV_VARS.openRouter,
    envFile,
    globalValue: globalConfig.openRouterApiKey,
  });
  const aa = resolveSingle({
    explicit: options.artificialAnalysisApiKey,
    envName: ENV_VARS.aa,
    envFile,
    globalValue: globalConfig.artificialAnalysisApiKey,
  });

  return {
    openRouterApiKey: or.value,
    artificialAnalysisApiKey: aa.value,
    sources: {
      openRouter: or.source,
      artificialAnalysis: aa.source,
    },
  };
};
