#!/usr/bin/env node
/**
 * Dev entry point — renders the ModelSelector for visual testing.
 *
 * Required: both API keys must be provided (via flags or env vars).
 * Flags take priority over environment variables.
 *
 * Usage:
 *   npx tsx src/dev.tsx --openrouter-key=<key> --aa-key=<key> [--width=<value>] [--height=<value>]
 *
 * API key flags:
 *   --openrouter-key=<key>   OpenRouter API key (fallback: OPENROUTER_API_KEY env var)
 *   --aa-key=<key>           Artificial Analysis API key (fallback: ARTIFICIAL_ANALYSIS_API_KEY env var)
 *
 * Size values:
 *   1-100    percentage of terminal size
 *   negative full terminal minus |value| (e.g. --height=-5 = all rows minus 5)
 *
 * Examples:
 *   npx tsx src/dev.tsx --openrouter-key=sk-or-... --aa-key=aa-...
 *   OPENROUTER_API_KEY=sk-or-... ARTIFICIAL_ANALYSIS_API_KEY=aa-... npx tsx src/dev.tsx
 *   npx tsx src/dev.tsx --openrouter-key=sk-or-... --aa-key=aa-... --width=80 --height=70
 */

import { render, Box, Text, useStdout } from 'ink';
import { ModelSelector } from './index.js';

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

// Resolve API keys: flag > env var
const OPEN_ROUTER_KEY = parseStringFlag('openrouter-key') ?? process.env['OPENROUTER_API_KEY'];
const AA_KEY = parseStringFlag('aa-key') ?? process.env['ARTIFICIAL_ANALYSIS_API_KEY'];

// Validate required API keys
const missingKeys: string[] = [];
if (!OPEN_ROUTER_KEY) missingKeys.push('OpenRouter (--openrouter-key=<key> or OPENROUTER_API_KEY env var)');
if (!AA_KEY) missingKeys.push('Artificial Analysis (--aa-key=<key> or ARTIFICIAL_ANALYSIS_API_KEY env var)');

if (missingKeys.length > 0) {
  console.error('\n  ✖ Missing required API key(s):\n');
  for (const key of missingKeys) {
    console.error(`    • ${key}`);
  }
  console.error('\n  Provide them via CLI flags or environment variables.\n');
  console.error('  Example:');
  console.error('    npx tsx src/dev.tsx --openrouter-key=sk-or-... --aa-key=aa-...\n');
  process.exit(1);
}

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
          <Text dimColor>OpenRouter: {OPEN_ROUTER_KEY ? 'key set' : 'public (no key)'}</Text>
          <Text dimColor>AA: {AA_KEY ? 'key set' : 'disabled'}</Text>
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
