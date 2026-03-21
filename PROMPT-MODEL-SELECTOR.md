# Prompt: Seletor de Modelos com Tabela Filtrável

Feature que substitui o SelectInput hardcoded por uma tabela rica com nome, provider, velocidade, preço, benchmark e filtro de texto. Modelos visíveis na barra de status em todas as telas.

**Fonte de dados:** LLM Cost-Performance Matrix, Março 2026 — 18 modelos analisados com preços, benchmarks (SWE-Bench, Terminal-Bench, HumanEval) e performance/custo ratio.

---

## Task 1: Catálogo de modelos (`src/data/models.ts`)

**Arquivo a criar:** `src/data/models.ts` (~250 LOC)

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 250 LOC), TSDoc, responsabilidade única
- @src/schemas/config.schema.ts — formato do model ID ("provider/modelId")
</context>

<role>
Você é um engenheiro de dados. Crie o catálogo estático de modelos disponíveis via OpenRouter com metadados completos de preço, performance e velocidade para exibição em tabela filtrável.
</role>

<constraints>
- Max 250 LOC
- Array readonly exportado, tipado com interface ModelEntry
- Cada modelo tem: id, name, provider, tier, speed (tok/s numérico), contextWindow (K), inputPrice, outputPrice, cachePrice, sweBench (%), perfCostRatio
- Tier: "planner" = reasoning pesado, "worker" = execução rápida, "both" = serve para ambos
- Ordenar por tier → perfCostRatio decrescente (melhor custo-benefício primeiro)
- TSDoc com @example mostrando filtro por tier
- Incluir os 18 modelos da pesquisa de cost-performance abaixo
</constraints>

<output_schema>
export interface ModelEntry {
  readonly id: string;              // "openai/gpt-4.1-mini" — formato OpenRouter
  readonly name: string;            // "GPT-4.1 Mini" — nome humano
  readonly provider: string;        // "OpenAI" — nome do provider
  readonly tier: 'planner' | 'worker' | 'both';
  readonly speed: number;           // tokens/segundo (ex: 143)
  readonly contextWindow: number;   // em K tokens (ex: 1000 = 1M)
  readonly inputPrice: number;      // $/1M tokens input
  readonly outputPrice: number;     // $/1M tokens output
  readonly cachePrice: number;      // $/1M tokens cached input (0 se N/A)
  readonly sweBench: number | null; // SWE-Bench Verified % (null se desconhecido)
  readonly perfCostRatio: number;   // Performance/Cost score (maior = melhor)
}

export const MODEL_CATALOG: readonly ModelEntry[] = [ ... ];

// Helpers
export const getPlannerModels = (): readonly ModelEntry[] =>
  MODEL_CATALOG.filter(m => m.tier === 'planner' || m.tier === 'both');

export const getWorkerModels = (): readonly ModelEntry[] =>
  MODEL_CATALOG.filter(m => m.tier === 'worker' || m.tier === 'both');

export const findModel = (id: string): ModelEntry | undefined =>
  MODEL_CATALOG.find(m => m.id === id);

export const formatPrice = (price: number): string =>
  price < 1 ? `$${price.toFixed(2)}` : `$${price.toFixed(0)}`;

export const formatContext = (k: number): string =>
  k >= 1000 ? `${(k / 1000).toFixed(1)}M` : `${k}K`;
</output_schema>

<data>
Os 18 modelos com dados verificados da pesquisa LLM Cost-Performance Matrix (Março 2026).
Velocidades usam valor médio do range reportado. SWE-Bench usa valor confirmado (não auto-reportado).

// --- TIER: PLANNER (reasoning pesado — decomposição arquitetural, planning) ---
{ id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'Anthropic', tier: 'planner', speed: 45, contextWindow: 1000, inputPrice: 5.00, outputPrice: 25.00, cachePrice: 0.50, sweBench: 80.8, perfCostRatio: 11 },
// Melhor SWE-rebench (51.7%), raciocínio abstrato (ARC-AGI-2: 68.8%), output max 128K, adaptive thinking

{ id: 'openai/gpt-5.4', name: 'GPT-5.4', provider: 'OpenAI', tier: 'planner', speed: 55, contextWindow: 1050, inputPrice: 2.50, outputPrice: 15.00, cachePrice: 0.25, sweBench: 80.0, perfCostRatio: 19 },
// Maior contexto (1.05M), computer use nativo, Tool Search (-47% tokens), SWE-Bench Pro 57.7%

{ id: 'google/gemini-3.1-pro', name: 'Gemini 3.1 Pro', provider: 'Google', tier: 'planner', speed: 50, contextWindow: 1000, inputPrice: 2.00, outputPrice: 12.00, cachePrice: 0.20, sweBench: 80.6, perfCostRatio: 24 },
// #1 Terminal-Bench (78.4%), LiveCodeBench Elo 2887, GPQA Diamond 94.3%, multimodal nativo, preview

{ id: 'openai/gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'OpenAI', tier: 'planner', speed: 68, contextWindow: 400, inputPrice: 1.75, outputPrice: 14.00, cachePrice: 0.175, sweBench: null, perfCostRatio: 0 },
// Terminal-Bench 77.3%, SWE-Bench Pro 56.8%, async tasks em worktrees, interactive steering

// --- TIER: BOTH (serve como planner ou worker) ---
{ id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'Anthropic', tier: 'both', speed: 62, contextWindow: 1000, inputPrice: 3.00, outputPrice: 15.00, cachePrice: 0.30, sweBench: 79.6, perfCostRatio: 18 },
// Workhorse 80-90% dos workloads, preferido 59% sobre Opus no Claude Code, Elo GDPval-AA 1633

{ id: 'minimax/minimax-m2.5', name: 'MiniMax M2.5', provider: 'MiniMax', tier: 'both', speed: 50, contextWindow: 196, inputPrice: 0.15, outputPrice: 1.20, cachePrice: 0.015, sweBench: 80.2, perfCostRatio: 242 },
// SWEET SPOT: 80.2% SWE-Bench a 1/20 do Opus, SWE-Bench Pro 55.4%, MoE 230B/10B ativo, MIT mod

{ id: 'moonshot/kimi-k2.5', name: 'Kimi K2.5', provider: 'Moonshot', tier: 'both', speed: 80, contextWindow: 256, inputPrice: 0.60, outputPrice: 2.50, cachePrice: 0.10, sweBench: 76.8, perfCostRatio: 99 },
// HumanEval 99% (#1), Agent Swarm (100 sub-agents), 1.04T params, input barato para review

{ id: 'deepseek/deepseek-chat', name: 'DeepSeek V3.2', provider: 'DeepSeek', tier: 'both', speed: 27, contextWindow: 128, inputPrice: 0.28, outputPrice: 0.42, cachePrice: 0.028, sweBench: 70.4, perfCostRatio: 396 },
// Output MAIS BARATO ($0.42/M = 60x menos que Opus), 685B/37B MoE, lento (27 tok/s), 128K ctx

{ id: 'anthropic/claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'Anthropic', tier: 'both', speed: 116, contextWindow: 200, inputPrice: 1.00, outputPrice: 5.00, cachePrice: 0.10, sweBench: 73.3, perfCostRatio: 50 },
// 90% performance Sonnet 4.5, 106-126 tok/s, extended thinking, 200K ctx (não 1M), batch $0.50/$2.50

// --- TIER: WORKER (execução rápida — implementação, testes, refactoring) ---
{ id: 'google/gemini-3-flash', name: 'Gemini 3 Flash', provider: 'Google', tier: 'worker', speed: 164, contextWindow: 1000, inputPrice: 0.50, outputPrice: 3.00, cachePrice: 0.05, sweBench: 78.0, perfCostRatio: 91 },
// Free tier disponível, 1M ctx, SWE-rebench 46.7%, 30% menos tokens que 2.5 Pro

{ id: 'google/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', provider: 'Google', tier: 'worker', speed: 300, contextWindow: 1000, inputPrice: 0.25, outputPrice: 1.50, cachePrice: 0.025, sweBench: null, perfCostRatio: 168 },
// MAIS RÁPIDO (249-363 tok/s), 1M ctx a $0.25, destilado do Pro, LiveCodeBench 72%, free tier

{ id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', tier: 'worker', speed: 110, contextWindow: 1000, inputPrice: 0.30, outputPrice: 2.50, cachePrice: 0.03, sweBench: 64.0, perfCostRatio: 93 },
// GA (estável em produção), free tier com Google Search grounding, sendo substituído pelo 3 Flash

{ id: 'stepfun/step-3.5-flash', name: 'Step 3.5 Flash', provider: 'StepFun', tier: 'worker', speed: 230, contextWindow: 262, inputPrice: 0.10, outputPrice: 0.30, cachePrice: 0.02, sweBench: 74.4, perfCostRatio: 709 },
// 83x mais barato que Opus em output, AIME 2025 97.3%, Apache 2.0, roda em Mac Studio M4 Max

{ id: 'xiaomi/mimo-v2-flash', name: 'MiMo-V2-Flash', provider: 'Xiaomi', tier: 'worker', speed: 135, contextWindow: 256, inputPrice: 0.10, outputPrice: 0.30, cachePrice: 0, sweBench: 73.4, perfCostRatio: 757 },
// MELHOR P/C RATIO (757), SWE-Bench Multilingual 71.7% (#1 open-source), 309B/15B MoE

{ id: 'mistral/devstral-small-2', name: 'Devstral Small 2', provider: 'Mistral', tier: 'worker', speed: 198, contextWindow: 256, inputPrice: 0.10, outputPrice: 0.30, cachePrice: 0, sweBench: 68.0, perfCostRatio: 702 },
// Apache 2.0 COMPLETA, roda em RTX 4090 / Mac 32GB / CPU-only, 24B, zero custo API possível

{ id: 'mistral/devstral-2', name: 'Devstral 2', provider: 'Mistral', tier: 'worker', speed: 60, contextWindow: 256, inputPrice: 0.40, outputPrice: 2.00, cachePrice: 0, sweBench: 72.2, perfCostRatio: 122 },
// GRÁTIS na Mistral API (promoção), 123B denso, MIT modificada (>$20M/mês precisa licença), Vibe CLI

{ id: 'xai/grok-code-fast-1', name: 'Grok Code Fast 1', provider: 'xAI', tier: 'worker', speed: 155, contextWindow: 256, inputPrice: 0.20, outputPrice: 1.50, cachePrice: 0.02, sweBench: 64.2, perfCostRatio: 156 },
// SWE-Bench controverso (57.6-70.8% depende do scaffold), 201 tok/s medidos, #1 volume OpenRouter

{ id: 'alibaba/qwen3-coder-480b', name: 'Qwen3-Coder 480B', provider: 'Alibaba', tier: 'worker', speed: 115, contextWindow: 262, inputPrice: 0.22, outputPrice: 1.00, cachePrice: 0, sweBench: 55.0, perfCostRatio: 184 },
// Apache 2.0, pass@5 64.6% (SWE-rebench), 480B/35B MoE, grátis no OpenRouter (rate limited)
</data>
```

---

## Task 2: Componente de tabela filtrável (`src/components/model-table.tsx`)

**Arquivo a criar:** `src/components/model-table.tsx` (~200 LOC)

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 200 LOC), componentes funcionais com arrow functions
- @docs/general/ink.md — Box (flexDirection, gap, borderStyle), Text (color, bold, dimColor), useInput, useStdout para viewport height; NÃO usar tabelas HTML — simular com Box/Text alinhados
- @src/data/models.ts — ModelEntry interface, formatPrice, formatContext (task 1)
</context>

<role>
Você é um desenvolvedor React/Ink especializado em TUIs tabulares. Crie o componente de tabela filtrável de modelos para terminal.
</role>

<constraints>
- Ink v6, React 19, TypeScript strict, ESM
- Max 200 LOC
- Componente aceita: models (ModelEntry[]), onSelect callback, title
- Colunas: Nome | Provider | Vel.(tok/s) | Ctx | $In | $Out | SWE% | P/C
- Campo TextInput no topo para filtro (filtra por nome, provider, ou id — case insensitive)
- Navegação: j/k ou setas para mover cursor, Enter para selecionar
- Velocidade colorida: >=150=verde, >=50=amarelo, <50=vermelho
- SWE-Bench colorido: >=78=verde, >=70=amarelo, <70=cinza, null="—"
- P/C (perf/cost ratio) colorido: >=200=verde bold, >=50=amarelo, <50=dimColor
- Scroll se tabela maior que viewport
- Linha ativa: backgroundColor="cyan" color="black"
- Preços com formatPrice(), contexto com formatContext()
</constraints>

<output_schema>
interface ModelTableProps {
  readonly models: readonly ModelEntry[];
  readonly onSelect: (model: ModelEntry) => void;
  readonly title?: string;
}

Layout:
┌──────────────────────────────────────────────────────────────────────────────┐
│ Selecione o modelo Planner                                                   │
│ Filtro: _                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Nome                Provider    tok/s  Ctx    $In    $Out   SWE%   P/C      │
│ ────────────────────────────────────────────────────────────────────────── │
│ MiniMax M2.5        MiniMax       50   196K   $0.15  $1.20  80.2%  242  ←  │
│ Gemini 3.1 Pro      Google        50   1.0M   $2.00  $12    80.6%   24     │
│ GPT-5.4             OpenAI        55   1.1M   $2.50  $15    80.0%   19     │
│ Claude Sonnet 4.6   Anthropic     62   1.0M   $3.00  $15    79.6%   18     │
│ Claude Opus 4.6     Anthropic     45   1.0M   $5.00  $25    80.8%   11     │
└──────────────────────────────────────────────────────────────────────────────┘
j/k:navegar  Enter:selecionar  filtro filtra em tempo real
</output_schema>
```

---

## Task 3: Reescrever config-screen com tabela de modelos (`src/screens/config-screen.tsx`)

**Arquivo a editar:** `src/screens/config-screen.tsx` (~250 LOC)

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 250 LOC)
- @docs/general/ink.md — composição de componentes, Box layout
- @src/screens/config-screen.tsx — implementação atual (135 LOC) com SelectInput hardcoded de 6 modelos
- @src/components/model-table.tsx — ModelTable component (task 2)
- @src/data/models.ts — getPlannerModels(), getWorkerModels(), findModel(), formatPrice() (task 1)
- @src/schemas/config.schema.ts — tipo Config
</context>

<role>
Você é um desenvolvedor React/Ink. Reescreva a tela de configuração substituindo os SelectInputs hardcoded de 6 modelos pelo ModelTable filtrável com 18 modelos.
</role>

<constraints>
- Max 250 LOC
- Manter fluxo: api-key → planner-model → worker-model → complete
- Substituir PLANNER_MODELS e WORKER_MODELS hardcoded por getPlannerModels() e getWorkerModels()
- No step planner-model: renderizar ModelTable com title="Modelo Planner (raciocínio)" filtrando tier planner+both
- No step worker-model: renderizar ModelTable com title="Modelo Worker (execução rápida)" filtrando tier worker+both
- Após seleção, mostrar resumo: "Claude Opus 4.6 ($5/$25) | SWE: 80.8%"
- Remover arrays PLANNER_MODELS e WORKER_MODELS hardcoded
- Prop opcional skipApiKey: boolean — quando true, pula direto para planner-model (para reconfiguração via [m])
</constraints>

<behavior>
1. Step api-key: sem mudança (TextInput + validação) — skipado se skipApiKey=true
2. Step planner-model: ModelTable com modelos tier=planner|both, ordenados por perfCostRatio desc
   - onSelect: salvar model.id, mostrar resumo, avançar para worker-model
3. Step worker-model: ModelTable com modelos tier=worker|both, ordenados por perfCostRatio desc
   - onSelect: chamar onComplete com config completa
4. Resumo mostra: "nome ($in/$out) | SWE: X% | P/C: Y"
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
- @src/data/models.ts — findModel(), formatPrice() para resolver nome e preço do model ID
- @src/schemas/config.schema.ts — tipo Config
</context>

<role>
Você é um desenvolvedor React/Ink. Crie uma barra de status compacta que mostra os modelos atuais com nome, preço e SWE-Bench.
</role>

<constraints>
- Max 60 LOC
- Componente puro (sem hooks de estado)
- Layout: "Planner: Nome ($in/$out) | Worker: Nome ($in/$out) | [m] modelos"
- Se modelo não encontrado no catálogo, exibir ID raw
- Nome do modelo em bold cyan, preços em dimColor, separadores em dimColor
- Prop opcional onChangeModels callback (se presente, mostra hint [m])
</constraints>

<output_schema>
interface StatusBarProps {
  readonly plannerModel: string;
  readonly workerModel: string;
  readonly onChangeModels?: () => void;
}

Layout:
┌───────────────────────────────────────────────────────────────────────────────┐
│ Planner: Claude Opus 4.6 ($5/$25)  |  Worker: MiMo-V2-Flash ($0.1/$0.3)  |  [m] modelos │
└───────────────────────────────────────────────────────────────────────────────┘
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
- @src/screens/config-screen.tsx — nova config screen com ModelTable e prop skipApiKey (task 3)
</context>

<role>
Você é um desenvolvedor React/Ink. Integre a barra de status de modelos no app e adicione atalho [m] para trocar modelos a qualquer momento.
</role>

<constraints>
- Max 250 LOC total para app.tsx
- StatusBar visível em TODAS as telas EXCETO 'loading' e 'config'
- Keybinding [m] em qualquer tela (exceto config/loading/executing):
  - Salvar screen atual em previousScreen
  - Mudar para 'model-change' (renderiza ConfigScreen com skipApiKey=true)
  - Ao completar: salvar novos modelos, voltar para previousScreen
- Se screen === 'executing': [m] desabilitado (não trocar modelo mid-execution)
- Adicionar 'model-change' ao type Screen
</constraints>

<behavior>
1. Se config loaded: renderizar StatusBar no topo de context, task, executing, result
2. Keybinding [m] em qualquer tela (exceto config/loading/executing):
   - Salvar screen atual em previousScreen
   - Mudar para 'model-change'
   - ConfigScreen renderiza com skipApiKey=true (pula API key, vai direto para modelos)
   - Ao completar: salvar novos modelos, voltar para previousScreen
3. StatusBar mostra: "Planner: {nome} ({preço}) | Worker: {nome} ({preço}) | [m] modelos"
</behavior>

<examples>
// Tela de contexto com status bar:
┌───────────────────────────────────────────────────────────────────────────────┐
│ Planner: Gemini 3.1 Pro ($2/$12)  |  Worker: Step 3.5 Flash ($0.1/$0.3)  |  [m] modelos │
└───────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Selecionar Contexto                                              │
│ ...                                                              │
└─────────────────────────────────────────────────────────────────┘

// Usuário pressiona [m] → vai para seleção de modelo (sem pedir API key)
// Seleciona novos modelos → volta para tela de contexto com StatusBar atualizada
</examples>
```

---

## Grafo de dependências

```
Task 1 (catálogo 18 modelos) ──→ Task 2 (tabela filtrável) ──→ Task 3 (config screen)
                             └──→ Task 4 (status bar)       ──→ Task 5 (app.tsx + [m])
```

**Wave 1:** Task 1 (sem deps)
**Wave 2:** Task 2 + Task 4 (paralelas)
**Wave 3:** Task 3 + Task 5 (paralelas)

## Arquivos impactados

| Arquivo | Tipo | Task | LOC |
|---------|------|------|-----|
| `src/data/models.ts` | NOVO | 1 | ~250 |
| `src/components/model-table.tsx` | NOVO | 2 | ~200 |
| `src/components/status-bar.tsx` | NOVO | 4 | ~60 |
| `src/screens/config-screen.tsx` | REWRITE | 3 | ~250 |
| `src/app.tsx` | EDIT | 5 | ~250 |

## Dados de referência (Cost-Performance Matrix, Março 2026)

### Defaults recomendados

**Default Planner:** `google/gemini-3.1-pro` — 80.6% SWE-Bench, #1 Terminal-Bench (78.4%), $2/$12 (60% mais barato que Opus).

**Default Worker:** `xiaomi/mimo-v2-flash` — 73.4% SWE-Bench, P/C ratio 757 (melhor do catálogo), $0.10/$0.30. Alternativa mais rápida: `stepfun/step-3.5-flash` a 230 tok/s.

**Sweet spot universal:** `minimax/minimax-m2.5` — 80.2% SWE-Bench a $0.15/$1.20. Performance frontier a custo budget. Serve como planner E worker.

### Tabela completa de benchmarks (para referência na UI)

| Modelo | SWE-Verified | SWE-rebench | SWE-Pro | Terminal-Bench | HumanEval | Tool Calling |
|--------|:-----------:|:-----------:|:-------:|:-------------:|:---------:|:------------:|
| Claude Opus 4.6 | 80.8% | 51.7% | 57.5% | 74.7% | 95.0% | 5/5 |
| Claude Sonnet 4.6 | 79.6% | — | — | 59.1% | 92.1% | 5/5 |
| Claude Haiku 4.5 | 73.3% | — | 39.5% | — | — | 5/5 |
| GPT-5.4 | 80.0% | — | 57.7% | 75.0% | 95.0% | 4.5/5 |
| GPT-5.3 Codex | — | — | 56.8% | 77.3% | — | 4.5/5 |
| Gemini 3.1 Pro | 80.6% | 46.7% | 43.3% | 78.4% | 93.0% | 4/5 |
| Gemini 3 Flash | 78.0% | 46.7% | 34.6% | — | — | 4/5 |
| Gemini 3.1 Flash Lite | — | — | — | — | — | 3/5 |
| Gemini 2.5 Flash | 64.0% | — | — | — | — | 4/5 |
| MiniMax M2.5 | 80.2% | 39.6% | 55.4% | 42.2% | 89.6% | 4/5 |
| Kimi K2.5 | 76.8% | 37.9% | — | 50.8% | 99.0% | 4/5 |
| Step 3.5 Flash | 74.4% | — | — | 51.0% | 81.1% | 3.5/5 |
| MiMo-V2-Flash | 73.4% | — | — | 38.5% | 84.8% | 3.5/5 |
| DeepSeek V3.2 | 70.4% | 37.5% | 15.6% | 39.6% | — | 3/5 |
| Devstral 2 | 72.2% | 37.5% | — | 43.8% | — | 4/5 |
| Devstral Small 2 | 68.0% | 32.1% | — | 40.0% | — | 3.5/5 |
| Grok Code Fast 1 | 64.2% | 29.0% | — | — | — | 3.5/5 |
| Qwen3-Coder 480B | 55.0% | 31.7% | 38.7% | — | — | 3.5/5 |

### Alocação recomendada por agente (11 agentes HUU)

| Agente | Modelo recomendado | Blended $/M | Justificativa |
|--------|-------------------|:-----------:|---------------|
| orchestrator | Gemini 3.1 Pro | $4.24 | #1 Terminal-Bench, raciocínio arquitetural |
| planner | Claude Opus 4.6 | $9.11 | Melhor raciocínio abstrato (ARC-AGI-2: 68.8%) |
| builder | MiniMax M2.5 | $0.41 | 80.2% SWE a 1/20 do Opus |
| tester | Gemini 3.1 Pro | $4.24 | LiveCodeBench Elo 2887 |
| reviewer | Kimi K2.5 | $0.96 | 99% HumanEval, input barato |
| researcher | Gemini 3 Flash | $1.06 | 1M ctx, Search grounding |
| merger | GPT-5.4 | $5.31 | Computer use + Terminal-Bench |
| refactorer | MiniMax M2.5 | $0.41 | Output-heavy a custo mínimo |
| doc-writer | Claude Haiku 4.5 | $1.82 | Prosa clara, 116 tok/s |
| debugger | Claude Sonnet 4.6 | $5.47 | Raciocínio profundo + tool use |
| context-curator | Gemini 3.1 Flash Lite | $0.53 | 1M ctx + 300 tok/s |

### Preços com cache (90% desconto típico)

| Modelo | Input | Cached | Economia |
|--------|------:|-------:|:--------:|
| Claude Opus 4.6 | $5.00 | $0.50 | 90% |
| GPT-5.4 | $2.50 | $0.25 | 90% |
| Gemini 3.1 Pro | $2.00 | $0.20 | 90% |
| MiniMax M2.5 | $0.15 | $0.015 | 90% |
| DeepSeek V3.2 | $0.28 | $0.028 | 90% |
| Step 3.5 Flash | $0.10 | $0.02 | 80% |
| Kimi K2.5 | $0.60 | $0.10 | 83% |

### Custo estimado por feature (single pass, 11 agentes)

| Total input | Total output | Custo base | Com cache | Com batch |
|:-----------:|:------------:|:----------:|:---------:|:---------:|
| ~675K tokens | ~194K tokens | ~$1.53 | ~$1.10 | ~$0.90 |

Real-world com retries: multiplique por 2-5x = **$3-8 por feature média**.
