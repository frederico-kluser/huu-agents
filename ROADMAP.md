# ROADMAP: Pi DAG Task CLI (POC)

Cronograma com subtasks atômicas, mapeamento de contextos `@path` para Claude Code, e prompts prontos para cada etapa.

**Princípios transversais a TODAS as fases:**
- Código segue @docs/general/file-agent-patterns.md: 200-500 LOC/arquivo, 5-10 funções/arquivo, max 50 LOC/função, complexidade ciclomática <10
- Prompts seguem @docs/general/prompts-guide.md: papel + catálogo + regras + schema + few-shot
- Anti-patterns de @docs/general/prompt-engineering.md: sem over-prompting (max ~300 palavras), sem CoT cego, structured outputs nativos
- TSDoc complementar (nunca duplicar tipos): `@throws`, `@example`, comentar o "porquê"

---

## Fase 0: Setup do Projeto e Padrões

**Objetivo:** Projeto TS/ESM funcional com padrões agent-friendly desde o primeiro arquivo.

### Subtask 0.1: Scaffold do projeto TS/ESM

**Depende de:** nenhuma
**Contexto obrigatório:**
- @docs/general/ink.md — setup Ink v6, Node >=20, ESM, React 19, create-ink-app, estrutura de projeto
- @docs/general/file-agent-patterns.md — métricas de arquivo (200-500 LOC), JSDoc, checklist de qualidade

**Arquivos a criar:**
- `package.json` (type: module, engines: node >=20)
- `tsconfig.json` (ES2022, NodeNext, strict)
- `.eslintrc.json` (no-explicit-any, max-lines: 500, complexity: 10)
- `src/cli.tsx` (entry point)
- `src/app.tsx` (componente raiz Ink)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/ink.md — setup completo Ink v6 + React 19, ESM, tsconfig, entry point, render()
- @docs/general/file-agent-patterns.md — métricas de arquivo, JSDoc, complexidade ciclomática
</context>

<role>
Você é um engenheiro TypeScript sênior. Crie o scaffold inicial de um projeto CLI baseado em Ink v6 + React 19, 100% ESM.
</role>

<constraints>
- Node.js >= 20, TypeScript strict mode, ES2022 target, NodeNext module resolution
- Cada arquivo: 200-500 linhas (max 800), 5-10 funções (max 50 linhas cada)
- Complexidade ciclomática máxima: 10
- ESLint com @typescript-eslint/no-explicit-any habilitado
- Sem console.log em código de produção
- package.json com "type": "module"
- Imports usam extensão .js mesmo para .tsx (exigência ESM + tsc)
- TSDoc com @throws e @example em funções exportadas
</constraints>

<output_schema>
Gere os seguintes arquivos com conteúdo funcional:
1. package.json — deps: ink@latest, react@latest, @types/react, typescript, zod
2. tsconfig.json — strict, ES2022, NodeNext, outDir: dist, rootDir: src
3. .eslintrc.json — no-explicit-any, max-lines: 500, complexity: 10
4. src/cli.tsx — entry point com shebang, chama render(<App />)
5. src/app.tsx — componente raiz com Text "Pi DAG CLI v0.1"
</output_schema>

<examples>
Entrada: "Crie o scaffold"
Saída: 5 arquivos prontos para `npm run build && node dist/cli.js`
</examples>
```

---

### Subtask 0.2: CLAUDE.md e AGENTS.md do projeto

**Depende de:** 0.1
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — seção sobre AGENTS.md (60K+ repos), progressive disclosure, checklist de 20 itens
- @README.md — visão geral do projeto, stack, arquitetura

**Arquivos a criar:**
- `CLAUDE.md` (max 150 linhas)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — seção "Convenções de projetos agent-friendly", AGENTS.md <=150 linhas, progressive disclosure, limites explícitos
- @README.md — visão geral do Pi DAG Task CLI, stack, arquitetura, estrutura de diretórios
</context>

<role>
Você é um arquiteto de projetos agent-friendly. Crie o CLAUDE.md do projeto Pi DAG Task CLI seguindo as melhores práticas de AGENTS.md (60K+ repos).
</role>

<constraints>
- Máximo 150 linhas
- Incluir: comandos de build/test, visão arquitetural, stack, limites explícitos
- Não incluir regras que linters já aplicam (ESLint já cuida de no-any, complexity)
- Não auto-gerar — cada linha deve ter valor semântico específico
- Três níveis de limites: SEMPRE fazer, PERGUNTAR antes, NUNCA fazer
- Incluir exemplos concretos do projeto (um snippet vale mais que três parágrafos)
</constraints>

<output_schema>
CLAUDE.md com seções:
1. Projeto (1 parágrafo)
2. Comandos (build, test, lint, run)
3. Stack e dependências
4. Estrutura de diretórios
5. Convenções de código (max LOC, TSDoc, imutabilidade)
6. Limites (sempre/perguntar/nunca)
</output_schema>
```

---

### Subtask 0.3: Schemas Zod fundamentais

**Depende de:** 0.1
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo para os próprios schemas
- @docs/general/prompts-guide.md — seção "Schema de output estruturado" (componente 4 obrigatório), templates de schema
- @docs/general/prompt-engineering.md — seção "Structured outputs nativos são obrigatórios", schema-first pattern, Pydantic/Zod antes do prompt

**Arquivos a criar:**
- `src/schemas/dag.schema.ts` — schema do DAG (output do Planner)
- `src/schemas/config.schema.ts` — schema do ~/.pi-dag-cli.json
- `src/schemas/worker-result.schema.ts` — schema de resultado do Worker

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas de arquivo (200-500 LOC), JSDoc, responsabilidade única por arquivo
- @docs/general/prompts-guide.md — seção sobre schemas tipados obrigatórios, catálogo de ações com enums, restrições de additionalProperties
- @docs/general/prompt-engineering.md — seção "Structured outputs nativos são obrigatórios", schema-first pattern com Zod, schemas flat para compatibilidade cross-provider
</context>

<role>
Você é um engenheiro de schemas. Defina os schemas Zod que governam toda a comunicação entre componentes do Pi DAG CLI.
</role>

<constraints>
- Usar Zod, não interfaces TypeScript soltas
- Cada schema em arquivo separado (responsabilidade única)
- Schemas flat quando possível — providers limitam tipos recursivos
- Enums para ações, status e tipos — nunca strings livres
- Todos os campos obrigatórios explícitos, sem additionalProperties
- Max 200 LOC por arquivo, TSDoc com @example em cada schema exportado
</constraints>

<schemas_required>
1. DAGSchema (dag.schema.ts):
   - nodes: array de { id: string, task: string, dependencies: string[], status: enum(pending|running|done|failed), files: string[] }
   - metadata: { macroTask: string, totalNodes: number, parallelizable: number }

2. ConfigSchema (config.schema.ts):
   - openrouterApiKey: string
   - plannerModel: string (ex: "openai/gpt-4.1")
   - workerModel: string (ex: "openai/gpt-4.1-mini")
   - worktreeBasePath: string (default: ".pi-dag-worktrees")

3. WorkerResultSchema (worker-result.schema.ts):
   - nodeId: string
   - status: enum(success|failure|partial)
   - filesModified: string[]
   - commitHash: string | null
   - error: string | null
</schemas_required>

<examples>
// DAG output do Planner para "Refatore todos os .js da pasta utils"
{
  "nodes": [
    { "id": "1", "task": "Converter utils/format.js para TypeScript", "dependencies": [], "status": "pending", "files": ["utils/format.js"] },
    { "id": "2", "task": "Converter utils/validate.js para TypeScript", "dependencies": [], "status": "pending", "files": ["utils/validate.js"] },
    { "id": "3", "task": "Atualizar imports nos consumidores", "dependencies": ["1", "2"], "status": "pending", "files": ["src/app.ts"] }
  ],
  "metadata": { "macroTask": "Refatore todos os .js da pasta utils", "totalNodes": 3, "parallelizable": 2 }
}
</examples>
```

---

## Fase 1: CLI, Menus Ink e Model Config (MVP 1)

**Objetivo:** TUI interativo funcional que coleta configuração, contexto e macro-task.

### Subtask 1.1: Tela de configuração (API Key + Modelos)

**Depende de:** 0.3
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo, JSDoc
- @docs/general/ink.md — componentes (Box, Text, TextInput, SelectInput), hooks (useInput, useApp), layout Flexbox, borderStyle
- @docs/langchain/langchain-models-2026.md — catálogo completo de modelos, famílias GPT-5/Gemini/DeepSeek, preços, contexto max
- @src/schemas/config.schema.ts — ConfigSchema para validação

**Arquivos a criar:**
- `src/screens/config-screen.tsx` (~200 LOC)
- `src/hooks/use-config.ts` (~100 LOC)
- `src/utils/openrouter.ts` (~80 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 300 LOC, max 50 LOC/função), TSDoc, responsabilidade única
- @docs/general/ink.md — componentes Box, Text, TextInput, SelectInput; hooks useInput, useApp; layout Flexbox; borderStyle; render()
- @docs/langchain/langchain-models-2026.md — modelos disponíveis via OpenRouter: GPT-5.x, Gemini 2.5, DeepSeek V3.2; preços e contexto max
- @src/schemas/config.schema.ts — ConfigSchema Zod para validação de input
</context>

<role>
Você é um desenvolvedor React/Ink especializado em TUIs. Construa a tela de configuração inicial do Pi DAG CLI.
</role>

<constraints>
- Ink v6 com React 19, 100% ESM, TypeScript strict
- Cada arquivo: max 300 linhas, max 10 funções, max 50 LOC/função
- Componentes funcionais com arrow functions
- Validação de inputs com Zod (importar de src/schemas/config.schema.ts)
- Sem console.log — usar componente <Text> para feedback
- Persistir config em ~/.pi-dag-cli.json via fs/promises
- useInput hook do Ink para navegação
- TSDoc com @throws e @example em funções exportadas
</constraints>

<behavior>
1. Verificar se ~/.pi-dag-cli.json existe
2. Se existe e tem apiKey válida: pular para próxima tela
3. Se não existe: pedir OpenRouter API Key via TextInput
4. Validar key com HEAD request ao OpenRouter
5. Listar modelos para Planner (reasoning: gpt-4.1, gemini-2.5-pro, deepseek-chat) e Worker (fast: gpt-4.1-mini, gemini-2.5-flash, gpt-4.1-nano)
6. Salvar config validada
</behavior>

<output_schema>
ConfigScreen renderiza:
- Box com borderStyle="round": título "Configuração"
- TextInput para API key (mascarado com *)
- SelectInput para modelo Planner
- SelectInput para modelo Worker
- Text com status de validação (verde=ok, vermelho=erro)
</output_schema>

<examples>
┌─────────────────────────────────┐
│ Pi DAG CLI — Configuração       │
│                                 │
│ OpenRouter API Key: *********** │
│ Validando... ✓                  │
│                                 │
│ Modelo Planner: > gpt-4.1      │
│ Modelo Worker:  > gpt-4.1-mini │
│                                 │
│ [Enter] Confirmar               │
└─────────────────────────────────┘
</examples>
```

---

### Subtask 1.2: Tela de seleção de contexto

**Depende de:** 0.1
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo, aritmética de tokens (LOC * 7-10), limites de contexto
- @docs/general/ink.md — componentes Box, Text; hooks useInput; layout Flexbox

**Arquivos a criar:**
- `src/screens/context-screen.tsx` (~250 LOC)
- `src/hooks/use-file-tree.ts` (~150 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — aritmética de tokens (cada linha JS/TS = ~7-10 tokens), limites de contexto (degradação a ~147K-152K tokens), regras de arquivo
- @docs/general/ink.md — Box, Text, useInput (j/k setas), layout Flexbox, borderStyle, dimColor
</context>

<role>
Você é um desenvolvedor React/Ink. Construa a tela de seleção de contexto onde o usuário marca arquivos e diretórios relevantes para a macro-task.
</role>

<constraints>
- Ink v6, React 19, TypeScript strict, ESM
- Max 250 LOC por arquivo, max 50 LOC por função
- Componentes funcionais com arrow functions
- Navegação via useInput (j/k ou setas), toggle via espaço, expandir/colapsar via Enter
- Respeitar .gitignore — não listar node_modules, dist, .git
- Limitar profundidade a 4 níveis para não sobrecarregar o terminal
- Estimativa de tokens: LOC * 8 (média JS/TS conforme file-agent-patterns)
- TSDoc com @example em funções exportadas
</constraints>

<behavior>
1. Ler cwd e listar árvore de arquivos respeitando .gitignore
2. Renderizar como tree view com checkboxes: [x] src/app.tsx, [ ] src/utils/
3. Diretórios colapsáveis com indicador ▶/▼
4. Barra inferior: "N arquivos selecionados | ~X tokens estimados"
5. [Enter] confirma seleção, retorna array de paths
</behavior>

<output_schema>
ContextScreen aceita props: { onComplete: (selectedPaths: string[]) => void }
Renderiza: Box título + tree view + footer com contagem
</output_schema>
```

---

### Subtask 1.3: Tela de entrada da macro-task

**Depende de:** 0.3
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo
- @docs/general/ink.md — TextInput, Box, Text
- @src/schemas/config.schema.ts — tipo Config para exibir resumo

**Arquivos a criar:**
- `src/screens/task-screen.tsx` (~120 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas de arquivo (max 200 LOC para este arquivo pequeno)
- @docs/general/ink.md — TextInput para entrada de texto, Box, Text
- @src/schemas/config.schema.ts — tipo Config para exibir resumo da configuração
</context>

<role>
Você é um desenvolvedor React/Ink. Construa a tela final de input onde o usuário digita a macro-task.
</role>

<constraints>
- Ink v6, React 19, TypeScript strict, ESM
- Max 200 LOC, max 5 funções
- TextInput para a task
- Mostrar resumo: modelo Planner, modelo Worker, N arquivos de contexto
- TSDoc com @example em funções exportadas
</constraints>

<behavior>
1. Mostrar resumo da configuração e contexto selecionados
2. Campo de texto para macro-task
3. Validar que task não está vazia
4. [Enter] inicia o pipeline
</behavior>

<output_schema>
TaskScreen aceita props: { config: Config, contextFiles: string[], onSubmit: (task: string) => void }
</output_schema>
```

---

### Subtask 1.4: Orquestrador de telas (App Router)

**Depende de:** 1.1, 1.2, 1.3
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo
- @docs/general/ink.md — render(), componente raiz, lifecycle (waitUntilExit, unmount)
- @src/screens/config-screen.tsx — interface ConfigScreen
- @src/screens/context-screen.tsx — interface ContextScreen
- @src/screens/task-screen.tsx — interface TaskScreen
- @src/schemas/config.schema.ts — tipo Config

**Arquivos a criar:**
- `src/app.tsx` — router de telas (~150 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 150 LOC para este arquivo)
- @docs/general/ink.md — render(), componente raiz, lifecycle
- @src/screens/config-screen.tsx — props e callbacks do ConfigScreen
- @src/screens/context-screen.tsx — props e callbacks do ContextScreen
- @src/screens/task-screen.tsx — props e callbacks do TaskScreen
- @src/schemas/config.schema.ts — tipo Config
</context>

<role>
Você é um desenvolvedor React/Ink. Construa o componente App que orquestra a navegação entre as 3 telas usando state machine simples.
</role>

<constraints>
- Ink v6, React 19, TypeScript strict, ESM
- Max 150 LOC
- State machine com useState: "config" | "context" | "task" | "executing"
- Cada tela passa dados via callback para a próxima
- Sem bibliotecas de routing — useState simples
- Imutabilidade: spread de state, nunca mutar
</constraints>

<behavior>
1. Estado inicial: "config"
2. ConfigScreen.onComplete → salva config, muda para "context"
3. ContextScreen.onComplete → salva paths, muda para "task"
4. TaskScreen.onSubmit → salva macro-task, muda para "executing"
5. Em "executing": renderiza placeholder (depois será substituído pelo DAG screen)
</behavior>
```

---

## Fase 2: Decomposição Inteligente e Coleta ReAct (MVP 2)

**Objetivo:** Planner decompõe macro-task em DAG JSON validado, com exploração ReAct quando contexto insuficiente.

### Subtask 2.1: System prompt do Planner (Arquiteto)

**Depende de:** 0.3
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — padrões de código que o Planner deve EMBUTIR nos nodes para os Workers seguirem (200-500 LOC, JSDoc, complexidade <10)
- @docs/general/prompts-guide.md — 5 componentes obrigatórios (papel, catálogo, regras, schema, few-shot), templates, anti-patterns
- @docs/general/prompt-engineering.md — max 300 palavras, sandwich method, adaptação por modelo (XML Claude, Markdown GPT), prompt caching
- @docs/general/story-breaking.md — frameworks de decomposição (ADaPT, TDAG), decomposição hierárquica, regra de McKee (cada subtask produz mudança mensurável)
- @docs/general/context-building.md — 5 camadas de contexto, anti-alucinação, closed-world assumption
- @src/schemas/dag.schema.ts — DAGSchema que o prompt deve referenciar como output

**Arquivos a criar:**
- `src/prompts/planner.prompt.ts` (~200 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas agent-friendly que o Planner deve EMBUTIR em cada node.task para os Workers
- @docs/general/prompts-guide.md — 5 componentes obrigatórios de system prompt para automação, catálogo de ações, few-shot (5-12 exemplos)
- @docs/general/prompt-engineering.md — max 300 palavras de instrução, sandwich method (início+fim), adaptação por modelo (XML para Claude, Markdown para GPT), prompt caching (estático no topo)
- @docs/general/story-breaking.md — ADaPT (decomposição by-failure), regra de McKee (cada subtask = mudança de estado mensurável), decomposição hierárquica fractal
- @docs/general/context-building.md — 5 camadas de contexto, closed-world assumption, anti-alucinação
- @src/schemas/dag.schema.ts — DAGSchema Zod que define o formato exato do output
</context>

<role>
Você é um engenheiro de prompts de produção. Crie o system prompt do agente Planner (Arquiteto) do Pi DAG CLI.
</role>

<constraints>
- Máximo 300 palavras no system prompt gerado
- Structured output obrigatório via DAGSchema de @src/schemas/dag.schema.ts
- 5 componentes: papel, catálogo de ações, regras, schema de output, few-shot
- Exportar função: generatePlannerPrompt(modelProvider: string): string
- Adaptável: XML tags para anthropic, Markdown headers para openai
- Sandwich method: instruções críticas no início E no final
- Conteúdo estático no topo para prompt caching
</constraints>

<prompt_structure>
1. PAPEL: "Você é o Arquiteto de Decomposição. Sua ÚNICA função é..."
2. CATÁLOGO DE AÇÕES:
   - decompose: quebrar macro-task em DAG de subtasks atômicas
   - request_exploration: solicitar que o Explorer investigue o codebase
   - clarify: pedir esclarecimento ao usuário
3. REGRAS INVIOLÁVEIS:
   - Cada node executável por UM agente em UM worktree
   - Dependências formam DAG (sem ciclos)
   - Nodes independentes marcados como parallelizable
   - Cada node lista os files que vai tocar
   - Se não sabe quantos arquivos: action = "request_exploration"
   - Se ambíguo: action = "clarify"
   - NUNCA inventar nomes de arquivo
4. SCHEMA: DAGSchema (nodes, metadata)
5. FEW-SHOT: 3 exemplos (task simples, task com exploração, task ambígua)
</prompt_structure>

<quality_gates>
O Planner DEVE embutir em cada node.task para guiar Workers:
- "Ao implementar: max 500 LOC/arquivo, max 50 LOC/função, JSDoc com @throws e @example em exports, complexidade ciclomática < 10"
- "Documente decisões de design — explique o PORQUÊ, nunca o QUÊ"
- "TypeScript strict. Proibido 'any'."
</quality_gates>
```

---

### Subtask 2.2: Sub-agente ReAct Explorer

**Depende de:** 0.1
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo para os 3 arquivos gerados
- @docs/langchain/ReAct-langchain-tec-guide.md — ciclo Thought→Action→Observation, createReactAgent, bindTools(), ToolMessage, loop manual, circuit breaker
- @docs/langchain/langchain-langgraph-production.md — createAgent vs StateGraph, middleware (beforeModel, modifyModelRequest, afterModel)
- @docs/general/prompts-guide.md — catálogo de ações com schema tipado, regras de comportamento explícitas
- @docs/general/prompt-engineering.md — sem over-prompting, structured outputs

**Arquivos a criar:**
- `src/agents/explorer.agent.ts` (~250 LOC)
- `src/prompts/explorer.prompt.ts` (~150 LOC)
- `src/tools/explorer-tools.ts` (~200 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 250 LOC agente, max 200 LOC tools, max 150 LOC prompt)
- @docs/langchain/ReAct-langchain-tec-guide.md — implementação completa do ciclo ReAct: createReactAgent (prebuilt) OU loop manual com bindTools() + ToolMessage, circuit breaker, 8 tipos de pensamentos
- @docs/langchain/langchain-langgraph-production.md — createAgent para casos simples, StateGraph se branching/loops necessários
- @docs/general/prompts-guide.md — catálogo de ações tipado, regras de comportamento explícitas, fallback "unsupported"
- @docs/general/prompt-engineering.md — max 300 palavras no prompt, sem CoT cego
</context>

<role>
Você é um engenheiro de agentes LLM. Implemente o sub-agente ReAct Explorer que investiga o codebase para fornecer contexto ao Planner.
</role>

<constraints>
- Ciclo Thought→Action→Observation via LangChain.js createReactAgent ou loop manual com bindTools()
- Max 250 LOC no agente, max 200 LOC nas tools, max 150 LOC no prompt
- Cada tool é função pura com schema Zod de input/output
- Max 10 iterações do loop ReAct (circuit breaker)
- Output condensado: max 2.000 tokens retornados ao Planner
- TSDoc com @throws e @example em funções exportadas
</constraints>

<tool_catalog>
O Explorer tem acesso APENAS a estas tools:
1. list_directory(path: string, depth?: number) → string[]
2. read_file_head(path: string, lines?: number) → string
3. count_files(path: string, pattern: string) → number
4. search_content(path: string, query: string) → { file: string, line: number, content: string }[]

NUNCA: modificar arquivos, executar comandos arbitrários, acessar rede
</tool_catalog>

<system_prompt_explorer>
Você é um Explorador de Codebase. Investigue a estrutura e conteúdo do projeto para responder perguntas do Arquiteto.

FERRAMENTAS: list_directory, read_file_head, count_files, search_content
REGRAS: Use APENAS as ferramentas listadas. Max 10 ações. Retorne dados concretos. NUNCA invente informação. Max 2.000 tokens de resultado.
FORMATO: Arquivos encontrados: [paths]. Contagens: [métrica→valor]. Observações: [trechos relevantes].
</system_prompt_explorer>
```

---

### Subtask 2.3: Pipeline Planner (orquestração)

**Depende de:** 2.1, 2.2
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo
- @docs/general/prompt-engineering.md — structured outputs nativos por modelo (strict:true OpenAI, responseJsonSchema Gemini), retry com re-prompting
- @docs/langchain/langchain-models-2026.md — capacidades de structured output por modelo, json_schema vs json_object, limitações DeepSeek
- @src/schemas/dag.schema.ts — DAGSchema para validação do output
- @src/prompts/planner.prompt.ts — prompt generator
- @src/agents/explorer.agent.ts — explorer para invocação condicional

**Arquivos a criar:**
- `src/pipeline/planner-pipeline.ts` (~200 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 200 LOC)
- @docs/general/prompt-engineering.md — structured outputs nativos: strict:true (OpenAI), responseJsonSchema (Gemini), json_object (DeepSeek, sem schema); retry com feedback de erro
- @docs/langchain/langchain-models-2026.md — tabela de capacidades por modelo, limitações DeepSeek (json_object only, conteúdo vazio possível), GPT-4.1 (strict true), Gemini (responseJsonSchema)
- @src/schemas/dag.schema.ts — DAGSchema Zod para validação
- @src/prompts/planner.prompt.ts — generatePlannerPrompt()
- @src/agents/explorer.agent.ts — Explorer para invocação condicional
</context>

<role>
Você é um engenheiro de pipelines. Implemente o pipeline que conecta Planner ao Explorer e valida o output.
</role>

<constraints>
- Max 200 LOC
- Zod para validar output (DAGSchema.safeParse)
- Se Planner retorna action="request_exploration": invocar Explorer, anexar resultado, re-invocar Planner
- Se Planner retorna action="clarify": propagar pergunta ao usuário via callback
- Max 3 ciclos Planner→Explorer (circuit breaker)
- Retry com re-prompting se Zod falhar (max 2 retries, incluir erro Zod na mensagem)
- Structured output via API nativa quando disponível por modelo
- TSDoc com @throws e @example
</constraints>

<behavior>
1. Montar contexto: system prompt + arquivos selecionados + macro-task
2. Chamar Planner com structured output (model-specific)
3. Validar resposta com DAGSchema.safeParse()
4. Se válido e action="decompose": retornar DAG
5. Se action="request_exploration": Explorer → anexar → retry Planner
6. Se action="clarify": retornar pergunta ao caller
7. Se validação falha: retry com mensagem de erro Zod (max 2x)
</behavior>
```

---

### Subtask 2.4: Tela de visualização do DAG

**Depende de:** 0.3
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo
- @docs/general/ink.md — Box (flexDirection, borderStyle, borderColor), Text (color, bold, dimColor), layout Flexbox
- @src/schemas/dag.schema.ts — tipos DAGNode, DAGSchema para tipagem dos props

**Arquivos a criar:**
- `src/screens/dag-screen.tsx` (~200 LOC)
- `src/components/dag-node.tsx` (~80 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 200 LOC tela, max 80 LOC componente)
- @docs/general/ink.md — Box (flexDirection, borderStyle, borderColor), Text (color, bold, dimColor), Spacer; layout Flexbox no terminal
- @src/schemas/dag.schema.ts — tipos DAGNode e DAGSchema para tipagem dos props
</context>

<role>
Você é um desenvolvedor React/Ink especializado em visualização. Renderize o DAG de subtasks no terminal.
</role>

<constraints>
- Ink v6, React 19, TypeScript strict
- Max 200 LOC tela, max 80 LOC componente
- Box com flexDirection="column" para lista vertical
- Dependências: indentação ou "└── depende de: [ids]"
- Status com cores: pending=cinza, running=amarelo, done=verde, failed=vermelho
- Atualizar em tempo real conforme Workers completam
- TSDoc com @example
</constraints>

<output_schema>
┌──────────────────────────────────────────┐
│ DAG: "Refatore utils para TypeScript"    │
│                                          │
│  ● [1] Converter format.js → format.ts   │  ← pending (cinza)
│  ● [2] Converter validate.js → validate.ts│ ← running (amarelo)
│  └─ [3] Atualizar imports (depende: 1,2) │  ← blocked (dim)
│                                          │
│ Progresso: 0/3 completos | 1 rodando     │
└──────────────────────────────────────────┘
</output_schema>
```

---

## Fase 3: Controlador Git & Worktrees Isoladas (MVP 3)

**Objetivo:** Automação confiável de branches e worktrees via child_process, sem tocar no working tree do usuário.

### Subtask 3.1: Git Wrapper

**Depende de:** 0.1
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo, TSDoc com @throws e @example, imutabilidade

**Arquivos a criar:**
- `src/git/git-wrapper.ts` (~300 LOC)
- `src/git/worktree-manager.ts` (~250 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 300 LOC git-wrapper, max 250 LOC worktree-manager), TSDoc com @throws e @example obrigatório, imutabilidade (retornar novos objetos), responsabilidade única por arquivo
</context>

<role>
Você é um engenheiro de sistemas com expertise em Git internals. Implemente o wrapper Git e o gerenciador de worktrees para o Pi DAG CLI.
</role>

<constraints>
- Max 300 LOC para git-wrapper, max 250 LOC para worktree-manager
- child_process.execFile (não exec) para segurança contra injection
- Toda operação retorna Result<T, GitError> (never throws)
- Imutabilidade: funções retornam novos objetos, nunca mutam parâmetros
- NUNCA operar no working tree do usuário — apenas em worktrees
- Cleanup automático: se worktree falha, limpar branch e diretório
- TSDoc com @throws (GitError) e @example em toda função exportada
</constraints>

<api_required>
git-wrapper.ts:
- createBranch(name: string, from?: string): Result<Branch, GitError>
- deleteBranch(name: string): Result<void, GitError>
- commit(worktreePath: string, message: string): Result<CommitHash, GitError>
- merge(target: string, sources: string[]): Result<MergeResult, GitError>
- getCurrentBranch(): Result<string, GitError>

worktree-manager.ts:
- createWorktree(nodeId: string, taskTimestamp: string): Result<WorktreePath, GitError>
- removeWorktree(path: string): Result<void, GitError>
- listWorktrees(): Result<Worktree[], GitError>
- cleanupAll(taskTimestamp: string): Result<void, GitError>
</api_required>

<naming_convention>
- Branch base: task-{timestamp} (ex: task-20260321-143000)
- Branch por node: task-{timestamp}-subtask-{nodeId}
- Worktree path: .pi-dag-worktrees/task-{timestamp}-subtask-{nodeId}
</naming_convention>

<examples>
const result = await createWorktree("2", "20260321-143000");
// result.ok → { path: ".pi-dag-worktrees/task-20260321-143000-subtask-2", branch: "task-20260321-143000-subtask-2" }
</examples>
```

---

### Subtask 3.2: DAG Executor (topological sort + paralelismo)

**Depende de:** 0.3, 3.1
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo
- @src/schemas/dag.schema.ts — DAGSchema, DAGNode para tipagem
- @src/git/git-wrapper.ts — merge(), commit()
- @src/git/worktree-manager.ts — createWorktree(), removeWorktree()

**Arquivos a criar:**
- `src/pipeline/dag-executor.ts` (~250 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 250 LOC), TSDoc
- @src/schemas/dag.schema.ts — DAGSchema, DAGNode para tipagem do input
- @src/git/git-wrapper.ts — merge() e commit() para integrar resultados
- @src/git/worktree-manager.ts — createWorktree() e removeWorktree() para lifecycle
</context>

<role>
Você é um engenheiro de sistemas distribuídos. Implemente o executor de DAG com topological sort e paralelismo.
</role>

<constraints>
- Max 250 LOC
- Topological sort (Kahn's algorithm) para ordem de execução
- Nodes sem dependências executam em paralelo (Promise.allSettled)
- Nodes com dependências aguardam predecessores (merge antes)
- Emitir eventos: node-started, node-completed, node-failed
- Se node falha: marcar dependentes como "blocked", continuar outros ramos
- async/await puro, nunca bloquear event loop
- TSDoc com @throws e @example
</constraints>

<behavior>
1. Receber DAG validado (DAGSchema)
2. Computar topological order (Kahn's algorithm)
3. Wave 1: nodes sem dependências → executar em paralelo
4. Para cada node completo: git merge na branch base → liberar dependentes
5. Repetir até todos done/failed/blocked
6. Retornar: { completed: string[], failed: string[], blocked: string[] }
</behavior>
```

---

## Fase 4: Worker Pi Agent com Contexto LLM (MVP 4)

**Objetivo:** Workers executam subtasks em worktrees isoladas com system prompts ricos e padrões agent-friendly.

### Subtask 4.1: System prompt do Worker

**Depende de:** 0.3
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de código que DEVEM ser EMBUTIDAS no prompt dos Workers (200-500 LOC, JSDoc, complexidade <10, checklist completo)
- @docs/general/prompts-guide.md — 5 componentes, catálogo de ações, few-shot, templates prontos
- @docs/general/prompt-engineering.md — max 300 palavras, sandwich method, adaptação por modelo, prompt caching (estático no topo)
- @docs/general/context-building.md — 5 camadas de contexto (sistema→projeto→KB→sessão→tarefa), anti-alucinação, quote-first, retrieval just-in-time
- @docs/general/context-building-2.md — CoVe, Self-RAG, defesa em camadas, compactação de contexto
- @src/schemas/dag.schema.ts — tipo DAGNode para tipagem de parâmetros

**Arquivos a criar:**
- `src/prompts/worker.prompt.ts` (~200 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — TODAS as métricas agent-friendly: 200-500 LOC/arquivo, 5-10 funções, max 50 LOC/função, complexidade <10, JSDoc com @throws/@example, comentar PORQUÊ — estas regras DEVEM ser embutidas literalmente no prompt gerado
- @docs/general/prompts-guide.md — 5 componentes (papel, catálogo, regras, schema, few-shot), templates de system prompt, regras invioláveis
- @docs/general/prompt-engineering.md — max 300 palavras, sandwich method (início+fim), adaptação por modelo (XML tags anthropic, Markdown openai, sem system prompt para DeepSeek R1), prompt caching (estático no topo)
- @docs/general/context-building.md — 5 camadas (sistema→projeto→KB→sessão→tarefa), anti-alucinação, princípio "menor conjunto de tokens de alto sinal"
- @docs/general/context-building-2.md — CoVe (verificação de afirmações), quote-first (citações antes de análise), Self-RAG (tokens de reflexão), defesa em camadas
- @src/schemas/dag.schema.ts — tipo DAGNode para parâmetros da função geradora
</context>

<role>
Você é um engenheiro de prompts de produção. Crie o gerador de system prompt dos Workers do Pi DAG CLI.
</role>

<constraints>
- Max 300 palavras no prompt gerado (evitar over-prompting)
- Prompt dinâmico com contexto específico da subtask
- Sandwich method: instruções críticas no início E no final
- Estático no topo (cacheável), dinâmico no final
- EMBUTIR as regras de file-agent-patterns DIRETAMENTE no prompt
- Exportar: generateWorkerPrompt(node: DAGNode, gitLog: string, modelProvider: string): string
- Adaptação: XML tags para anthropic, Markdown headers para openai
- Max 200 LOC neste arquivo, TSDoc com @example
</constraints>

<prompt_template>
CAMADA 1 (estática, cacheável):
- Papel: "Você é um engenheiro de software operando em worktree Git isolado."
- Padrões obrigatórios: max 500 LOC/arquivo (ideal 200-300), max 50 LOC/função, 5-10 funções/arquivo, complexidade <10, TSDoc @throws/@example, comentar PORQUÊ, TS strict, sem 'any', sem console.log, imutabilidade

CAMADA 2 (dinâmica por node):
- Tarefa: node.task
- Arquivos: node.files
- Dependências completadas: resumo do que foi feito

CAMADA 3 (contexto git):
- git log resumido das branches mergidas (max 500 tokens)

CAMADA 4 (regras finais — sandwich):
- "git add dos modificados. NÃO faça commit."
- "Se ambíguo: pare e retorne pergunta."
- "NUNCA modifique arquivos fora de: [node.files]"
</prompt_template>

<examples>
// Provider: anthropic → XML tags
<system>
<role>Engenheiro TypeScript em worktree isolado.</role>
<code_standards>Max 500 LOC, max 50 LOC/função, TSDoc @throws/@example, complexidade <10, sem 'any'.</code_standards>
<task>Converter utils/format.js para TypeScript.</task>
<files>utils/format.js</files>
<rules>git add ao terminar. NÃO commit. NUNCA tocar fora de: utils/format.js, utils/format.ts.</rules>
</system>
</examples>
```

---

### Subtask 4.2: Worker Runner (Pi Agent SDK)

**Depende de:** 4.1
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo
- @docs/pi/pi-agent-nodejs.md — SDK createAgentSession, subscribe, prompt, steer, SessionManager (inMemory vs file), 4 camadas (pi-ai, pi-agent-core, pi-coding-agent, pi-tui)
- @docs/pi/pi-agent-anatomia.md — pipeline interno (input→contexto→loop→persistência), hooks (tool_call, tool_result, session_before_compact), tools built-in (read, write, edit, bash)
- @docs/pi/pi-agent-sdk-vs-rpc.md — SDK vs RPC: SDK para type safety e acesso direto ao estado, RPC para isolamento de processo
- @src/schemas/dag.schema.ts — tipo DAGNode
- @src/schemas/worker-result.schema.ts — WorkerResultSchema para validação do retorno
- @src/prompts/worker.prompt.ts — generateWorkerPrompt()

**Arquivos a criar:**
- `src/agents/worker-runner.ts` (~250 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 250 LOC), TSDoc
- @docs/pi/pi-agent-nodejs.md — createAgentSession({ model, cwd, tools, sessionManager }), session.subscribe(callback), session.prompt(text), SessionManager inMemory, stream de eventos (tool_call, text, error, done)
- @docs/pi/pi-agent-anatomia.md — loop interno runLoop(), hooks disponíveis (tool_call, tool_result), tools built-in (read, write, edit, bash), compactação automática de contexto
- @docs/pi/pi-agent-sdk-vs-rpc.md — escolha SDK (type safety, acesso ao estado, mesma thread) vs RPC (isolamento de processo); usar SDK para este caso
- @src/schemas/dag.schema.ts — tipo DAGNode para parâmetros
- @src/schemas/worker-result.schema.ts — WorkerResultSchema para validação do retorno
- @src/prompts/worker.prompt.ts — generateWorkerPrompt() para gerar system prompt
</context>

<role>
Você é um engenheiro de integração. Implemente o runner que instancia e executa um Pi Coding Agent como Worker em worktree isolada.
</role>

<constraints>
- Max 250 LOC
- SDK Pi: createAgentSession com inMemory SessionManager
- cwd = path do worktree (NUNCA o diretório principal)
- Subscribe a eventos para streaming de progresso
- Timeout configurável (default 5 min por node)
- Se agent para sem completar: status "partial"
- Após execução: git diff para resumo de mudanças
- TSDoc com @throws e @example
</constraints>

<behavior>
1. Receber: node (DAGNode), worktreePath, workerModel, systemPrompt
2. createAgentSession com: model=workerModel, cwd=worktreePath, tools=default
3. session.prompt(systemPrompt + node.task)
4. Subscribe → emitir progresso via callback
5. Aguardar conclusão ou timeout
6. git diff no worktree → WorkerResult
7. Retornar WorkerResultSchema.parse(result)
</behavior>

<error_handling>
- Timeout: kill session, status="failure", error="timeout"
- Agent error: capturar, status="failure", error=message
- Partial: git diff mostra mudanças mas agent não completou → status="partial"
</error_handling>
```

---

### Subtask 4.3: Tela de execução em tempo real

**Depende de:** 0.3
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo
- @docs/general/ink.md — Static (logs sem re-render), Box (split layout), Text (cores por status), Spacer
- @src/schemas/dag.schema.ts — DAGSchema para renderizar DAG
- @src/schemas/worker-result.schema.ts — WorkerResult para status

**Arquivos a criar:**
- `src/screens/execution-screen.tsx` (~250 LOC)
- `src/components/worker-log.tsx` (~100 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 250 LOC tela, max 100 LOC componente)
- @docs/general/ink.md — Static (logs que não re-renderizam), Box (split layout horizontal), Text (color, bold, dimColor), Spacer, useStdout
- @src/schemas/dag.schema.ts — DAGSchema e DAGNode para renderizar status
- @src/schemas/worker-result.schema.ts — WorkerResult para exibir resultados
</context>

<role>
Você é um desenvolvedor React/Ink especializado em dashboards real-time. Construa a tela de execução do Pi DAG CLI.
</role>

<constraints>
- Ink v6, React 19, TypeScript strict
- Max 250 LOC tela, max 100 LOC componente
- <Static> para logs que não devem re-renderizar
- Status em tempo real (cores por status)
- Scroll automático do log ativo
- Mostrar: tempo decorrido, progresso geral
- TSDoc com @example
</constraints>

<layout>
┌─────────────────────────────────────────────┐
│ Pi DAG CLI — Executando                     │
├─────────────────────┬───────────────────────┤
│ DAG                 │ Log do Worker ativo    │
│ ✓ [1] format.js     │ > Lendo format.js...   │
│ ⟳ [2] validate.js  │ > Convertendo tipos... │
│ ○ [3] imports       │                        │
├─────────────────────┴───────────────────────┤
│ Progresso: 1/3 ✓ | 1 rodando | 00:42       │
└─────────────────────────────────────────────┘
</layout>
```

---

## Fase 5: Estabilidade, Retries & Fallbacks (MVP 5)

**Objetivo:** Resiliência em falhas de LLM, Git e rede.

### Subtask 5.1: Retry com temperature decay

**Depende de:** 4.2
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo
- @docs/general/prompts-guide.md — seção DeepSeek "conteúdo vazio ocasionalmente", retry com re-prompting, seção anti-padrões (#5 conteúdo vazio)
- @docs/general/prompt-engineering.md — seção "Temperatura zero não garante determinismo", diferenças de temperatura por modelo
- @docs/langchain/langchain-models-2026.md — fallback entre modelos, preços para cálculo de custo de retry, Gemini "manter em 1.0"
- @src/schemas/worker-result.schema.ts — WorkerResult para verificar status

**Arquivos a criar:**
- `src/pipeline/retry-handler.ts` (~150 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 150 LOC)
- @docs/general/prompts-guide.md — DeepSeek "pode retornar conteúdo vazio ocasionalmente" (bug documentado, implementar always try/catch + retry), retry com re-prompting (incluir erro na mensagem)
- @docs/general/prompt-engineering.md — "Temperatura zero não garante determinismo", instabilidade de até 15% entre runs
- @docs/langchain/langchain-models-2026.md — tabela de fallback: GPT-4.1→GPT-4.1-mini, Gemini Pro→Gemini Flash, DeepSeek→GPT-4.1-mini; Gemini requer temp 1.0 (reduzir causa loops)
- @src/schemas/worker-result.schema.ts — WorkerResult para verificar status
</context>

<role>
Você é um engenheiro de resiliência. Implemente o handler de retry para falhas de Workers.
</role>

<constraints>
- Max 150 LOC
- Retry: max 3 tentativas
- Tentativa 1: temperature original
- Tentativa 2: temperature - 0.2 (mínimo 0, exceto Gemini que deve manter 1.0)
- Tentativa 3: modelo fallback (se configurado)
- Backoff exponencial: 1s, 3s, 9s
- DeepSeek vazio: retry imediato sem backoff (bug documentado)
- Tratar: timeout, rate limit (429), conteúdo vazio
- TSDoc com @throws e @example
</constraints>
```

---

### Subtask 5.2: Git conflict resolution

**Depende de:** 3.1
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo
- @src/git/git-wrapper.ts — merge() e suas assinaturas para compor a resolução

**Arquivos a criar:**
- `src/git/conflict-resolver.ts` (~200 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 200 LOC), TSDoc, imutabilidade
- @src/git/git-wrapper.ts — merge() e Result<MergeResult, GitError> para compor resolução
</context>

<role>
Você é um engenheiro Git. Implemente a resolução de conflitos de merge entre branches de worktrees.
</role>

<constraints>
- Max 200 LOC
- Se merge falha: tentar merge com -X theirs (último writer ganha)
- Se ainda falha: abortar merge, marcar node "failed", notificar usuário
- NUNCA deletar source files do usuário
- NUNCA force push ou reset --hard na branch principal
- Logar conflitos detalhadamente para debugging
- TSDoc com @throws e @example
</constraints>
```

---

### Subtask 5.3: Tela de status final

**Depende de:** 0.3
**Contexto obrigatório:**
- @docs/general/file-agent-patterns.md — métricas de arquivo
- @docs/general/ink.md — Box, Text, useInput para ações do usuário
- @src/schemas/dag.schema.ts — DAGSchema para resumo
- @src/schemas/worker-result.schema.ts — WorkerResult para exibir resultados

**Arquivos a criar:**
- `src/screens/result-screen.tsx` (~150 LOC)

**Prompt:**

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 150 LOC)
- @docs/general/ink.md — Box, Text (cores), useInput para keybindings
- @src/schemas/dag.schema.ts — DAGSchema para resumo do DAG
- @src/schemas/worker-result.schema.ts — WorkerResult para listar resultados/erros
</context>

<role>
Você é um desenvolvedor React/Ink. Construa a tela de resultado final do pipeline.
</role>

<constraints>
- Max 150 LOC
- Resumo: DAG (completed/failed/blocked), branch final, diff total
- Se falhas: listar nodes falhados com erro
- Keybindings: [r] retry falhados, [q] sair, [d] ver diff completo
- TSDoc com @example
</constraints>
```

---

## Mapa de Arquivos por Fase

```
src/
├── cli.tsx                              # Fase 0 — entry point
├── app.tsx                              # Fase 1 — router de telas
├── schemas/
│   ├── dag.schema.ts                    # Fase 0 — DAG JSON Schema (Zod)
│   ├── config.schema.ts                 # Fase 0 — config schema
│   └── worker-result.schema.ts          # Fase 0 — resultado do worker
├── screens/
│   ├── config-screen.tsx                # Fase 1 — config API/modelos
│   ├── context-screen.tsx               # Fase 1 — seleção de contexto
│   ├── task-screen.tsx                  # Fase 1 — input macro-task
│   ├── dag-screen.tsx                   # Fase 2 — visualização DAG
│   ├── execution-screen.tsx             # Fase 4 — dashboard execução
│   └── result-screen.tsx                # Fase 5 — resultado final
├── components/
│   ├── dag-node.tsx                     # Fase 2 — nó do DAG
│   └── worker-log.tsx                   # Fase 4 — log streaming
├── prompts/
│   ├── planner.prompt.ts                # Fase 2 — system prompt Planner
│   ├── explorer.prompt.ts               # Fase 2 — system prompt Explorer
│   └── worker.prompt.ts                 # Fase 4 — gerador de prompt Worker
├── agents/
│   ├── explorer.agent.ts                # Fase 2 — sub-agente ReAct
│   └── worker-runner.ts                 # Fase 4 — runner do Pi Agent
├── tools/
│   └── explorer-tools.ts               # Fase 2 — tools do Explorer
├── pipeline/
│   ├── planner-pipeline.ts              # Fase 2 — orquestração Planner
│   ├── dag-executor.ts                  # Fase 3 — executor topológico
│   └── retry-handler.ts                # Fase 5 — retry com fallback
├── git/
│   ├── git-wrapper.ts                   # Fase 3 — operações git
│   ├── worktree-manager.ts              # Fase 3 — lifecycle worktrees
│   └── conflict-resolver.ts             # Fase 5 — resolução de conflitos
├── hooks/
│   ├── use-config.ts                    # Fase 1 — persistência config
│   └── use-file-tree.ts                 # Fase 1 — listagem de arquivos
└── utils/
    └── openrouter.ts                    # Fase 1 — validação API
```

**Total: 25 arquivos, ~4.800 LOC estimadas (média ~192 LOC/arquivo)**

---

## Checklist de Qualidade por Fase (derivado de @docs/general/file-agent-patterns.md)

Antes de considerar qualquer fase completa:

- [ ] Todos os arquivos têm < 500 LOC (ideal < 300)
- [ ] Todas as funções têm < 50 LOC
- [ ] Complexidade ciclomática < 10 em todos os módulos
- [ ] TSDoc com @throws e @example em toda função exportada
- [ ] Sem `any` (eslint @typescript-eslint/no-explicit-any)
- [ ] Schemas Zod validam todo input/output entre módulos
- [ ] Sem console.log — usar sistema de logging ou componentes Ink
- [ ] Testes unitários para utils, schemas, git wrapper (80%+ cobertura)
- [ ] Comentários explicam o "porquê", nunca o "quê"
- [ ] Nomes de arquivo únicos e descritivos (zero arquivos index.ts)

---

## Referência Cruzada: Contextos @ por Subtask

| Subtask | @docs/general/ | @docs/langchain/ | @docs/pi/ | @src/ |
|---------|---------------|-----------------|----------|-------|
| 0.1 | file-agent-patterns, ink | — | — | — |
| 0.2 | file-agent-patterns | — | — | README.md |
| 0.3 | file-agent-patterns, prompts-guide, prompt-engineering | — | — | — |
| 1.1 | file-agent-patterns, ink | langchain-models-2026 | — | schemas/config |
| 1.2 | file-agent-patterns, ink | — | — | — |
| 1.3 | file-agent-patterns, ink | — | — | schemas/config |
| 1.4 | file-agent-patterns, ink | — | — | screens/*, schemas/config |
| 2.1 | file-agent-patterns, prompts-guide, prompt-engineering, story-breaking, context-building | — | — | schemas/dag |
| 2.2 | file-agent-patterns, prompts-guide, prompt-engineering | ReAct-tec-guide, langgraph-production | — | — |
| 2.3 | file-agent-patterns, prompt-engineering | langchain-models-2026 | — | schemas/dag, prompts/planner, agents/explorer |
| 2.4 | file-agent-patterns, ink | — | — | schemas/dag |
| 3.1 | file-agent-patterns | — | — | — |
| 3.2 | file-agent-patterns | — | — | schemas/dag, git/* |
| 4.1 | file-agent-patterns, prompts-guide, prompt-engineering, context-building, context-building-2 | — | — | schemas/dag |
| 4.2 | file-agent-patterns | — | pi-agent-nodejs, pi-agent-anatomia, pi-agent-sdk-vs-rpc | schemas/dag, schemas/worker-result, prompts/worker |
| 4.3 | file-agent-patterns, ink | — | — | schemas/dag, schemas/worker-result |
| 5.1 | file-agent-patterns, prompts-guide, prompt-engineering | langchain-models-2026 | — | schemas/worker-result |
| 5.2 | file-agent-patterns | — | — | git/git-wrapper |
| 5.3 | file-agent-patterns, ink | — | — | schemas/dag, schemas/worker-result |
