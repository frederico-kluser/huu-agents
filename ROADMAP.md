# ROADMAP EXPANDIDO: Pi DAG Task CLI (POC)

Cronograma expandido com subtasks atômicas, mapeamento de arquivos de referência obrigatórios, e prompts prontos para cada etapa.

**Princípios aplicados a TODAS as fases:**
- Código da CLI segue `docs/general/file-agent-patterns.md`: 200-500 LOC/arquivo, 5-10 funções/arquivo, max 50 LOC/função, complexidade ciclomática <10
- Prompts seguem `docs/general/prompts-guide.md`: papel + catálogo + regras + schema + few-shot
- Anti-patterns de `docs/general/prompt-engineering.md`: sem over-prompting (max ~300 palavras), sem CoT cego, structured outputs nativos
- TSDoc complementar (nunca duplicar tipos): `@throws`, `@example`, comentar o "porquê"

---

## Fase 0: Setup do Projeto e Padrões (NOVA)

**Objetivo:** Projeto TS/ESM funcional com padrões agent-friendly desde o primeiro arquivo.

### Arquivos de referência obrigatórios
- `docs/general/file-agent-patterns.md` — métricas de arquivo, JSDoc, checklist
- `docs/general/ink.md` — Node >=20, ESM, React 19, estrutura base

### Subtask 0.1: Scaffold do projeto TS/ESM

**Arquivos a criar:**
- `package.json` (type: module, engines: node >=20)
- `tsconfig.json` (ES2022, NodeNext, strict)
- `.eslintrc.json` (no-explicit-any, max-lines: 500, complexity: 10)
- `src/cli.tsx` (entry point)
- `src/app.tsx` (componente raiz Ink)

**Prompt para o agente construtor:**

```xml
<role>
Você é um engenheiro TypeScript sênior. Sua função é criar o scaffold inicial de um projeto CLI baseado em Ink v6 + React 19, 100% ESM.
</role>

<constraints>
- Node.js >= 20, TypeScript strict mode, ES2022 target, NodeNext module resolution
- Cada arquivo deve ter 200-500 linhas (max 800), 5-10 funções (max 50 linhas cada)
- Complexidade ciclomática máxima: 10
- ESLint com @typescript-eslint/no-explicit-any habilitado
- Sem console.log em código de produção
- package.json deve ter "type": "module"
- Imports usam extensão .js mesmo para .tsx (exigência ESM + tsc)
</constraints>

<output_schema>
Gere os seguintes arquivos com conteúdo funcional:
1. package.json — dependências: ink@latest, react@latest, @types/react, typescript
2. tsconfig.json — strict, ES2022, NodeNext, outDir: dist, rootDir: src
3. src/cli.tsx — entry point com shebang, chama render(<App />)
4. src/app.tsx — componente raiz com Text "Pi DAG CLI v0.1"
</output_schema>

<examples>
Entrada: "Crie o scaffold"
Saída: 4 arquivos com conteúdo funcional, prontos para `npm run build && node dist/cli.js`
</examples>
```

### Subtask 0.2: CLAUDE.md e AGENTS.md do projeto

**Arquivos a criar:**
- `CLAUDE.md` (max 150 linhas)
- `.cursor/rules` ou `AGENTS.md`

**Prompt para o agente construtor:**

```xml
<role>
Você é um arquiteto de projetos agent-friendly. Crie o CLAUDE.md do projeto Pi DAG Task CLI seguindo as melhores práticas de AGENTS.md (60K+ repos).
</role>

<constraints>
- Máximo 150 linhas
- Incluir: comandos de build/test, visão arquitetural, stack, limites explícitos
- Não incluir regras que linters já aplicam
- Não auto-gerar — cada linha deve ter valor semântico específico
- Três níveis de limites: SEMPRE fazer, PERGUNTAR antes, NUNCA fazer
</constraints>

<context>
Stack: TypeScript ESM, Ink v6, React 19, LangChain.js, Pi Coding Agent SDK
Arquitetura: CLI que decompõe macro-tasks em DAG, executa via Git Worktrees paralelos com agentes Pi
Modelos: Planner (raciocínio pesado) + Workers (execução rápida) via OpenRouter
</context>

<output_schema>
Um arquivo CLAUDE.md com seções:
1. Projeto (1 parágrafo)
2. Comandos (build, test, lint, run)
3. Stack e dependências
4. Estrutura de diretórios
5. Convenções de código (referenciando file-agent-patterns)
6. Limites (sempre/perguntar/nunca)
</output_schema>
```

### Subtask 0.3: Schemas Zod fundamentais

**Arquivos a criar:**
- `src/schemas/dag.schema.ts` — schema do DAG (output do Planner)
- `src/schemas/config.schema.ts` — schema do ~/.pi-dag-cli.json
- `src/schemas/worker-result.schema.ts` — schema de resultado do Worker

**Arquivos de referência:**
- `docs/general/prompts-guide.md` — "schema de output estruturado" obrigatório
- `docs/general/prompt-engineering.md` — "Structured outputs nativos são obrigatórios"

**Prompt para o agente construtor:**

```xml
<role>
Você é um engenheiro de schemas. Defina os schemas Zod que governam toda a comunicação entre componentes do Pi DAG CLI.
</role>

<constraints>
- Usar Zod, não interfaces TypeScript soltas
- Cada schema em arquivo separado (responsabilidade única)
- Schemas flat quando possível — providers limitam tipos recursivos
- Enums para ações, status e tipos — nunca strings livres
- Todos os campos obrigatórios explícitos, sem additionalProperties
</constraints>

<schemas_required>
1. DAGSchema:
   - nodes: array de { id: string, task: string, dependencies: string[], status: enum(pending|running|done|failed), files: string[] }
   - metadata: { macroTask: string, totalNodes: number, parallelizable: number }

2. ConfigSchema:
   - openrouterApiKey: string
   - plannerModel: string (ex: "openai/gpt-4.1")
   - workerModel: string (ex: "openai/gpt-4.1-mini")
   - worktreeBasePath: string (default: ".pi-dag-worktrees")

3. WorkerResultSchema:
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

### Arquivos de referência obrigatórios
- `docs/general/ink.md` — componentes, hooks, layout Flexbox, dashboard multi-agente
- `docs/general/file-agent-patterns.md` — métricas de cada arquivo criado
- `docs/langchain/langchain-models-2026.md` — catálogo de modelos para seleção

### Subtask 1.1: Tela de configuração (API Key + Modelos)

**Arquivos a criar:**
- `src/screens/config-screen.tsx` — tela de config (~200 LOC)
- `src/hooks/use-config.ts` — hook de persistência (~100 LOC)
- `src/utils/openrouter.ts` — verificação de API key (~80 LOC)

**Prompt para o agente construtor:**

```xml
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
</constraints>

<behavior>
1. Verificar se ~/.pi-dag-cli.json existe
2. Se existe e tem apiKey válida: pular para próxima tela
3. Se não existe: pedir OpenRouter API Key via TextInput
4. Validar key com HEAD request ao OpenRouter
5. Listar modelos disponíveis para Planner (reasoning models) e Worker (fast models)
6. Salvar config validada
</behavior>

<output_schema>
ConfigScreen renderiza:
- Box com borderStyle="round": título "Configuração"
- TextInput para API key (mascarado com *)
- SelectInput para modelo Planner (opções: gpt-4.1, gemini-2.5-pro, deepseek-chat)
- SelectInput para modelo Worker (opções: gpt-4.1-mini, gemini-2.5-flash, gpt-4.1-nano)
- Text com status de validação (verde=ok, vermelho=erro)
</output_schema>

<examples>
// Estado inicial — sem config
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

### Subtask 1.2: Tela de seleção de contexto

**Arquivos a criar:**
- `src/screens/context-screen.tsx` — seleção de arquivos/dirs (~250 LOC)
- `src/hooks/use-file-tree.ts` — listagem recursiva do projeto (~150 LOC)

**Prompt para o agente construtor:**

```xml
<role>
Você é um desenvolvedor React/Ink. Construa a tela de seleção de contexto onde o usuário marca arquivos e diretórios relevantes para a macro-task.
</role>

<constraints>
- Ink v6, React 19, TypeScript strict, ESM
- Max 300 LOC por arquivo, max 50 LOC por função
- Componentes funcionais com arrow functions
- Navegação via useInput (j/k ou setas), toggle via espaço, expandir/colapsar via Enter
- Respeitar .gitignore — não listar node_modules, dist, .git
- Limitar profundidade a 4 níveis para não sobrecarregar o terminal
</constraints>

<behavior>
1. Ler cwd e listar árvore de arquivos respeitando .gitignore
2. Renderizar como tree view com checkboxes: [x] src/app.tsx, [ ] src/utils/
3. Diretórios colapsáveis com indicador ▶/▼
4. Barra inferior mostrando: "N arquivos selecionados | ~X tokens estimados"
5. Estimativa de tokens: LOC * 8 (média JS/TS)
6. [Enter] confirma seleção, retorna array de paths
</behavior>

<output_schema>
ContextScreen aceita props: { onComplete: (selectedPaths: string[]) => void }
Renderiza:
- Box com título "Selecione contexto para o Planner"
- Tree view com checkboxes
- Footer com contagem e estimativa de tokens
</output_schema>
```

### Subtask 1.3: Tela de entrada da macro-task

**Arquivos a criar:**
- `src/screens/task-screen.tsx` — entrada de texto (~120 LOC)

**Prompt para o agente construtor:**

```xml
<role>
Você é um desenvolvedor React/Ink. Construa a tela final de input onde o usuário digita a macro-task.
</role>

<constraints>
- Ink v6, React 19, TypeScript strict, ESM
- Max 200 LOC, max 5 funções
- TextInput multi-linha para tasks complexas
- Mostrar resumo: modelo Planner, modelo Worker, N arquivos de contexto
</constraints>

<behavior>
1. Mostrar resumo da configuração selecionada nas telas anteriores
2. Campo de texto para macro-task
3. Validar que task não está vazia
4. [Enter] inicia o pipeline
</behavior>

<output_schema>
TaskScreen aceita props: { config: Config, contextFiles: string[], onSubmit: (task: string) => void }
</output_schema>
```

### Subtask 1.4: Orquestrador de telas (App Router)

**Arquivos a criar:**
- `src/app.tsx` — router de telas com state machine (~150 LOC)

**Prompt para o agente construtor:**

```xml
<role>
Você é um desenvolvedor React/Ink. Construa o componente App que orquestra a navegação entre as 3 telas (config → contexto → task) usando state machine simples.
</role>

<constraints>
- Ink v6, React 19, TypeScript strict, ESM
- Max 150 LOC
- State machine com useState: "config" | "context" | "task" | "executing"
- Cada tela passa dados via callback para a próxima
- Sem bibliotecas de routing — useState simples
</constraints>

<behavior>
1. Estado inicial: "config"
2. ConfigScreen.onComplete → salva config, muda para "context"
3. ContextScreen.onComplete → salva paths, muda para "task"
4. TaskScreen.onSubmit → salva macro-task, muda para "executing"
5. Em "executing": renderiza placeholder "Executando pipeline..."
</behavior>
```

---

## Fase 2: Decomposição Inteligente e Coleta ReAct (MVP 2)

**Objetivo:** Planner decompõe macro-task em DAG JSON Schema validado, com exploração ReAct quando contexto é insuficiente.

### Arquivos de referência obrigatórios
- `docs/langchain/ReAct-langchain-tec-guide.md` — ciclo Thought→Action→Observation
- `docs/general/story-breaking.md` — decomposição hierárquica, ADaPT, TDAG
- `docs/general/prompts-guide.md` — 5 componentes do system prompt
- `docs/general/prompt-engineering.md` — anti-patterns, structured outputs
- `docs/general/context-building.md` — 5 camadas, anti-alucinação
- `docs/langchain/langchain-models-2026.md` — capacidades por modelo
- `docs/general/file-agent-patterns.md` — métricas para o código que Workers vão gerar

### Subtask 2.1: System prompt do Planner (Arquiteto)

**Arquivos a criar:**
- `src/prompts/planner.prompt.ts` — prompt do Planner (~200 LOC)

**Prompt para o agente construtor:**

```xml
<role>
Você é um engenheiro de prompts de produção. Crie o system prompt do agente Planner (Arquiteto) do Pi DAG CLI.
</role>

<constraints>
- Máximo 300 palavras de instrução no system prompt (regra de ouro do prompt-engineering.md)
- Structured output obrigatório via schema Zod (DAGSchema de src/schemas/dag.schema.ts)
- 5 componentes obrigatórios: papel, catálogo de ações, regras, schema de output, few-shot
- Adaptável a modelo (XML tags para Claude, Markdown para GPT) — exportar função que recebe modelProvider e retorna prompt formatado
- Instruções no início E no final (sandwich method)
- Conteúdo estático no topo para aproveitar prompt caching
- O Planner DEVE instruir que cada node do DAG produza código seguindo file-agent-patterns:
  - Max 500 LOC por arquivo modificado
  - Max 50 LOC por função
  - JSDoc com @throws e @example em funções exportadas
  - Complexidade ciclomática < 10
</constraints>

<prompt_structure>
1. PAPEL: "Você é o Arquiteto de Decomposição do Pi DAG CLI. Sua ÚNICA função é..."
2. CATÁLOGO DE AÇÕES:
   - decompose: quebrar macro-task em DAG de subtasks atômicas
   - request_exploration: solicitar que o ReAct Explorer investigue o codebase
   - clarify: pedir esclarecimento ao usuário
3. REGRAS INVIOLÁVEIS:
   - Cada node deve ser executável por UM agente em UM worktree
   - Dependências devem formar um DAG (sem ciclos)
   - Nodes independentes DEVEM ser marcados como parallelizable
   - Cada node lista os files que vai tocar
   - Se não sabe quantos arquivos existem num diretório: action = "request_exploration"
   - Se a task é ambígua: action = "clarify"
   - NUNCA inventar nomes de arquivo — usar apenas paths confirmados
4. SCHEMA: DAGSchema (nodes, metadata)
5. FEW-SHOT: 3 exemplos diversos (task simples, task com exploração, task ambígua)
</prompt_structure>

<quality_gates>
O Planner deve embutir estas regras em cada node.task para guiar os Workers:
- "Ao implementar, siga: max 500 LOC/arquivo, max 50 LOC/função, JSDoc com @throws e @example em exports, complexidade ciclomática < 10"
- "Documente decisões de design em comentários — explique o PORQUÊ, nunca o QUÊ"
- "Use TypeScript strict mode. Proibido 'any'."
</quality_gates>
```

### Subtask 2.2: Sub-agente ReAct Explorer

**Arquivos a criar:**
- `src/agents/explorer.agent.ts` — loop ReAct de exploração (~250 LOC)
- `src/prompts/explorer.prompt.ts` — prompt do Explorer (~150 LOC)
- `src/tools/explorer-tools.ts` — tools disponíveis para o Explorer (~200 LOC)

**Arquivos de referência:**
- `docs/langchain/ReAct-langchain-tec-guide.md` — implementação com bindTools + ToolMessage

**Prompt para o agente construtor:**

```xml
<role>
Você é um engenheiro de agentes LLM. Implemente o sub-agente ReAct Explorer que investiga o codebase para fornecer contexto ao Planner.
</role>

<constraints>
- Implementar ciclo Thought→Action→Observation usando LangChain.js createReactAgent ou loop manual com bindTools()
- Max 250 LOC no arquivo do agente, max 200 LOC no arquivo de tools
- Cada tool é uma função pura com schema Zod de input/output
- Max 10 iterações do loop ReAct (circuit breaker)
- Output condensado: max 2.000 tokens retornados ao Planner
</constraints>

<tool_catalog>
O Explorer tem acesso APENAS a estas tools:
1. list_directory(path: string, depth?: number) → string[] — lista arquivos/dirs
2. read_file_head(path: string, lines?: number) → string — lê primeiras N linhas (default 50)
3. count_files(path: string, pattern: string) → number — conta arquivos por glob pattern
4. search_content(path: string, query: string) → { file: string, line: number, content: string }[] — busca textual

NUNCA:
- Modificar arquivos
- Executar comandos arbitrários
- Acessar rede
</tool_catalog>

<system_prompt_explorer>
Você é um Explorador de Codebase. Sua função é investigar a estrutura e conteúdo do projeto para responder perguntas específicas do Arquiteto.

## FERRAMENTAS DISPONÍVEIS
- list_directory: lista arquivos e subdiretórios
- read_file_head: lê as primeiras linhas de um arquivo
- count_files: conta arquivos por padrão glob
- search_content: busca texto em arquivos

## REGRAS
- Use APENAS as ferramentas listadas
- Máximo 10 ações antes de retornar resultado
- Retorne dados concretos: nomes de arquivo, contagens, trechos de código
- NUNCA invente informação — se não encontrou, diga "não encontrado"
- Condense o resultado em no máximo 2.000 tokens

## FORMATO DE RESPOSTA
Retorne um resumo estruturado:
- Arquivos encontrados: [lista de paths]
- Contagens: [métrica → valor]
- Observações relevantes: [trechos de código ou padrões identificados]
</system_prompt_explorer>
```

### Subtask 2.3: Pipeline Planner (orquestração)

**Arquivos a criar:**
- `src/pipeline/planner-pipeline.ts` — orquestra Planner + Explorer (~200 LOC)

**Prompt para o agente construtor:**

```xml
<role>
Você é um engenheiro de pipelines. Implemente o pipeline que conecta o Planner ao Explorer e valida o output.
</role>

<constraints>
- Max 200 LOC
- Usar Zod para validar DAG output (DAGSchema)
- Se Planner retorna action="request_exploration": invocar Explorer, concatenar resultado ao contexto, re-invocar Planner
- Se Planner retorna action="clarify": propagar pergunta ao usuário via callback
- Max 3 ciclos Planner→Explorer (circuit breaker)
- Retry com re-prompting se Zod validation falhar (max 2 retries)
- Structured output via API nativa quando disponível (strict: true para OpenAI, responseJsonSchema para Gemini)
</constraints>

<behavior>
1. Montar contexto: system prompt + arquivos selecionados pelo usuário + macro-task
2. Chamar Planner com structured output
3. Validar resposta com DAGSchema.safeParse()
4. Se válido e action="decompose": retornar DAG
5. Se action="request_exploration": chamar Explorer → anexar resultado → retry Planner
6. Se action="clarify": retornar pergunta ao caller
7. Se validação falha: retry com mensagem de erro do Zod (max 2x)
</behavior>
```

### Subtask 2.4: Tela de visualização do DAG

**Arquivos a criar:**
- `src/screens/dag-screen.tsx` — renderização do DAG no terminal (~200 LOC)
- `src/components/dag-node.tsx` — componente de nó individual (~80 LOC)

**Prompt para o agente construtor:**

```xml
<role>
Você é um desenvolvedor React/Ink especializado em visualização. Renderize o DAG de subtasks no terminal.
</role>

<constraints>
- Ink v6, React 19, TypeScript strict
- Max 200 LOC para a tela, max 80 LOC para o componente de nó
- Usar Box com flexDirection="column" para lista vertical de nodes
- Indicar dependências com indentação ou prefixo "└── depende de: [ids]"
- Status com cores: pending=cinza, running=amarelo, done=verde, failed=vermelho
- Atualizar em tempo real conforme Workers completam
</constraints>

<output_schema>
Exemplo de renderização:
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

### Arquivos de referência obrigatórios
- `docs/general/file-agent-patterns.md` — métricas para o wrapper (200-500 LOC)

### Subtask 3.1: Git Wrapper

**Arquivos a criar:**
- `src/git/git-wrapper.ts` — operações git atômicas (~300 LOC)
- `src/git/worktree-manager.ts` — lifecycle de worktrees (~250 LOC)

**Prompt para o agente construtor:**

```xml
<role>
Você é um engenheiro de sistemas com expertise em Git internals. Implemente o wrapper Git e o gerenciador de worktrees para o Pi DAG CLI.
</role>

<constraints>
- Max 300 LOC para git-wrapper, max 250 LOC para worktree-manager
- Usar child_process.execFile (não exec) para segurança contra injection
- Toda operação git retorna Result<T, GitError> (never throws)
- Imutabilidade: funções retornam novos objetos, nunca mutam parâmetros
- NUNCA operar no working tree do usuário — apenas em worktrees isoladas
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
// Criar worktree para node "2" da task "20260321-143000"
const result = await createWorktree("2", "20260321-143000");
// result.ok → { path: ".pi-dag-worktrees/task-20260321-143000-subtask-2", branch: "task-20260321-143000-subtask-2" }
</examples>
```

### Subtask 3.2: DAG Executor (topological sort + paralelismo)

**Arquivos a criar:**
- `src/pipeline/dag-executor.ts` — executor topológico (~250 LOC)

**Prompt para o agente construtor:**

```xml
<role>
Você é um engenheiro de sistemas distribuídos. Implemente o executor de DAG que resolve dependências e lança Workers em paralelo.
</role>

<constraints>
- Max 250 LOC
- Topological sort para determinar ordem de execução
- Nodes sem dependências executam em paralelo (Promise.allSettled)
- Nodes com dependências aguardam predecessores (merge de resultados antes de iniciar)
- Emitir eventos de progresso: node-started, node-completed, node-failed
- Se um node falha: marcar dependentes como "blocked", continuar outros ramos
- Nunca bloquear a event loop — usar async/await puro
</constraints>

<behavior>
1. Receber DAG validado (DAGSchema)
2. Computar topological order (Kahn's algorithm)
3. Identificar wave 1: nodes sem dependências → executar em paralelo
4. Para cada node completo:
   a. git merge resultado na branch base
   b. Liberar nodes cujas dependências estão satisfeitas → nova wave
5. Repetir até todos os nodes estarem done/failed/blocked
6. Retornar: { completed: string[], failed: string[], blocked: string[] }
</behavior>
```

---

## Fase 4: Worker Pi Agent com Contexto LLM (MVP 4)

**Objetivo:** Workers executam subtasks em worktrees isoladas com system prompts ricos em contexto e padrões agent-friendly.

### Arquivos de referência obrigatórios
- `docs/general/context-building.md` — 5 camadas de contexto, anti-alucinação
- `docs/general/context-building-2.md` — CoVe, quote-first, Self-RAG
- `docs/general/file-agent-patterns.md` — métricas que Workers DEVEM seguir ao codificar
- `docs/pi/pi-agent-nodejs.md` — SDK createAgentSession, subscribe, prompt
- `docs/pi/pi-agent-anatomia.md` — hooks, loop, tools
- `docs/pi/pi-agent-sdk-vs-rpc.md` — SDK vs RPC para orquestração
- `docs/langchain/langchain-langgraph-production.md` — orquestração

### Subtask 4.1: System prompt do Worker

**Arquivos a criar:**
- `src/prompts/worker.prompt.ts` — gerador de prompt contextualizado (~200 LOC)

**Prompt para o agente construtor:**

```xml
<role>
Você é um engenheiro de prompts de produção. Crie o gerador de system prompt dos Workers do Pi DAG CLI.
</role>

<constraints>
- Máximo 300 palavras no system prompt gerado (evitar over-prompting)
- Prompt gerado dinamicamente com contexto específico da subtask
- Sandwich method: instruções críticas no início E no final
- Conteúdo estático no topo (cacheável), dinâmico no final
- EMBUTIR as regras de file-agent-patterns diretamente no prompt
- Exportar função: generateWorkerPrompt(node: DAGNode, gitLog: string, modelProvider: string): string
- Adaptação por provider: XML tags para anthropic, Markdown headers para openai
</constraints>

<prompt_template>
O prompt gerado deve seguir esta estrutura:

CAMADA 1 (estática, cacheável):
- Papel: "Você é um engenheiro de software operando em um worktree Git isolado."
- Padrões de código obrigatórios:
  * Arquivos: max 500 linhas, ideal 200-300
  * Funções: max 50 linhas, 5-10 por arquivo
  * Complexidade ciclomática: max 10
  * TSDoc em toda função exportada: @throws, @example
  * Comentar o PORQUÊ, nunca o QUÊ
  * TypeScript strict, sem 'any', sem console.log
  * Imutabilidade: retornar novos objetos, nunca mutar

CAMADA 2 (dinâmica por node):
- Tarefa específica: node.task
- Arquivos que deve tocar: node.files
- Dependências já completadas: node.dependencies (com resumo do que foi feito)

CAMADA 3 (contexto git):
- git log resumido das branches mergidas (max 500 tokens)
- Não enviar arquivos completos — apenas paths e diffs relevantes

CAMADA 4 (regras finais — sandwich):
- "Ao terminar, faça git add dos arquivos modificados. NÃO faça commit."
- "Se encontrar ambiguidade, pare e retorne pergunta."
- "NUNCA modifique arquivos fora da lista: [node.files]"
</prompt_template>

<examples>
// Prompt gerado para node "1" (converter format.js → format.ts)
// Provider: anthropic (usa XML tags)
<system>
<role>Você é um engenheiro TypeScript operando em worktree isolado.</role>

<code_standards>
- Arquivos: max 500 linhas (ideal 200-300)
- Funções: max 50 linhas, 5-10 por arquivo
- TSDoc com @throws e @example em exports
- Complexidade ciclomática < 10
- Sem 'any', sem console.log
</code_standards>

<task>Converter utils/format.js para TypeScript com tipos estritos.</task>
<files>utils/format.js</files>
<dependencies>Nenhuma — este node é independente.</dependencies>

<git_context>Branch: task-20260321-subtask-1. Worktree limpo.</git_context>

<rules>
- Ao terminar: git add dos arquivos modificados. NÃO faça commit.
- NUNCA modifique arquivos fora de: utils/format.js, utils/format.ts
- Se ambíguo: pare e retorne pergunta.
</rules>
</system>
</examples>
```

### Subtask 4.2: Worker Runner (Pi Agent SDK)

**Arquivos a criar:**
- `src/agents/worker-runner.ts` — instância e execução do Pi Agent (~250 LOC)

**Arquivos de referência:**
- `docs/pi/pi-agent-nodejs.md` — createAgentSession, subscribe, prompt, steer

**Prompt para o agente construtor:**

```xml
<role>
Você é um engenheiro de integração. Implemente o runner que instancia e executa um Pi Coding Agent como Worker em um worktree isolado.
</role>

<constraints>
- Max 250 LOC
- Usar SDK do Pi: createAgentSession com inMemory SessionManager
- cwd do agent = path do worktree (NUNCA o diretório principal)
- Subscribe aos eventos para streaming de progresso (tool_call, text, error)
- Timeout configurável (default 5 minutos por node)
- Se agent para sem completar: retornar status "partial"
- Após execução: ler git diff para gerar resumo de mudanças
</constraints>

<behavior>
1. Receber: node (DAGNode), worktreePath, workerModel, systemPrompt
2. createAgentSession com: model=workerModel, cwd=worktreePath, tools=default(read,write,edit,bash)
3. session.prompt(systemPrompt + node.task)
4. Subscribe a eventos, emitir progresso via callback
5. Aguardar conclusão ou timeout
6. Ler git diff no worktree para gerar WorkerResult
7. Retornar WorkerResultSchema validado
</behavior>

<error_handling>
- Timeout: kill session, retornar status="failure", error="timeout"
- Agent error: capturar, retornar status="failure", error=message
- Partial completion: se git diff mostra mudanças mas agent não completou, status="partial"
</error_handling>
```

### Subtask 4.3: Tela de execução em tempo real

**Arquivos a criar:**
- `src/screens/execution-screen.tsx` — dashboard de execução (~250 LOC)
- `src/components/worker-log.tsx` — log streaming por worker (~100 LOC)

**Prompt para o agente construtor:**

```xml
<role>
Você é um desenvolvedor React/Ink especializado em dashboards real-time. Construa a tela de execução do Pi DAG CLI.
</role>

<constraints>
- Ink v6, React 19, TypeScript strict
- Max 250 LOC para tela, max 100 LOC para componente de log
- Usar <Static> do Ink para logs que não devem re-renderizar
- Atualizar DAG node status em tempo real (cores por status)
- Scroll automático do log ativo
- Mostrar: tempo decorrido, tokens consumidos (se disponível), progresso geral
</constraints>

<layout>
┌─────────────────────────────────────────────┐
│ Pi DAG CLI — Executando                     │
├─────────────────────┬───────────────────────┤
│ DAG                 │ Log do Worker ativo    │
│                     │                        │
│ ✓ [1] format.js     │ > Lendo format.js...   │
│ ⟳ [2] validate.js  │ > Convertendo tipos... │
│ ○ [3] imports       │ > Escrevendo format.ts │
│                     │                        │
├─────────────────────┴───────────────────────┤
│ Progresso: 1/3 ✓ | 1 rodando | 00:42       │
└─────────────────────────────────────────────┘
</layout>
```

---

## Fase 5: Estabilidade, Retries & Fallbacks (MVP 5)

**Objetivo:** Resiliência em falhas de LLM, Git e rede.

### Arquivos de referência obrigatórios
- `docs/general/prompts-guide.md` — retry com re-prompting, DeepSeek conteúdo vazio
- `docs/general/context-building.md` — defesa em camadas
- `docs/langchain/langchain-models-2026.md` — fallback entre modelos

### Subtask 5.1: Retry com temperature decay

**Arquivos a criar:**
- `src/pipeline/retry-handler.ts` (~150 LOC)

**Prompt para o agente construtor:**

```xml
<role>
Você é um engenheiro de resiliência. Implemente o handler de retry para falhas de Workers.
</role>

<constraints>
- Max 150 LOC
- Retry strategy: max 3 tentativas
- Tentativa 1: temperature original
- Tentativa 2: temperature - 0.2 (mínimo 0)
- Tentativa 3: modelo fallback (se configurado)
- Backoff exponencial: 1s, 3s, 9s
- Tratar especificamente: timeout, rate limit (429), conteúdo vazio (bug DeepSeek)
- Se DeepSeek retorna vazio: retry imediato sem backoff (bug documentado)
</constraints>
```

### Subtask 5.2: Git conflict resolution

**Arquivos a criar:**
- `src/git/conflict-resolver.ts` (~200 LOC)

**Prompt para o agente construtor:**

```xml
<role>
Você é um engenheiro Git. Implemente a resolução de conflitos de merge entre branches de worktrees.
</role>

<constraints>
- Max 200 LOC
- Estratégia: se merge falha com conflito, tentar merge com -X theirs (último writer ganha)
- Se ainda falha: abortar merge, marcar node como "failed", notificar usuário
- NUNCA deletar source files do usuário
- NUNCA fazer force push ou reset --hard na branch principal
- Logar conflitos detalhadamente para debugging
</constraints>
```

### Subtask 5.3: Tela de status final com retry visual

**Arquivos a criar:**
- `src/screens/result-screen.tsx` (~150 LOC)

**Prompt para o agente construtor:**

```xml
<role>
Você é um desenvolvedor React/Ink. Construa a tela de resultado final do pipeline.
</role>

<constraints>
- Max 150 LOC
- Mostrar: resumo do DAG (completed/failed/blocked), branch final, diff total
- Se houve falhas: listar nodes falhados com erro
- Oferecer: [r] retry nodes falhados, [q] sair, [d] ver diff completo
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

**Total: 25 arquivos, ~4.800 LOC estimadas**
**Média: 192 LOC/arquivo (dentro do sweet spot 200-500)**

---

## Checklist de Qualidade por Fase (derivado de file-agent-patterns.md)

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

## Referência Cruzada: Docs → Fases

| Documento | F0 | F1 | F2 | F3 | F4 | F5 |
|-----------|:--:|:--:|:--:|:--:|:--:|:--:|
| `general/file-agent-patterns.md` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `general/ink.md` | ✓ | ✓ | — | — | ✓ | ✓ |
| `general/prompts-guide.md` | — | — | ✓ | — | ✓ | ✓ |
| `general/prompt-engineering.md` | — | — | ✓ | — | ✓ | ✓ |
| `general/story-breaking.md` | — | — | ✓ | — | — | — |
| `general/context-building.md` | — | — | ✓ | — | ✓ | ✓ |
| `general/context-building-2.md` | — | — | — | — | ✓ | — |
| `langchain/ReAct-langchain-tec-guide.md` | — | — | ✓ | — | — | — |
| `langchain/langchain-models-2026.md` | — | ✓ | ✓ | — | — | ✓ |
| `langchain/langchain-langgraph-production.md` | — | — | — | — | ✓ | — |
| `pi/pi-agent-nodejs.md` | — | — | — | — | ✓ | — |
| `pi/pi-agent-anatomia.md` | — | — | — | — | ✓ | — |
| `pi/pi-agent-sdk-vs-rpc.md` | — | — | — | — | ✓ | — |
