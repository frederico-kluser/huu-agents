#!/usr/bin/env node
/**
 * Dev entry point — renders the ModelSelector for visual testing.
 * Usage: npx tsx src/dev.tsx
 */

import { render, Box, Text } from 'ink';
import { ModelSelector } from './index.js';

const OPEN_ROUTER_KEY = process.env['OPENROUTER_API_KEY'];
const AA_KEY = process.env['ARTIFICIAL_ANALYSIS_API_KEY'];

const App = () => {
  return (
    <Box flexDirection="column">
      <Box paddingX={1} paddingY={1} borderStyle="double" borderColor="green" flexDirection="column">
        <Text bold color="green">model-selector-ink — dev mode</Text>
        <Box gap={2}>
          <Text dimColor>OpenRouter: {OPEN_ROUTER_KEY ? 'key set' : 'public (no key)'}</Text>
          <Text dimColor>AA: {AA_KEY ? 'key set' : 'disabled'}</Text>
        </Box>
      </Box>
      <ModelSelector
        openRouterApiKey={OPEN_ROUTER_KEY}
        artificialAnalysisApiKey={AA_KEY}
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
