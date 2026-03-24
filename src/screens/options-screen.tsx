/**
 * Tela de opcoes acessivel via [o] de qualquer tela.
 * Centraliza: selecao individual de modelos (planner/worker),
 * criacao de pipeline profiles, e guia de referencia.
 *
 * @module
 */

import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { ModelTable } from '../components/model-table.js';
import { ProfileBuilderScreen } from './profile-builder-screen.js';
import { useOpenRouterModels } from '../hooks/use-openrouter-models.js';
import { findModel, formatPrice, toModelEntry } from '../data/models.js';
import type { ModelEntry } from '../data/models.js';
import type { Config } from '../schemas/config.schema.js';
import type { WorkerProfile } from '../schemas/worker-profile.schema.js';
import { validateProfileReferences } from '../schemas/worker-profile.schema.js';
import { saveProfile } from '../services/profile-catalog.js';

type OptionsPhase = 'menu' | 'planner-model' | 'worker-model' | 'create-profile' | 'guide';

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
  const { state: modelsState } = useOpenRouterModels(config.openrouterApiKey);

  const allModels: readonly ModelEntry[] =
    modelsState.status === 'loaded' ? modelsState.models.map(toModelEntry) : [];

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

  // --- Loading models ---
  if ((phase === 'planner-model' || phase === 'worker-model') && modelsState.status !== 'loaded') {
    return (
      <Box padding={1} gap={1}>
        {modelsState.status === 'error' ? (
          <Text color="red">Erro ao buscar modelos: {modelsState.message}</Text>
        ) : (
          <>
            <Text color="yellow">⏳</Text>
            <Text>Carregando modelos da OpenRouter...</Text>
          </>
        )}
      </Box>
    );
  }

  // --- Planner model selection ---
  if (phase === 'planner-model') {
    return (
      <ModelTable
        models={allModels}
        onSelect={handlePlannerSelect}
        title={`Selecionar Modelo Planner (${allModels.length} modelos)`}
      />
    );
  }

  // --- Worker model selection ---
  if (phase === 'worker-model') {
    return (
      <ModelTable
        models={allModels}
        onSelect={handleWorkerSelect}
        title={`Selecionar Modelo Worker (${allModels.length} modelos)`}
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
      label: '\u{1F527}  Criar Pipeline Profile',
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
          <Text dimColor>  Modelos menores sao mais rapidos e baratos.</Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">{'\u2699\uFE0F'}  Modelo Worker</Text>
          <Text dimColor>  Os Workers executam cada subtask em worktrees Git isoladas.</Text>
          <Text dimColor>  Modelos rapidos funcionam bem para tarefas simples.</Text>
          <Text dimColor>  Modelos maiores ajudam em tarefas complexas.</Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">{'\u{1F527}'} Pipeline Profile</Text>
          <Text dimColor>  Transforma workers de executores one-shot em pipelines multi-step.</Text>
          <Text dimColor>  Crie fluxos com IA, condicoes, loops e variaveis compartilhadas.</Text>
          <Text dimColor>  Ex: gerar testes {'\u2192'} corrigir codigo {'\u2192'} validar {'\u2192'} reformular se falhou.</Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">{'\u{1F4D6}'} Guia de Referencia</Text>
          <Text dimColor>  Documentacao completa sobre step types, variaveis, como criar</Text>
          <Text dimColor>  pipelines e exemplos de uso. Consulte antes de criar perfis.</Text>
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
      <Text color="red" dimColor>  {'!!'} NAO cria variaveis do pipeline — opera apenas no filesystem.</Text>
      <Text dimColor>  Le: $task, $custom_* (via template)  |  Escreve: nenhuma variavel</Text>
      <Text> </Text>
      <Text bold color="magenta">{'\u{1F4AC}'} langchain_prompt — Gera texto via LLM</Text>
      <Text dimColor>  Envia prompt ao LLM e salva a resposta em uma variavel.</Text>
      <Text dimColor>  Ideal para reformular tasks ou tomar decisoes.</Text>
      <Text dimColor>  Le: $task, $custom_* (via inputTemplate)  |  Escreve: outputTarget</Text>
      <Text> </Text>
      <Text bold color="yellow">{'\u{1F500}'} condition — Bifurca execucao</Text>
      <Text dimColor>  Avalia: $variavel operador valor (ex: $custom_tries {'>'}= 3)</Text>
      <Text dimColor>  Operadores: ==  !=  {'>='}  {'<='}  {'>'}  {'<'}</Text>
      <Text dimColor>  Le: variavel da expressao  |  Escreve: nenhuma</Text>
      <Text> </Text>
      <Text bold color="cyan">{'\u27A1\uFE0F'}  goto — Salto incondicional</Text>
      <Text dimColor>  Move o cursor para outro step ou __end__.</Text>
      <Text dimColor>  Cuidado com loops sem condicao de saida!</Text>
      <Text> </Text>
      <Text bold color="blue">{'\u{1F4DD}'} set_variable — Define variavel</Text>
      <Text dimColor>  Valor literal: value (numero, texto, boolean)</Text>
      <Text dimColor>  OU expressao: valueExpression ($custom_tries + 1)</Text>
      <Text dimColor>  Apenas UM dos dois pode ser usado por vez.</Text>
      <Text dimColor>  Le: variavel na expressao  |  Escreve: target</Text>
      <Text> </Text>
      <Text bold color="white">{'\u{1F4CB}'} git_diff — Captura diff do worktree</Text>
      <Text dimColor>  Executa git diff e armazena em variavel (normalmente $diff).</Text>
      <Text dimColor>  Use antes de condition ou langchain_prompt para analisar mudancas.</Text>
      <Text> </Text>
      <Text bold color="red">{'\u{1F6D1}'} fail — Encerra com erro</Text>
      <Text dimColor>  Encerra a pipeline com mensagem de erro de negocio.</Text>
      <Text dimColor>  O worker sera marcado como falho no DAG.</Text>
    </Box>
  );
}

function GuideVariables() {
  return (
    <Box flexDirection="column">
      <Text bold color="yellow">Sistema de Variaveis</Text>
      <Text dimColor>  Variaveis sao o estado compartilhado entre steps de uma pipeline.</Text>
      <Text dimColor>  Cada worker tem suas proprias variaveis — NAO ha memoria cross-worker.</Text>
      <Text> </Text>

      <Text bold color="cyan">Variaveis Reservadas (preenchidas automaticamente)</Text>
      <Text> </Text>
      <Text dimColor>  <Text color="white" bold>$task</Text>    Descricao da subtask atribuida ao worker pelo DAG.</Text>
      <Text dimColor>           Pode ser sobrescrita por langchain_prompt ou set_variable.</Text>
      <Text dimColor>           Origem: preenchida pelo runtime antes do primeiro step.</Text>
      <Text> </Text>
      <Text dimColor>  <Text color="white" bold>$diff</Text>    Diff do worktree do worker no momento da coleta.</Text>
      <Text dimColor>           Atualizada APENAS pelo step git_diff.</Text>
      <Text dimColor>           Comeca vazia — use git_diff para preencher.</Text>
      <Text> </Text>
      <Text dimColor>  <Text color="white" bold>$error</Text>   Ultimo erro tecnico ou de negocio.</Text>
      <Text dimColor>           Preenchida automaticamente pelo runtime quando um step falha.</Text>
      <Text dimColor>           Pode ser usada em templates para contexto de erro.</Text>
      <Text> </Text>

      <Text bold color="cyan">Variaveis Custom ($custom_*)</Text>
      <Text> </Text>
      <Text dimColor>  <Text color="white" bold>Como CRIAR:</Text></Text>
      <Text dimColor>  1. No perfil: adicione em "initialVariables" com valor inicial</Text>
      <Text dimColor>     Ex: custom_tries = 0, custom_pass = false</Text>
      <Text dimColor>  2. Via set_variable: define/atualiza qualquer $custom_* em runtime</Text>
      <Text dimColor>  3. Via langchain_prompt: a resposta do LLM e salva no outputTarget</Text>
      <Text> </Text>
      <Text dimColor>  <Text color="white" bold>Como LER:</Text></Text>
      <Text dimColor>  Use $custom_nome em qualquer template de step.</Text>
      <Text dimColor>  Ex: "Fix code to pass: $task (tentativa $custom_tries)"</Text>
      <Text dimColor>  Se a variavel nao existir, $custom_nome permanece literal no texto.</Text>
      <Text> </Text>

      <Text bold color="cyan">Quem pode CRIAR/MODIFICAR variaveis?</Text>
      <Text> </Text>
      <Box flexDirection="column" paddingX={2}>
        <Text>  <Text color="blue">{'\u{1F4DD}'} set_variable</Text>   {'\u2714'} Cria e modifica qualquer variavel</Text>
        <Text>  <Text color="magenta">{'\u{1F4AC}'} langchain_prompt</Text> {'\u2714'} Escreve resposta no outputTarget</Text>
        <Text>  <Text color="white">{'\u{1F4CB}'} git_diff</Text>         {'\u2714'} Escreve diff na variavel target</Text>
        <Text>  <Text color="green">{'\u{1F916}'} pi_agent</Text>         {'\u2716'} <Text color="red">NAO modifica variaveis</Text></Text>
        <Text dimColor>                       (opera apenas no filesystem do worktree)</Text>
        <Text>  <Text color="yellow">{'\u{1F500}'} condition</Text>        {'\u2716'} Apenas le para decidir caminho</Text>
        <Text>  <Text color="cyan">{'\u27A1\uFE0F'}  goto</Text>             {'\u2716'} Apenas redireciona fluxo</Text>
        <Text>  <Text color="red">{'\u{1F6D1}'} fail</Text>             {'\u2716'} Apenas encerra com erro</Text>
      </Box>
      <Text> </Text>

      <Text bold color="cyan">Expressoes suportadas</Text>
      <Text dimColor>  Condicoes: $var == valor  |  $var != valor  |  $var {'>='}  {'<='} {'>'} {'<'}</Text>
      <Text dimColor>  Aritmetica: $var + N  |  $var - N  |  $var * N  |  $var / N</Text>
    </Box>
  );
}

function GuideExamples() {
  return (
    <Box flexDirection="column">
      <Text bold color="yellow">Exemplo: test-driven-fixer</Text>
      <Text dimColor>  Pipeline que gera testes, corrige, valida e reformula se necessario.</Text>
      <Text> </Text>
      <Text dimColor>  Variaveis iniciais: custom_tries = 0</Text>
      <Text> </Text>
      <Text color="blue">  [1] set_variable    $custom_tries = $custom_tries + 1</Text>
      <Text dimColor>   {'\u2502'}</Text>
      <Text color="green">  [2] pi_agent        "Write tests for: $task"</Text>
      <Text dimColor>   {'\u2502'}</Text>
      <Text color="green">  [3] pi_agent        "Fix code to pass tests: $task"</Text>
      <Text dimColor>   {'\u2502'}</Text>
      <Text color="yellow">  [4] condition       $custom_tries {'>'}= 3</Text>
      <Text dimColor>   {'\u251C'}<Text color="green">{'\u2714'} true</Text> {'\u2192'} [done] goto __end__</Text>
      <Text dimColor>   {'\u2514'}<Text color="red">{'\u2716'} false</Text> {'\u2192'} [5] set_variable (incrementa tries, volta p/ [2])</Text>
      <Text> </Text>

      <Text bold color="yellow">Exemplo: code-review-loop</Text>
      <Text dimColor>  Pipeline que implementa, revisa via LLM e corrige ate aprovacao.</Text>
      <Text> </Text>
      <Text color="green">  [1] pi_agent        "Implement: $task"</Text>
      <Text dimColor>   {'\u2502'}</Text>
      <Text color="white">  [2] git_diff        {'\u2192'} $diff</Text>
      <Text dimColor>   {'\u2502'}</Text>
      <Text color="magenta">  [3] langchain_prompt "Review this diff: $diff" {'\u2192'} $custom_review</Text>
      <Text dimColor>   {'\u2502'}</Text>
      <Text color="yellow">  [4] condition       $custom_review == approved</Text>
      <Text dimColor>   {'\u251C'}<Text color="green">{'\u2714'} true</Text> {'\u2192'} __end__</Text>
      <Text dimColor>   {'\u2514'}<Text color="red">{'\u2716'} false</Text> {'\u2192'} [5] pi_agent "Fix issues: $custom_review"</Text>
      <Text> </Text>

      <Text bold color="yellow">Dica: Comece simples</Text>
      <Text dimColor>  1. Crie um perfil com 2-3 steps para testar o conceito</Text>
      <Text dimColor>  2. Use initialVariables para contadores de loop</Text>
      <Text dimColor>  3. Sempre inclua uma condicao de saida para evitar loops infinitos</Text>
      <Text dimColor>  4. Use git_diff antes de langchain_prompt para analisar mudancas</Text>
    </Box>
  );
}
