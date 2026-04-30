/**
 * model-selector-ink — Interactive Ink/TUI model selector
 * with OpenRouter + Artificial Analysis integration.
 *
 * @module
 * @example
 * ```tsx
 * import { ModelSelector } from 'model-selector-ink';
 *
 * <ModelSelector
 *   openRouterApiKey="sk-or-..."
 *   artificialAnalysisApiKey="aa-..."
 *   onSelect={(model) => console.log(model.id)}
 *   title="Select a model"
 * />
 * ```
 */

// ── Main container ──────────────────────────────────────────────────

export { ModelSelector } from './components/model-selector.js';
export type { ModelSelectorProps } from './components/model-selector.js';

// ── Table component (for advanced usage) ────────────────────────────

export { EnhancedModelTable } from './components/enhanced-model-table.js';
export type { EnhancedModelTableProps } from './components/enhanced-model-table.js';

// ── Modal components ────────────────────────────────────────────────

export { FilterBuilderModal } from './components/filter-builder-modal.js';
export type { FilterBuilderModalProps } from './components/filter-builder-modal.js';

export { ColumnSelectorModal } from './components/column-selector-modal.js';
export type { ColumnSelectorModalProps } from './components/column-selector-modal.js';

export { SortSelectorModal } from './components/sort-selector-modal.js';
export type { SortSelectorModalProps } from './components/sort-selector-modal.js';

// ── Hooks ───────────────────────────────────────────────────────────

export { useModels } from './hooks/use-models.js';
export type { ModelsState } from './hooks/use-models.js';

export { useArtificialAnalysis } from './hooks/use-artificial-analysis.js';
export type { AAState } from './hooks/use-artificial-analysis.js';

// ── Data types ──────────────────────────────────────────────────────

export type { EnrichedModel, AABenchmarks, AASpeed, AAPricing } from './data/enriched-model.js';
export type { ModelEntry } from './data/models.js';
export type { OpenRouterModel, FetchModelsResult, FetchModelsOptions } from './data/openrouter-client.js';
export type { AAModel, AAEvaluations, FetchAAResult } from './data/artificial-analysis-client.js';

// ── Data utilities ──────────────────────────────────────────────────

export { buildEnrichedModels } from './data/enriched-model.js';
export { toModelEntry, loadModels, getModelsCached, findModel, formatPrice, formatContext } from './data/models.js';
export { fetchOpenRouterModels, tokenPriceToPerMillion, extractProviderName } from './data/openrouter-client.js';
export { fetchAAModels, normalizeAAName } from './data/artificial-analysis-client.js';

// ── Filter utilities ────────────────────────────────────────────────

export { parseFilterString, serializeFilters, applyFilters, AVAILABLE_METRICS } from './components/filter-parser.js';
export type { FilterRule, TextFilterRule, MetricFilterRule, MetricOperator } from './components/filter-parser.js';

// ── Column definitions ──────────────────────────────────────────────

export {
  COLUMNS, METRIC_COLUMNS, DEFAULT_VISIBLE_METRICS,
  FILTER_LABELS, FILTER_CYCLE,
  pad, padR,
} from './components/table-columns.js';
export type { ColumnDef, SortKey, FilterMode } from './components/table-columns.js';

// ── Cache configuration ─────────────────────────────────────────────

export { configureCachePaths, formatCacheAge, isDiskCacheFresh } from './services/offline-benchmark-cache.js';
export type { CacheConfig, BenchmarkCache } from './services/offline-benchmark-cache.js';

// ── API key resolution & global config ─────────────────────────────

export { resolveApiKeys, clearEnvFileCache } from './services/api-key-resolver.js';
export type { ResolvedApiKeys, ResolveOptions, ApiKeySource } from './services/api-key-resolver.js';

export {
  loadGlobalConfig,
  loadGlobalConfigSync,
  saveGlobalConfig,
  getGlobalConfigPath,
} from './services/global-config.js';
export type { GlobalConfig } from './services/global-config.js';
