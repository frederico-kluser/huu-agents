/**
 * Tela de criação de pipeline via IA.
 * O usuário descreve o que deseja em linguagem natural;
 * duas chamadas LLM geram o perfil completo automaticamente.
 * Escolhas do usuário: scope (local/global), seats (paralelismo),
 * e modelo LLM (catálogo completo OpenRouter via ModelSelector).
 *
 * @module
 */

import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { MultiLineInput } from '../components/multi-line-input.js';
import { ModelSelector } from '../components/model-selector.js';
import {
  generatePipeline,
  DEFAULT_BUILDER_MODEL,
  type GeneratorErrorKind,
} from '../services/ai-pipeline-generator.js';
import type { WorkerProfile, ProfileScope } from '../schemas/worker-profile.schema.js';
import type { ModelEntry } from '../data/models.js';

// ── Types ────────────────────────────────────────────────────────

type Phase = 'description' | 'scope' | 'seats' | 'model' | 'generating' | 'preview' | 'error';

interface AiPipelineBuilderScreenProps {
  /** API key para chamadas LLM */
  readonly apiKey: string;
  /** Callback ao salvar perfil gerado */
  readonly onSave: (profile: WorkerProfile) => void;
  /** Callback ao cancelar */
  readonly onCancel: () => void;
}

// ── Constants ────────────────────────────────────────────────────

const SEAT_OPTIONS = [
  { label: '1 worker por vez (sequencial)', value: '1' },
  { label: '2 workers em paralelo', value: '2' },
  { label: '4 workers em paralelo', value: '4' },
  { label: '8 workers em paralelo', value: '8' },
];

const SCOPE_OPTIONS = [
  { label: 'Projeto (local — .pi-dag/)', value: 'project' as ProfileScope },
  { label: 'Global (todos os projetos — ~/.pi-dag-cli/)', value: 'global' as ProfileScope },
];

const STEP_ICONS: Record<string, string> = {
  pi_agent: '\u{1F916}', langchain_prompt: '\u{1F4AC}', condition: '\u{1F500}',
  goto: '\u27A1\uFE0F', set_variable: '\u{1F4DD}', git_diff: '\u{1F4CB}', fail: '\u{1F6D1}',
};

// ── Helpers ──────────────────────────────────────────────────────

const formatError = (error: GeneratorErrorKind): string => {
  switch (error.kind) {
    case 'llm_error': return `Erro LLM: ${error.detail}`;
    case 'parse_error': return `Erro parse: ${error.detail}`;
    case 'validation_error': return `Pipeline inválida: ${error.detail}`;
  }
};

const truncate = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max)}...` : s;

// ── Main Component ───────────────────────────────────────────────

/**
 * Tela de criação de pipeline via IA.
 * Fluxo: descrição → scope → seats → modelo (catálogo completo) → geração → preview.
 *
 * @example
 * <AiPipelineBuilderScreen
 *   apiKey="sk-or-..." onSave={(p) => save(p)} onCancel={() => back()}
 * />
 */
export const AiPipelineBuilderScreen = ({
  apiKey, onSave, onCancel,
}: AiPipelineBuilderScreenProps) => {
  const [phase, setPhase] = useState<Phase>('description');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<ProfileScope>('project');
  const [seats, setSeats] = useState(1);
  const [model, setModel] = useState(DEFAULT_BUILDER_MODEL);
  const [progress, setProgress] = useState('');
  const [generatedProfile, setGeneratedProfile] = useState<WorkerProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // ESC handling para fases que não têm input próprio (scope, seats).
  // description: MultiLineInput cuida do ESC internamente.
  // model: ModelSelector tem ESC via ModelTable.
  // generating: sem cancelamento. preview/error: handlers próprios.
  useInput((_input, key) => {
    if (key.escape && phase !== 'generating' && phase !== 'description'
        && phase !== 'preview' && phase !== 'error' && phase !== 'model') {
      onCancel();
    }
  });

  const startGeneration = useCallback(async (selectedModel: string) => {
    setPhase('generating');
    setProgress('Iniciando geração...');
    const result = await generatePipeline({
      userDescription: description.trim(), apiKey, scope, seats,
      model: selectedModel, onProgress: setProgress,
    });
    if (result.ok) { setGeneratedProfile(result.value); setPhase('preview'); }
    else { setErrorMessage(formatError(result.error)); setPhase('error'); }
  }, [description, apiKey, scope, seats]);

  if (phase === 'description') {
    return (
      <DescriptionPhase
        onSubmit={(text) => { setDescription(text); setPhase('scope'); }}
        onCancel={onCancel}
      />
    );
  }

  if (phase === 'scope') {
    return (
      <SelectPhase title="Onde salvar o perfil?" description={description}
        items={SCOPE_OPTIONS}
        onSelect={(item) => { setScope(item.value); setPhase('seats'); }}
      />
    );
  }

  if (phase === 'seats') {
    return (
      <SelectPhase title="Quantos workers em paralelo?" description={description}
        subtitle="Controla quantos workers com este perfil rodam por wave do DAG."
        items={SEAT_OPTIONS}
        onSelect={(item) => { setSeats(Number(item.value)); setPhase('model'); }}
      />
    );
  }

  if (phase === 'model') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header description={description} />
        <Box marginTop={1} flexDirection="column" paddingX={1}>
          <Text bold color="yellow">Modelo LLM para gerar a pipeline:</Text>
          <Text dimColor>O modelo interpreta sua descrição e gera os steps. Default: {DEFAULT_BUILDER_MODEL}</Text>
        </Box>
        <Box marginTop={1}>
          <ModelSelector
            apiKey={apiKey}
            onSelect={(m: ModelEntry) => { setModel(m.id); void startGeneration(m.id); }}
            title="Selecionar Modelo para Gerar Pipeline"
          />
        </Box>
      </Box>
    );
  }

  if (phase === 'generating') {
    return <GeneratingPhase description={description} progress={progress} model={model} scope={scope} seats={seats} />;
  }

  if (phase === 'preview' && generatedProfile) {
    return (
      <ProfilePreview profile={generatedProfile}
        onConfirm={() => onSave(generatedProfile)}
        onRetry={() => { setPhase('description'); setGeneratedProfile(null); }}
        onCancel={onCancel}
      />
    );
  }

  return <ErrorPhase description={description} error={errorMessage}
    onRetry={() => setPhase('description')} onCancel={onCancel} />;
};

// ── Phase Components ─────────────────────────────────────────────

function Header({ description }: { readonly description: string }) {
  return (
    <Box borderStyle="round" borderColor="magenta" paddingX={2} flexDirection="column">
      <Text bold color="magenta">{'\u{1F9E0}'} AI Pipeline Builder</Text>
      <Text dimColor wrap="truncate">{'\u276F'} {description}</Text>
    </Box>
  );
}

function DescriptionPhase({ onSubmit, onCancel }: {
  readonly onSubmit: (text: string) => void;
  readonly onCancel: () => void;
}) {
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="magenta">{'\u{1F9E0}'} AI Pipeline Builder</Text>
        <Text dimColor>Descreva o que deseja e a IA cria a pipeline automaticamente.</Text>
        <Text dimColor>Suporta múltiplas linhas e paste de conteúdo.</Text>
      </Box>
      <Box marginTop={1} flexDirection="column" paddingX={1}>
        <Text bold color="yellow">O que a pipeline deve fazer?</Text>
        <Text dimColor>Exemplos:</Text>
        <Text dimColor>  {'\u2022'} "Escrever testes, corrigir código, repetir até 3 vezes"</Text>
        <Text dimColor>  {'\u2022'} "Implementar, revisar com IA, aplicar correções"</Text>
        <Text dimColor>  {'\u2022'} "Analisar se precisa refatorar, se sim refatorar"</Text>
        <Text dimColor>  {'\u2022'} "Planejar abordagem, implementar, validar com lint e testes"</Text>
      </Box>
      <Box marginTop={1} paddingX={1}>
        <MultiLineInput
          onSubmit={onSubmit}
          onCancel={onCancel}
          placeholder="Descreva a pipeline desejada..."
        />
      </Box>
    </Box>
  );
}

function SelectPhase<T extends string>({ title, description, subtitle, items, onSelect }: {
  readonly title: string;
  readonly description: string;
  readonly subtitle?: string;
  readonly items: ReadonlyArray<{ label: string; value: T }>;
  readonly onSelect: (item: { value: T }) => void;
}) {
  return (
    <Box flexDirection="column" padding={1}>
      <Header description={description} />
      <Box marginTop={1} flexDirection="column" paddingX={1}>
        <Text bold color="yellow">{title}</Text>
        {subtitle && <Text dimColor>{subtitle}</Text>}
      </Box>
      <Box marginTop={1}>
        <SelectInput items={items as Array<{ label: string; value: T }>} onSelect={onSelect} />
      </Box>
      <Box paddingX={1}><Text dimColor>[ESC] cancelar</Text></Box>
    </Box>
  );
}

function GeneratingPhase({ description, progress, model, scope, seats }: {
  readonly description: string; readonly progress: string;
  readonly model: string; readonly scope: string; readonly seats: number;
}) {
  return (
    <Box flexDirection="column" padding={1}>
      <Header description={description} />
      <Box marginTop={1} gap={1} paddingX={1}>
        <Text color="magenta"><Spinner type="dots" /></Text>
        <Text>{progress}</Text>
      </Box>
      <Box marginTop={1} paddingX={1} flexDirection="column">
        <Text dimColor>Modelo: {model}</Text>
        <Text dimColor>Escopo: {scope} | Seats: {seats}</Text>
      </Box>
    </Box>
  );
}

function ErrorPhase({ description, error, onRetry, onCancel }: {
  readonly description: string; readonly error: string;
  readonly onRetry: () => void; readonly onCancel: () => void;
}) {
  useInput((input, key) => {
    if (input === 'r') onRetry();
    if (key.escape) onCancel();
  });
  return (
    <Box flexDirection="column" padding={1}>
      <Header description={description} />
      <Box marginTop={1} paddingX={1} flexDirection="column">
        <Text color="red" bold>Erro na geração</Text>
        <Text color="red">{error}</Text>
      </Box>
      <Box marginTop={1} paddingX={1}>
        <Text dimColor>[r] tentar novamente  |  [ESC] cancelar</Text>
      </Box>
    </Box>
  );
}

// ── Profile Preview ──────────────────────────────────────────────

function ProfilePreview({ profile, onConfirm, onRetry, onCancel }: {
  readonly profile: WorkerProfile;
  readonly onConfirm: () => void;
  readonly onRetry: () => void;
  readonly onCancel: () => void;
}) {
  useInput((input, key) => {
    if (key.return) onConfirm();
    if (input === 'r') onRetry();
    if (key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="green" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="green">{'\u2714'} Pipeline gerada com sucesso!</Text>
      </Box>
      <ProfileMetadata profile={profile} />
      <StepsList profile={profile} />
      <InitialVarsList initialVariables={profile.initialVariables} />
      <Box marginTop={1} paddingX={1}>
        <Text dimColor>[Enter] salvar  |  [r] refazer  |  [ESC] cancelar</Text>
      </Box>
    </Box>
  );
}

function ProfileMetadata({ profile }: { readonly profile: WorkerProfile }) {
  return (
    <Box marginTop={1} paddingX={1} flexDirection="column">
      <Box gap={1}><Text bold>ID:</Text><Text color="cyan">{profile.id}</Text></Box>
      <Box gap={1}><Text bold>Descrição:</Text><Text>{profile.description || '(sem descrição)'}</Text></Box>
      <Box gap={1}>
        <Text bold>Escopo:</Text><Text>{profile.scope}</Text>
        <Text dimColor>|</Text><Text bold>Seats:</Text><Text>{profile.seats}</Text>
        <Text dimColor>|</Text><Text bold>Max steps:</Text><Text>{profile.maxStepExecutions}</Text>
      </Box>
    </Box>
  );
}

function StepsList({ profile }: { readonly profile: WorkerProfile }) {
  return (
    <Box marginTop={1} paddingX={1} flexDirection="column">
      <Text bold color="yellow">Steps ({profile.steps.length}):</Text>
      {profile.steps.map((step, i) => {
        const icon = STEP_ICONS[step.type] ?? '?';
        const isEntry = step.id === profile.entryStepId;
        return (
          <Box key={step.id} gap={1}>
            <Text dimColor>{String(i + 1).padStart(2)}.</Text>
            <Text>{icon}</Text>
            <Text color={isEntry ? 'cyan' : 'white'} bold={isEntry}>{step.id}</Text>
            <Text dimColor>({step.type})</Text>
            <Text dimColor wrap="truncate">{getStepDetail(step)}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function InitialVarsList({ initialVariables }: { readonly initialVariables: Record<string, string | number> }) {
  const entries = Object.entries(initialVariables);
  if (entries.length === 0) return null;
  return (
    <Box marginTop={1} paddingX={1} flexDirection="column">
      <Text bold color="yellow">Variáveis iniciais:</Text>
      {entries.map(([key, val]) => (
        <Text key={key} dimColor>  ${key} = {String(val)}</Text>
      ))}
    </Box>
  );
}

/** Extrai detalhe resumido de um step para exibição em uma linha */
function getStepDetail(step: Record<string, unknown>): string {
  switch (step.type) {
    case 'pi_agent': return truncate(String(step.taskTemplate ?? ''), 50);
    case 'langchain_prompt': return `→ $${step.outputTarget}`;
    case 'condition': return String(step.expression ?? '');
    case 'goto': return `→ ${step.target}`;
    case 'set_variable': return `$${step.target} = ${step.valueExpression ?? step.value ?? ''}`;
    case 'git_diff': return `→ $${step.target}`;
    case 'fail': return truncate(String(step.messageTemplate ?? ''), 40);
    default: return '';
  }
}
