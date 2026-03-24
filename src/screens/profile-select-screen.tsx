/**
 * Tela de selecao de perfil de worker pipeline.
 * Exibe perfis disponiveis (global + local) com descricoes detalhadas
 * e preview da arvore de steps.
 *
 * Quando um perfil é selecionado, oferece a opção de usar o modelo
 * default do perfil ou escolher outro modelo do catálogo completo OpenRouter.
 *
 * @module
 */

import { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { WorkerProfile } from '../schemas/worker-profile.schema.js';
import { listProfiles, deleteProfile, saveProfile } from '../services/profile-catalog.js';
import { validateProfileReferences } from '../schemas/worker-profile.schema.js';
import { ProfileBuilderScreen } from './profile-builder-screen.js';
import { PipelineGraph } from '../components/pipeline-graph.js';
import { findStepTypeInfo } from '../components/step-field-defs.js';
import { ModelSelector } from '../components/model-selector.js';
import type { ModelEntry } from '../data/models.js';

type Phase = 'select' | 'confirm-model' | 'choose-model' | 'edit-profile';

interface ProfileSelectScreenProps {
  /** Caminho absoluto da raiz do projeto para carregar catalogos */
  readonly projectRoot: string;
  /** Callback com perfil selecionado (com override de modelo) ou null (sem perfil) */
  readonly onSelect: (profile: WorkerProfile | null) => void;
  /** API key para carregar catálogo de modelos */
  readonly apiKey: string;
}

/**
 * Tela de selecao de perfil antes da execucao.
 * Primeira opcao e sempre "No profile" para preservar comportamento atual.
 * Ao selecionar um perfil, oferece escolha de modelo para execução.
 *
 * @example
 * <ProfileSelectScreen
 *   projectRoot="/home/user/my-project"
 *   apiKey="sk-or-..."
 *   onSelect={(profile) => startExecution(profile)}
 * />
 */
export const ProfileSelectScreen = ({ projectRoot, onSelect, apiKey }: ProfileSelectScreenProps) => {
  const [phase, setPhase] = useState<Phase>('select');
  const [profiles, setProfiles] = useState<readonly WorkerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingProfile, setPendingProfile] = useState<WorkerProfile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<WorkerProfile | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadProfileList = async () => {
    try {
      const loaded = await listProfiles(projectRoot);
      setProfiles(loaded);
      setSelectedIdx((prev) => Math.min(prev, loaded.length));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfileList();
  }, [projectRoot]);

  const totalItems = profiles.length + 1; // "No profile" + perfis

  /** Executa remocao de perfil e recarrega lista */
  const executeDelete = (profileId: string) => {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) { setConfirmDelete(null); return; }
    void (async () => {
      const result = await deleteProfile(profile.id, profile.scope, projectRoot);
      setActionMessage(result.ok ? `Perfil "${profile.id}" removido` : `Erro ao remover: ${result.error.kind}`);
      setConfirmDelete(null);
      await loadProfileList();
    })();
  };

  /** Retorna perfil selecionado (excluindo "No profile" no idx 0) */
  const selectedProfile = (): WorkerProfile | undefined =>
    selectedIdx > 0 ? profiles[selectedIdx - 1] : undefined;

  useInput((input, key) => {
    if (phase !== 'select') return;

    if (confirmDelete) {
      if (input === 'y' || input === 'Y') executeDelete(confirmDelete);
      else setConfirmDelete(null);
      return;
    }

    if (key.upArrow || input === 'k') {
      setSelectedIdx((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
      setActionMessage(null);
    }
    if (key.downArrow || input === 'j') {
      setSelectedIdx((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
      setActionMessage(null);
    }
    if (key.return) {
      if (selectedIdx === 0) { onSelect(null); return; }
      const p = selectedProfile();
      if (p) { setPendingProfile(p); setPhase('confirm-model'); }
    }
    if (input === 'e') {
      const p = selectedProfile();
      if (p) { setEditingProfile(p); setPhase('edit-profile'); }
    }
    if (input === 'x') {
      const p = selectedProfile();
      if (p) setConfirmDelete(p.id);
    }
  });

  // Phase: confirm model — ask if user wants default or custom model
  if (phase === 'confirm-model' && pendingProfile) {
    return (
      <ModelConfirmPhase
        profile={pendingProfile}
        onUseDefault={() => onSelect(pendingProfile)}
        onChooseModel={() => setPhase('choose-model')}
        onBack={() => { setPendingProfile(null); setPhase('select'); }}
      />
    );
  }

  // Phase: choose model — full OpenRouter catalog
  if (phase === 'choose-model' && pendingProfile) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column">
          <Text bold color="cyan">{'\u{1F527}'} Selecionar Modelo para Pipeline</Text>
          <Text dimColor>O modelo selecionado será usado nos steps pi_agent e langchain_prompt.</Text>
          <Text dimColor>Perfil: <Text color="white">{pendingProfile.id}</Text></Text>
        </Box>
        <Box marginTop={1}>
          <ModelSelector
            apiKey={apiKey}
            onSelect={(m: ModelEntry) => {
              const overridden: WorkerProfile = {
                ...pendingProfile,
                workerModel: m.id,
                langchainModel: m.id,
              };
              onSelect(overridden);
            }}
            title="Modelo para Execução da Pipeline"
          />
        </Box>
      </Box>
    );
  }

  // Phase: edit profile
  if (phase === 'edit-profile' && editingProfile) {
    return (
      <ProfileBuilderScreen
        existingProfile={editingProfile}
        onSave={async (profile) => {
          const errors = validateProfileReferences(profile);
          if (errors.length > 0) {
            setActionMessage(`Erro: ${errors.join(' | ')}`);
            setEditingProfile(null);
            setPhase('select');
            return;
          }
          const result = await saveProfile(profile, profile.scope, projectRoot);
          if (result.ok) {
            setActionMessage(`Perfil "${profile.id}" salvo com sucesso`);
          } else {
            setActionMessage(`Erro ao salvar: ${result.error.kind}`);
          }
          setEditingProfile(null);
          setPhase('select');
          await loadProfileList();
        }}
        onCancel={() => { setEditingProfile(null); setPhase('select'); }}
      />
    );
  }

  // Phase: select profile
  if (loading) {
    return (
      <Box padding={1}>
        <Text color="yellow">Carregando perfis...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">{'\u26A0'} Erro ao carregar perfis: {error}</Text>
        <Text dimColor>Press Enter para continuar sem perfil</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="cyan">{'\u{1F527}'} Selecionar Worker Pipeline Profile</Text>
        <Text dimColor>Escolha um perfil para transformar workers em pipelines multi-step,</Text>
        <Text dimColor>ou continue sem perfil para manter o comportamento one-shot.</Text>
      </Box>

      {actionMessage && (
        <Box marginTop={1} paddingX={1}>
          <Text color={actionMessage.startsWith('Erro') ? 'red' : 'green'}>{actionMessage}</Text>
        </Box>
      )}

      {confirmDelete && (
        <Box marginTop={1} paddingX={1}>
          <Text color="red" bold>Confirmar remocao de "{confirmDelete}"? [y] sim / [qualquer tecla] cancelar</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        {/* No profile option */}
        <Box flexDirection="column">
          <Box>
            <Text color={selectedIdx === 0 ? 'cyan' : 'white'} bold={selectedIdx === 0}>
              {selectedIdx === 0 ? '\u25B6 ' : '  '}
              Sem perfil (comportamento original)
            </Text>
          </Box>
          {selectedIdx === 0 && (
            <Box marginLeft={4} flexDirection="column">
              <Text dimColor>Cada worker executa a subtask em um unico passo usando o Pi Agent.</Text>
              <Text dimColor>Sem variaveis, sem loops, sem condicoes — execucao direta.</Text>
            </Box>
          )}
        </Box>

        {/* Profile list */}
        {profiles.map((profile, idx) => {
          const itemIdx = idx + 1;
          const isSelected = selectedIdx === itemIdx;
          const stepTypes = countStepTypes(profile);

          return (
            <Box key={profile.id} flexDirection="column" marginTop={1}>
              <Box>
                <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                  {isSelected ? '\u25B6 ' : '  '}
                  {profile.id}
                </Text>
                <Text dimColor> [{profile.scope === 'project' ? 'local' : 'global'}]</Text>
              </Box>

              {/* Profile details when selected */}
              {isSelected && (
                <Box marginLeft={4} flexDirection="column">
                  {profile.description && (
                    <Text dimColor>{profile.description}</Text>
                  )}

                  {/* Stats row */}
                  <Box gap={2} marginTop={1}>
                    <Text dimColor>Steps: <Text color="white">{profile.steps.length}</Text></Text>
                    <Text dimColor>Loop guard: <Text color="white">{profile.maxStepExecutions}</Text></Text>
                    <Text dimColor>Seats: <Text color="white">{profile.seats}</Text></Text>
                  </Box>

                  {/* Step type breakdown */}
                  <Box gap={2}>
                    {stepTypes.map(({ type, count, icon, color }) => (
                      <Text key={type} dimColor>
                        <Text color={color}>{icon}</Text> {type}: {count}
                      </Text>
                    ))}
                  </Box>

                  {/* Model info */}
                  {(profile.workerModel || profile.langchainModel) && (
                    <Box gap={2}>
                      {profile.workerModel && (
                        <Text dimColor>Worker model: <Text color="white">{profile.workerModel}</Text></Text>
                      )}
                      {profile.langchainModel && (
                        <Text dimColor>LangChain model: <Text color="white">{profile.langchainModel}</Text></Text>
                      )}
                    </Box>
                  )}

                  {/* Initial variables */}
                  {Object.keys(profile.initialVariables).length > 0 && (
                    <Box>
                      <Text dimColor>Vars: </Text>
                      <Text dimColor>
                        {Object.entries(profile.initialVariables)
                          .map(([name, val]) => `$${name}=${val}`)
                          .join('  ')}
                      </Text>
                    </Box>
                  )}

                  {/* Mini pipeline tree preview */}
                  <Box marginTop={1} flexDirection="column">
                    <Text bold dimColor>Pipeline:</Text>
                    <PipelineGraph
                      steps={[...profile.steps]}
                      selectedStepId={null}
                      compact
                    />
                  </Box>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {profiles.length === 0 && (
        <Box marginTop={1} flexDirection="column" paddingX={2}>
          <Text dimColor>Nenhum perfil encontrado.</Text>
          <Text dimColor>Use <Text color="white">[o] opcoes</Text> {'\u2192'} Criar Pipeline Profile para criar o primeiro.</Text>
          <Text dimColor>Perfis locais: .pi-dag/worker-profiles.json</Text>
          <Text dimColor>Perfis globais: ~/.pi-dag-cli/worker-profiles.json</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>[j/k] navegar  |  [Enter] selecionar  |  [e] editar  |  [x] deletar  |  [o] opcoes</Text>
      </Box>
    </Box>
  );
};

// ── Model Confirm Phase ──────────────────────────────────────────

interface ModelConfirmPhaseProps {
  readonly profile: WorkerProfile;
  readonly onUseDefault: () => void;
  readonly onChooseModel: () => void;
  readonly onBack: () => void;
}

/**
 * Fase intermediária: mostra o modelo default do perfil e pergunta
 * se o usuário quer usá-lo ou escolher outro.
 */
function ModelConfirmPhase({ profile, onUseDefault, onChooseModel, onBack }: ModelConfirmPhaseProps) {
  useInput((input, key) => {
    if (key.return || input === 'd') onUseDefault();
    if (input === 'c') onChooseModel();
    if (key.escape) onBack();
  });

  const defaultModel = profile.workerModel ?? 'config default (Worker model)';

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="cyan">{'\u{1F527}'} Modelo para Execução da Pipeline</Text>
        <Text dimColor>Perfil: <Text color="white" bold>{profile.id}</Text></Text>
        {profile.description && <Text dimColor>{profile.description}</Text>}
      </Box>

      <Box marginTop={1} flexDirection="column" paddingX={1}>
        <Text bold color="yellow">Qual modelo usar para executar os steps da pipeline?</Text>
        <Text> </Text>
        <Box gap={1}>
          <Text bold color="green">Default:</Text>
          <Text color="white">{defaultModel}</Text>
        </Box>
        {profile.langchainModel && profile.langchainModel !== profile.workerModel && (
          <Box gap={1}>
            <Text bold color="magenta">LangChain:</Text>
            <Text color="white">{profile.langchainModel}</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column" paddingX={1}>
        <Text color="cyan" bold>[d/Enter]</Text>
        <Text dimColor>  Usar modelo default ({defaultModel})</Text>
        <Text> </Text>
        <Text color="cyan" bold>[c]</Text>
        <Text dimColor>  Escolher outro modelo (catálogo completo OpenRouter)</Text>
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>[d/Enter] usar default  |  [c] escolher modelo  |  [ESC] voltar</Text>
      </Box>
    </Box>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

interface StepTypeCount {
  readonly type: string;
  readonly count: number;
  readonly icon: string;
  readonly color: string;
}

/** Conta steps por tipo para resumo visual */
function countStepTypes(profile: WorkerProfile): readonly StepTypeCount[] {
  const counts = new Map<string, number>();
  for (const step of profile.steps) {
    counts.set(step.type, (counts.get(step.type) ?? 0) + 1);
  }
  const result: StepTypeCount[] = [];
  for (const [type, count] of counts) {
    const info = findStepTypeInfo(type as import('../schemas/worker-profile.schema.js').StepType);
    result.push({
      type,
      count,
      icon: info?.icon ?? '?',
      color: info?.color ?? 'white',
    });
  }
  return result;
}
