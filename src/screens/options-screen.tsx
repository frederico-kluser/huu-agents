/**
 * Tela de opcoes acessivel via [o] de qualquer tela.
 * Centraliza: selecao individual de modelos (planner/worker),
 * criacao de pipeline profiles, e guia de referencia.
 * Usa ModelSelector (DRY) para selecao de modelos.
 *
 * @module
 */

import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { ModelSelector } from '../components/model-selector.js';
import { ProfileBuilderScreen } from './profile-builder-screen.js';
import { AiPipelineBuilderScreen } from './ai-pipeline-builder-screen.js';
import { findModel, formatPrice } from '../data/models.js';
import type { ModelEntry } from '../data/models.js';
import type { Config } from '../schemas/config.schema.js';
import type { WorkerProfile } from '../schemas/worker-profile.schema.js';
import { validateProfileReferences } from '../schemas/worker-profile.schema.js';
import { saveProfile } from '../services/profile-catalog.js';

type OptionsPhase = 'menu' | 'planner-model' | 'worker-model' | 'create-profile' | 'ai-builder' | 'guide';

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

/**
 * Tela de opcoes: selecao individual de modelos, criacao de pipelines e guia.
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

  const handlePlannerSelect = useCallback((model: ModelEntry) => {
    const updated: Config = {
      ...config,
      plannerModel: model.id,
      selectedAgents: { ...config.selectedAgents, planner: model.id },
    };
    onConfigChange(updated);
    setSaveMessage(`Planner atualizado: ${model.name}`);
    setPhase('menu');
  }, [config, onConfigChange]);

  const handleWorkerSelect = useCallback((model: ModelEntry) => {
    const updated: Config = {
      ...config,
      workerModel: model.id,
      selectedAgents: { ...config.selectedAgents, worker: model.id },
    };
    onConfigChange(updated);
    setSaveMessage(`Worker atualizado: ${model.name}`);
    setPhase('menu');
  }, [config, onConfigChange]);

  const handleProfileSave = useCallback(async (profile: WorkerProfile) => {
    const errors = validateProfileReferences(profile);
    if (errors.length > 0) {
      setSaveMessage(`Erro: ${errors.join(' | ')}`);
      setPhase('menu');
      return;
    }

    const result = await saveProfile(profile, profile.scope, projectRoot);
    if (result.ok) {
      setSaveMessage(`Perfil "${profile.id}" salvo com sucesso`);
    } else {
      setSaveMessage(`Erro ao salvar: ${result.error.kind}`);
    }
    setPhase('menu');
  }, [projectRoot]);

  // --- Planner model selection (uses ModelSelector DRY component) ---
  if (phase === 'planner-model') {
    return (
      <ModelSelector
        apiKey={config.openrouterApiKey}
        onSelect={handlePlannerSelect}
        title="Selecionar Modelo Planner"
      />
    );
  }

  // --- Worker model selection (uses ModelSelector DRY component) ---
  if (phase === 'worker-model') {
    return (
      <ModelSelector
        apiKey={config.openrouterApiKey}
        onSelect={handleWorkerSelect}
        title="Selecionar Modelo Worker"
      />
    );
  }

  // --- Profile builder ---
  if (phase === 'create-profile') {
    return (
      <ProfileBuilderScreen
        onSave={(profile) => void handleProfileSave(profile)}
        onCancel={() => setPhase('menu')}
      />
    );
  }

  // --- AI pipeline builder ---
  if (phase === 'ai-builder' && config.openrouterApiKey) {
    return (
      <AiPipelineBuilderScreen
        apiKey={config.openrouterApiKey}
        onSave={(profile) => void handleProfileSave(profile)}
        onCancel={() => setPhase('menu')}
      />
    );
  }

  // --- Guide / Reference ---
  if (phase === 'guide') {
    return <GuideScreen onBack={() => setPhase('menu')} />;
  }

  // --- Main menu ---
  const menuItems = [
    {
      label: `\u{1F9E0}  Modelo Planner   ${modelSummary(config.selectedAgents.planner)}`,
      value: 'planner',
    },
    {
      label: `\u{2699}\u{FE0F}   Modelo Worker    ${modelSummary(config.selectedAgents.worker)}`,
      value: 'worker',
    },
    {
      label: '\u{1F9E0}  Criar Pipeline com IA (AI Builder)',
      value: 'ai-builder',
    },
    {
      label: '\u{1F527}  Criar Pipeline Manual',
      value: 'create-profile',
    },
    {
      label: '\u{1F4D6}  Guia de Referencia',
      value: 'guide',
    },
    {
      label: '\u{2190}   Voltar',
      value: 'back',
    },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="cyan">{'\u2699\uFE0F'}  Opcoes</Text>
        <Text dimColor>Configure modelos, crie pipelines e consulte o guia de referencia.</Text>
      </Box>

      {/* Descricoes das opcoes */}
      <Box marginTop={1} flexDirection="column" paddingX={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">{'\u{1F9E0}'} Modelo Planner</Text>
          <Text dimColor>  O Planner e o modelo de raciocinio pesado que decompoe sua macro-task</Text>
          <Text dimColor>  em um DAG de subtasks. Modelos maiores geram DAGs mais precisos.</Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">{'\u2699\uFE0F'}  Modelo Worker</Text>
          <Text dimColor>  Os Workers executam cada subtask em worktrees Git isoladas.</Text>
          <Text dimColor>  Modelos rapidos funcionam bem para tarefas simples.</Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">{'\u{1F9E0}'} AI Pipeline Builder</Text>
          <Text dimColor>  Descreva o que deseja e a IA gera a pipeline automaticamente.</Text>
          <Text dimColor>  Escolha qualquer modelo da OpenRouter para gerar a pipeline.</Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">{'\u{1F527}'} Pipeline Manual</Text>
          <Text dimColor>  Wizard visual para montar pipelines step-by-step manualmente.</Text>
          <Text dimColor>  Controle total sobre cada step, condicoes e variaveis.</Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">{'\u{1F4D6}'} Guia de Referencia</Text>
          <Text dimColor>  Documentacao completa sobre step types, variaveis e exemplos.</Text>
        </Box>
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
              case 'planner': setPhase('planner-model'); break;
              case 'worker': setPhase('worker-model'); break;
              case 'ai-builder': setPhase('ai-builder'); break;
              case 'create-profile': setPhase('create-profile'); break;
              case 'guide': setPhase('guide'); break;
              case 'back': onBack(); break;
            }
          }}
        />
      </Box>

      <Box paddingX={1}>
        <Text dimColor>[ESC] voltar  |  Mudancas de modelo sao salvas imediatamente</Text>
      </Box>
    </Box>
  );
};

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
        <Text bold color="cyan">{'\u{1F4D6}'} Guia de Referencia — Worker Pipeline Profiles</Text>
        <Text dimColor>Consulte tudo sobre pipelines, steps, variaveis e exemplos.</Text>
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
      <Text dimColor>  1. Crie um perfil em [o] Opcoes {'\u2192'} Criar Pipeline Profile</Text>
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
      <Text bold color="green">{'\u{1F916}'} pi_agent — Executa IA no worktree</Text>
      <Text dimColor>  Roda o Pi Coding Agent com o taskTemplate resolvido.</Text>
      <Text dimColor>  O agente pode criar/editar arquivos e rodar comandos.</Text>
      <Text color="red" dimColor>  NAO pode definir variaveis — use langchain_prompt para analise.</Text>
      <Text> </Text>
      <Text bold color="magenta">{'\u{1F4AC}'} langchain_prompt — Gera texto via LLM</Text>
      <Text dimColor>  Envia prompt ao LLM e salva a resposta em uma variavel.</Text>
      <Text dimColor>  Use para: analise, planejamento, decisoes, revisao de codigo.</Text>
      <Text> </Text>
      <Text bold color="yellow">{'\u{1F500}'} condition — Bifurca execucao</Text>
      <Text dimColor>  Avalia: $variavel operador valor (ex: $custom_tries {'>'}= 3)</Text>
      <Text dimColor>  A variavel deve ter sido definida por um step anterior.</Text>
      <Text> </Text>
      <Text bold color="cyan">{'\u27A1\uFE0F'}  goto — Salto incondicional</Text>
      <Text dimColor>  Move o cursor para outro step ou __end__.</Text>
      <Text> </Text>
      <Text bold color="blue">{'\u{1F4DD}'} set_variable — Define variavel</Text>
      <Text dimColor>  Valor literal ou expressao aritmetica.</Text>
      <Text> </Text>
      <Text bold color="white">{'\u{1F4CB}'} git_diff — Captura diff do worktree</Text>
      <Text dimColor>  Executa git diff e armazena em variavel.</Text>
      <Text> </Text>
      <Text bold color="red">{'\u{1F6D1}'} fail — Encerra com erro</Text>
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
