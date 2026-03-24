/**
 * Tela de listagem de perfis para edicao e exclusao.
 * Exibe todos os perfis (global + local) com preview e acoes.
 *
 * @module
 */

import { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { WorkerProfile } from '../schemas/worker-profile.schema.js';
import { listProfiles, deleteProfile } from '../services/profile-catalog.js';
import { PipelineGraph } from '../components/pipeline-graph.js';
import { findStepTypeInfo } from '../components/step-field-defs.js';
import type { StepType } from '../schemas/worker-profile.schema.js';

type Phase = 'list' | 'confirm-delete';

interface ProfileListScreenProps {
  /** Caminho absoluto da raiz do projeto */
  readonly projectRoot: string;
  /** Callback para editar perfil no builder */
  readonly onEdit: (profile: WorkerProfile) => void;
  /** Callback para voltar ao menu anterior */
  readonly onBack: () => void;
}

/**
 * Tela de listagem de perfis com opcoes de editar e deletar.
 *
 * @example
 * <ProfileListScreen
 *   projectRoot="/home/user/project"
 *   onEdit={(p) => openBuilder(p)}
 *   onBack={() => setPhase('pipelines-menu')}
 * />
 */
export const ProfileListScreen = ({ projectRoot, onEdit, onBack }: ProfileListScreenProps) => {
  const [phase, setPhase] = useState<Phase>('list');
  const [profiles, setProfiles] = useState<readonly WorkerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    try {
      setLoading(true);
      const loaded = await listProfiles(projectRoot);
      setProfiles(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const selectedProfile = profiles[selectedIdx] ?? null;

  // Confirm delete phase
  useInput((input, key) => {
    if (phase !== 'confirm-delete' || !selectedProfile) return;
    if (input === 'y') {
      void handleDeleteConfirmed(selectedProfile);
    }
    if (input === 'n' || key.escape) {
      setPhase('list');
    }
  }, { isActive: phase === 'confirm-delete' });

  // List phase
  useInput((input, key) => {
    if (phase !== 'list') return;
    if (key.escape) {
      onBack();
      return;
    }
    if (profiles.length === 0) return;

    if (key.upArrow || input === 'k') {
      setSelectedIdx((prev) => (prev > 0 ? prev - 1 : profiles.length - 1));
      setMessage(null);
    }
    if (key.downArrow || input === 'j') {
      setSelectedIdx((prev) => (prev < profiles.length - 1 ? prev + 1 : 0));
      setMessage(null);
    }
    if (key.return || input === 'e') {
      if (selectedProfile) {
        onEdit(selectedProfile);
      }
    }
    if (input === 'x') {
      if (selectedProfile) {
        setPhase('confirm-delete');
      }
    }
  }, { isActive: phase === 'list' });

  const handleDeleteConfirmed = async (profile: WorkerProfile) => {
    const result = await deleteProfile(profile.id, profile.scope, projectRoot);
    if (result.ok) {
      setMessage(`Perfil "${profile.id}" removido com sucesso`);
      const newIdx = Math.max(0, selectedIdx - 1);
      setSelectedIdx(newIdx);
      await loadProfiles();
    } else {
      setMessage(`Erro ao remover: ${result.error.kind}`);
    }
    setPhase('list');
  };

  // Confirm delete dialog
  if (phase === 'confirm-delete' && selectedProfile) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="red">Confirmar exclusao</Text>
          <Text>Tem certeza que deseja excluir o perfil <Text bold color="white">{selectedProfile.id}</Text>?</Text>
          <Text dimColor>Scope: {selectedProfile.scope} | Steps: {selectedProfile.steps.length}</Text>
          {selectedProfile.description && <Text dimColor>{selectedProfile.description}</Text>}
        </Box>
        <Box marginTop={1} paddingX={1}>
          <Text color="red" bold>[y]</Text><Text> confirmar  </Text>
          <Text color="cyan" bold>[n/ESC]</Text><Text> cancelar</Text>
        </Box>
      </Box>
    );
  }

  // Loading
  if (loading) {
    return (
      <Box padding={1}>
        <Text color="yellow">Carregando perfis...</Text>
      </Box>
    );
  }

  // Error
  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Erro ao carregar perfis: {error}</Text>
        <Text dimColor>[ESC] voltar</Text>
      </Box>
    );
  }

  // Empty state
  if (profiles.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="cyan">Editar Pipeline Profiles</Text>
        </Box>
        <Box marginTop={1} flexDirection="column" paddingX={2}>
          <Text dimColor>Nenhum perfil encontrado.</Text>
          <Text dimColor>Use <Text color="white">Criar Pipeline</Text> para criar o primeiro.</Text>
        </Box>
        <Box marginTop={1} paddingX={1}>
          <Text dimColor>[ESC] voltar</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="cyan">Editar Pipeline Profiles</Text>
        <Text dimColor>Selecione um perfil para editar ou excluir.</Text>
      </Box>

      {/* Message */}
      {message && (
        <Box marginTop={1} paddingX={1}>
          <Text color={message.startsWith('Erro') ? 'red' : 'green'}>{message}</Text>
        </Box>
      )}

      {/* Profile list */}
      <Box marginTop={1} flexDirection="column">
        {profiles.map((profile, idx) => {
          const isSelected = selectedIdx === idx;
          return (
            <ProfileListItem
              key={profile.id}
              profile={profile}
              isSelected={isSelected}
            />
          );
        })}
      </Box>

      {/* Footer */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
        <Box gap={2}>
          <Text dimColor>[j/k] navegar</Text>
          <Text dimColor>[Enter/e] editar</Text>
          <Text dimColor>[x] excluir</Text>
          <Text dimColor>[ESC] voltar</Text>
        </Box>
      </Box>
    </Box>
  );
};

// ── ProfileListItem ──────────────────────────────────────────

interface ProfileListItemProps {
  readonly profile: WorkerProfile;
  readonly isSelected: boolean;
}

/** Item de perfil na lista com preview expandido quando selecionado */
function ProfileListItem({ profile, isSelected }: ProfileListItemProps) {
  const stepTypes = countStepTypes(profile);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
          {isSelected ? '\u25B6 ' : '  '}
          {profile.id}
        </Text>
        <Text dimColor> [{profile.scope === 'project' ? 'local' : 'global'}]</Text>
      </Box>

      {/* Expanded details when selected */}
      {isSelected && (
        <Box marginLeft={4} flexDirection="column">
          {profile.description && (
            <Text dimColor>{profile.description}</Text>
          )}

          {/* Stats */}
          <Box gap={2} marginTop={1}>
            <Text dimColor>Steps: <Text color="white">{profile.steps.length}</Text></Text>
            <Text dimColor>Loop guard: <Text color="white">{profile.maxStepExecutions}</Text></Text>
            <Text dimColor>Seats: <Text color="white">{profile.seats}</Text></Text>
          </Box>

          {/* Step types breakdown */}
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
                <Text dimColor>Worker: <Text color="white">{profile.workerModel}</Text></Text>
              )}
              {profile.langchainModel && (
                <Text dimColor>LangChain: <Text color="white">{profile.langchainModel}</Text></Text>
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

          {/* Pipeline preview */}
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
}

// ── Helpers ────────────────────────────────────────────────────

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
    const info = findStepTypeInfo(type as StepType);
    result.push({
      type,
      count,
      icon: info?.icon ?? '?',
      color: info?.color ?? 'white',
    });
  }
  return result;
}
