/**
 * Componente reutilizavel para listar e selecionar perfis de pipeline.
 * Usado nas telas de edicao e exclusao de perfis.
 *
 * @module
 */

import { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { listProfiles } from '../services/profile-catalog.js';
import { PipelineGraph } from './pipeline-graph.js';
import { findStepTypeInfo } from './step-field-defs.js';
import type { WorkerProfile, StepType } from '../schemas/worker-profile.schema.js';

interface ProfileListSelectorProps {
  /** Caminho absoluto da raiz do projeto */
  readonly projectRoot: string;
  /** Titulo exibido no header */
  readonly title: string;
  /** Descricao exibida abaixo do titulo */
  readonly description: string;
  /** Callback quando perfil e selecionado */
  readonly onSelect: (profile: WorkerProfile) => void;
  /** Callback para voltar */
  readonly onBack: () => void;
}

/**
 * Lista perfis disponiveis com preview e permite selecao.
 *
 * @param props - Propriedades do seletor
 * @returns Componente de listagem de perfis
 *
 * @example
 * <ProfileListSelector
 *   projectRoot="/home/user/proj"
 *   title="Editar Pipeline"
 *   description="Selecione um perfil para editar."
 *   onSelect={(p) => editProfile(p)}
 *   onBack={() => setPhase('menu')}
 * />
 */
export function ProfileListSelector({
  projectRoot,
  title,
  description,
  onSelect,
  onBack,
}: ProfileListSelectorProps) {
  const [profiles, setProfiles] = useState<readonly WorkerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await listProfiles(projectRoot);
        setProfiles(loaded);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar perfis');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [projectRoot]);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.upArrow || input === 'k') {
      setSelectedIdx((prev) => (prev > 0 ? prev - 1 : profiles.length - 1));
    }
    if (key.downArrow || input === 'j') {
      setSelectedIdx((prev) => (prev < profiles.length - 1 ? prev + 1 : 0));
    }
    if (key.return) {
      const profile = profiles[selectedIdx];
      if (profile) {
        onSelect(profile);
      }
    }
  });

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
        <Text color="red">{'\u26A0'} Erro: {error}</Text>
        <Text dimColor>[ESC] voltar</Text>
      </Box>
    );
  }

  if (profiles.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="cyan">{title}</Text>
          <Text dimColor>{description}</Text>
        </Box>
        <Box marginTop={1} paddingX={2} flexDirection="column">
          <Text dimColor>Nenhum perfil encontrado.</Text>
          <Text dimColor>Crie um perfil primeiro em Pipeline Profiles {'\u2192'} Criar Pipeline.</Text>
        </Box>
        <Box marginTop={1} paddingX={1}>
          <Text dimColor>[ESC] voltar</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="cyan">{title}</Text>
        <Text dimColor>{description}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {profiles.map((profile, idx) => {
          const isSelected = selectedIdx === idx;
          return (
            <Box key={profile.id} flexDirection="column" marginTop={idx > 0 ? 1 : 0}>
              <Box>
                <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                  {isSelected ? '\u25B6 ' : '  '}
                  {profile.id}
                </Text>
                <Text dimColor> [{profile.scope === 'project' ? 'local' : 'global'}]</Text>
              </Box>

              {isSelected && (
                <Box marginLeft={4} flexDirection="column">
                  {profile.description && (
                    <Text dimColor>{profile.description}</Text>
                  )}
                  <Box gap={2} marginTop={1}>
                    <Text dimColor>Steps: <Text color="white">{profile.steps.length}</Text></Text>
                    <Text dimColor>Loop guard: <Text color="white">{profile.maxStepExecutions}</Text></Text>
                    <Text dimColor>Seats: <Text color="white">{profile.seats}</Text></Text>
                  </Box>
                  <Box gap={2}>
                    {countStepTypes(profile).map(({ type, count, icon, color }) => (
                      <Text key={type} dimColor>
                        <Text color={color}>{icon}</Text> {type}: {count}
                      </Text>
                    ))}
                  </Box>
                  <Box marginTop={1} flexDirection="column">
                    <Text bold dimColor>Pipeline:</Text>
                    <PipelineGraph steps={[...profile.steps]} selectedStepId={null} compact />
                  </Box>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>[j/k] navegar  |  [Enter] selecionar  |  [ESC] voltar</Text>
      </Box>
    </Box>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

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
