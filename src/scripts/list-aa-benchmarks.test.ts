import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  extractBenchmarkCatalog,
  parseArgs,
  parseConfigApiKey,
  renderCatalog,
  resolveApiKeyFromSources,
} from './list-aa-benchmarks.js';

test('extractBenchmarkCatalog preserva campos desconhecidos da API', () => {
  const catalog = extractBenchmarkCatalog([
    {
      evaluations: {
        artificial_analysis_intelligence_index: 62.9,
        mmlu_pro: 0.791,
        terminal_bench_hard: 0.51,
      },
    },
    {
      evaluations: {
        artificial_analysis_intelligence_index: 55.2,
        terminal_bench_hard: null,
      },
    },
  ]);

  const unknownField = catalog.find((entry) => entry.key === 'terminal_bench_hard');
  assert.ok(unknownField);
  assert.equal(unknownField.label, 'Terminal Bench Hard');
  assert.equal(unknownField.modelsWithField, 2);
  assert.equal(unknownField.modelsWithValue, 1);
});

test('parseArgs aceita json e prompt-length explicitamente', () => {
  const parsed = parseArgs(['--prompt-length', 'long', '--json']);

  assert.deepEqual(parsed, {
    promptLength: 'long',
    json: true,
  });
});

test('parseArgs falha com mensagem amigavel quando prompt-length fica sem valor', () => {
  assert.throws(
    () => parseArgs(['--prompt-length']),
    /Uso invalido\.|Argumento invalido:/u,
  );
});

test('resolveApiKeyFromSources prioriza AA_API_KEY sobre a config', () => {
  const resolved = resolveApiKeyFromSources('env-aa-key', 'config-aa-key');

  assert.deepEqual(resolved, {
    apiKey: 'env-aa-key',
    source: 'AA_API_KEY',
  });
});

test('resolveApiKeyFromSources normaliza espacos da config', () => {
  const resolved = resolveApiKeyFromSources(undefined, '  config-aa-key  ');

  assert.deepEqual(resolved, {
    apiKey: 'config-aa-key',
    source: '/Users/fredericoguilhermekluserdeoliveira/.pi-dag-cli.json',
  });
});

test('parseConfigApiKey extrai a chave da config sem depender do restante do arquivo', () => {
  const apiKey = parseConfigApiKey(JSON.stringify({
    openrouterApiKey: 'sk-or-123',
    artificialAnalysisApiKey: 'aa-config-key',
    selectedAgents: {
      planner: 'openai/gpt-5.4',
      worker: 'openai/gpt-4.1-mini',
    },
  }));

  assert.equal(apiKey, 'aa-config-key');
});

test('CLI compilada falha com mensagem amigavel para uso invalido', () => {
  const currentTestFile = fileURLToPath(import.meta.url);
  const distScriptsDir = dirname(currentTestFile);
  const cliPath = join(distScriptsDir, 'list-aa-benchmarks.js');

  const result = spawnSync(process.execPath, [cliPath, '--prompt-length'], {
    encoding: 'utf-8',
    env: {},
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Uso invalido\.|Argumento invalido:/u);
});

test('renderCatalog inclui metadados essenciais no texto', () => {
  const output = renderCatalog([
    {
      key: 'gpqa',
      label: 'GPQA Diamond',
      scale: '0-1',
      description: 'Raciocinio cientifico em nivel de pos-graduacao.',
      modelsWithField: 10,
      modelsWithValue: 8,
      exampleValue: 0.748,
    },
  ], 12, 'AA_API_KEY', 'medium');

  assert.match(output, /GPQA Diamond/u);
  assert.match(output, /modelos com valor: 8\/12/u);
  assert.match(output, /Fonte da chave: AA_API_KEY/u);
});
