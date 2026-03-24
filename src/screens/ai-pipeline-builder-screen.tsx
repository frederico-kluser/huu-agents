/**
 * Tela de criação de pipeline via IA.
 * O usuário descreve o que quer em textarea multilinha,
 * a LLM gera o pipeline completo.
 *
 * Fluxo: input → scope → seats → generating → preview → salvo/erro
 * Na fase input apenas ESC funciona. Submissão via Enter duplo.
 *
 * @module
 */

import { useState, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
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
 * Textarea multilinha na fase de input — apenas ESC funciona como atalho.
 * Submissão via Enter duplo (linha vazia após conteúdo).
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

  const handleModelSelect = useCallback((entry: ModelEntry) => {
    setModel(entry.id);
    setPhase('scope');
  }, []);

  const handleScopeSelect = useCallback((item: { value: ProfileScope }) => {
    setScope(item.value);
    setPhase('seats');
  }, []);

  const handleSeatsSelect = useCallback((item: { value: number }) => {
    setSeats(item.value);
    startGeneration(description, item.value, scope, model);
  }, [description, scope, model]);

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

  // ── Input phase (multiline, only ESC works) ────────────────────

  if (phase === 'input') {
    return (
      <MultilineInputPhase
        model={model}
        onSubmit={(text) => { setDescription(text); setPhase('scope'); }}
        onCancel={onCancel}
      />
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

  // ── Scope selection (with [m] to change model) ─────────────────

  if (phase === 'scope') {
    return (
      <ScopePhase
        description={description}
        model={model}
        hasModels={models.length > 0}
        onSelect={handleScopeSelect}
        onModelChange={() => setPhase('model-select')}
        onCancel={onCancel}
      />
    );
  }

  // ── Seats selection ────────────────────────────────────────────

  if (phase === 'seats') {
    return (
      <SeatsPhase
        description={description}
        scope={scope}
        onSelect={handleSeatsSelect}
        onCancel={onCancel}
      />
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

      <ErrorActions
        onRetry={() => startGeneration(description, seats, scope, model)}
        onCancel={onCancel}
      />
    </Box>
  );
}

// ── Multiline input phase ──────────────────────────────────────────

interface MultilineInputPhaseProps {
  readonly model: string;
  readonly onSubmit: (text: string) => void;
  readonly onCancel: () => void;
}

/**
 * Textarea multilinha controlada por useInput.
 * Apenas ESC funciona como atalho — todo o resto é capturado como texto.
 * Enter duplo (linha vazia após conteúdo) submete o input.
 * Suporta paste de conteúdo multilinha.
 */
function MultilineInputPhase({ model, onSubmit, onCancel }: MultilineInputPhaseProps) {
  const [lines, setLines] = useState<readonly string[]>(['']);
  const lastKeyWasReturn = useRef(false);

  useInput((input, key) => {
    // ESC é o único atalho ativo durante digitação
    if (key.escape) {
      onCancel();
      return;
    }

    // Enter: adiciona nova linha ou submete se Enter duplo
    if (key.return) {
      if (lastKeyWasReturn.current) {
        // Enter duplo — submete se há conteúdo
        const fullText = lines.join('\n').trim();
        if (fullText.length >= 5) {
          onSubmit(fullText);
          return;
        }
      }
      lastKeyWasReturn.current = true;
      setLines((prev) => [...prev, '']);
      return;
    }

    lastKeyWasReturn.current = false;

    // Backspace: remove último caractere ou merge com linha anterior
    if (key.backspace || key.delete) {
      setLines((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        const lastLine = updated[lastIdx] ?? '';

        if (lastLine.length > 0) {
          // Remove último caractere da linha atual
          updated[lastIdx] = lastLine.slice(0, -1);
        } else if (updated.length > 1) {
          // Linha vazia: merge com linha anterior
          updated.pop();
        }

        return updated;
      });
      return;
    }

    // Texto normal (inclui paste multilinha)
    if (input) {
      // Paste pode conter \n — splitamos em linhas
      const pastedLines = input.split('\n');

      setLines((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;

        // Primeiro fragmento: append na linha atual
        updated[lastIdx] = (updated[lastIdx] ?? '') + (pastedLines[0] ?? '');

        // Fragmentos adicionais: novas linhas (caso de paste multilinha)
        for (let i = 1; i < pastedLines.length; i++) {
          updated.push(pastedLines[i] ?? '');
        }

        return updated;
      });
    }
  });

  const displayLines = lines.length === 0 ? [''] : lines;
  const hasContent = lines.join('').trim().length > 0;

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="magenta">{'\u{1F916}'} Criar Pipeline com IA</Text>
        <Text dimColor>Descreva o que voce quer que o pipeline faca.</Text>
        <Text dimColor>A IA vai gerar os steps, variaveis e fluxo automaticamente.</Text>
      </Box>

      <Box marginTop={1} flexDirection="column" paddingX={1}>
        <Text dimColor>Modelo: <Text color="cyan">{model}</Text> (trocavel na proxima tela)</Text>
      </Box>

      {/* Textarea area */}
      <Box
        marginTop={1}
        flexDirection="column"
        borderStyle="single"
        borderColor={hasContent ? 'cyan' : 'gray'}
        paddingX={1}
        minHeight={4}
      >
        {displayLines.map((line, i) => (
          <Text key={i}>
            {i === displayLines.length - 1
              ? <Text>{line}<Text color="cyan">{'\u2588'}</Text></Text>
              : <Text>{line}</Text>
            }
          </Text>
        ))}
      </Box>

      {!hasContent && (
        <Box paddingX={1}>
          <Text dimColor italic>Ex: Gere testes, corrija o codigo e valide ate passar...</Text>
        </Box>
      )}

      <Box marginTop={1} paddingX={1}>
        <Text dimColor>[Enter Enter] enviar  |  [ESC] cancelar</Text>
      </Box>
    </Box>
  );
}

// ── Scope phase ────────────────────────────────────────────────────

interface ScopePhaseProps {
  readonly description: string;
  readonly model: string;
  readonly hasModels: boolean;
  readonly onSelect: (item: { value: ProfileScope }) => void;
  readonly onModelChange: () => void;
  readonly onCancel: () => void;
}

/** Seleção de escopo com [m] para trocar modelo */
function ScopePhase({ description, model, hasModels, onSelect, onModelChange, onCancel }: ScopePhaseProps) {
  useInput((input, key) => {
    if (key.escape) onCancel();
    if (input === 'm' && hasModels) onModelChange();
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="magenta">{'\u{1F916}'} Criar Pipeline com IA</Text>
        <Text dimColor>Onde salvar o perfil gerado?</Text>
      </Box>

      <Box marginTop={1} flexDirection="column" paddingX={1}>
        <Text dimColor>Descricao: <Text color="white">{truncate(description.replace(/\n/g, ' '), 80)}</Text></Text>
        <Text dimColor>Modelo: <Text color="cyan">{model}</Text></Text>
      </Box>

      <Box marginTop={1}>
        <SelectInput items={SCOPE_ITEMS} onSelect={onSelect} />
      </Box>

      <Box paddingX={1}>
        <Text dimColor>[m] trocar modelo  |  [ESC] cancelar</Text>
      </Box>
    </Box>
  );
}

// ── Seats phase ────────────────────────────────────────────────────

interface SeatsPhaseProps {
  readonly description: string;
  readonly scope: ProfileScope;
  readonly onSelect: (item: { value: number }) => void;
  readonly onCancel: () => void;
}

function SeatsPhase({ description, scope, onSelect, onCancel }: SeatsPhaseProps) {
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="magenta">{'\u{1F916}'} Criar Pipeline com IA</Text>
        <Text dimColor>Quantas instancias em paralelo por wave do DAG?</Text>
      </Box>

      <Box marginTop={1} flexDirection="column" paddingX={1}>
        <Text dimColor>Descricao: <Text color="white">{truncate(description.replace(/\n/g, ' '), 80)}</Text></Text>
        <Text dimColor>Escopo: <Text color="cyan">{scope}</Text></Text>
      </Box>

      <Box marginTop={1}>
        <SelectInput items={SEATS_ITEMS} onSelect={onSelect} />
      </Box>

      <Box paddingX={1}>
        <Text dimColor>[ESC] cancelar</Text>
      </Box>
    </Box>
  );
}

// ── Preview / Error actions ────────────────────────────────────────

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

  return (
    <Box marginTop={1} paddingX={1}>
      <Text dimColor>[r] tentar novamente  |  [ESC] cancelar</Text>
    </Box>
  );
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
