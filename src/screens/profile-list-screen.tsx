/**
 * Tela de listagem de perfis com opcoes de editar, duplicar e excluir.
 * Carrega catalogo merged (global + local) e permite gerenciamento completo.
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
  /** Raiz do projeto para carregar catalogos */
  readonly projectRoot: string;
  /** Callback para editar perfil no ProfileBuilderScreen */
  readonly onEdit: (profile: WorkerProfile) => void;
  /** Callback para duplicar perfil no ProfileBuilderScreen */
  readonly onDuplicate: (profile: WorkerProfile) => void;
  /** Callback para voltar ao menu anterior */
  readonly onBack: () => void;
  /** Mensagem de feedback (ex: perfil salvo com sucesso) */
  readonly feedbackMessage?: string | null;
}

/**
 * Lista todos os perfis com preview, edicao, duplicacao e exclusao.
 *
 * @example
 * <ProfileListScreen
 *   projectRoot="/home/user/proj"
 *   onEdit={(p) => openEditor(p)}
 *   onDuplicate={(p) => openEditor(withNewId(p))}
 *   onBack={() => setPhase('pipelines-menu')}
 * />
 */
export function ProfileListScreen({
  projectRoot,
  onEdit,
  onDuplicate,
  onBack,
  feedbackMessage,
}: ProfileListScreenProps) {
  const [phase, setPhase] = useState<Phase>('list');
  const [profiles, setProfiles] = useState<readonly WorkerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [message, setMessage] = useState<string | null>(feedbackMessage ?? null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const loaded = await listProfiles(projectRoot);
      setProfiles(loaded);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar perfis');
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => { void reload(); }, [reload]);

  const selectedProfile = profiles[selectedIdx] ?? null;

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedProfile) return;
    const result = await deleteProfile(selectedProfile.id, selectedProfile.scope, projectRoot);
    if (result.ok) {
      setMessage(`Perfil "${selectedProfile.id}" excluido`);
      setSelectedIdx((prev) => Math.max(0, prev - 1));
      await reload();
    } else {
      setMessage(`Erro ao excluir: ${result.error.kind}`);
    }
    setPhase('list');
  }, [selectedProfile, projectRoot, reload]);

  useInput((input, key) => {
    if (phase === 'confirm-delete') {
      if (input === 'y' || input === 'Y') { void handleConfirmDelete(); }
      else { setPhase('list'); }
      return;
    }
    if (key.escape) { onBack(); return; }
    if (key.upArrow || input === 'k') {
      setSelectedIdx((prev) => (prev > 0 ? prev - 1 : profiles.length - 1));
      setMessage(null);
    }
    if (key.downArrow || input === 'j') {
      setSelectedIdx((prev) => (prev < profiles.length - 1 ? prev + 1 : 0));
      setMessage(null);
    }
    if ((key.return || input === 'e') && selectedProfile) { onEdit(selectedProfile); }
    if (input === 'd' && selectedProfile) {
      onDuplicate({ ...selectedProfile, id: `${selectedProfile.id}-copy`, description: `Copia de ${selectedProfile.id}` });
    }
    if (input === 'x' && selectedProfile) { setPhase('confirm-delete'); }
  });

  if (loading) {
    return <Box padding={1}><Text color="yellow">Carregando perfis...</Text></Box>;
  }
  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">{'\u26A0'} {error}</Text>
        <Text dimColor>[ESC] voltar</Text>
      </Box>
    );
  }
  if (profiles.length === 0) {
    return <EmptyState />;
  }
  if (phase === 'confirm-delete' && selectedProfile) {
    return <ConfirmDeleteDialog profile={selectedProfile} />;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="cyan">{'\u{1F4CB}'} Editar Pipeline Profiles</Text>
        <Text dimColor>Selecione um perfil para editar, duplicar ou excluir.</Text>
      </Box>

      {message && (
        <Box marginTop={1} paddingX={1}>
          <Text color={message.startsWith('Erro') ? 'red' : 'green'}>{message}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        {profiles.map((profile, idx) => (
          <ProfileRow key={profile.id} profile={profile} isSelected={selectedIdx === idx} isFirst={idx === 0} />
        ))}
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>[j/k] navegar  |  [Enter/e] editar  |  [d] duplicar  |  [x] excluir  |  [ESC] voltar</Text>
      </Box>
    </Box>
  );
}

// ── Sub-components ──────────────────────────────────────────────

/** Estado vazio quando nao ha perfis */
function EmptyState() {
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="cyan">{'\u{1F4CB}'} Pipeline Profiles</Text>
        <Text dimColor>Nenhum perfil encontrado.</Text>
      </Box>
      <Box marginTop={1} paddingX={2} flexDirection="column">
        <Text dimColor>Crie um perfil usando:</Text>
        <Text dimColor>  {'\u2022'} <Text color="white">Criar Pipeline com IA</Text> (AI Builder)</Text>
        <Text dimColor>  {'\u2022'} <Text color="white">Criar Pipeline Manual</Text> (Wizard)</Text>
      </Box>
      <Box marginTop={1} paddingX={1}><Text dimColor>[ESC] voltar</Text></Box>
    </Box>
  );
}

/** Dialogo de confirmacao de exclusao */
function ConfirmDeleteDialog({ profile }: { readonly profile: WorkerProfile }) {
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="red">{'\u26A0'} Confirmar exclusao</Text>
        <Text>Excluir perfil <Text bold color="white">{profile.id}</Text>?</Text>
        <Text dimColor>Scope: {profile.scope} | Steps: {profile.steps.length}</Text>
        <Text dimColor>Esta acao nao pode ser desfeita.</Text>
      </Box>
      <Box marginTop={1} paddingX={1}>
        <Text dimColor>[y] confirmar exclusao  |  [qualquer tecla] cancelar</Text>
      </Box>
    </Box>
  );
}

/** Linha de perfil na lista com detalhes expandidos quando selecionado */
function ProfileRow({ profile, isSelected, isFirst }: {
  readonly profile: WorkerProfile;
  readonly isSelected: boolean;
  readonly isFirst: boolean;
}) {
  return (
    <Box flexDirection="column" marginTop={isFirst ? 0 : 1}>
      <Box>
        <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
          {isSelected ? '\u25B6 ' : '  '}{profile.id}
        </Text>
        <Text dimColor> [{profile.scope === 'project' ? 'local' : 'global'}]</Text>
        <Text dimColor> ({profile.steps.length} steps)</Text>
      </Box>
      {isSelected && <ProfileDetails profile={profile} />}
    </Box>
  );
}

/** Detalhes expandidos de um perfil selecionado */
function ProfileDetails({ profile }: { readonly profile: WorkerProfile }) {
  const stepTypes = countStepTypes(profile);
  return (
    <Box marginLeft={4} flexDirection="column">
      {profile.description && <Text dimColor>{profile.description}</Text>}
      <Box gap={2} marginTop={1}>
        <Text dimColor>Loop guard: <Text color="white">{profile.maxStepExecutions}</Text></Text>
        <Text dimColor>Seats: <Text color="white">{profile.seats}</Text></Text>
      </Box>
      <Box gap={2}>
        {stepTypes.map(({ type, count, icon, color }) => (
          <Text key={type} dimColor><Text color={color}>{icon}</Text> {type}: {count}</Text>
        ))}
      </Box>
      {(profile.workerModel || profile.langchainModel) && (
        <Box gap={2}>
          {profile.workerModel && <Text dimColor>Worker: <Text color="white">{profile.workerModel}</Text></Text>}
          {profile.langchainModel && <Text dimColor>LangChain: <Text color="white">{profile.langchainModel}</Text></Text>}
        </Box>
      )}
      {Object.keys(profile.initialVariables).length > 0 && (
        <Box>
          <Text dimColor>Vars: {Object.entries(profile.initialVariables).map(([n, v]) => `$${n}=${v}`).join('  ')}</Text>
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text bold dimColor>Pipeline:</Text>
        <PipelineGraph steps={[...profile.steps]} selectedStepId={null} compact />
      </Box>
      <Box marginTop={1} gap={2}>
        <Text color="cyan">[Enter/e] editar</Text>
        <Text color="yellow">[d] duplicar</Text>
        <Text color="red">[x] excluir</Text>
      </Box>
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
    result.push({ type, count, icon: info?.icon ?? '?', color: info?.color ?? 'white' });
  }
  return result;
}
