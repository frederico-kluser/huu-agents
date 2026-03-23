/**
 * Tela de opcoes acessivel via [o] de qualquer tela.
 * Centraliza: selecao individual de modelos (planner/worker)
 * e criacao de pipeline profiles.
 *
 * @module
 */

import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { ModelTable } from '../components/model-table.js';
import { ProfileBuilderScreen } from './profile-builder-screen.js';
import { MODEL_CATALOG, findModel, formatPrice } from '../data/models.js';
import type { ModelEntry } from '../data/models.js';
import type { Config } from '../schemas/config.schema.js';
import type { WorkerProfile } from '../schemas/worker-profile.schema.js';
import { validateProfileReferences } from '../schemas/worker-profile.schema.js';
import { saveProfile } from '../services/profile-catalog.js';

type OptionsPhase = 'menu' | 'planner-model' | 'worker-model' | 'create-profile';

interface OptionsScreenProps {
  /** Config atual (para exibir e atualizar modelos) */
  readonly config: Config;
  /** Callback quando config muda (modelo atualizado) */
  readonly onConfigChange: (config: Config) => void;
  /** Callback para voltar a tela anterior */
  readonly onBack: () => void;
  /** Raiz do projeto para salvar perfis locais */
  readonly projectRoot: string;
}

/** Formata nome do modelo com preco compacto */
const modelSummary = (id: string): string => {
  const m = findModel(id);
  if (!m) return id;
  return `${m.name} (${formatPrice(m.inputPrice)}/${formatPrice(m.outputPrice)})`;
};

/**
 * Tela de opcoes: selecao individual de modelos e criacao de pipelines.
 * Substitui o fluxo antigo de model-change (ciclo planner -> worker -> concurrency).
 *
 * @example
 * <OptionsScreen
 *   config={currentConfig}
 *   onConfigChange={(c) => saveAndUpdate(c)}
 *   onBack={() => setScreen(previousScreen)}
 *   projectRoot={process.cwd()}
 * />
 */
export const OptionsScreen = ({
  config,
  onConfigChange,
  onBack,
  projectRoot,
}: OptionsScreenProps) => {
  const [phase, setPhase] = useState<OptionsPhase>('menu');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handlePlannerSelect = useCallback((model: ModelEntry) => {
    const updated: Config = {
      ...config,
      plannerModel: model.id,
      selectedAgents: { ...config.selectedAgents, planner: model.id },
    };
    onConfigChange(updated);
    setSaveMessage(`Planner atualizado: ${model.name}`);
    setPhase('menu');
  }, [config, onConfigChange]);

  const handleWorkerSelect = useCallback((model: ModelEntry) => {
    const updated: Config = {
      ...config,
      workerModel: model.id,
      selectedAgents: { ...config.selectedAgents, worker: model.id },
    };
    onConfigChange(updated);
    setSaveMessage(`Worker atualizado: ${model.name}`);
    setPhase('menu');
  }, [config, onConfigChange]);

  const handleProfileSave = useCallback(async (profile: WorkerProfile) => {
    // Validar referencias antes de salvar
    const errors = validateProfileReferences(profile);
    if (errors.length > 0) {
      setSaveMessage(`Erro: ${errors[0]}`);
      setPhase('menu');
      return;
    }

    const result = await saveProfile(profile, profile.scope, projectRoot);
    if (result.ok) {
      setSaveMessage(`Perfil "${profile.name}" salvo com sucesso`);
    } else {
      setSaveMessage(`Erro ao salvar: ${result.error.kind}`);
    }
    setPhase('menu');
  }, [projectRoot]);

  // --- Planner model selection (todos os modelos) ---
  if (phase === 'planner-model') {
    return (
      <ModelTable
        models={MODEL_CATALOG}
        onSelect={handlePlannerSelect}
        title="Selecionar Modelo Planner"
      />
    );
  }

  // --- Worker model selection (todos os modelos) ---
  if (phase === 'worker-model') {
    return (
      <ModelTable
        models={MODEL_CATALOG}
        onSelect={handleWorkerSelect}
        title="Selecionar Modelo Worker"
      />
    );
  }

  // --- Profile builder ---
  if (phase === 'create-profile') {
    return (
      <ProfileBuilderScreen
        onSave={(profile) => void handleProfileSave(profile)}
        onCancel={() => setPhase('menu')}
      />
    );
  }

  // --- Main menu ---
  const menuItems = [
    {
      label: `Modelo Planner:  ${modelSummary(config.selectedAgents.planner)}`,
      value: 'planner',
    },
    {
      label: `Modelo Worker:   ${modelSummary(config.selectedAgents.worker)}`,
      value: 'worker',
    },
    {
      label: 'Criar Pipeline Profile',
      value: 'create-profile',
    },
    {
      label: 'Voltar',
      value: 'back',
    },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="cyan">Opcoes</Text>
        <Text dimColor>Selecione modelos individualmente ou crie pipelines</Text>
      </Box>

      {saveMessage && (
        <Box marginTop={1}>
          <Text color={saveMessage.startsWith('Erro') ? 'red' : 'green'}>{saveMessage}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <SelectInput
          items={menuItems}
          onSelect={(item) => {
            setSaveMessage(null);
            switch (item.value) {
              case 'planner': setPhase('planner-model'); break;
              case 'worker': setPhase('worker-model'); break;
              case 'create-profile': setPhase('create-profile'); break;
              case 'back': onBack(); break;
            }
          }}
        />
      </Box>
    </Box>
  );
};
