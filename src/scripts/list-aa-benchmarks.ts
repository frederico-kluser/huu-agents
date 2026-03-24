import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const CONFIG_PATH = join(homedir(), '.pi-dag-cli.json');
const BASE_URL = 'https://artificialanalysis.ai/api/v2';
const FETCH_TIMEOUT_MS = 15_000;

const PromptLengthSchema = z.enum(['medium', 'long', '100k']);

const ConfigAAKeySchema = z.object({
  artificialAnalysisApiKey: z.string().min(1).optional(),
}).passthrough();

const RawEvaluationsSchema = z.record(z.string(), z.union([z.number(), z.null()]));

const RawAAResponseSchema = z.object({
  data: z.array(z.object({
    evaluations: RawEvaluationsSchema.catch({}),
  })),
});

interface BenchmarkMetadata {
  readonly label: string;
  readonly scale: string;
  readonly description: string;
  readonly order: number;
}

export interface BenchmarkCatalogEntry {
  readonly key: string;
  readonly label: string;
  readonly scale: string;
  readonly description: string;
  readonly modelsWithField: number;
  readonly modelsWithValue: number;
  readonly exampleValue: number | null;
}

interface RawAAModel {
  readonly evaluations: Readonly<Record<string, number | null>>;
}

interface ParsedArgs {
  readonly promptLength: z.infer<typeof PromptLengthSchema>;
  readonly json: boolean;
}

interface ResolvedApiKey {
  readonly apiKey: string;
  readonly source: string;
}

const KNOWN_BENCHMARKS: Readonly<Record<string, BenchmarkMetadata>> = {
  artificial_analysis_intelligence_index: {
    label: 'Intelligence Index',
    scale: '0-100',
    description: 'Indice composto geral da Artificial Analysis para capacidade textual.',
    order: 1,
  },
  artificial_analysis_coding_index: {
    label: 'Coding Index',
    scale: '0-100',
    description: 'Indice composto de codigo, hoje centrado em Terminal-Bench Hard e SciCode.',
    order: 2,
  },
  artificial_analysis_math_index: {
    label: 'Math Index',
    scale: '0-100',
    description: 'Indice composto de matematica com foco em AIME e MATH-500.',
    order: 3,
  },
  mmlu_pro: {
    label: 'MMLU-Pro',
    scale: '0-1',
    description: 'Conhecimento avancado multi-dominio em 14 disciplinas.',
    order: 10,
  },
  gpqa: {
    label: 'GPQA Diamond',
    scale: '0-1',
    description: 'Raciocinio cientifico em nivel de pos-graduacao.',
    order: 11,
  },
  hle: {
    label: "Humanity's Last Exam",
    scale: '0-1',
    description: 'Questoes de fronteira criadas por especialistas para reasoning.',
    order: 12,
  },
  livecodebench: {
    label: 'LiveCodeBench',
    scale: '0-1',
    description: 'Benchmark de programacao com problemas recentes e baixa contaminacao.',
    order: 13,
  },
  scicode: {
    label: 'SciCode',
    scale: '0-1',
    description: 'Codigo cientifico em Python em varias disciplinas.',
    order: 14,
  },
  math_500: {
    label: 'MATH-500',
    scale: '0-1',
    description: 'Problemas de matematica de competicao e raciocinio simbolico.',
    order: 15,
  },
  aime: {
    label: 'AIME',
    scale: '0-1',
    description: 'Olimpiada matematica AIME, com foco em problemas curtos e dificeis.',
    order: 16,
  },
};

const writeStdoutLine = (line = ''): void => {
  process.stdout.write(`${line}\n`);
};

const writeStderrLine = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

const getUsageMessage = (arg?: string): string =>
  arg
    ? `Argumento invalido: ${arg}. Use --prompt-length <medium|long|100k> e/ou --json.`
    : 'Uso invalido. Use --prompt-length <medium|long|100k> e/ou --json.';

const UPPERCASE_BENCHMARK_TOKENS = new Set([
  'aa',
  'aime',
  'gpqa',
  'hle',
  'mmlu',
]);

const humanizeBenchmarkKey = (key: string): string =>
  key
    .split(/[_-]+/)
    .filter(Boolean)
    .map((token) => {
      const normalizedToken = token.toLowerCase();
      if (UPPERCASE_BENCHMARK_TOKENS.has(normalizedToken)) {
        return normalizedToken.toUpperCase();
      }

      return `${normalizedToken[0]?.toUpperCase() ?? ''}${normalizedToken.slice(1)}`;
    })
    .join(' ');

export const parseArgs = (argv: readonly string[]): ParsedArgs => {
  let promptLength: z.infer<typeof PromptLengthSchema> = 'medium';
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg) {
      continue;
    }

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg.startsWith('--prompt-length=')) {
      const inlineValue = arg.split('=', 2)[1];
      const parsedValue = PromptLengthSchema.safeParse(inlineValue);

      if (!parsedValue.success) {
        throw new Error(getUsageMessage(arg));
      }

      promptLength = parsedValue.data;
      continue;
    }

    if (arg === '--prompt-length') {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error(getUsageMessage());
      }

      const parsedValue = PromptLengthSchema.safeParse(nextValue);

      if (!parsedValue.success) {
        throw new Error(getUsageMessage(nextValue));
      }

      promptLength = parsedValue.data;
      index += 1;
      continue;
    }

    throw new Error(getUsageMessage(arg));
  }

  return { promptLength, json };
};

export const parseConfigApiKey = (rawConfig: string): string | null => {
  const parsedConfig: unknown = JSON.parse(rawConfig);
  const config = ConfigAAKeySchema.parse(parsedConfig);
  return config.artificialAnalysisApiKey ?? null;
};

export const resolveApiKeyFromSources = (
  envApiKey: string | undefined,
  configApiKey: string | null,
): ResolvedApiKey | null => {
  const normalizedEnvApiKey = envApiKey?.trim();
  const normalizedConfigApiKey = configApiKey?.trim();

  if (normalizedEnvApiKey) {
    return { apiKey: normalizedEnvApiKey, source: 'AA_API_KEY' };
  }

  return normalizedConfigApiKey
    ? { apiKey: normalizedConfigApiKey, source: CONFIG_PATH }
    : null;
};

const readApiKeyFromConfig = async (): Promise<string | null> => {
  try {
    const rawConfig = await readFile(CONFIG_PATH, 'utf-8');
    return parseConfigApiKey(rawConfig);
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error) {
      const code = (error as Error & { code?: string }).code;

      if (code === 'ENOENT') {
        return null;
      }

      if (code === 'EACCES' || code === 'EPERM') {
        throw new Error(`Sem permissao para ler ${CONFIG_PATH}.`);
      }
    }

    if (error instanceof SyntaxError) {
      throw new Error(`${CONFIG_PATH} contem JSON invalido.`);
    }

    if (error instanceof z.ZodError) {
      throw new Error(`${CONFIG_PATH} contem formato invalido para artificialAnalysisApiKey.`);
    }

    throw new Error(
      error instanceof Error
        ? `Falha ao ler ${CONFIG_PATH}: ${error.message}`
        : `Falha ao ler ${CONFIG_PATH}.`,
    );
  }
};

const resolveApiKey = async (): Promise<ResolvedApiKey> => {
  const envApiKey = process.env.AA_API_KEY;

  const configApiKey = await readApiKeyFromConfig();
  const resolved = resolveApiKeyFromSources(envApiKey, configApiKey);

  if (resolved) {
    return resolved;
  }

  throw new Error(
    'Artificial Analysis API key nao encontrada. Defina AA_API_KEY ou configure artificialAnalysisApiKey em ~/.pi-dag-cli.json.',
  );
};

const fetchRawAAModels = async (
  apiKey: string,
  promptLength: z.infer<typeof PromptLengthSchema>,
): Promise<readonly RawAAModel[]> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = `${BASE_URL}/data/llms/models?prompt_length=${promptLength}&parallel_queries=1`;
    const response = await fetch(url, {
      headers: { 'x-api-key': apiKey },
      signal: controller.signal,
    });

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
    const parsed = RawAAResponseSchema.safeParse(json);

    if (!parsed.success) {
      throw new Error(`Resposta invalida da Artificial Analysis: ${parsed.error.message}`);
    }

    return parsed.data.data;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Timeout ao buscar benchmarks da Artificial Analysis (15s).');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const extractBenchmarkCatalog = (
  models: readonly RawAAModel[],
): readonly BenchmarkCatalogEntry[] => {
  const aggregate = new Map<string, {
    modelsWithField: number;
    modelsWithValue: number;
    exampleValue: number | null;
  }>();

  for (const model of models) {
    for (const [key, rawValue] of Object.entries(model.evaluations)) {
      const current = aggregate.get(key) ?? {
        modelsWithField: 0,
        modelsWithValue: 0,
        exampleValue: null,
      };

      aggregate.set(key, {
        modelsWithField: current.modelsWithField + 1,
        modelsWithValue: rawValue === null ? current.modelsWithValue : current.modelsWithValue + 1,
        exampleValue: current.exampleValue ?? rawValue,
      });
    }
  }

  return [...aggregate.entries()]
    .map(([key, stats]) => {
      const metadata = KNOWN_BENCHMARKS[key];

      return {
        key,
        label: metadata?.label ?? humanizeBenchmarkKey(key),
        scale: metadata?.scale ?? 'desconhecida',
        description: metadata?.description ?? 'Campo nao mapeado localmente; detectado direto na resposta da API.',
        modelsWithField: stats.modelsWithField,
        modelsWithValue: stats.modelsWithValue,
        exampleValue: stats.exampleValue,
      } satisfies BenchmarkCatalogEntry;
    })
    .sort((left, right) => {
      const leftOrder = KNOWN_BENCHMARKS[left.key]?.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = KNOWN_BENCHMARKS[right.key]?.order ?? Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.key.localeCompare(right.key);
    });
};

const formatExampleValue = (value: number | null): string => {
  if (value === null) {
    return '-';
  }

  return value >= 100 || Number.isInteger(value)
    ? value.toString()
    : value.toFixed(3).replace(/0+$/u, '').replace(/\.$/u, '');
};

export const renderCatalog = (
  entries: readonly BenchmarkCatalogEntry[],
  modelCount: number,
  source: string,
  promptLength: z.infer<typeof PromptLengthSchema>,
): string => {
  const lines = [
    'Artificial Analysis - catalogo de benchmarks detectados',
    `Modelos analisados: ${modelCount}`,
    `Fonte da chave: ${source}`,
    `Prompt length: ${promptLength}`,
    '',
  ];

  for (const entry of entries) {
    lines.push(`${entry.key}  [${entry.label}]`);
    lines.push(`  escala: ${entry.scale}`);
    lines.push(`  modelos com campo: ${entry.modelsWithField}/${modelCount}`);
    lines.push(`  modelos com valor: ${entry.modelsWithValue}/${modelCount}`);
    lines.push(`  exemplo: ${formatExampleValue(entry.exampleValue)}`);
    lines.push(`  descricao: ${entry.description}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const { apiKey, source } = await resolveApiKey();
  const models = await fetchRawAAModels(apiKey, args.promptLength);
  const catalog = extractBenchmarkCatalog(models);

  if (catalog.length === 0) {
    throw new Error('Nenhum campo de benchmark foi encontrado em data[].evaluations.');
  }

  if (args.json) {
    writeStdoutLine(JSON.stringify({
      promptLength: args.promptLength,
      modelCount: models.length,
      source,
      benchmarks: catalog,
    }, null, 2));
    return;
  }

  writeStdoutLine(renderCatalog(catalog, models.length, source, args.promptLength));
};

const isExecutedDirectly = (): boolean => {
  const executedPath = process.argv[1];

  if (!executedPath) {
    return false;
  }

  return resolve(executedPath) === fileURLToPath(import.meta.url);
};

if (isExecutedDirectly()) {
  main().catch((error: unknown) => {
    writeStderrLine(error instanceof Error ? error.message : 'Erro desconhecido ao listar benchmarks da Artificial Analysis.');
    process.exitCode = 1;
  });
}
