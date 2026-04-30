#!/usr/bin/env node
/**
 * Dev entry point — renders the ModelSelector for visual testing.
 *
 * API keys are resolved automatically via the chain:
 *   1. CLI flag (`--openrouter-key=` / `--aa-key=`)
 *   2. Local `.env` file in CWD
 *   3. Process env (`OPENROUTER_API_KEY` / `ARTIFICIAL_ANALYSIS_API_KEY`)
 *   4. Global config (`~/.model-selector-ink/config.json`)
 *
 * Both keys are optional — OpenRouter falls back to the public endpoint and
 * Artificial Analysis simply skips benchmark enrichment when no key is found.
 *
 * Usage:
 *   npx tsx src/dev.tsx [--openrouter-key=<key>] [--aa-key=<key>] [--width=<value>] [--height=<value>]
 *
 * Size values:
 *   1-100    percentage of terminal size
 *   negative full terminal minus |value| (e.g. --height=-5 = all rows minus 5)
 */

import { render, Box, Text, useStdout } from 'ink';
import { ModelSelector } from './index.js';
import { resolveApiKeys } from './services/api-key-resolver.js';

// Parse a string flag from CLI args (e.g. --openrouter-key=value)
function parseStringFlag(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return undefined;
  const value = arg.slice(`--${name}=`.length);
  if (!value) return undefined;
  return value;
}

// Parse a numeric flag from CLI args (positive 1-100 or negative for offset)
function parseNumericFlag(name: string): number | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return undefined;
  const val = Number(arg.split('=')[1]);
  if (Number.isNaN(val) || val === 0 || val > 100) {
    console.error(`Invalid --${name} value (must be 1-100 or negative): ${arg.split('=')[1]}`);
    process.exit(1);
  }
  return val;
}

const resolved = resolveApiKeys({
  openRouterApiKey: parseStringFlag('openrouter-key'),
  artificialAnalysisApiKey: parseStringFlag('aa-key'),
});

const OPEN_ROUTER_KEY = resolved.openRouterApiKey;
const AA_KEY = resolved.artificialAnalysisApiKey;

const formatSource = (source?: string): string => {
  switch (source) {
    case 'explicit': return 'flag';
    case 'env-file': return '.env';
    case 'process-env': return 'env';
    case 'global-config': return 'global';
    default: return 'none';
  }
};

const widthPercent = parseNumericFlag('width');
const heightPercent = parseNumericFlag('height');

const App = () => {
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;

  return (
    <Box flexDirection="column" height={termHeight}>
      <Box paddingX={1} paddingY={1} borderStyle="double" borderColor="green" flexDirection="column">
        <Text bold color="green">model-selector-ink — dev mode</Text>
        <Box gap={2}>
          <Text dimColor>OpenRouter: {OPEN_ROUTER_KEY ? `set (${formatSource(resolved.sources.openRouter)})` : 'public (no key)'}</Text>
          <Text dimColor>AA: {AA_KEY ? `set (${formatSource(resolved.sources.artificialAnalysis)})` : 'disabled (no key)'}</Text>
          {(widthPercent || heightPercent) && (
            <Text dimColor>Size: {widthPercent !== undefined && widthPercent < 0 ? `${widthPercent}` : `${widthPercent ?? 100}%`}w x {heightPercent !== undefined && heightPercent < 0 ? `${heightPercent}` : `${heightPercent ?? 100}%`}h</Text>
          )}
        </Box>
      </Box>
      <ModelSelector
        openRouterApiKey={OPEN_ROUTER_KEY}
        artificialAnalysisApiKey={AA_KEY}
        widthPercent={widthPercent}
        heightPercent={heightPercent}
        onSelect={(model) => {
          console.clear();
          console.log('\n  Selected model:\n');
          console.log(`  ID:       ${model.id}`);
          console.log(`  Name:     ${model.name}`);
          console.log(`  Provider: ${model.provider}`);
          console.log(`  Context:  ${model.contextWindow}K`);
          console.log(`  Input:    $${model.inputPrice}/M tokens`);
          console.log(`  Output:   $${model.outputPrice}/M tokens`);
          console.log(`  Tools:    ${model.hasTools ? 'Yes' : 'No'}`);
          console.log(`  Reasoning:${model.hasReasoning ? ' Yes' : ' No'}`);
          if (model.aa.matched) {
            const b = model.aa.benchmarks;
            console.log(`  Intel:    ${b.intelligenceIndex ?? '-'}`);
            console.log(`  Coding:   ${b.codingIndex ?? '-'}`);
            console.log(`  Math:     ${b.mathIndex ?? '-'}`);
          }
          console.log('');
          process.exit(0);
        }}
        onCancel={() => {
          console.clear();
          console.log('\n  Cancelled.\n');
          process.exit(0);
        }}
        title="model-selector-ink demo"
      />
    </Box>
  );
};

render(<App />);
