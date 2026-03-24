/**
 * Tela de geracao de pipeline via IA.
 * Interface limpa: descricao -> scope -> seats -> gerar -> preview -> salvar.
 * Duas requests LLM: steps + metadata. Usuario nao escolhe nome nem descricao.
 *
 * @module
 */

import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { PipelineTreeGraph } from '../components/pipeline-tree-graph.js';
import { generatePipeline, type GenerateResult } from '../agents/pipeline-generator.js';
import { validateProfileReferences } from '../schemas/worker-profile.schema.js';
import { saveProfile } from '../services/profile-catalog.js';
import type { WorkerProfile, ProfileScope } from '../schemas/worker-profile.schema.js';
import { findModel } from '../data/models.js';

type Phase =
  | 'input'           // User typing description
  | 'scope'           // Choosing local/global
  | 'seats'           // Choosing parallel instances
  | 'generating'      // LLM working
  | 'preview'         // Show result, confirm save
  | 'saved'           // Done
  | 'error';          // Generation failed

interface PipelineGeneratorScreenProps {
  /** API key para OpenRouter */
  readonly apiKey: string;
  /** Modelo LangChain selecionado (default deepseek) */
  readonly langchainModel: string;
  /** Raiz do projeto para salvar perfis locais */
  readonly projectRoot: string;
  /** Volta ao menu anterior */
  readonly onBack: () => void;
  /** Perfil salvo com sucesso */
  readonly onSaved?: (profile: WorkerProfile) => void;
}

const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3-0324';

/**
 * Tela de geracao de pipeline por IA.
 * Fluxo: descricao -> scope -> seats -> LLM gera -> preview -> salvar.
 *
 * @example
 * <PipelineGeneratorScreen
 *   apiKey="sk-or-..."
 *   langchainModel="deepseek/deepseek-chat-v3-0324"
 *   projectRoot="/home/user/project"
 *   onBack={() => setPhase('menu')}
 * />
 */
export const PipelineGeneratorScreen = ({
  apiKey,
  langchainModel,
  projectRoot,
  onBack,
  onSaved,
}: PipelineGeneratorScreenProps) => {
  const [phase, setPhase] = useState<Phase>('input');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<ProfileScope>('project');
  const [seatsInput, setSeatsInput] = useState('1');
  const [progressMsg, setProgressMsg] = useState('');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState('');

  const model = langchainModel || DEFAULT_MODEL;
  const modelInfo = findModel(model);
  const modelLabel = modelInfo?.name ?? model;

  // ── Input phase: description ──────────────────────────────────
  const handleDescriptionSubmit = useCallback(() => {
    if (description.trim().length === 0) return;
    setPhase('scope');
  }, [description]);

  // ── Scope phase ───────────────────────────────────────────────
  useInput((input: string, key: { escape: boolean; return: boolean }) => {
    if (phase === 'scope') {
      if (input === 'l' || input === '1') { setScope('project'); setPhase('seats'); }
      if (input === 'g' || input === '2') { setScope('global'); setPhase('seats'); }
      if (key.escape) { setPhase('input'); }
    }
    if (phase === 'seats') {
      if (key.escape) { setPhase('scope'); }
    }
    if (phase === 'preview') {
      if (input === 's' && result?.ok) {
        void handleSave(result.profile);
      }
      if (input === 'r') {
        setPhase('input');
        setResult(null);
      }
      if (key.escape) { onBack(); }
    }
    if (phase === 'error') {
      if (input === 'r') {
        setPhase('input');
        setResult(null);
        setError('');
      }
      if (key.escape) { onBack(); }
    }
    if (phase === 'saved') {
      if (key.return || key.escape) { onBack(); }
    }
    if (phase === 'input' && key.escape) {
      onBack();
    }
  });

  const handleSeatsSubmit = useCallback(() => {
    const parsed = parseInt(seatsInput, 10);
    const validSeats = Number.isFinite(parsed) && parsed >= 1 && parsed <= 16 ? parsed : 1;
    void handleGenerate(validSeats);
  }, [seatsInput, description, scope, model, apiKey]);

  const handleGenerate = useCallback(async (finalSeats: number) => {
    setPhase('generating');
    setProgressMsg('Initializing...');

    const genResult = await generatePipeline({
      description: description.trim(),
      scope,
      seats: finalSeats,
      model,
      apiKey,
      onProgress: (_phase, msg) => setProgressMsg(msg),
    });

    setResult(genResult);
    if (genResult.ok) {
      // Run additional reference validation
      const refErrors = validateProfileReferences(genResult.profile);
      if (refErrors.length > 0) {
        setError(`Reference validation: ${refErrors.join('; ')}`);
        setPhase('error');
        return;
      }
      setPhase('preview');
    } else {
      setError(genResult.error);
      setPhase('error');
    }
  }, [description, scope, model, apiKey]);

  const handleSave = useCallback(async (profile: WorkerProfile) => {
    const saveResult = await saveProfile(profile, profile.scope, projectRoot);
    if (saveResult.ok) {
      onSaved?.(profile);
      setPhase('saved');
    } else {
      setError(`Save failed: ${saveResult.error.kind}`);
      setPhase('error');
    }
  }, [projectRoot, onSaved]);

  // ── Render ────────────────────────────────────────────────────

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="magenta">{'\u2728'} Gerar Pipeline com IA</Text>
        <Text dimColor>Descreva o que voce quer e a IA cria o pipeline automaticamente.</Text>
        <Text dimColor>Modelo: <Text color="white">{modelLabel}</Text></Text>
      </Box>

      {/* Phase: Input */}
      {phase === 'input' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="yellow">Descreva o pipeline desejado:</Text>
          <Text dimColor>Ex: "Escreva testes, implemente o codigo, revise e corrija ate passar"</Text>
          <Text dimColor>Ex: "Analise o codigo, crie um plano, execute e valide"</Text>
          <Text dimColor>Ex: "Code review automatico com loop de correcao"</Text>
          <Box marginTop={1}>
            <Text color="cyan">{'\u276F'} </Text>
            <TextInput
              value={description}
              onChange={setDescription}
              onSubmit={handleDescriptionSubmit}
              placeholder="Descreva o que o pipeline deve fazer..."
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>[Enter] continuar  |  [ESC] voltar</Text>
          </Box>
        </Box>
      )}

      {/* Phase: Scope selection */}
      {phase === 'scope' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="yellow">Escopo do perfil:</Text>
          <Box marginTop={1} flexDirection="column" gap={1}>
            <Box>
              <Text color="cyan" bold>[1] </Text>
              <Text>Local </Text>
              <Text dimColor>(apenas este projeto — .pi-dag/)</Text>
            </Box>
            <Box>
              <Text color="cyan" bold>[2] </Text>
              <Text>Global </Text>
              <Text dimColor>(todos os projetos — ~/.pi-dag-cli/)</Text>
            </Box>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>[1/l] local  |  [2/g] global  |  [ESC] voltar</Text>
          </Box>
        </Box>
      )}

      {/* Phase: Seats */}
      {phase === 'seats' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="yellow">Instancias em paralelo (seats):</Text>
          <Text dimColor>Quantos workers com esse perfil podem rodar ao mesmo tempo (1-16).</Text>
          <Box marginTop={1}>
            <Text color="cyan">{'\u276F'} </Text>
            <TextInput
              value={seatsInput}
              onChange={setSeatsInput}
              onSubmit={handleSeatsSubmit}
              placeholder="1"
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>[Enter] gerar pipeline  |  [ESC] voltar</Text>
          </Box>
        </Box>
      )}

      {/* Phase: Generating */}
      {phase === 'generating' && (
        <Box marginTop={1} flexDirection="column" gap={1}>
          <Box gap={1}>
            <Text color="magenta"><Spinner type="dots" /></Text>
            <Text bold>Gerando pipeline...</Text>
          </Box>
          <Text dimColor>{progressMsg}</Text>
          <Box marginTop={1} flexDirection="column">
            <ProgressIndicator phase={progressMsg} />
          </Box>
        </Box>
      )}

      {/* Phase: Preview */}
      {phase === 'preview' && result?.ok && (
        <Box marginTop={1} flexDirection="column">
          <Box borderStyle="round" borderColor="green" paddingX={2} paddingY={1} flexDirection="column">
            <Text bold color="green">{'\u2714'} Pipeline gerado com sucesso!</Text>
            <Box marginTop={1} gap={2}>
              <Text dimColor>ID: <Text color="white" bold>{result.profile.id}</Text></Text>
              <Text dimColor>Scope: <Text color="white">{result.profile.scope}</Text></Text>
              <Text dimColor>Seats: <Text color="white">{result.profile.seats}</Text></Text>
            </Box>
            <Text dimColor>{result.profile.description}</Text>
          </Box>

          {/* Stats */}
          <Box marginTop={1} gap={3}>
            <Text dimColor>Steps: <Text color="white">{result.profile.steps.length}</Text></Text>
            <Text dimColor>Loop guard: <Text color="white">{result.profile.maxStepExecutions}</Text></Text>
            <Text dimColor>Entry: <Text color="white">{result.profile.entryStepId}</Text></Text>
          </Box>

          {/* Initial variables */}
          {Object.keys(result.profile.initialVariables).length > 0 && (
            <Box marginTop={1}>
              <Text dimColor>Variables: </Text>
              <Text color="blue">
                {Object.entries(result.profile.initialVariables)
                  .map(([k, v]) => `$${k}=${v}`)
                  .join('  ')}
              </Text>
            </Box>
          )}

          {/* Git-tree graph */}
          <Box marginTop={1} flexDirection="column">
            <Text bold dimColor>Pipeline Graph:</Text>
            <Box marginLeft={1} flexDirection="column">
              <PipelineTreeGraph
                steps={[...result.profile.steps]}
                entryStepId={result.profile.entryStepId}
              />
            </Box>
          </Box>

          <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
            <Text dimColor>[s] salvar  |  [r] refazer  |  [ESC] cancelar</Text>
          </Box>
        </Box>
      )}

      {/* Phase: Saved */}
      {phase === 'saved' && result?.ok && (
        <Box marginTop={1} flexDirection="column">
          <Box borderStyle="round" borderColor="green" paddingX={2} paddingY={1} flexDirection="column">
            <Text bold color="green">{'\u2714'} Perfil "{result.profile.id}" salvo!</Text>
            <Text dimColor>
              {result.profile.scope === 'project'
                ? 'Salvo em .pi-dag/worker-profiles.json'
                : 'Salvo em ~/.pi-dag-cli/worker-profiles.json'}
            </Text>
            <Text dimColor>Selecione-o na tela de perfis antes da proxima execucao.</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>[Enter/ESC] voltar</Text>
          </Box>
        </Box>
      )}

      {/* Phase: Error */}
      {phase === 'error' && (
        <Box marginTop={1} flexDirection="column">
          <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={1} flexDirection="column">
            <Text bold color="red">{'\u2716'} Erro na geracao</Text>
            <Text color="red">{error}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>[r] tentar novamente  |  [ESC] voltar</Text>
          </Box>
        </Box>
      )}

      {/* Summary bar */}
      {description.trim().length > 0 && phase !== 'input' && phase !== 'saved' && (
        <Box marginTop={1} paddingX={1}>
          <Text dimColor>Descricao: </Text>
          <Text dimColor italic>{description.length > 60 ? `${description.slice(0, 57)}...` : description}</Text>
        </Box>
      )}
    </Box>
  );
};

/** Visual progress indicator for generation phases */
function ProgressIndicator({ phase }: { readonly phase: string }) {
  const steps = [
    { label: 'Gerando steps', key: 'steps' },
    { label: 'Gerando metadados', key: 'metadata' },
    { label: 'Validando', key: 'validating' },
  ];

  const activeIdx = phase.toLowerCase().includes('metadata') ? 1
    : phase.toLowerCase().includes('validat') ? 2
    : 0;

  return (
    <Box flexDirection="column">
      {steps.map((step, idx) => (
        <Box key={step.key} gap={1}>
          <Text color={idx < activeIdx ? 'green' : idx === activeIdx ? 'yellow' : 'gray'}>
            {idx < activeIdx ? '\u2714' : idx === activeIdx ? '\u25CF' : '\u25CB'}
          </Text>
          <Text color={idx <= activeIdx ? 'white' : 'gray'}>
            {step.label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
