/**
 * Tipo enriquecido que combina dados OpenRouter (pricing, contexto, capabilities)
 * com dados Artificial Analysis (benchmarks, velocidade, intelligence index).
 * Matching entre as duas fontes e feito por nome normalizado.
 *
 * @module
 */

import type { ModelEntry } from './models.js';
import type { AAModel, AAEvaluations } from './artificial-analysis-client.js';
import { normalizeAAName } from './artificial-analysis-client.js';

/** Benchmarks da Artificial Analysis associados a um modelo */
export interface AABenchmarks {
  readonly intelligenceIndex: number | null;
  readonly codingIndex: number | null;
  readonly mathIndex: number | null;
  readonly mmluPro: number | null;
  readonly gpqa: number | null;
  readonly hle: number | null;
  readonly livecodebench: number | null;
  readonly scicode: number | null;
  readonly math500: number | null;
  readonly aime: number | null;
}

/** Metricas de velocidade da Artificial Analysis */
export interface AASpeed {
  readonly outputTokensPerSecond: number | null;
  readonly timeToFirstToken: number | null;
  readonly timeToFirstAnswerToken: number | null;
}

/** Pricing da Artificial Analysis (blended) */
export interface AAPricing {
  readonly blended3to1: number | null;
  readonly inputPerMillion: number | null;
  readonly outputPerMillion: number | null;
}

/** Modelo enriquecido: OpenRouter base + AA benchmarks opcionais */
export interface EnrichedModel extends ModelEntry {
  readonly aa: {
    readonly matched: boolean;
    readonly benchmarks: AABenchmarks;
    readonly speed: AASpeed;
    readonly pricing: AAPricing;
    readonly creatorSlug: string | null;
  };
}

/** Benchmark vazio para modelos sem match AA */
const EMPTY_BENCHMARKS: AABenchmarks = {
  intelligenceIndex: null, codingIndex: null, mathIndex: null,
  mmluPro: null, gpqa: null, hle: null,
  livecodebench: null, scicode: null, math500: null, aime: null,
};

const EMPTY_SPEED: AASpeed = {
  outputTokensPerSecond: null, timeToFirstToken: null, timeToFirstAnswerToken: null,
};

const EMPTY_PRICING: AAPricing = {
  blended3to1: null, inputPerMillion: null, outputPerMillion: null,
};

const EMPTY_AA: EnrichedModel['aa'] = {
  matched: false, benchmarks: EMPTY_BENCHMARKS, speed: EMPTY_SPEED,
  pricing: EMPTY_PRICING, creatorSlug: null,
};

/**
 * Converte evaluations da AA para o formato interno AABenchmarks.
 *
 * @param evals - Objeto evaluations cru da API AA
 * @returns AABenchmarks normalizado
 */
const toAABenchmarks = (evals: AAEvaluations): AABenchmarks => ({
  intelligenceIndex: evals.artificial_analysis_intelligence_index,
  codingIndex: evals.artificial_analysis_coding_index,
  mathIndex: evals.artificial_analysis_math_index,
  mmluPro: evals.mmlu_pro,
  gpqa: evals.gpqa,
  hle: evals.hle,
  livecodebench: evals.livecodebench,
  scicode: evals.scicode,
  math500: evals.math_500,
  aime: evals.aime,
});

/**
 * Constroi indice de lookup AA por nome normalizado.
 * Inclui slug e nome do modelo para maximizar chances de match.
 *
 * @param aaModels - Array de modelos AA
 * @returns Map de nome normalizado para AAModel
 */
const buildAAIndex = (aaModels: readonly AAModel[]): ReadonlyMap<string, AAModel> => {
  const index = new Map<string, AAModel>();
  for (const m of aaModels) {
    index.set(normalizeAAName(m.slug), m);
    index.set(normalizeAAName(m.name), m);
  }
  return index;
};

/**
 * Tenta encontrar match AA para um modelo OpenRouter.
 * Estrategia: normaliza o nome do modelo OR e busca no indice AA.
 *
 * @param orModel - Modelo OpenRouter
 * @param aaIndex - Indice AA por nome normalizado
 * @returns AAModel ou undefined
 */
const findAAMatch = (orModel: ModelEntry, aaIndex: ReadonlyMap<string, AAModel>): AAModel | undefined => {
  // Tentar pelo nome do modelo (sem provider prefix)
  const modelName = orModel.id.includes('/') ? orModel.id.split('/')[1]! : orModel.id;
  const normalizedName = normalizeAAName(modelName);
  const bySlug = aaIndex.get(normalizedName);
  if (bySlug) return bySlug;

  // Tentar pelo display name
  const normalizedDisplayName = normalizeAAName(orModel.name);
  const byName = aaIndex.get(normalizedDisplayName);
  if (byName) return byName;

  // Tentar matching parcial — modelo OR contem slug AA ou vice-versa
  for (const [key, aaModel] of aaIndex) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return aaModel;
    }
  }

  return undefined;
};

/**
 * Enriquece modelos OpenRouter com dados da Artificial Analysis.
 * Se aaModels estiver vazio, retorna modelos com AA vazio (matched: false).
 *
 * @param orModels - Modelos da OpenRouter
 * @param aaModels - Modelos da Artificial Analysis (pode ser vazio)
 * @returns Array de EnrichedModel
 * @example
 * ```ts
 * const enriched = buildEnrichedModels(openRouterModels, aaModels);
 * const withBenchmarks = enriched.filter(m => m.aa.matched);
 * ```
 */
export const buildEnrichedModels = (
  orModels: readonly ModelEntry[],
  aaModels: readonly AAModel[],
): readonly EnrichedModel[] => {
  if (aaModels.length === 0) {
    return orModels.map((m) => ({ ...m, aa: EMPTY_AA }));
  }

  const aaIndex = buildAAIndex(aaModels);

  return orModels.map((m) => {
    const aaMatch = findAAMatch(m, aaIndex);
    if (!aaMatch) return { ...m, aa: EMPTY_AA };

    return {
      ...m,
      aa: {
        matched: true,
        benchmarks: toAABenchmarks(aaMatch.evaluations),
        speed: {
          outputTokensPerSecond: aaMatch.median_output_tokens_per_second,
          timeToFirstToken: aaMatch.median_time_to_first_token_seconds,
          timeToFirstAnswerToken: aaMatch.median_time_to_first_answer_token,
        },
        pricing: {
          blended3to1: aaMatch.pricing.price_1m_blended_3_to_1,
          inputPerMillion: aaMatch.pricing.price_1m_input_tokens,
          outputPerMillion: aaMatch.pricing.price_1m_output_tokens,
        },
        creatorSlug: aaMatch.model_creator.slug,
      },
    };
  });
};
