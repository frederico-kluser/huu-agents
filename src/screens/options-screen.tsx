/**
 * Tela de opcoes acessivel via [o] de qualquer tela.
 * Menu principal com sub-menus: API Keys, Modelos, Pipelines, Guia.
 * Modelos ficam travados se OpenRouter API key nao estiver configurada.
 * Benchmarks AA so aparecem se AA key estiver presente.
 *
 * @module
 */

import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { EnhancedModelTable } from '../components/enhanced-model-table.js';
import { ProfileBuilderScreen } from './profile-builder-screen.js';
import { AiPipelineBuilderScreen } from './ai-pipeline-builder-screen.js';
import { useModels } from '../hooks/use-models.js';
import { useArtificialAnalysis } from '../hooks/use-artificial-analysis.js';
import { buildEnrichedModels } from '../data/enriched-model.js';
import type { EnrichedModel } from '../data/enriched-model.js';
import { findModel, formatPrice } from '../data/models.js';
import type { Config } from '../schemas/config.schema.js';
import type { WorkerProfile } from '../schemas/worker-profile.schema.js';
import { validateProfileReferences } from '../schemas/worker-profile.schema.js';
import { saveProfile } from '../services/profile-catalog.js';

type OptionsPhase =
  | 'menu'
  | 'keys-menu'
  | 'models-menu'
  | 'pipelines-menu'
  | 'planner-model'
  | 'worker-model'
  | 'create-profile'
  | 'ai-builder'
  | 'guide'
  | 'edit-openrouter-key'
  | 'edit-aa-key';

interface OptionsScreenProps {
  /** Config atual (para exibir e atualizar modelos) */
  readonly config: Config;
  /** Callback quando config muda (modelo atualizado) */
  readonly onConfigChange: (config: Config) => void;
  /** Callback para voltar a tela anterior */
  readonly onBack: () => void;
  /** Raiz do projeto para salvar perfis locais */
  readonly projectRoot: string;
}

/** Formata nome do modelo com preco compacto */
const modelSummary = (id: string): string => {
  const m = findModel(id);
  if (!m) return id;
  return `${m.name} (${formatPrice(m.inputPrice)}/${formatPrice(m.outputPrice)})`;
};

/** Verifica se a OpenRouter key parece preenchida (nao valida online) */
const hasValidOrKey = (config: Config): boolean =>
  Boolean(config.openrouterApiKey?.trim());

/**
 * Tela de opcoes com sub-menus: API Keys, Modelos, Pipelines, Guia.
 *
 * @example
 * <OptionsScreen
 *   config={currentConfig}
 *   onConfigChange={(c) => saveAndUpdate(c)}
 *   onBack={() => setScreen(previousScreen)}
 *   projectRoot={process.cwd()}
 * />
 */
export const OptionsScreen = ({
  config,
  onConfigChange,
  onBack,
  projectRoot,
}: OptionsScreenProps) => {
  const [phase, setPhase] = useState<OptionsPhase>('menu');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editingOrKey, setEditingOrKey] = useState(config.openrouterApiKey);
  const [editingAaKey, setEditingAaKey] = useState(config.artificialAnalysisApiKey ?? '');
  const { state: modelsState } = useModels(config.openrouterApiKey);
  const hasAaKey = Boolean(config.artificialAnalysisApiKey);
  const { state: aaState } = useArtificialAnalysis(config.artificialAnalysisApiKey);

  // ESC volta ao parent de qualquer sub-fase de edicao de keys
  useInput((_input, key) => {
    if (key.escape && (phase === 'edit-openrouter-key' || phase === 'edit-aa-key')) {
      setPhase('keys-menu');
    }
  }, { isActive: phase === 'edit-openrouter-key' || phase === 'edit-aa-key' });

  const enrichedModels = buildEnrichedModels(
    modelsState.status === 'loaded' ? modelsState.models : [],
    aaState.status === 'loaded' ? aaState.models : [],
  );
  const hasAAData = hasAaKey && aaState.status === 'loaded';
  const orKeyValid = hasValidOrKey(config);

  const handlePlannerSelect = useCallback((model: EnrichedModel) => {
    const updated: Config = {
      ...config,
      plannerModel: model.id,
      selectedAgents: { ...config.selectedAgents, planner: model.id },
    };
    onConfigChange(updated);
    setSaveMessage(`Planner atualizado: ${model.name}`);
    setPhase('models-menu');
  }, [config, onConfigChange]);

  const handleWorkerSelect = useCallback((model: EnrichedModel) => {
    const updated: Config = {
      ...config,
      workerModel: model.id,
      selectedAgents: { ...config.selectedAgents, worker: model.id },
    };
    onConfigChange(updated);
    setSaveMessage(`Worker atualizado: ${model.name}`);
    setPhase('models-menu');
  }, [config, onConfigChange]);

  const handleProfileSave = useCallback(async (profile: WorkerProfile) => {
    const errors = validateProfileReferences(profile);
    if (errors.length > 0) {
      setSaveMessage(`Erro: ${errors.join(' | ')}`);
      setPhase('pipelines-menu');
      return;
    }

    const result = await saveProfile(profile, profile.scope, projectRoot);
    if (result.ok) {
      setSaveMessage(`Perfil "${profile.id}" salvo com sucesso`);
    } else {
      setSaveMessage(`Erro ao salvar: ${result.error.kind}`);
    }
    setPhase('pipelines-menu');
  }, [projectRoot]);

  const handleOrKeySave = useCallback((value: string) => {
    if (!value.trim()) {
      setSaveMessage('OpenRouter API key nao pode ser vazia');
      setPhase('keys-menu');
      return;
    }
    const updated: Config = { ...config, openrouterApiKey: value };
    onConfigChange(updated);
    setSaveMessage('OpenRouter API key atualizada');
    setPhase('keys-menu');
  }, [config, onConfigChange]);

  const handleAaKeySave = useCallback((value: string) => {
    const updated: Config = {
      ...config,
      artificialAnalysisApiKey: value.trim() || undefined,
    };
    onConfigChange(updated);
    setSaveMessage(value.trim() ? 'Artificial Analysis API key atualizada' : 'Artificial Analysis API key removida');
    setPhase('keys-menu');
  }, [config, onConfigChange]);

  // --- Loading models ---
  if ((phase === 'planner-model' || phase === 'worker-model') && modelsState.status === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box gap={1}>
          <Text color="green"><Spinner type="dots" /></Text>
          <Text>Carregando modelos da OpenRouter...</Text>
        </Box>
      </Box>
    );
  }

  if ((phase === 'planner-model' || phase === 'worker-model') && modelsState.status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Erro ao carregar modelos: {modelsState.error}</Text>
        <Text dimColor>Pressione ESC para voltar</Text>
      </Box>
    );
  }

  // --- Planner model selection ---
  if (phase === 'planner-model') {
    return (
      <EnhancedModelTable
        models={enrichedModels}
        onSelect={handlePlannerSelect}
        onCancel={() => setPhase('models-menu')}
        title={`Selecionar Modelo Planner (${enrichedModels.length} modelos${hasAAData ? ' + benchmarks AA' : ''})`}
        hasAAData={hasAAData}
      />
    );
  }

  // --- Worker model selection ---
  if (phase === 'worker-model') {
    return (
      <EnhancedModelTable
        models={enrichedModels}
        onSelect={handleWorkerSelect}
        onCancel={() => setPhase('models-menu')}
        title={`Selecionar Modelo Worker (${enrichedModels.length} modelos${hasAAData ? ' + benchmarks AA' : ''})`}
        hasAAData={hasAAData}
      />
    );
  }

  // --- Edit OpenRouter API Key ---
  if (phase === 'edit-openrouter-key') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="cyan">OpenRouter API Key</Text>
          <Text dimColor>Chave obrigatoria para acessar modelos LLM via OpenRouter.</Text>
          <Box marginTop={1}>
            <Text>API Key: </Text>
            <TextInput
              value={editingOrKey}
              onChange={setEditingOrKey}
              onSubmit={handleOrKeySave}
              mask="*"
              placeholder="sk-or-..."
            />
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter para salvar  |  ESC para cancelar</Text>
        </Box>
      </Box>
    );
  }

  // --- Edit Artificial Analysis API Key ---
  if (phase === 'edit-aa-key') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
          <Text bold color="cyan">Artificial Analysis API Key <Text dimColor>(opcional)</Text></Text>
          <Text dimColor>Habilita benchmarks (Intelligence Index, Coding, Math, GPQA, etc.),</Text>
          <Text dimColor>velocidade (tokens/s) e custo-beneficio na tabela de modelos.</Text>
          <Box marginTop={1}>
            <Text>AA Key: </Text>
            <TextInput
              value={editingAaKey}
              onChange={setEditingAaKey}
              onSubmit={handleAaKeySave}
              mask="*"
              placeholder="Cole a key ou Enter vazio para remover"
            />
          </Box>
          {config.artificialAnalysisApiKey && (
            <Text color="green" dimColor>Key atual configurada. Enter vazio para remover.</Text>
          )}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter para salvar  |  ESC para cancelar  |  Obtenha em artificialanalysis.ai</Text>
        </Box>
      </Box>
    );
  }

  // --- Profile builder ---
  if (phase === 'create-profile') {
    return (
      <ProfileBuilderScreen
        onSave={(profile) => void handleProfileSave(profile)}
        onCancel={() => setPhase('pipelines-menu')}
      />
    );
  }

  // --- AI pipeline builder ---
  if (phase === 'ai-builder' && config.openrouterApiKey) {
    return (
      <AiPipelineBuilderScreen
        apiKey={config.openrouterApiKey}
        onSave={(profile) => void handleProfileSave(profile)}
        onCancel={() => setPhase('pipelines-menu')}
      />
    );
  }

  // --- Guide / Reference ---
  if (phase === 'guide') {
    return <GuideScreen onBack={() => setPhase('menu')} />;
  }

  // --- API Keys sub-menu ---
  if (phase === 'keys-menu') {
    return (
      <SubMenu
        title="API Keys"
        description="Configure as chaves de acesso aos servicos."
        saveMessage={saveMessage}
        onBack={() => { setSaveMessage(null); setPhase('menu'); }}
        items={[
          {
            label: `OpenRouter API Key   ${orKeyValid ? '(configurada)' : '(nao configurada)'}`,
            value: 'edit-or-key',
          },
          {
            label: `Artificial Analysis Key   ${hasAaKey ? '(configurada)' : '(nao configurada — sem benchmarks)'}`,
            value: 'edit-aa-key',
          },
          { label: 'Voltar', value: 'back' },
        ]}
        onSelect={(value) => {
          setSaveMessage(null);
          if (value === 'edit-or-key') { setEditingOrKey(config.openrouterApiKey); setPhase('edit-openrouter-key'); }
          else if (value === 'edit-aa-key') { setEditingAaKey(config.artificialAnalysisApiKey ?? ''); setPhase('edit-aa-key'); }
          else { setPhase('menu'); }
        }}
      />
    );
  }

  // --- Models sub-menu ---
  if (phase === 'models-menu') {
    const lockedMsg = !orKeyValid ? ' (configure a OpenRouter API Key primeiro)' : '';
    return (
      <SubMenu
        title="Selecao de Modelos"
        description={orKeyValid
          ? 'Escolha modelos para o Planner (raciocinio) e Worker (execucao).'
          : 'Configure a OpenRouter API Key em API Keys para desbloquear a selecao.'}
        saveMessage={saveMessage}
        onBack={() => { setSaveMessage(null); setPhase('menu'); }}
        items={[
          {
            label: `Modelo Planner   ${modelSummary(config.selectedAgents.planner)}${lockedMsg}`,
            value: 'planner',
          },
          {
            label: `Modelo Worker    ${modelSummary(config.selectedAgents.worker)}${lockedMsg}`,
            value: 'worker',
          },
          { label: 'Voltar', value: 'back' },
        ]}
        onSelect={(value) => {
          setSaveMessage(null);
          if (!orKeyValid && (value === 'planner' || value === 'worker')) {
            setSaveMessage('Configure a OpenRouter API Key primeiro em API Keys');
            return;
          }
          if (value === 'planner') setPhase('planner-model');
          else if (value === 'worker') setPhase('worker-model');
          else setPhase('menu');
        }}
      />
    );
  }

  // --- Pipelines sub-menu ---
  if (phase === 'pipelines-menu') {
    return (
      <SubMenu
        title="Pipeline Profiles"
        description="Crie pipelines multi-step para customizar a execucao dos workers."
        saveMessage={saveMessage}
        onBack={() => { setSaveMessage(null); setPhase('menu'); }}
        items={[
          { label: 'Criar Pipeline com IA (AI Builder)', value: 'ai-builder' },
          { label: 'Criar Pipeline Manual (Wizard)', value: 'create-profile' },
          { label: 'Voltar', value: 'back' },
        ]}
        onSelect={(value) => {
          setSaveMessage(null);
          if (value === 'ai-builder') setPhase('ai-builder');
          else if (value === 'create-profile') setPhase('create-profile');
          else setPhase('menu');
        }}
      />
    );
  }

  // --- Main menu ---
  const menuItems = [
    { label: 'API Keys', value: 'keys' },
    { label: 'Modelos', value: 'models' },
    { label: 'Pipeline Profiles', value: 'pipelines' },
    { label: 'Guia de Referencia', value: 'guide' },
    { label: 'Voltar', value: 'back' },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="cyan">Opcoes</Text>
      </Box>

      {saveMessage && (
        <Box marginTop={1} paddingX={1}>
          <Text color={saveMessage.startsWith('Erro') ? 'red' : 'green'}>{saveMessage}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <SelectInput
          items={menuItems}
          onSelect={(item) => {
            setSaveMessage(null);
            switch (item.value) {
              case 'keys': setPhase('keys-menu'); break;
              case 'models': setPhase('models-menu'); break;
              case 'pipelines': setPhase('pipelines-menu'); break;
              case 'guide': setPhase('guide'); break;
              case 'back': onBack(); break;
            }
          }}
        />
      </Box>

      <Box paddingX={1}>
        <Text dimColor>[ESC] voltar</Text>
      </Box>
    </Box>
  );
};

// ── SubMenu component (DRY) ──────────────────────────────────────────

interface SubMenuProps {
  readonly title: string;
  readonly description: string;
  readonly saveMessage: string | null;
  readonly onBack: () => void;
  readonly items: readonly { readonly label: string; readonly value: string }[];
  readonly onSelect: (value: string) => void;
}

/** Sub-menu reutilizavel com titulo, descricao e itens selecionaveis. */
function SubMenu({ title, description, saveMessage, onBack, items, onSelect }: SubMenuProps) {
  useInput((_input, key) => {
    if (key.escape) onBack();
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="cyan">{title}</Text>
        <Text dimColor>{description}</Text>
      </Box>

      {saveMessage && (
        <Box marginTop={1} paddingX={1}>
          <Text color={saveMessage.startsWith('Erro') ? 'red' : 'green'}>{saveMessage}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <SelectInput
          items={items as { label: string; value: string }[]}
          onSelect={(item) => onSelect(item.value)}
        />
      </Box>

      <Box paddingX={1}>
        <Text dimColor>[ESC] voltar</Text>
      </Box>
    </Box>
  );
}

// ── Guide Screen ──────────────────────────────────────────────────────

interface GuideScreenProps {
  readonly onBack: () => void;
}

type GuideTab = 'overview' | 'steps' | 'variables' | 'examples';

/**
 * Tela de guia de referencia com abas navegaveis.
 * Documenta step types, variaveis, fluxo de criacao e exemplos.
 */
function GuideScreen({ onBack }: GuideScreenProps) {
  const [tab, setTab] = useState<GuideTab>('overview');

  useInput((input, key) => {
    if (key.escape) { onBack(); return; }
    if (input === '1') setTab('overview');
    if (input === '2') setTab('steps');
    if (input === '3') setTab('variables');
    if (input === '4') setTab('examples');
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="cyan">Guia de Referencia — Worker Pipeline Profiles</Text>
      </Box>

      {/* Tabs */}
      <Box marginTop={1} gap={2}>
        <TabItem label="1.Visao Geral" active={tab === 'overview'} />
        <TabItem label="2.Step Types" active={tab === 'steps'} />
        <TabItem label="3.Variaveis" active={tab === 'variables'} />
        <TabItem label="4.Exemplos" active={tab === 'examples'} />
      </Box>

      <Box marginTop={1} flexDirection="column" paddingX={1}>
        {tab === 'overview' && <GuideOverview />}
        {tab === 'steps' && <GuideSteps />}
        {tab === 'variables' && <GuideVariables />}
        {tab === 'examples' && <GuideExamples />}
      </Box>

      <Box marginTop={1} paddingX={1}>
        <Text dimColor>[1-4] trocar aba  |  [ESC] voltar ao menu</Text>
      </Box>
    </Box>
  );
}

function TabItem({ label, active }: { readonly label: string; readonly active: boolean }) {
  return (
    <Text color={active ? 'cyan' : 'gray'} bold={active} underline={active}>
      {active ? `[${label}]` : ` ${label} `}
    </Text>
  );
}

function GuideOverview() {
  return (
    <Box flexDirection="column">
      <Text bold color="yellow">O que e um Pipeline Profile?</Text>
      <Text dimColor>  Um perfil transforma o worker de executor one-shot em um executor</Text>
      <Text dimColor>  multi-step programavel. O DAG continua como scheduler de alto nivel;</Text>
      <Text dimColor>  a pipeline roda DENTRO de cada worker, no seu worktree isolado.</Text>
      <Text> </Text>
      <Text bold color="yellow">Fluxo de uso:</Text>
      <Text dimColor>  1. Crie um perfil em [o] Opcoes {'\u2192'} Pipeline Profiles</Text>
      <Text dimColor>  2. Defina os steps (IA, condicoes, variaveis, etc.)</Text>
      <Text dimColor>  3. Salve como "project" (local) ou "global" (todos os projetos)</Text>
      <Text dimColor>  4. Na proxima execucao, selecione o perfil na tela de selecao</Text>
      <Text dimColor>  5. Sem perfil = comportamento original (one-shot) preservado</Text>
      <Text> </Text>
      <Text bold color="yellow">Conceitos-chave:</Text>
      <Text dimColor>  {'\u2022'} <Text color="white">Steps</Text>: acoes sequenciais que formam a pipeline (7 tipos V1)</Text>
      <Text dimColor>  {'\u2022'} <Text color="white">Variaveis</Text>: estado compartilhado entre steps ($task, $custom_*)</Text>
      <Text dimColor>  {'\u2022'} <Text color="white">Entry Step</Text>: primeiro step executado (auto-detectado pelo menor ID)</Text>
      <Text dimColor>  {'\u2022'} <Text color="white">Loop Guard</Text>: maxStepExecutions impede loops infinitos (default: 20)</Text>
      <Text dimColor>  {'\u2022'} <Text color="white">Seats</Text>: quantos workers com esse perfil rodam em paralelo por wave</Text>
      <Text dimColor>  {'\u2022'} <Text color="white">__end__</Text>: target especial que encerra a pipeline com sucesso</Text>
      <Text> </Text>
      <Text bold color="yellow">Onde ficam salvos?</Text>
      <Text dimColor>  {'\u2022'} Global: ~/.pi-dag-cli/worker-profiles.json</Text>
      <Text dimColor>  {'\u2022'} Local:  .pi-dag/worker-profiles.json (tem precedencia)</Text>
      <Text> </Text>
      <Text bold color="yellow">Regra importante sobre variaveis:</Text>
      <Text dimColor>  {'\u2022'} pi_agent NAO pode definir variaveis — apenas modifica arquivos</Text>
      <Text dimColor>  {'\u2022'} Use langchain_prompt para analise e decisoes (salva em variavel)</Text>
      <Text dimColor>  {'\u2022'} Use set_variable para contadores e flags literais</Text>
    </Box>
  );
}

function GuideSteps() {
  return (
    <Box flexDirection="column">
      <Text bold color="yellow">7 Step Types disponiveis (V1)</Text>
      <Text> </Text>
      <Text bold color="green">pi_agent — Executa IA no worktree</Text>
      <Text dimColor>  Roda o Pi Coding Agent com o taskTemplate resolvido.</Text>
      <Text dimColor>  O agente pode criar/editar arquivos e rodar comandos.</Text>
      <Text color="red" dimColor>  NAO pode definir variaveis — use langchain_prompt para analise.</Text>
      <Text> </Text>
      <Text bold color="magenta">langchain_prompt — Gera texto via LLM</Text>
      <Text dimColor>  Envia prompt ao LLM e salva a resposta em uma variavel.</Text>
      <Text dimColor>  Use para: analise, planejamento, decisoes, revisao de codigo.</Text>
      <Text> </Text>
      <Text bold color="yellow">condition — Bifurca execucao</Text>
      <Text dimColor>  Avalia: $variavel operador valor (ex: $custom_tries {'>'}= 3)</Text>
      <Text dimColor>  A variavel deve ter sido definida por um step anterior.</Text>
      <Text> </Text>
      <Text bold color="cyan">goto — Salto incondicional</Text>
      <Text dimColor>  Move o cursor para outro step ou __end__.</Text>
      <Text> </Text>
      <Text bold color="blue">set_variable — Define variavel</Text>
      <Text dimColor>  Valor literal ou expressao aritmetica.</Text>
      <Text> </Text>
      <Text bold color="white">git_diff — Captura diff do worktree</Text>
      <Text dimColor>  Executa git diff e armazena em variavel.</Text>
      <Text> </Text>
      <Text bold color="red">fail — Encerra com erro</Text>
      <Text dimColor>  Encerra a pipeline com mensagem de erro de negocio.</Text>
    </Box>
  );
}

function GuideVariables() {
  return (
    <Box flexDirection="column">
      <Text bold color="yellow">Sistema de Variaveis</Text>
      <Text dimColor>  Variaveis sao o estado compartilhado entre steps de uma pipeline.</Text>
      <Text> </Text>
      <Text bold color="cyan">Variaveis Reservadas</Text>
      <Text dimColor>  <Text color="white" bold>$task</Text>    Descricao da subtask atribuida ao worker pelo DAG.</Text>
      <Text dimColor>  <Text color="white" bold>$diff</Text>    Diff do worktree (preenchida por git_diff).</Text>
      <Text dimColor>  <Text color="white" bold>$error</Text>   Ultimo erro (preenchida automaticamente).</Text>
      <Text> </Text>
      <Text bold color="cyan">Variaveis Custom ($custom_*)</Text>
      <Text dimColor>  Criadas via initialVariables, set_variable, ou langchain_prompt.</Text>
      <Text dimColor>  Use $custom_nome em qualquer template de step.</Text>
      <Text> </Text>
      <Text bold color="cyan">Quem pode definir variaveis?</Text>
      <Text dimColor>  {'\u2022'} <Text color="white">set_variable</Text>: valor literal ou expressao aritmetica</Text>
      <Text dimColor>  {'\u2022'} <Text color="white">langchain_prompt</Text>: resultado do LLM no outputTarget</Text>
      <Text dimColor>  {'\u2022'} <Text color="white">git_diff</Text>: diff do worktree no target</Text>
      <Text dimColor>  {'\u2022'} <Text color="red">pi_agent</Text>: NAO pode definir variaveis</Text>
    </Box>
  );
}

function GuideExamples() {
  return (
    <Box flexDirection="column">
      <Text bold color="yellow">Exemplo: test-driven-fixer</Text>
      <Text dimColor>  Pipeline que gera testes, corrige, valida e reformula.</Text>
      <Text> </Text>
      <Text color="blue">  [1] set_variable    $custom_tries = $custom_tries + 1</Text>
      <Text color="green">  [2] pi_agent        "Write tests for: $task"</Text>
      <Text color="green">  [3] pi_agent        "Fix code to pass tests: $task"</Text>
      <Text color="yellow">  [4] condition       $custom_tries {'>'}= 3</Text>
      <Text dimColor>       true {'\u2192'} __end__  |  false {'\u2192'} volta p/ [1]</Text>
      <Text> </Text>
      <Text bold color="yellow">Exemplo: analyze-then-act (decisao com langchain_prompt)</Text>
      <Text dimColor>  Analisa se refatoracao e necessaria e age conforme resultado.</Text>
      <Text> </Text>
      <Text color="magenta">  [1] langchain_prompt "Analyze $task..." {'\u2192'} $custom_needs_refactor</Text>
      <Text color="yellow">  [2] condition        $custom_needs_refactor == true</Text>
      <Text color="green">  [3] pi_agent         "Refactor: $task" (se true)</Text>
      <Text dimColor>       false {'\u2192'} __end__ (nenhuma acao necessaria)</Text>
      <Text> </Text>
      <Text bold color="yellow">Dica: Comece simples</Text>
      <Text dimColor>  1. Crie um perfil com 2-3 steps para testar</Text>
      <Text dimColor>  2. Use initialVariables para contadores de loop</Text>
      <Text dimColor>  3. Sempre inclua condicao de saida</Text>
      <Text dimColor>  4. Use langchain_prompt para decisoes, pi_agent para acoes</Text>
    </Box>
  );
}
