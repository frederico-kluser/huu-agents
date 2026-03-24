/**
 * Tela de selecao de perfil de worker pipeline.
 * Exibe perfis disponiveis (global + local) com descricoes detalhadas
 * e preview da arvore de steps.
 *
 * @module
 */

import { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { WorkerProfile } from '../schemas/worker-profile.schema.js';
import { listProfiles } from '../services/profile-catalog.js';
import { PipelineTreeGraph } from '../components/pipeline-tree-graph.js';
import { findStepTypeInfo } from '../components/step-field-defs.js';

interface ProfileSelectScreenProps {
  /** Caminho absoluto da raiz do projeto para carregar catalogos */
  readonly projectRoot: string;
  /** Callback com perfil selecionado ou null (sem perfil) */
  readonly onSelect: (profile: WorkerProfile | null) => void;
}

/**
 * Tela de selecao de perfil antes da execucao.
 * Primeira opcao e sempre "No profile" para preservar comportamento atual.
 * Exibe preview da arvore do pipeline quando um perfil esta selecionado.
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
                    <PipelineTreeGraph
                      steps={[...profile.steps]}
                      entryStepId={profile.entryStepId}
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
        <Text dimColor>[j/k] navegar  |  [Enter] selecionar  |  [o] opcoes (criar perfis)</Text>
      </Box>
    </Box>
  );
};

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
