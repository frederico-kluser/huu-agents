/**
 * Container de alto nivel para selecao de modelos LLM.
 * Encapsula o padrao completo: carregamento OpenRouter + AA,
 * enriquecimento, cache, refresh unificado e tabela interativa.
 *
 * Recebe API keys e callbacks por props, sem dependencia de config global.
 *
 * @module
 */

import { useMemo, useCallback, useState } from 'react';
import { Box, Text } from 'ink';
import type { EnrichedModel } from '../data/enriched-model.js';
import { buildEnrichedModels } from '../data/enriched-model.js';
import { useModels } from '../hooks/use-models.js';
import { useArtificialAnalysis } from '../hooks/use-artificial-analysis.js';
import { resolveApiKeys } from '../services/api-key-resolver.js';
import { EnhancedModelTable } from './enhanced-model-table.js';

// ── Props ───────────────────────────────────────────────────────────

export interface ModelSelectorProps {
  /** OpenRouter API key (optional — public endpoint, but improves rate limits) */
  readonly openRouterApiKey?: string;
  /** Artificial Analysis API key (optional — enables benchmarks) */
  readonly artificialAnalysisApiKey?: string;
  /** Callback when a model is selected */
  readonly onSelect: (model: EnrichedModel) => void;
  /** Callback when selection is cancelled (ESC) */
  readonly onCancel?: () => void;
  /** Title displayed above the table */
  readonly title?: string;
  /**
   * Controls the component width.
   * - Positive (1-100): percentage of terminal width
   * - Negative: full terminal width minus |value| columns (e.g. -10 = all columns minus 10)
   * - undefined or 100: full terminal width (default)
   */
  readonly widthPercent?: number;
  /**
   * Controls the component height.
   * - Positive (1-100): percentage of terminal height
   * - Negative: full terminal height minus |value| rows (e.g. -5 = all rows minus 5)
   * - undefined or 100: full terminal height (default)
   */
  readonly heightPercent?: number;
}

/**
 * Ready-to-use Ink component for interactive LLM model selection.
 *
 * Handles the full lifecycle:
 * 1. Loads models from OpenRouter (with cache fallback)
 * 2. Loads benchmarks from Artificial Analysis (optional)
 * 3. Enriches models with AA data via name-based matching
 * 4. Renders interactive table with filters, sorting, modals
 * 5. Returns selected model via onSelect callback
 *
 * @example
 * ```tsx
 * <ModelSelector
 *   openRouterApiKey="sk-or-..."
 *   artificialAnalysisApiKey="aa-..."
 *   onSelect={(model) => console.log(model.id)}
 *   onCancel={() => process.exit(0)}
 *   title="Selecione um modelo"
 * />
 * ```
 */
export const ModelSelector = ({
  openRouterApiKey,
  artificialAnalysisApiKey,
  onSelect,
  onCancel,
  title,
  widthPercent,
  heightPercent,
}: ModelSelectorProps) => {
  // Quando uma key nao vier por prop, resolve via cadeia: .env > process.env > config global.
  // Permite que consumidores instalem o pacote e nao precisem repetir keys em cada projeto.
  const resolved = useMemo(
    () =>
      resolveApiKeys({
        openRouterApiKey,
        artificialAnalysisApiKey,
      }),
    [openRouterApiKey, artificialAnalysisApiKey],
  );

  const { state: modelsState, forceRefresh: refreshModels } = useModels(resolved.openRouterApiKey);
  const { state: aaState, forceRefresh: refreshAA } = useArtificialAnalysis(resolved.artificialAnalysisApiKey);
  const [refreshing, setRefreshing] = useState(false);

  // Enrich OR models with AA benchmarks
  const enriched = useMemo((): readonly EnrichedModel[] => {
    if (modelsState.status !== 'loaded') return [];
    const aaModels = aaState.status === 'loaded' ? aaState.models : [];
    return buildEnrichedModels(modelsState.models, aaModels);
  }, [modelsState, aaState]);

  const hasAAData = aaState.status === 'loaded' && aaState.models.length > 0;

  // Unified cache age (oldest of the two sources)
  const cacheAge = useMemo(() => {
    const orAge = modelsState.status === 'loaded' ? modelsState.cacheAge : null;
    const aaAge = aaState.status === 'loaded' ? aaState.cacheAge : null;
    if (orAge !== null && aaAge !== null) return Math.min(orAge, aaAge);
    return orAge ?? aaAge ?? null;
  }, [modelsState, aaState]);

  // Unified refresh: hooks own their own disk persistence on success
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refreshModels(),
      resolved.artificialAnalysisApiKey ? refreshAA() : Promise.resolve(false),
    ]);
    setRefreshing(false);
  }, [refreshModels, refreshAA, resolved.artificialAnalysisApiKey]);

  // Loading state
  if (modelsState.status === 'loading') {
    return (
      <Box padding={1}>
        <Text color="cyan">Carregando modelos...</Text>
      </Box>
    );
  }

  // Error state
  if (modelsState.status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Erro ao carregar modelos: {modelsState.error}</Text>
        {onCancel && <Text dimColor>Pressione ESC para voltar</Text>}
      </Box>
    );
  }

  return (
    <EnhancedModelTable
      models={enriched}
      onSelect={onSelect}
      onCancel={onCancel}
      title={title}
      hasAAData={hasAAData}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      cacheAge={cacheAge}
      widthPercent={widthPercent}
      heightPercent={heightPercent}
    />
  );
};
