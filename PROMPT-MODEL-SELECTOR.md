# Prompt: Seletor de Modelos com Tabela Filtrável

Feature que substitui o SelectInput hardcoded por uma tabela rica com nome, provider, velocidade, preço e filtro de texto. Modelos visíveis na barra de status em todas as telas.

---

## Task 1: Catálogo de modelos (`src/data/models.ts`)

**Arquivo a criar:** `src/data/models.ts` (~150 LOC)

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 150 LOC), TSDoc, responsabilidade única
- @docs/langchain/langchain-models-2026.md — catálogo completo de modelos: famílias GPT-5/4.1, Gemini 2.5, DeepSeek V3.2, Claude 4.x; preços por 1M tokens; contexto max; reasoning mode
- @src/schemas/config.schema.ts — formato do model ID ("provider/modelId")
</context>

<role>
Você é um engenheiro de dados. Crie o catálogo estático de modelos disponíveis via OpenRouter com metadados para exibição em tabela.
</role>

<constraints>
- Max 150 LOC
- Array readonly exportado, tipado com interface ModelEntry
- Cada modelo tem: id (provider/modelId), name (humano), provider, tier (planner|worker|both), speed (fast|medium|slow), contextWindow (K tokens), inputPrice ($/1M tokens), outputPrice ($/1M tokens)
- Tier "planner" = modelos de raciocínio (reasoning models); "worker" = modelos rápidos; "both" = serve para ambos
- Ordenar por tier → provider → preço
- Mínimo 15 modelos cobrindo: OpenAI (GPT-4.1, GPT-4.1-mini, GPT-4.1-nano, GPT-5), Google (Gemini 2.5 Pro, Flash), Anthropic (Claude Sonnet 4, Haiku 4.5), DeepSeek (V3.2, R1), Mistral (Large, Small), Meta (Llama 4 Scout, Maverick)
- TSDoc com @example mostrando como filtrar por tier
</constraints>

<output_schema>
export interface ModelEntry {
  readonly id: string;           // "openai/gpt-4.1-mini"
  readonly name: string;         // "GPT-4.1 Mini"
  readonly provider: string;     // "OpenAI"
  readonly tier: 'planner' | 'worker' | 'both';
  readonly speed: 'fast' | 'medium' | 'slow';
  readonly contextWindow: number; // em K tokens (ex: 1000 = 1M)
  readonly inputPrice: number;   // $/1M tokens
  readonly outputPrice: number;  // $/1M tokens
}

export const MODEL_CATALOG: readonly ModelEntry[] = [ ... ];

// Helpers
export const getPlannerModels = (): readonly ModelEntry[] => ...
export const getWorkerModels = (): readonly ModelEntry[] => ...
export const findModel = (id: string): ModelEntry | undefined => ...
</output_schema>

<examples>
// Catálogo (parcial):
{ id: 'openai/gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI', tier: 'planner', speed: 'medium', contextWindow: 1000, inputPrice: 2.00, outputPrice: 8.00 },
{ id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'OpenAI', tier: 'worker', speed: 'fast', contextWindow: 1000, inputPrice: 0.40, outputPrice: 1.60 },
{ id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', tier: 'worker', speed: 'fast', contextWindow: 1000, inputPrice: 0.30, outputPrice: 2.50 },
{ id: 'anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'Anthropic', tier: 'both', speed: 'medium', contextWindow: 200, inputPrice: 3.00, outputPrice: 15.00 },
{ id: 'deepseek/deepseek-chat', name: 'DeepSeek V3.2', provider: 'DeepSeek', tier: 'both', speed: 'fast', contextWindow: 128, inputPrice: 0.28, outputPrice: 0.42 },
</examples>
```

---

## Task 2: Componente de tabela filtrável (`src/components/model-table.tsx`)

**Arquivo a criar:** `src/components/model-table.tsx` (~200 LOC)

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 200 LOC), componentes funcionais com arrow functions
- @docs/general/ink.md — Box (flexDirection, gap, borderStyle), Text (color, bold, dimColor), useInput, useStdout para viewport height; NÃO usar tabelas HTML — simular com Box/Text alinhados
- @src/data/models.ts — ModelEntry interface e MODEL_CATALOG (task 1)
</context>

<role>
Você é um desenvolvedor React/Ink especializado em TUIs tabulares. Crie o componente de tabela filtrável de modelos para terminal.
</role>

<constraints>
- Ink v6, React 19, TypeScript strict, ESM
- Max 200 LOC
- Componente aceita: models (ModelEntry[]), onSelect callback, filterPlaceholder
- Renderizar tabela com colunas: Nome | Provider | Velocidade | Contexto | Preço In | Preço Out
- Campo TextInput no topo para filtro de texto (filtra por nome, provider, ou id)
- Navegação: j/k ou setas para mover cursor, Enter para selecionar
- Velocidade colorida: fast=verde, medium=amarelo, slow=vermelho
- Scroll se tabela maior que viewport (usar useStdout para height)
- Modelo selecionado fica highlighted com backgroundColor="cyan"
- Preços formatados com $ e 2 casas decimais
- Contexto formatado em K (ex: 1000K = 1M)
</constraints>

<output_schema>
interface ModelTableProps {
  readonly models: readonly ModelEntry[];
  readonly onSelect: (model: ModelEntry) => void;
  readonly title?: string;
  readonly filterPlaceholder?: string;
}

Layout:
┌──────────────────────────────────────────────────────────────────┐
│ Selecione o modelo Planner                                       │
│ Filtro: gpt_                                                     │
├──────────────────────────────────────────────────────────────────┤
│ Nome              Provider   Vel.     Ctx    $In     $Out        │
│ ─────────────────────────────────────────────────────────────── │
│ GPT-4.1           OpenAI     medium   1M     $2.00   $8.00   ←  │
│ GPT-4.1 Mini      OpenAI     fast     1M     $0.40   $1.60      │
│ GPT-4.1 Nano      OpenAI     fast     1M     $0.10   $0.40      │
│ GPT-5             OpenAI     slow     1M     $5.00   $20.00     │
└──────────────────────────────────────────────────────────────────┘
</output_schema>

<examples>
// Filtro "gem" mostra apenas modelos Google Gemini:
│ Gemini 2.5 Pro    Google     medium   1M     $1.25   $10.00     │
│ Gemini 2.5 Flash  Google     fast     1M     $0.30   $2.50   ←  │

// Filtro vazio mostra todos os modelos do tier
</examples>
```

---

## Task 3: Reescrever config-screen com tabela de modelos (`src/screens/config-screen.tsx`)

**Arquivo a editar:** `src/screens/config-screen.tsx` (~250 LOC)

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 250 LOC)
- @docs/general/ink.md — composição de componentes, Box layout
- @src/screens/config-screen.tsx — implementação atual (135 LOC) com SelectInput hardcoded
- @src/components/model-table.tsx — ModelTable component (task 2)
- @src/data/models.ts — MODEL_CATALOG, getPlannerModels, getWorkerModels (task 1)
- @src/schemas/config.schema.ts — tipo Config
</context>

<role>
Você é um desenvolvedor React/Ink. Reescreva a tela de configuração substituindo os SelectInputs hardcoded pelo novo ModelTable filtrável.
</role>

<constraints>
- Max 250 LOC
- Manter fluxo: api-key → planner-model → worker-model → complete
- Substituir PLANNER_MODELS e WORKER_MODELS hardcoded por getPlannerModels() e getWorkerModels()
- No step planner-model: renderizar ModelTable com title="Modelo Planner (raciocínio)" filtrando por tier planner+both
- No step worker-model: renderizar ModelTable com title="Modelo Worker (execução rápida)" filtrando por tier worker+both
- Após seleção, mostrar resumo: nome do modelo + preço in/out
- Manter validação de API key inalterada
- Remover arrays PLANNER_MODELS e WORKER_MODELS hardcoded
</constraints>

<behavior>
1. Step api-key: sem mudança (TextInput + validação)
2. Step planner-model: renderizar ModelTable com modelos tier=planner|both
   - onSelect: salvar model.id, avançar para worker-model
   - Mostrar nome do modelo selecionado + preço: "GPT-4.1 ($2.00/$8.00)"
3. Step worker-model: renderizar ModelTable com modelos tier=worker|both
   - onSelect: chamar onComplete com config completa
4. Modelo selecionado exibido com nome amigável + preço, não apenas o ID
</behavior>
```

---

## Task 4: Barra de status com modelos atuais (`src/components/status-bar.tsx`)

**Arquivo a criar:** `src/components/status-bar.tsx` (~60 LOC)

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 80 LOC)
- @docs/general/ink.md — Box (borderStyle, borderColor, paddingX, gap), Text (color, bold, dimColor)
- @src/data/models.ts — findModel() para resolver nome amigável do model ID
- @src/schemas/config.schema.ts — tipo Config
</context>

<role>
Você é um desenvolvedor React/Ink. Crie uma barra de status compacta que mostra os modelos atuais.
</role>

<constraints>
- Max 60 LOC
- Componente puro (sem hooks de estado)
- Renderiza em uma linha: "Planner: GPT-4.1 | Worker: GPT-4.1 Mini | [m] trocar modelos"
- Se modelo não encontrado no catálogo, exibir ID raw
- Cores: nome do modelo em bold cyan, separadores em dimColor
- Prop opcional onChangeModels callback (se presente, mostra hint [m])
</constraints>

<output_schema>
interface StatusBarProps {
  readonly plannerModel: string;  // model ID
  readonly workerModel: string;   // model ID
  readonly onChangeModels?: () => void;
}

Layout:
┌─────────────────────────────────────────────────────────────┐
│ Planner: GPT-4.1 ($2/$8)  |  Worker: GPT-4.1 Mini ($0.4/$1.6)  |  [m] modelos │
└─────────────────────────────────────────────────────────────┘
</output_schema>
```

---

## Task 5: Integrar status bar no app.tsx e adicionar atalho [m]

**Arquivo a editar:** `src/app.tsx`

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 250 LOC para app.tsx)
- @docs/general/ink.md — useInput para keybinding global
- @src/app.tsx — router de telas atual (207 LOC)
- @src/components/status-bar.tsx — StatusBar component (task 4)
- @src/screens/config-screen.tsx — nova config screen com ModelTable (task 3)
</context>

<role>
Você é um desenvolvedor React/Ink. Integre a barra de status de modelos no app e adicione atalho para trocar modelos.
</role>

<constraints>
- Max 250 LOC total para app.tsx
- StatusBar visível em TODAS as telas EXCETO 'loading' e 'config'
- Keybinding [m] leva para tela de config preservando o restante do state (não reseta contextFiles/macroTask)
- Ao sair da config após troca de modelo, voltar para a tela anterior (não reiniciar fluxo)
- Adicionar 'model-change' como Screen type possível
- Quando config já existe (status 'loaded'), pular api-key e ir direto para seleção de modelo
</constraints>

<behavior>
1. Se config loaded: renderizar StatusBar no topo de context, task, executing, result
2. Keybinding [m] em qualquer tela (exceto config/loading/executing):
   - Salvar screen atual em previousScreen
   - Mudar para 'model-change' (renderiza ConfigScreen mas pula api-key)
   - Ao completar: salvar novos modelos, voltar para previousScreen
3. StatusBar mostra: "Planner: {nome} | Worker: {nome} | [m] modelos"
4. Se screen === 'executing': [m] desabilitado (não trocar modelo mid-execution)
</behavior>

<examples>
// Tela de contexto com status bar:
┌─────────────────────────────────────────────────────────────┐
│ Planner: GPT-4.1 ($2/$8)  |  Worker: Gemini Flash ($0.3/$2.5)  |  [m] modelos │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Selecionar Contexto                                          │
│ [x] src/app.tsx                                              │
│ [ ] src/cli.tsx                                              │
│ ...                                                          │
└─────────────────────────────────────────────────────────────┘

// Usuário pressiona [m]:
→ Tela de seleção de modelo (ModelTable) sem pedir API key novamente
→ Ao selecionar, volta para tela de contexto com novos modelos na StatusBar
</examples>
```

---

## Grafo de dependências

```
Task 1 (catálogo) ──→ Task 2 (tabela) ──→ Task 3 (config screen)
                  └──→ Task 4 (status bar) ──→ Task 5 (app.tsx)
```

**Wave 1:** Task 1 (sem deps)
**Wave 2:** Task 2 + Task 4 (dependem de Task 1, paralelas entre si)
**Wave 3:** Task 3 + Task 5 (dependem de Wave 2)

## Arquivos impactados

| Arquivo | Tipo | Task |
|---------|------|------|
| `src/data/models.ts` | NOVO | 1 |
| `src/components/model-table.tsx` | NOVO | 2 |
| `src/components/status-bar.tsx` | NOVO | 4 |
| `src/screens/config-screen.tsx` | REWRITE | 3 |
| `src/app.tsx` | EDIT | 5 |
