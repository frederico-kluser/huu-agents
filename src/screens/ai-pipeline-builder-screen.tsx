/**
 * Tela de criação de pipeline via IA.
 * O usuário descreve o que quer, a LLM gera o pipeline completo.
 * Escolhas do usuário: escopo (local/global), seats, e modelo LLM.
 *
 * Fluxo: input → gerando → preview → salvo/erro
 *
 * @module
 */

import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { generatePipeline } from '../services/ai-pipeline-generator.js';
import type { WorkerProfile, ProfileScope } from '../schemas/worker-profile.schema.js';
import type { ModelEntry } from '../data/models.js';
import { ModelTable } from '../components/model-table.js';

type Phase =
  | 'input'
  | 'scope'
  | 'seats'
  | 'model-select'
  | 'generating'
  | 'preview'
  | 'error';

interface AiPipelineBuilderProps {
  /** Callback com perfil gerado e validado */
  readonly onSave: (profile: WorkerProfile) => void;
  /** Cancelar e voltar ao menu */
  readonly onCancel: () => void;
  /** API key do OpenRouter */
  readonly apiKey: string;
  /** Modelos disponíveis para seleção de LLM */
  readonly models: readonly ModelEntry[];
}

const DEFAULT_MODEL = 'deepseek/deepseek-chat';
const DEFAULT_SEATS = 1;

const SCOPE_ITEMS = [
  { label: 'project — salva no projeto atual (.pi-dag/)', value: 'project' as ProfileScope },
  { label: 'global  — disponivel em todos os projetos (~/.pi-dag-cli/)', value: 'global' as ProfileScope },
];

const SEATS_ITEMS = Array.from({ length: 8 }, (_, i) => ({
  label: `${i + 1} instancia${i > 0 ? 's' : ''} em paralelo`,
  value: i + 1,
}));

/**
 * Tela de criação de pipeline assistida por IA.
 * O usuário descreve o pipeline desejado em linguagem natural,
 * escolhe escopo e seats, e a LLM gera automaticamente.
 *
 * @example
 * <AiPipelineBuilderScreen
 *   onSave={(p) => handleSave(p)}
 *   onCancel={() => setPhase('menu')}
 *   apiKey="sk-or-..."
 *   models={allModels}
 * />
 */
export function AiPipelineBuilderScreen({
  onSave,
  onCancel,
  apiKey,
  models,
}: AiPipelineBuilderProps) {
  const [phase, setPhase] = useState<Phase>('input');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<ProfileScope>('project');
  const [seats, setSeats] = useState(DEFAULT_SEATS);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [progress, setProgress] = useState('');
  const [generatedProfile, setGeneratedProfile] = useState<WorkerProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Keybindings globais: ESC cancela, [m] troca modelo na fase input
  useInput((input, key) => {
    if (key.escape && phase !== 'generating') {
      onCancel();
    }
    if (input === 'm' && phase === 'input' && models.length > 0) {
      setPhase('model-select');
    }
  });

  const handleDescriptionSubmit = useCallback(() => {
    if (description.trim().length < 5) return;
    setPhase('scope');
  }, [description]);

  const handleScopeSelect = useCallback((item: { value: ProfileScope }) => {
    setScope(item.value);
    setPhase('seats');
  }, []);

  const handleSeatsSelect = useCallback((item: { value: number }) => {
    setSeats(item.value);
    startGeneration(description, item.value, scope, model);
  }, [description, scope, model]);

  const handleModelSelect = useCallback((entry: ModelEntry) => {
    setModel(entry.id);
    setPhase('input');
  }, []);

  const startGeneration = useCallback(async (
    desc: string,
    seatCount: number,
    profileScope: ProfileScope,
    llmModel: string,
  ) => {
    setPhase('generating');
    setProgress('Iniciando...');

    const result = await generatePipeline({
      userDescription: desc,
      scope: profileScope,
      seats: seatCount,
      apiKey,
      model: llmModel,
      onProgress: setProgress,
    });

    if (result.ok) {
      setGeneratedProfile(result.value);
      setPhase('preview');
    } else {
      setErrorMessage(`${result.error.kind}: ${result.error.detail}`);
      setPhase('error');
    }
  }, [apiKey]);

  // ── Input phase ────────────────────────────────────────────────

  if (phase === 'input') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="magenta">{'\u{1F916}'} Criar Pipeline com IA</Text>
          <Text dimColor>Descreva o que voce quer que o pipeline faca.</Text>
          <Text dimColor>A IA vai gerar os steps, variaveis e fluxo automaticamente.</Text>
        </Box>

        <Box marginTop={1} flexDirection="column" paddingX={1}>
          <Text dimColor>Modelo: <Text color="cyan">{model}</Text> <Text dimColor>[m] trocar</Text></Text>
        </Box>

        <Box marginTop={1} paddingX={1}>
          <Text bold color="cyan">{'\u276F'} </Text>
          <TextInput
            value={description}
            onChange={setDescription}
            onSubmit={handleDescriptionSubmit}
            placeholder="Ex: Gere testes, corrija o codigo e valide ate passar..."
          />
        </Box>

        <Box marginTop={1} paddingX={1}>
          <Text dimColor>[Enter] continuar  |  [m] trocar modelo  |  [ESC] cancelar</Text>
        </Box>
      </Box>
    );
  }

  // ── Model selection ────────────────────────────────────────────

  if (phase === 'model-select') {
    return (
      <ModelTable
        models={[...models].filter((m) => m.hasTools || m.id.includes('deepseek'))}
        onSelect={handleModelSelect}
        title="Selecionar modelo para gerar pipeline"
      />
    );
  }

  // ── Scope selection ────────────────────────────────────────────

  if (phase === 'scope') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="magenta">{'\u{1F916}'} Criar Pipeline com IA</Text>
          <Text dimColor>Onde salvar o perfil gerado?</Text>
        </Box>

        <Box marginTop={1} flexDirection="column" paddingX={1}>
          <Text dimColor>Descricao: <Text color="white">{description.slice(0, 80)}{description.length > 80 ? '...' : ''}</Text></Text>
        </Box>

        <Box marginTop={1}>
          <SelectInput items={SCOPE_ITEMS} onSelect={handleScopeSelect} />
        </Box>

        <Box paddingX={1}>
          <Text dimColor>[ESC] cancelar</Text>
        </Box>
      </Box>
    );
  }

  // ── Seats selection ────────────────────────────────────────────

  if (phase === 'seats') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="magenta">{'\u{1F916}'} Criar Pipeline com IA</Text>
          <Text dimColor>Quantas instancias em paralelo por wave do DAG?</Text>
        </Box>

        <Box marginTop={1} flexDirection="column" paddingX={1}>
          <Text dimColor>Descricao: <Text color="white">{description.slice(0, 80)}{description.length > 80 ? '...' : ''}</Text></Text>
          <Text dimColor>Escopo: <Text color="cyan">{scope}</Text></Text>
        </Box>

        <Box marginTop={1}>
          <SelectInput items={SEATS_ITEMS} onSelect={handleSeatsSelect} />
        </Box>

        <Box paddingX={1}>
          <Text dimColor>[ESC] cancelar</Text>
        </Box>
      </Box>
    );
  }

  // ── Generating phase ───────────────────────────────────────────

  if (phase === 'generating') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="magenta">{'\u{1F916}'} Criando Pipeline com IA</Text>
          <Text dimColor>Modelo: <Text color="cyan">{model}</Text></Text>
        </Box>

        <Box marginTop={1} paddingX={1} gap={1}>
          <Text color="green"><Spinner type="dots" /></Text>
          <Text>{progress}</Text>
        </Box>

        <Box marginTop={1} paddingX={1}>
          <Text dimColor>Aguarde — duas chamadas LLM em sequencia...</Text>
        </Box>
      </Box>
    );
  }

  // ── Preview phase ──────────────────────────────────────────────

  if (phase === 'preview' && generatedProfile) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="green" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="green">{'\u2714'} Pipeline gerada com sucesso!</Text>
        </Box>

        {/* Metadata */}
        <Box marginTop={1} flexDirection="column" paddingX={1}>
          <Text><Text bold color="cyan">ID:</Text> {generatedProfile.id}</Text>
          <Text><Text bold color="cyan">Descricao:</Text> {generatedProfile.description}</Text>
          <Text><Text bold color="cyan">Escopo:</Text> {generatedProfile.scope}</Text>
          <Text><Text bold color="cyan">Seats:</Text> {generatedProfile.seats}</Text>
          <Text><Text bold color="cyan">Max executions:</Text> {generatedProfile.maxStepExecutions}</Text>
        </Box>

        {/* Steps */}
        <Box marginTop={1} flexDirection="column" paddingX={1}>
          <Text bold color="yellow">Steps ({generatedProfile.steps.length}):</Text>
          {generatedProfile.steps.map((step, i) => (
            <Box key={step.id} paddingLeft={1}>
              <Text dimColor>{i + 1}. </Text>
              <Text color={stepColor(step.type)}>[{step.type}]</Text>
              <Text> {step.id}</Text>
              {step.type === 'pi_agent' && <Text dimColor> — {truncate(step.taskTemplate, 50)}</Text>}
              {step.type === 'langchain_prompt' && <Text dimColor> — {'\u2192'} ${step.outputTarget}</Text>}
              {step.type === 'condition' && <Text dimColor> — {step.expression}</Text>}
              {step.type === 'goto' && <Text dimColor> — {'\u2192'} {step.target}</Text>}
              {step.type === 'set_variable' && <Text dimColor> — ${step.target}</Text>}
            </Box>
          ))}
        </Box>

        {/* Initial variables */}
        {Object.keys(generatedProfile.initialVariables).length > 0 && (
          <Box marginTop={1} flexDirection="column" paddingX={1}>
            <Text bold color="yellow">Variaveis iniciais:</Text>
            {Object.entries(generatedProfile.initialVariables).map(([k, v]) => (
              <Text key={k} dimColor>  ${k} = {String(v)}</Text>
            ))}
          </Box>
        )}

        <PreviewActions
          onSave={() => onSave(generatedProfile)}
          onRetry={() => startGeneration(description, seats, scope, model)}
          onCancel={onCancel}
        />
      </Box>
    );
  }

  // ── Error phase ────────────────────────────────────────────────

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="red">{'\u2718'} Erro ao gerar pipeline</Text>
      </Box>

      <Box marginTop={1} paddingX={1} flexDirection="column">
        <Text color="red">{errorMessage}</Text>
      </Box>

      <Box marginTop={1} paddingX={1}>
        <Text dimColor>[r] tentar novamente  |  [ESC] cancelar</Text>
      </Box>

      <ErrorActions
        onRetry={() => startGeneration(description, seats, scope, model)}
        onCancel={onCancel}
      />
    </Box>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

/** Ações na tela de preview: salvar, regenerar, cancelar */
function PreviewActions({ onSave, onRetry, onCancel }: {
  readonly onSave: () => void;
  readonly onRetry: () => void;
  readonly onCancel: () => void;
}) {
  useInput((input, key) => {
    if (input === 's') onSave();
    if (input === 'r') onRetry();
    if (key.escape) onCancel();
  });

  return (
    <Box marginTop={1} paddingX={1}>
      <Text dimColor>[s] salvar  |  [r] regenerar  |  [ESC] cancelar</Text>
    </Box>
  );
}

/** Ações na tela de erro: retry, cancelar */
function ErrorActions({ onRetry, onCancel }: {
  readonly onRetry: () => void;
  readonly onCancel: () => void;
}) {
  useInput((input, key) => {
    if (input === 'r') onRetry();
    if (key.escape) onCancel();
  });

  return null; // keybindings only, text already rendered in parent
}

// ── Helpers ────────────────────────────────────────────────────────

function stepColor(type: string): string {
  const colors: Record<string, string> = {
    pi_agent: 'green',
    langchain_prompt: 'magenta',
    condition: 'yellow',
    goto: 'cyan',
    set_variable: 'blue',
    git_diff: 'white',
    fail: 'red',
  };
  return colors[type] ?? 'gray';
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
