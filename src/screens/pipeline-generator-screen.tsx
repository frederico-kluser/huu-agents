/**
 * AI-powered pipeline generator screen.
 * Clean Ink interface: user describes desired pipeline in natural language,
 * selects scope (local/global) and seats, then LLM generates the full profile.
 *
 * Two LLM calls: (1) generate steps, (2) generate metadata (id, description).
 * User only chooses scope and seats — everything else is auto-generated.
 *
 * @module
 */

import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { PipelineGitGraph } from '../components/pipeline-git-graph.js';
import {
  generatePipeline,
  type GenerationPhase,
  type PipelineGenerationResult,
} from '../services/pipeline-generator.js';
import type { WorkerProfile, ProfileScope } from '../schemas/worker-profile.schema.js';

type Phase = 'input' | 'scope' | 'seats' | 'generating' | 'preview' | 'error';

interface PipelineGeneratorScreenProps {
  readonly apiKey: string;
  readonly model?: string;
  readonly onSave: (profile: WorkerProfile) => void;
  readonly onCancel: () => void;
}

/** Manages generator state and phase transitions */
function useGeneratorState(apiKey: string, model: string | undefined, onCancel: () => void) {
  const [phase, setPhase] = useState<Phase>('input');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<ProfileScope>('project');
  const [seats, setSeats] = useState(1);
  const [genPhase, setGenPhase] = useState('');
  const [result, setResult] = useState<PipelineGenerationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useInput((_input, key) => {
    if (!key.escape) return;
    if (phase === 'preview' || phase === 'error') {
      setPhase('input'); setResult(null); setErrorMsg('');
    } else if (phase === 'seats') { setPhase('scope'); }
    else if (phase === 'scope') { setPhase('input'); }
    else { onCancel(); }
  }, { isActive: phase !== 'generating' });

  const startGeneration = useCallback(async (
    desc: string, selectedScope: ProfileScope, selectedSeats: number,
  ) => {
    setPhase('generating');
    setGenPhase('Iniciando...');
    const genResult = await generatePipeline({
      description: desc, apiKey, model, scope: selectedScope,
      seats: selectedSeats,
      onProgress: (_p: GenerationPhase, msg: string) => setGenPhase(msg),
    });
    setResult(genResult);
    setPhase(genResult.ok ? 'preview' : 'error');
    if (!genResult.ok) setErrorMsg(genResult.error);
  }, [apiKey, model]);

  return {
    phase, setPhase, description, setDescription, scope, setScope,
    seats, setSeats, genPhase, result, setResult, errorMsg, startGeneration,
  };
}

/**
 * AI pipeline generator with clean multi-phase interface.
 * Flow: description → scope → seats → generating → preview → save.
 *
 * @example
 * <PipelineGeneratorScreen
 *   apiKey={config.openrouterApiKey}
 *   onSave={(p) => saveToCatalog(p)}
 *   onCancel={() => setPhase('menu')}
 * />
 */
export function PipelineGeneratorScreen({
  apiKey, model, onSave, onCancel,
}: PipelineGeneratorScreenProps) {
  const g = useGeneratorState(apiKey, model, onCancel);

  if (g.phase === 'input') {
    return (
      <InputPhase description={g.description} onChange={g.setDescription}
        onSubmit={(v) => { if (v.trim()) { g.setDescription(v.trim()); g.setPhase('scope'); } }}
      />
    );
  }
  if (g.phase === 'scope') {
    return <ScopePhase description={g.description}
      onSelect={(v) => { g.setScope(v as ProfileScope); g.setPhase('seats'); }}
    />;
  }
  if (g.phase === 'seats') {
    return <SeatsPhase description={g.description} scope={g.scope}
      onSelect={(n) => { g.setSeats(n); void g.startGeneration(g.description, g.scope, n); }}
    />;
  }
  if (g.phase === 'generating') {
    return <GeneratingPhase description={g.description} model={model} scope={g.scope} seats={g.seats} message={g.genPhase} />;
  }
  if (g.phase === 'error') {
    return <ErrorPhase error={g.errorMsg} result={g.result} />;
  }
  if (g.phase === 'preview' && g.result?.ok) {
    return <PreviewPhase profile={g.result.profile} onSave={onSave} onCancel={onCancel}
      onRetry={() => { g.setPhase('input'); g.setResult(null); }}
    />;
  }
  return null;
}

// ── Phase sub-components ───────────────────────────────────────────────

function InputPhase({ description, onChange, onSubmit }: {
  readonly description: string;
  readonly onChange: (v: string) => void;
  readonly onSubmit: (v: string) => void;
}) {
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="magenta">{'\u2728'} Gerar Pipeline com IA</Text>
        <Text dimColor>Descreva o pipeline desejado em linguagem natural.</Text>
        <Text dimColor>A IA vai criar todos os steps, variáveis e configurações automaticamente.</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan">{'\u276F'} Descreva o que o pipeline deve fazer:</Text>
        <Box marginTop={1}>
          <Text color="magenta">{'\u276F'} </Text>
          <TextInput
            value={description} onChange={onChange} onSubmit={onSubmit}
            placeholder="Ex: Pipeline que escreve testes, corrige código e repete até passar..."
          />
        </Box>
      </Box>
      <Box marginTop={1}><Text dimColor>[Enter] continuar  |  [ESC] voltar</Text></Box>
    </Box>
  );
}

function ScopePhase({ description, onSelect }: {
  readonly description: string;
  readonly onSelect: (v: string) => void;
}) {
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="magenta">{'\u2728'} Gerar Pipeline com IA</Text>
        <Text dimColor>"{truncate(description, 60)}"</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan">Onde salvar o pipeline?</Text>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: '\u{1F4C1} Projeto (local — .pi-dag/worker-profiles.json)', value: 'project' },
              { label: '\u{1F30D} Global (todos os projetos — ~/.pi-dag-cli/worker-profiles.json)', value: 'global' },
            ]}
            onSelect={(item) => onSelect(item.value)}
          />
        </Box>
      </Box>
      <Box marginTop={1}><Text dimColor>[ESC] voltar</Text></Box>
    </Box>
  );
}

function SeatsPhase({ description, scope, onSelect }: {
  readonly description: string;
  readonly scope: ProfileScope;
  readonly onSelect: (n: number) => void;
}) {
  const items = [1, 2, 4, 8, 16].map((n) => ({
    label: `${n} instância${n > 1 ? 's' : ''} em paralelo`, value: String(n),
  }));

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="magenta">{'\u2728'} Gerar Pipeline com IA</Text>
        <Text dimColor>"{truncate(description, 60)}"</Text>
        <Text dimColor>Escopo: {scope === 'project' ? 'Projeto (local)' : 'Global'}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan">Quantas instâncias em paralelo (seats)?</Text>
        <Text dimColor>Limita quantos workers com este perfil rodam ao mesmo tempo.</Text>
        <Box marginTop={1}>
          <SelectInput items={items} onSelect={(item) => onSelect(Number(item.value))} />
        </Box>
      </Box>
      <Box marginTop={1}><Text dimColor>[ESC] voltar</Text></Box>
    </Box>
  );
}

function GeneratingPhase({ description, model, scope, seats, message }: {
  readonly description: string;
  readonly model?: string;
  readonly scope: ProfileScope;
  readonly seats: number;
  readonly message: string;
}) {
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="magenta">{'\u2728'} Gerando Pipeline...</Text>
        <Text dimColor>"{truncate(description, 60)}"</Text>
      </Box>
      <Box marginTop={1} gap={1}>
        <Text color="green"><Spinner type="dots" /></Text>
        <Text>{message}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Modelo: {model ?? 'deepseek/deepseek-chat'}</Text>
        <Text dimColor>Escopo: {scope === 'project' ? 'Projeto' : 'Global'} | Seats: {seats}</Text>
      </Box>
    </Box>
  );
}

function ErrorPhase({ error, result }: {
  readonly error: string;
  readonly result: PipelineGenerationResult | null;
}) {
  const failedResult = result && !result.ok ? result : null;
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="red">{'\u2716'} Erro ao gerar pipeline</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color="red">{error}</Text>
        {failedResult?.phase && <Text dimColor>Fase: {failedResult.phase}</Text>}
        {failedResult?.raw && (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor bold>Resposta da LLM:</Text>
            <Text dimColor>{truncate(failedResult.raw, 500)}</Text>
          </Box>
        )}
      </Box>
      <Box marginTop={1}><Text dimColor>[ESC] tentar novamente</Text></Box>
    </Box>
  );
}

function PreviewPhase({ profile, onSave, onCancel, onRetry }: {
  readonly profile: WorkerProfile;
  readonly onSave: (profile: WorkerProfile) => void;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
}) {
  useInput((input, key) => {
    if (key.return) onSave(profile);
    if (key.escape) onCancel();
    if (input === 'r') onRetry();
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="green" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="green">{'\u2714'} Pipeline gerado com sucesso!</Text>
        <Box marginTop={1} gap={2}>
          <Text><Text bold>ID:</Text> {profile.id}</Text>
          <Text><Text bold>Escopo:</Text> {profile.scope === 'project' ? 'Projeto' : 'Global'}</Text>
          <Text><Text bold>Seats:</Text> {profile.seats}</Text>
        </Box>
        {profile.description && <Text dimColor>{profile.description}</Text>}
      </Box>
      <Box marginTop={1} gap={3}>
        <Text dimColor>{profile.steps.length} steps</Text>
        <Text dimColor>Loop guard: {profile.maxStepExecutions}</Text>
        {Object.keys(profile.initialVariables).length > 0 && (
          <Text dimColor>Vars: {Object.keys(profile.initialVariables).join(', ')}</Text>
        )}
      </Box>
      <Box marginTop={1} borderStyle="round" borderColor="gray" paddingX={1} paddingY={1} flexDirection="column">
        <Text bold dimColor>Pipeline Graph</Text>
        <Box marginTop={1}>
          <PipelineGitGraph steps={profile.steps} entryStepId={profile.entryStepId} />
        </Box>
      </Box>
      <Box marginTop={1} gap={2}>
        <Text color="green" bold>[Enter] Salvar</Text>
        <Text color="yellow">[r] Regenerar</Text>
        <Text dimColor>[ESC] Cancelar</Text>
      </Box>
    </Box>
  );
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
