# model-selector-ink

Interactive terminal UI for selecting LLM models, powered by [Ink](https://github.com/vadimdemedes/ink).

This package loads live model metadata from [OpenRouter](https://openrouter.ai/), optionally enriches it with benchmarks from [Artificial Analysis](https://artificialanalysis.ai/), and renders an interactive table with filtering, sorting, column toggling, presets, and keyboard-driven selection.

It is a library, not a standalone CLI binary.

## What You Get

- Live OpenRouter model catalog with normalized pricing and context window
- Optional Artificial Analysis enrichment with intelligence, coding, math, speed, and price-performance metrics
- High-level drop-in component for most apps: `ModelSelector`
- Low-level table component for custom loading flows: `EnhancedModelTable`
- Reusable hooks and raw fetch utilities for building your own UX
- Offline-first cache chain with bundled fallback data for degraded or first-run scenarios
- Fully typed exports for components, hooks, utilities, cache helpers, and data models

## Runtime Requirements

- Node.js `>=20`
- ESM runtime only
- A real terminal/TTY environment supported by Ink
- React `18` or `19`

This package is published as ESM. If your app still uses CommonJS, switch the entrypoint to ESM or load it from an ESM boundary.

## Installation

Install the package plus its peer dependencies:

```bash
npm install model-selector-ink ink ink-text-input react zod
```

Peer dependency versions expected by the package:

```json
{
  "ink": "^6.0.0",
  "ink-text-input": "^6.0.0",
  "react": "^18.0.0 || ^19.0.0",
  "zod": "^3.20.0 || ^4.0.0"
}
```

If your project does not already run as ESM, add this to `package.json`:

```json
{
  "type": "module"
}
```

## Quick Start

### Smallest Working Example

OpenRouter access is optional. The OpenRouter models endpoint is public, so the component can still work without a key, although a key helps with rate limits.

```tsx
import React from 'react';
import { render } from 'ink';
import { ModelSelector } from 'model-selector-ink';

const App = () => {
  return (
    <ModelSelector
      title="Select a model"
      onSelect={(model) => {
        console.clear();
        console.log(`Selected: ${model.id}`);
        process.exit(0);
      }}
      onCancel={() => process.exit(0)}
    />
  );
};

render(<App />);
```

### Example With Both APIs

```tsx
import React from 'react';
import { render } from 'ink';
import { ModelSelector } from 'model-selector-ink';

const App = () => {
  return (
    <ModelSelector
      openRouterApiKey={process.env.OPENROUTER_API_KEY}
      artificialAnalysisApiKey={process.env.ARTIFICIAL_ANALYSIS_API_KEY}
      title="Choose the best model"
      onSelect={(model) => {
        console.clear();
        console.log(JSON.stringify(model, null, 2));
        process.exit(0);
      }}
      onCancel={() => {
        console.clear();
        process.exit(0);
      }}
    />
  );
};

render(<App />);
```

### Controlling Component Size

By default the component uses 100% of the terminal width and height. Use `widthPercent` and `heightPercent` to constrain it to a fraction of the available space. Values are clamped to the range `1-100` and the component enforces minimum dimensions of 40 columns and 10 rows to prevent broken layouts.

```tsx
import React from 'react';
import { render } from 'ink';
import { ModelSelector } from 'model-selector-ink';

const App = () => {
  return (
    <ModelSelector
      widthPercent={60}
      heightPercent={75}
      title="Compact selector"
      onSelect={(model) => {
        console.log(model.id);
        process.exit(0);
      }}
      onCancel={() => process.exit(0)}
    />
  );
};

render(<App />);
```

Both props work independently. You can constrain only one axis:

```tsx
// Half the terminal width, full height
<ModelSelector widthPercent={50} onSelect={handleSelect} />

// Full width, 60% of the terminal height
<ModelSelector heightPercent={60} onSelect={handleSelect} />

// Both constrained
<ModelSelector widthPercent={80} heightPercent={70} onSelect={handleSelect} />
```

The same props are available on `EnhancedModelTable` for advanced usage:

```tsx
<EnhancedModelTable
  models={enriched}
  hasAAData={true}
  widthPercent={50}
  heightPercent={50}
  onSelect={handleSelect}
/>
```

## Which API Should You Use?

| Goal | Use |
|------|-----|
| I want a ready-to-use interactive selector | `ModelSelector` |
| I already load my own model data and only want the table UI | `EnhancedModelTable` |
| I want React hooks for OpenRouter and AA data | `useModels`, `useArtificialAnalysis` |
| I want to fetch raw API data manually | `fetchOpenRouterModels`, `fetchAAModels`, `loadModels` |
| I want to build my own filter UI | `parseFilterString`, `serializeFilters`, `applyFilters`, `AVAILABLE_METRICS` |
| I want to customize cache storage | `configureCachePaths` |

## High-Level Data Flow

```text
OpenRouter API/public endpoint
  -> normalize into ModelEntry
  -> optionally load Artificial Analysis data
  -> merge into EnrichedModel by normalized name matching
  -> render interactive table
  -> return selected EnrichedModel through onSelect
```

## Public API

### `ModelSelector`

High-level container. It handles loading, enrichment, cache fallback, refresh, and rendering.

| Prop | Type | Description |
|------|------|-------------|
| `openRouterApiKey` | `string | undefined` | Optional OpenRouter key. The endpoint is public, but a key improves rate limits. |
| `artificialAnalysisApiKey` | `string | undefined` | Optional AA key. Enables live AA fetches. Offline/bundled AA data may still appear without a key. |
| `onSelect` | `(model: EnrichedModel) => void` | Called when the user presses `Enter` on a row. |
| `onCancel` | `() => void` | Optional callback fired on `ESC`. |
| `title` | `string | undefined` | Optional title shown above the table. |
| `widthPercent` | `number | undefined` | Percentage of terminal width to use (1-100, default: 100). |
| `heightPercent` | `number | undefined` | Percentage of terminal height to use (1-100, default: 100). |

Behavior:

- Loads OpenRouter models first
- Loads AA data if available from cache or API
- Merges both sources into `EnrichedModel[]`
- Exposes a unified refresh action on `u`
- Shows loading and error messages in Portuguese

### `EnhancedModelTable`

Low-level interactive table. Use this when you already manage loading yourself.

| Prop | Type | Description |
|------|------|-------------|
| `models` | `readonly EnrichedModel[]` | Pre-enriched models to render. |
| `onSelect` | `(model: EnrichedModel) => void` | Called when the user selects a row. |
| `title` | `string | undefined` | Optional table title. |
| `hasAAData` | `boolean | undefined` | Controls whether AA metric columns are available. |
| `onCancel` | `() => void` | Optional `ESC` handler. |
| `onRefresh` | `() => void` | Optional refresh handler triggered by `u`. |
| `refreshing` | `boolean | undefined` | When true, the footer shows `atualizando...`. |
| `cacheAge` | `number | null | undefined` | Epoch timestamp used to display cache freshness in the footer. Despite the name, this is a timestamp, not a duration. |
| `widthPercent` | `number | undefined` | Percentage of terminal width to use (1-100, default: 100). |
| `heightPercent` | `number | undefined` | Percentage of terminal height to use (1-100, default: 100). |

Default interaction state inside the table:

- Sort key starts at `inputPrice`
- Sort direction starts ascending
- All metric columns start visible when AA data exists
- Text filter input starts empty
- Preset filter starts at `none`

### Modal Components

These are exported as building blocks for advanced custom flows.

#### `FilterBuilderModal`

| Prop | Type | Description |
|------|------|-------------|
| `filterText` | `string` | Existing pipe-separated filter string. |
| `onClose` | `(newFilterText: string) => void` | Receives the serialized filter string when closing. |
| `maxHeight` | `number | undefined` | Optional maximum visible height. |

#### `ColumnSelectorModal`

| Prop | Type | Description |
|------|------|-------------|
| `visibleKeys` | `ReadonlySet<string>` | Set of currently visible metric column keys. |
| `onClose` | `(newVisibleKeys: ReadonlySet<string>) => void` | Receives the updated set on close. |

#### `SortSelectorModal`

| Prop | Type | Description |
|------|------|-------------|
| `columns` | `readonly ColumnDef[]` | Sortable columns currently available. |
| `currentKey` | `string` | Current sort key. |
| `ascending` | `boolean` | Current sort direction. |
| `onSelect` | `(key: string, ascending: boolean) => void` | Called when a sort is chosen. |
| `onCancel` | `() => void` | Close callback. |

## Hooks

### `useModels(apiKey?)`

Loads normalized OpenRouter models with cache fallback.

```ts
const { state, reload, forceRefresh } = useModels(process.env.OPENROUTER_API_KEY);
```

Returned state:

```ts
type ModelsState =
  | { status: 'loading' }
  | { status: 'loaded'; models: readonly ModelEntry[]; cacheAge: number | null }
  | { status: 'error'; error: string };
```

Semantics:

- `reload()` fetches again without manually invalidating cache
- `forceRefresh()` invalidates the in-memory cache and then fetches again
- `cacheAge` is an epoch timestamp when data came from disk or bundled cache
- `cacheAge` is `null` when state came directly from live in-memory cache

### `useArtificialAnalysis(apiKey?)`

Loads AA data with cache fallback.

```ts
const { state, reload, forceRefresh } = useArtificialAnalysis(process.env.ARTIFICIAL_ANALYSIS_API_KEY);
```

Returned state:

```ts
type AAState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; models: readonly AAModel[]; cacheAge: number | null }
  | { status: 'error'; error: string };
```

Important behavior:

- If no AA key is provided, the hook may still return cached or bundled AA data
- If no AA key exists and no offline AA data is available, state becomes `idle`
- `forceRefresh()` returns `false` immediately when no AA key is provided

## Advanced Usage Example

Use the hooks directly when you want to keep rendering, refresh policies, or selection flow under your own control.

```tsx
import React, { useMemo } from 'react';
import { render } from 'ink';
import {
  EnhancedModelTable,
  buildEnrichedModels,
  useArtificialAnalysis,
  useModels,
} from 'model-selector-ink';

const App = () => {
  const { state: modelsState, forceRefresh: refreshModels } = useModels(process.env.OPENROUTER_API_KEY);
  const { state: aaState, forceRefresh: refreshAA } = useArtificialAnalysis(process.env.ARTIFICIAL_ANALYSIS_API_KEY);

  const enriched = useMemo(() => {
    if (modelsState.status !== 'loaded') return [];
    const aaModels = aaState.status === 'loaded' ? aaState.models : [];
    return buildEnrichedModels(modelsState.models, aaModels);
  }, [modelsState, aaState]);

  if (modelsState.status === 'loading') {
    return null;
  }

  if (modelsState.status === 'error') {
    throw new Error(modelsState.error);
  }

  return (
    <EnhancedModelTable
      title="Custom model table"
      models={enriched}
      hasAAData={aaState.status === 'loaded' && aaState.models.length > 0}
      cacheAge={modelsState.cacheAge}
      onSelect={(model) => {
        console.log(model.id);
        process.exit(0);
      }}
      onCancel={() => process.exit(0)}
      onRefresh={async () => {
        await refreshModels();
        await refreshAA();
      }}
    />
  );
};

render(<App />);
```

## Data Model Shape

### `ModelEntry`

Normalized OpenRouter model shape.

```ts
interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  inputPrice: number;
  outputPrice: number;
  maxCompletionTokens: number;
  hasTools: boolean;
  hasReasoning: boolean;
  isModerated: boolean;
  modality: string;
  tokenizer: string;
  description: string;
  createdAt: string;
  supportedParams: readonly string[];
}
```

### `EnrichedModel`

`EnrichedModel` extends `ModelEntry` and adds an `aa` object.

```ts
interface EnrichedModel extends ModelEntry {
  aa: {
    matched: boolean;
    creatorSlug: string | null;
    benchmarks: {
      intelligenceIndex: number | null;
      codingIndex: number | null;
      mathIndex: number | null;
      mmluPro: number | null;
      gpqa: number | null;
      hle: number | null;
      livecodebench: number | null;
      scicode: number | null;
      math500: number | null;
      aime: number | null;
    };
    speed: {
      outputTokensPerSecond: number | null;
      timeToFirstToken: number | null;
      timeToFirstAnswerToken: number | null;
    };
    pricing: {
      blended3to1: number | null;
      inputPerMillion: number | null;
      outputPerMillion: number | null;
    };
  };
}
```

When a model does not match any AA entry, `aa.matched` is `false` and all AA fields are `null`.

## Filter System

### Syntax

```text
$MetricName>=value|$Other<=value|text_search
```

Rules:

- A segment starting with `$` is a metric rule
- A segment without `$` is a text rule
- Segments are split by `|`
- Parsing is case-insensitive for metric aliases

### Semantics

- Metric rules are combined with `AND`
- Text rules are combined with `OR`
- The metric group and text group are combined with `AND`

Example:

```text
$intel>=40|$mmlu>=70|openai|anthropic
```

This means:

- keep only models with `intel >= 40`
- keep only models with `mmlu >= 70`
- then keep only models whose text fields match either `openai` or `anthropic`

### Text Search Fields

Text rules search across:

- `name`
- `provider`
- `id`
- `tokenizer`
- `aa.creatorSlug`

### Available Metric Aliases

The package exports `AVAILABLE_METRICS`:

```ts
['intel', 'code', 'math', 'mmlu', 'gpqa', 'hle', 'lcb', 'sci', 'm500', 'aime', 'tok', 'ttft', 'i/$', 'in', 'out', 'ctx']
```

Practical meaning of each alias:

| Alias | Meaning | Unit |
|-------|---------|------|
| `intel` | Artificial Analysis Intelligence Index | 0-100 |
| `code` | Artificial Analysis Coding Index | 0-100 |
| `math` | Artificial Analysis Math Index | 0-100 |
| `mmlu` | MMLU-Pro | displayed and filtered as 0-100 |
| `gpqa` | GPQA | displayed and filtered as 0-100 |
| `hle` | Humanity's Last Exam | displayed and filtered as 0-100 |
| `lcb` | LiveCodeBench | displayed and filtered as 0-100 |
| `sci` | SciCode | displayed and filtered as 0-100 |
| `m500` | MATH-500 | displayed and filtered as 0-100 |
| `aime` | AIME | displayed and filtered as 0-100 |
| `tok` | Output tokens per second | tokens/sec |
| `ttft` | Time to first token | seconds |
| `i/$` | Intelligence divided by blended price | ratio |
| `in` | Input price | USD per 1M tokens |
| `out` | Output price | USD per 1M tokens |
| `ctx` | Context window | K tokens |

For `mmlu`, `gpqa`, `hle`, `lcb`, `sci`, `m500`, and `aime`, the underlying AA values are stored as `0-1`, but the filter parser automatically scales them to `0-100` for user-facing filtering.

### Operators

Supported metric operators:

```text
>=  <=  >  <  ==
```

### Utility Functions

```ts
import {
  parseFilterString,
  serializeFilters,
  applyFilters,
  AVAILABLE_METRICS,
} from 'model-selector-ink';
```

Example:

```ts
const rules = parseFilterString('$Intel>=40|gpt|anthropic');

// [
//   { type: 'metric', metric: 'intel', operator: '>=', value: 40 },
//   { type: 'text', value: 'gpt' },
//   { type: 'text', value: 'anthropic' },
// ]

const filtered = applyFilters(models, rules);
const roundTrip = serializeFilters(rules);
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑↓` | Move between rows or modal items |
| `<>` or `,.` | Page up/down |
| `PageUp/PageDown` | Page up/down |
| `←→` | Horizontal column scroll |
| `s` | Open sort selector |
| `S` | Toggle sort direction |
| `c` | Open column selector |
| `f` | Enter inline filter input |
| `F` | Open filter builder modal |
| `p` | Cycle preset filters |
| `u` | Refresh from APIs |
| `Enter` | Select current row |
| `ESC` | Cancel or close the active modal |

Preset filter cycle:

- `none`
- `has-benchmarks`
- `high-intel`
- `best-value`
- `fast`

The package exports the preset metadata as `FILTER_LABELS` and `FILTER_CYCLE`.

## Cache and Offline Behavior

Default disk cache location:

```text
~/.model-selector-ink/benchmark-cache.json
```

Configure it before rendering any component or calling cache-backed APIs:

```ts
import { configureCachePaths } from 'model-selector-ink';

configureCachePaths({ namespace: '.my-app' });
// or
configureCachePaths({ cacheDir: '/tmp/my-cache' });
```

Important notes:

- `configureCachePaths()` changes module-level global state
- Call it once during app startup
- If both `namespace` and `cacheDir` are provided, `cacheDir` wins

### Cache Hierarchy

The real fallback chain is:

```text
1. In-memory cache
   - OpenRouter TTL: 1 hour
   - Artificial Analysis TTL: 24 hours

2. Global disk cache
   - TTL: 24 hours

3. Bundled fallback data
   - src/data/bundled-benchmarks.json included in the package

4. Live API fetch

5. Stale disk cache
   - used only as a last resort when API fetch fails
```

Helpers exported for cache work:

- `configureCachePaths(config)`
- `formatCacheAge(timestamp)`
- `isDiskCacheFresh(timestamp)`

## OpenRouter Fetch Defaults

By default, the OpenRouter loader does not expose the entire catalog. It filters results before normalization.

Default behavior in `fetchOpenRouterModels()` and `loadModels()`:

- only text-output models are kept
- only models created on or after `2025-01-01` are kept
- free variants ending in `:free` are excluded
- zero-priced models are excluded unless configured otherwise
- final results are sorted by input price ascending

Override those defaults with `FetchModelsOptions`:

```ts
import { loadModels } from 'model-selector-ink';

const result = await loadModels(process.env.OPENROUTER_API_KEY, {
  minCreatedTimestamp: 0,
  excludeFreeVariants: false,
  requirePricing: false,
});
```

## Raw Data Utilities

These are useful if you want the library's normalization and filtering logic without using the UI components.

### OpenRouter Utilities

- `fetchOpenRouterModels(apiKey?, options?)`
- `loadModels(apiKey?, options?)`
- `toModelEntry(rawModel)`
- `getModelsCached()`
- `findModel(id)`
- `tokenPriceToPerMillion(pricePerToken)`
- `extractProviderName(modelId)`
- `formatPrice(price)`
- `formatContext(kTokens)`

### Artificial Analysis Utilities

- `fetchAAModels(apiKey, promptLength?)`
- `normalizeAAName(name)`

`fetchAAModels()` accepts a second argument:

```ts
await fetchAAModels(apiKey, 'medium');
await fetchAAModels(apiKey, 'long');
await fetchAAModels(apiKey, '100k');
```

## Exported Types and Constants

Main exported types:

- `ModelSelectorProps`
- `EnhancedModelTableProps`
- `FilterBuilderModalProps`
- `ColumnSelectorModalProps`
- `SortSelectorModalProps`
- `EnrichedModel`
- `ModelEntry`
- `AABenchmarks`
- `AASpeed`
- `AAPricing`
- `AAModel`
- `AAEvaluations`
- `OpenRouterModel`
- `FetchModelsResult`
- `FetchModelsOptions`
- `FetchAAResult`
- `FilterRule`
- `TextFilterRule`
- `MetricFilterRule`
- `MetricOperator`
- `ColumnDef`
- `SortKey`
- `FilterMode`
- `CacheConfig`
- `BenchmarkCache`

Main exported constants:

- `AVAILABLE_METRICS`
- `COLUMNS`
- `METRIC_COLUMNS`
- `DEFAULT_VISIBLE_METRICS`
- `FILTER_LABELS`
- `FILTER_CYCLE`

## Notes for AI Agents and Tooling Authors

If you are generating integrations automatically, the safest mental model is:

- `ModelSelector` is the default entrypoint for end-user interactive selection
- `EnhancedModelTable` expects already enriched data and does not fetch on its own
- `EnrichedModel` is the stable selection payload returned to consumers
- AA enrichment is optional and partial; always handle `null` metrics
- Cache configuration is global module state, so set it once before importing complex flows in tests or worker pools
- UI copy is currently hardcoded in Portuguese for loading, errors, hints, and modal labels
- This package targets terminal UIs only; do not attempt to render it in a browser runtime
- Matching between OpenRouter and Artificial Analysis is heuristic and name-based, not ID-perfect

Suggested implementation order for agents:

1. Decide whether you need a drop-in selector or only data utilities.
2. If you want the ready-made UX, use `ModelSelector`.
3. If you want a custom flow, load `ModelEntry[]`, fetch `AAModel[]`, merge with `buildEnrichedModels()`, then render `EnhancedModelTable`.
4. Treat every AA field as nullable even when `aa.matched === true`.
5. If you parse user filter input, validate against `AVAILABLE_METRICS` instead of hardcoding metric names.

## Troubleshooting

### No models are shown

Check these first:

- You are running in a real interactive terminal
- Your runtime is Node `>=20`
- Your app is ESM
- OpenRouter returned models that survive the default filters for date, price, and `:free` exclusion

### Benchmarks do not appear

Possible reasons:

- No AA key was provided and no bundled/disk AA data was available
- Name-based matching found no AA entry for those models
- The table received `hasAAData={false}` in a custom integration

### My CommonJS project cannot import the package

This package is ESM-only. Move the entrypoint to ESM or load it from an ESM boundary.

### The UI language is not English

Current UI labels and status messages are hardcoded in Portuguese. There is no public localization API yet.

## Development

Local scripts:

```bash
npm run build
npm run dev
npm run lint
npm run typecheck
```

Development entrypoint:

```bash
OPENROUTER_API_KEY=sk-or-... ARTIFICIAL_ANALYSIS_API_KEY=aa-... npm run dev
```

The dev entrypoint supports `--width` and `--height` flags to test the sizing feature:

```bash
# Full terminal (default)
npm run dev

# 50% of the terminal width
npm run dev -- --width=50

# 60% of the terminal height
npm run dev -- --height=60

# Both constrained
npm run dev -- --width=80 --height=70
```

Values must be between 1 and 100. The dev header displays the configured size when any flag is set.

`npm run build` compiles TypeScript and copies `src/data/bundled-benchmarks.json` into `dist/data/`.

## License

MIT
