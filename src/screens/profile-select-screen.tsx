/**
 * Tela de seleção de perfil de worker pipeline.
 * Baseada em 6sD5N — tela separada no state machine, sem tocar task-screen.
 *
 * Exibe perfis disponíveis (global + local) com "No profile" como primeira opção.
 * Navegação por setas/vim keys, Enter para selecionar.
 */

import { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { WorkerProfile } from '../schemas/worker-profile.schema.js';
import { listProfiles } from '../services/profile-catalog.js';

interface ProfileSelectScreenProps {
  /** Caminho absoluto da raiz do projeto para carregar catálogos */
  readonly projectRoot: string;
  /** Callback com perfil selecionado ou null (sem perfil) */
  readonly onSelect: (profile: WorkerProfile | null) => void;
}

/**
 * Tela de seleção de perfil antes da execução.
 * Primeira opção é sempre "No profile" para preservar comportamento atual.
 *
 * @example
 * <ProfileSelectScreen
 *   projectRoot="/home/user/my-project"
 *   onSelect={(profile) => startExecution(profile)}
 * />
 */
export const ProfileSelectScreen = ({ projectRoot, onSelect }: ProfileSelectScreenProps) => {
  const [profiles, setProfiles] = useState<readonly WorkerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await listProfiles(projectRoot);
        setProfiles(loaded);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profiles');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [projectRoot]);

  const totalItems = profiles.length + 1; // "No profile" + perfis

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setSelectedIdx((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
    }
    if (key.downArrow || input === 'j') {
      setSelectedIdx((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
    }
    if (key.return) {
      if (selectedIdx === 0) {
        onSelect(null);
      } else {
        const profile = profiles[selectedIdx - 1];
        if (profile) onSelect(profile);
      }
    }
  });

  if (loading) {
    return (
      <Box padding={1}>
        <Text color="yellow">Loading profiles...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error loading profiles: {error}</Text>
        <Text dimColor>Press Enter to continue without profile</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Select Worker Profile</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Use arrows to navigate, Enter to select</Text>
      </Box>

      {/* No profile option */}
      <Box>
        <Text color={selectedIdx === 0 ? 'cyan' : 'white'}>
          {selectedIdx === 0 ? '> ' : '  '}
          No profile (current behavior)
        </Text>
      </Box>

      {/* Profile list */}
      {profiles.map((profile, idx) => {
        const itemIdx = idx + 1;
        const isSelected = selectedIdx === itemIdx;
        return (
          <Box key={profile.id} flexDirection="column">
            <Box>
              <Text color={isSelected ? 'cyan' : 'white'}>
                {isSelected ? '> ' : '  '}
                {profile.name}
              </Text>
              <Text dimColor> [{profile.scope}]</Text>
            </Box>
            {isSelected && profile.description && (
              <Box marginLeft={4}>
                <Text dimColor>{profile.description}</Text>
              </Box>
            )}
            {isSelected && (
              <Box marginLeft={4} gap={2}>
                <Text dimColor>Steps: {profile.steps.length}</Text>
                <Text dimColor>Max: {profile.maxStepExecutions}</Text>
                {profile.workerModel && <Text dimColor>Worker: {profile.workerModel}</Text>}
              </Box>
            )}
          </Box>
        );
      })}

      {profiles.length === 0 && (
        <Box marginTop={1}>
          <Text dimColor>No profiles found. Use [o] opcoes to create one.</Text>
        </Box>
      )}

      <Box marginTop={1} gap={2}>
        <Text dimColor>j/k:navegar  Enter:selecionar  [o] opcoes</Text>
      </Box>
    </Box>
  );
};
