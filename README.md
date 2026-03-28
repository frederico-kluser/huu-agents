# model-selector-ink

Interactive terminal UI for selecting LLM models, powered by [Ink](https://github.com/vadimdemedes/ink) (React for CLI).

Loads models from [OpenRouter](https://openrouter.ai/), enriches them with benchmarks from [Artificial Analysis](https://artificialanalysis.ai/), and provides a full-featured interactive table with filtering, sorting, column toggling, and keyboard-driven selection.

## Features

- **OpenRouter integration** — Fetches available LLM models with pricing, context window, and capabilities
- **Artificial Analysis benchmarks** — Intelligence Index, Coding Index, Math Index, MMLU-Pro, GPQA, HLE, LiveCodeBench, SciCode, MATH-500, AIME, speed metrics
- **Composite filters** — Pipe-separated syntax: `$Intel>=40|$MMLU>=70|openai|google` (metrics AND'd, text OR'd)
- **Preset filters** — Quick toggles: all, has-benchmarks, high-intel, best-value, fast
- **Sort by any metric** — Interactive modal for choosing sort criterion and direction
- **Column selector** — Toggle benchmark/speed columns on/off
- **Filter builder modal** — Visual rule editor with live preview
- **Offline cache** — 4-level hierarchy: memory → disk (24h TTL) → bundled fallback → API fetch
- **Configurable cache path** — Avoid collisions when used in multiple projects

## Installation

```bash
npm install model-selector-ink
```

### Peer Dependencies

```json
{
  "ink": "^6.0.0",
  "ink-text-input": "^6.0.0",
  "react": "^18.0.0 || ^19.0.0",
  "zod": "^3.20.0"
}
```

## Quick Start

```tsx
import React from 'react';
import { render } from 'ink';
import { ModelSelector } from 'model-selector-ink';

function App() {
  return (
    <ModelSelector
      openRouterApiKey="sk-or-..."
      artificialAnalysisApiKey="aa-..."
      onSelect={(model) => {
        console.log(`Selected: ${model.id}`);
        process.exit(0);
      }}
      onCancel={() => process.exit(0)}
      title="Select a model"
    />
  );
}

render(<App />);
```

## Components

### `<ModelSelector>` — High-level container

The main entry point. Handles loading, enrichment, caching, and rendering.

| Prop | Type | Description |
|------|------|-------------|
| `openRouterApiKey` | `string?` | OpenRouter API key (optional, improves rate limits) |
| `artificialAnalysisApiKey` | `string?` | AA API key (optional, enables benchmarks) |
| `onSelect` | `(model: EnrichedModel) => void` | Called when a model is selected |
| `onCancel` | `() => void?` | Called on ESC |
| `title` | `string?` | Title above the table |

### `<EnhancedModelTable>` — Low-level table

For advanced usage when you manage data loading yourself.

| Prop | Type | Description |
|------|------|-------------|
| `models` | `EnrichedModel[]` | Pre-enriched model data |
| `onSelect` | `(model: EnrichedModel) => void` | Selection callback |
| `hasAAData` | `boolean?` | Show benchmark columns |
| `onCancel` | `() => void?` | ESC callback |
| `onRefresh` | `() => void?` | Refresh callback (u key) |
| `refreshing` | `boolean?` | Show refreshing state |
| `cacheAge` | `number?` | Cache timestamp for display |
| `title` | `string?` | Title above the table |

## Hooks

### `useModels(apiKey?)`

Loads OpenRouter models with cache fallback chain.

```ts
const { state, reload, forceRefresh } = useModels('sk-or-...');
// state: { status: 'loading' } | { status: 'loaded', models, cacheAge } | { status: 'error', error }
```

### `useArtificialAnalysis(apiKey?)`

Loads AA benchmarks with cache fallback chain.

```ts
const { state, reload, forceRefresh } = useArtificialAnalysis('aa-...');
// state: { status: 'idle' } | { status: 'loading' } | { status: 'loaded', models, cacheAge } | { status: 'error', error }
```

## Data Utilities

### `buildEnrichedModels(orModels, aaModels)`

Combines OpenRouter models with AA benchmarks via name-based matching.

### `parseFilterString(input)`

Parses composite filter syntax into structured rules.

```ts
parseFilterString('$Intel>=40|gpt|anthropic');
// [{ type: 'metric', metric: 'intel', operator: '>=', value: 40 },
//  { type: 'text', value: 'gpt' },
//  { type: 'text', value: 'anthropic' }]
```

### `applyFilters(models, rules)`

Applies filter rules: metrics AND'd, text OR'd.

## Cache Configuration

By default, disk cache is stored at `~/.model-selector-ink/benchmark-cache.json`.

To customize:

```ts
import { configureCachePaths } from 'model-selector-ink';

// Use a different namespace under home dir
configureCachePaths({ namespace: '.my-app' });

// Or use an absolute path
configureCachePaths({ cacheDir: '/tmp/my-cache' });
```

Call `configureCachePaths()` before rendering any components.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑↓` | Navigate rows |
| `<>` | Page up/down |
| `←→` | Scroll columns horizontally |
| `s` | Open sort selector |
| `S` | Toggle sort direction |
| `c` | Open column selector |
| `f` | Type filter text |
| `F` | Open filter builder modal |
| `p` | Cycle preset filters |
| `u` | Refresh data from APIs |
| `Enter` | Select model |
| `ESC` | Cancel / close modal |

## Filter Syntax

```
$MetricName>=value|$Other<=val|text_search
```

- `$` prefix: metric filter (case-insensitive)
- No `$`: text search (name, provider, id, tokenizer)
- `|` (pipe): separates segments

**Semantics**: Metric filters are AND'd. Text filters are OR'd. Both groups are AND'd together.

**Available metrics**: `intel`, `code`, `math`, `mmlu`, `gpqa`, `hle`, `lcb`, `sci`, `m500`, `aime`, `tok`, `ttft`, `i/$`, `in`, `out`, `ctx`

**Operators**: `>=`, `<=`, `>`, `<`, `==`

## Types

Key types exported:

- `EnrichedModel` — Full model with OpenRouter data + AA benchmarks
- `ModelEntry` — Normalized OpenRouter model
- `AABenchmarks`, `AASpeed`, `AAPricing` — AA data subsets
- `FilterRule`, `TextFilterRule`, `MetricFilterRule` — Filter system
- `ColumnDef`, `SortKey`, `FilterMode` — Table column definitions

## License

MIT
