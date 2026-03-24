/**
 * Tela de criacao automatica de pipelines via LLM.
 *
 * Fluxo em 3 passos:
 *   1. Usuario descreve o pipeline desejado em linguagem natural
 *   2. Escolhe escopo (global/project) e seats (paralelismo)
 *   3. LLM gera pipeline (steps + metadata) automaticamente
 *
 * Duas chamadas LLM: uma para steps, outra para id/descricao.
 * Modelo padrao: deepseek/deepseek-chat (trocavel via seletor).
 *
 * @module
 */

import { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { MODEL_CATALOG, findModel, formatPrice } from '../data/models.js';
import { ModelTable } from '../components/model-table.js';
import {
  generateAutoPipeline,
  type AutoPipelineResult,
} from '../services/auto-pipeline.js';
import type { WorkerProfile, ProfileScope } from '../schemas/worker-profile.schema.js';
import type { ModelEntry } from '../data/models.js';

// ── Types ────────────────────────────────────────────────────────────

type Phase =
  | 'input'
  | 'settings'
  | 'model-select'
  | 'generating'
  | 'result'
  | 'error';

interface AutoPipelineScreenProps {
  /** OpenRouter API key */
  readonly apiKey: string;
  /** Raiz do projeto (para salvar perfis locais) */
  readonly projectRoot: string;
  /** Callback quando pipeline gerada com sucesso */
  readonly onSave: (profile: WorkerProfile) => void;
  /** Callback para cancelar e voltar */
  readonly onCancel: () => void;
}

interface Settings {
  readonly scope: ProfileScope;
  readonly seats: number;
  readonly model: string;
}

const DEFAULT_MODEL = 'deepseek/deepseek-chat';

/** Modelos elegíveis para langchain_prompt (todos do catálogo) */
const LANGCHAIN_MODELS = MODEL_CATALOG;

// ── Helpers ──────────────────────────────────────────────────────────

/** Formata nome do modelo com provider */
const modelLabel = (id: string): string => {
  const m = findModel(id);
  return m ? `${m.name} (${formatPrice(m.inputPrice)}/${formatPrice(m.outputPrice)})` : id;
};

// ── Component ────────────────────────────────────────────────────────

/**
 * Tela de criacao automatica de pipelines via LLM.
 * Interface limpa em 3 fases: input → settings → generating → result.
 *
 * @example
 * <AutoPipelineScreen
 *   apiKey="sk-..." projectRoot="/app"
 *   onSave={handleSave} onCancel={handleCancel}
 * />
 */
export const AutoPipelineScreen = ({
  apiKey,
  onSave,
  onCancel,
}: AutoPipelineScreenProps) => {
  const [phase, setPhase] = useState<Phase>('input');
  const [description, setDescription] = useState('');
  const [settings, setSettings] = useState<Settings>({
    scope: 'project',
    seats: 1,
    model: DEFAULT_MODEL,
  });
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<AutoPipelineResult | null>(null);
  const [settingsFocus, setSettingsFocus] = useState<'scope' | 'seats' | 'model' | 'confirm'>('scope');

  // ── Phase: Input ─────────────────────────────────────────────────

  const handleDescriptionSubmit = useCallback(() => {
    if (description.trim().length < 5) return;
    setPhase('settings');
  }, [description]);

  // ── Phase: Settings ──────────────────────────────────────────────

  const handleSettingsConfirm = useCallback(async () => {
    setPhase('generating');

    const genResult = await generateAutoPipeline({
      userDescription: description,
      scope: settings.scope,
      seats: settings.seats,
      apiKey,
      model: settings.model,
      onProgress: (_phase, detail) => {
        if (detail) setProgressMessage(detail);
      },
    });

    setResult(genResult);
    setPhase(genResult.ok ? 'result' : 'error');
  }, [description, settings, apiKey]);

  // ── Phase: Model select ──────────────────────────────────────────

  const handleModelSelect = useCallback((model: ModelEntry) => {
    setSettings((prev) => ({ ...prev, model: model.id }));
    setPhase('settings');
  }, []);

  // ── Input handlers ───────────────────────────────────────────────

  useInput((input, key) => {
    if (key.escape) {
      if (phase === 'model-select') { setPhase('settings'); return; }
      if (phase === 'settings') { setPhase('input'); return; }
      if (phase === 'result' || phase === 'error') { onCancel(); return; }
      if (phase === 'input') { onCancel(); return; }
      return;
    }

    if (phase === 'settings') {
      if (key.downArrow || input === 'j') {
        setSettingsFocus((f) => {
          if (f === 'scope') return 'seats';
          if (f === 'seats') return 'model';
          if (f === 'model') return 'confirm';
          return f;
        });
      }
      if (key.upArrow || input === 'k') {
        setSettingsFocus((f) => {
          if (f === 'confirm') return 'model';
          if (f === 'model') return 'seats';
          if (f === 'seats') return 'scope';
          return f;
        });
      }
      if (key.return) {
        if (settingsFocus === 'scope') {
          setSettings((p) => ({ ...p, scope: p.scope === 'global' ? 'project' : 'global' }));
        } else if (settingsFocus === 'seats') {
          setSettings((p) => ({ ...p, seats: Math.min(16, p.seats + 1) }));
        } else if (settingsFocus === 'model') {
          setPhase('model-select');
        } else if (settingsFocus === 'confirm') {
          void handleSettingsConfirm();
        }
      }
      // Decrement seats with left arrow
      if ((key.leftArrow || input === 'h') && settingsFocus === 'seats') {
        setSettings((p) => ({ ...p, seats: Math.max(1, p.seats - 1) }));
      }
      // Increment seats with right arrow
      if ((key.rightArrow || input === 'l') && settingsFocus === 'seats') {
        setSettings((p) => ({ ...p, seats: Math.min(16, p.seats + 1) }));
      }
    }

    if (phase === 'result' && result?.ok && key.return) {
      onSave(result.profile);
    }
  });

  // ── Render: Model select ─────────────────────────────────────────

  if (phase === 'model-select') {
    return (
      <ModelTable
        models={LANGCHAIN_MODELS}
        onSelect={handleModelSelect}
        title="Selecionar Modelo para Auto-Pipeline"
      />
    );
  }

  // ── Render: Input phase ──────────────────────────────────────────

  if (phase === 'input') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="magenta">{'\u2728'} Auto-Pipeline — Crie pipelines com IA</Text>
          <Text dimColor>Descreva o que voce quer que o pipeline faca.</Text>
          <Text dimColor>A IA vai interpretar e criar os steps automaticamente.</Text>
        </Box>

        <Box marginTop={1} flexDirection="column" paddingX={1}>
          <Text bold color="yellow">Exemplos:</Text>
          <Text dimColor>  {'\u2022'} "Escreva testes e corrija o codigo ate passar"</Text>
          <Text dimColor>  {'\u2022'} "Implemente a feature, faca code review via LLM e corrija"</Text>
          <Text dimColor>  {'\u2022'} "Gere codigo, capture o diff, analise qualidade e refatore"</Text>
          <Text dimColor>  {'\u2022'} "Implemente com TDD: testes primeiro, depois implementacao"</Text>
        </Box>

        <Box marginTop={1} paddingX={1}>
          <Text color="cyan" bold>{'\u276F'} </Text>
          <TextInput
            value={description}
            onChange={setDescription}
            onSubmit={handleDescriptionSubmit}
            placeholder="Descreva o pipeline desejado..."
          />
        </Box>

        <Box marginTop={1} paddingX={1}>
          <Text dimColor>Enter para continuar  |  ESC para voltar</Text>
        </Box>
      </Box>
    );
  }

  // ── Render: Settings phase ───────────────────────────────────────

  if (phase === 'settings') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="magenta">{'\u2728'} Auto-Pipeline — Configuracao</Text>
          <Text dimColor wrap="truncate">{'\u276F'} {description}</Text>
        </Box>

        <Box marginTop={1} flexDirection="column" paddingX={1}>
          {/* Scope */}
          <Box>
            <Text color={settingsFocus === 'scope' ? 'cyan' : 'white'} bold={settingsFocus === 'scope'}>
              {settingsFocus === 'scope' ? '\u25B6 ' : '  '}
              Escopo: <Text color="yellow">{settings.scope === 'global' ? 'Global (todos os projetos)' : 'Project (apenas este projeto)'}</Text>
            </Text>
          </Box>
          {settingsFocus === 'scope' && (
            <Box paddingX={4}>
              <Text dimColor>Enter para alternar entre global/project</Text>
            </Box>
          )}

          {/* Seats */}
          <Box marginTop={1}>
            <Text color={settingsFocus === 'seats' ? 'cyan' : 'white'} bold={settingsFocus === 'seats'}>
              {settingsFocus === 'seats' ? '\u25B6 ' : '  '}
              Instancias paralelas: <Text color="yellow">{settings.seats}</Text>
            </Text>
          </Box>
          {settingsFocus === 'seats' && (
            <Box paddingX={4}>
              <Text dimColor>{'\u2190'}/{'\u2192'} ajustar (1-16)  |  Enter +1</Text>
            </Box>
          )}

          {/* Model */}
          <Box marginTop={1}>
            <Text color={settingsFocus === 'model' ? 'cyan' : 'white'} bold={settingsFocus === 'model'}>
              {settingsFocus === 'model' ? '\u25B6 ' : '  '}
              Modelo: <Text color="yellow">{modelLabel(settings.model)}</Text>
            </Text>
          </Box>
          {settingsFocus === 'model' && (
            <Box paddingX={4}>
              <Text dimColor>Enter para trocar modelo</Text>
            </Box>
          )}

          {/* Confirm */}
          <Box marginTop={1} borderStyle="round" borderColor={settingsFocus === 'confirm' ? 'green' : 'gray'} paddingX={2}>
            <Text color={settingsFocus === 'confirm' ? 'green' : 'gray'} bold={settingsFocus === 'confirm'}>
              {settingsFocus === 'confirm' ? '\u25B6 ' : '  '}
              {'\u2714'} Gerar Pipeline
            </Text>
          </Box>
        </Box>

        <Box marginTop={1} paddingX={1}>
          <Text dimColor>j/k:navegar  Enter:selecionar  ESC:voltar</Text>
        </Box>
      </Box>
    );
  }

  // ── Render: Generating phase ─────────────────────────────────────

  if (phase === 'generating') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="magenta">{'\u2728'} Auto-Pipeline — Gerando...</Text>
          <Text dimColor wrap="truncate">{'\u276F'} {description}</Text>
        </Box>

        <Box marginTop={1} paddingX={1} gap={1}>
          <LoadingDots />
          <Text>{progressMessage || 'Preparando...'}</Text>
        </Box>

        <Box marginTop={1} paddingX={1} flexDirection="column">
          <Text dimColor>Modelo: {modelLabel(settings.model)}</Text>
          <Text dimColor>Escopo: {settings.scope} | Seats: {settings.seats}</Text>
        </Box>
      </Box>
    );
  }

  // ── Render: Result phase (success) ───────────────────────────────

  if (phase === 'result' && result?.ok) {
    const profile = result.profile;
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="green" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="green">{'\u2714'} Pipeline criada com sucesso!</Text>
        </Box>

        <Box marginTop={1} flexDirection="column" paddingX={1}>
          <Text bold>ID: <Text color="cyan">{profile.id}</Text></Text>
          <Text bold>Descricao: <Text dimColor>{profile.description}</Text></Text>
          <Text bold>Escopo: <Text color="yellow">{profile.scope}</Text></Text>
          <Text bold>Seats: <Text color="yellow">{profile.seats}</Text></Text>
          <Text bold>Steps: <Text color="yellow">{profile.steps.length}</Text></Text>
          <Text bold>Max execucoes: <Text color="yellow">{profile.maxStepExecutions}</Text></Text>
        </Box>

        {/* Step summary */}
        <Box marginTop={1} flexDirection="column" paddingX={1}>
          <Text bold color="yellow">Pipeline:</Text>
          {profile.steps.map((step, i) => (
            <Box key={step.id} paddingX={1}>
              <Text dimColor>{String(i + 1).padStart(2, ' ')}. </Text>
              <Text color={stepColor(step.type)}>[{step.type}]</Text>
              <Text> {step.id}</Text>
            </Box>
          ))}
        </Box>

        {/* Initial variables */}
        {Object.keys(profile.initialVariables).length > 0 && (
          <Box marginTop={1} flexDirection="column" paddingX={1}>
            <Text bold color="yellow">Variaveis iniciais:</Text>
            {Object.entries(profile.initialVariables).map(([k, v]) => (
              <Box key={k} paddingX={1}>
                <Text dimColor>${k} = {String(v)}</Text>
              </Box>
            ))}
          </Box>
        )}

        <Box marginTop={1} paddingX={1}>
          <Text dimColor>Enter para salvar  |  ESC para descartar</Text>
        </Box>
      </Box>
    );
  }

  // ── Render: Error phase ──────────────────────────────────────────

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="red">{'\u2716'} Erro ao gerar pipeline</Text>
      </Box>

      <Box marginTop={1} paddingX={1}>
        <Text color="red">{result && !result.ok ? result.error : 'Erro desconhecido'}</Text>
      </Box>

      <Box marginTop={1} paddingX={1} flexDirection="column">
        <Text dimColor>Possíveis causas:</Text>
        <Text dimColor>  {'\u2022'} Descricao muito vaga — tente ser mais especifico</Text>
        <Text dimColor>  {'\u2022'} Modelo retornou JSON invalido — tente outro modelo</Text>
        <Text dimColor>  {'\u2022'} Erro de rede/API — verifique sua API key</Text>
      </Box>

      <Box marginTop={1} paddingX={1}>
        <Text dimColor>ESC para voltar e tentar novamente</Text>
      </Box>
    </Box>
  );
};

// ── Animated spinner ─────────────────────────────────────────────────

const DOTS_FRAMES = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];

/** Spinner animado sem dependencia externa */
function LoadingDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % DOTS_FRAMES.length), 80);
    return () => clearInterval(timer);
  }, []);
  return <Text color="green">{DOTS_FRAMES[frame]}</Text>;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Cor por tipo de step para visualizacao */
function stepColor(type: string): string {
  switch (type) {
    case 'pi_agent': return 'green';
    case 'langchain_prompt': return 'magenta';
    case 'condition': return 'yellow';
    case 'goto': return 'cyan';
    case 'set_variable': return 'blue';
    case 'git_diff': return 'white';
    case 'fail': return 'red';
    default: return 'gray';
  }
}
