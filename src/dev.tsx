#!/usr/bin/env node
/**
 * Dev entry point — renders the ModelSelector for visual testing.
 * Usage: npx tsx src/dev.tsx [--width=<value>] [--height=<value>]
 *
 * Values:
 *   1-100    percentage of terminal size
 *   negative full terminal minus |value| (e.g. --height=-5 = all rows minus 5)
 *
 * Examples:
 *   npx tsx src/dev.tsx                     # full terminal
 *   npx tsx src/dev.tsx --width=50          # 50% width, full height
 *   npx tsx src/dev.tsx --height=60         # full width, 60% height
 *   npx tsx src/dev.tsx --width=80 --height=70
 *   npx tsx src/dev.tsx --height=-5         # full height minus 5 rows
 *   npx tsx src/dev.tsx --width=-10         # full width minus 10 columns
 */

import { render, Box, Text, useStdout } from 'ink';
import { ModelSelector } from './index.js';

const OPEN_ROUTER_KEY = process.env['OPENROUTER_API_KEY'];
const AA_KEY = process.env['ARTIFICIAL_ANALYSIS_API_KEY'];

// Parse --width=N and --height=N flags (positive 1-100 or negative for offset)
function parseFlag(name: string): number | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return undefined;
  const val = Number(arg.split('=')[1]);
  if (Number.isNaN(val) || val === 0 || val > 100) {
    console.error(`Invalid --${name} value (must be 1-100 or negative): ${arg.split('=')[1]}`);
    process.exit(1);
  }
  return val;
}

const widthPercent = parseFlag('width');
const heightPercent = parseFlag('height');

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
