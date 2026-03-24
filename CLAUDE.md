# Pi DAG Task CLI — Convenções para Agentes

## Projeto

**Pi DAG Task CLI** decompõe macro-tarefas em DAG, executa agentes IA paralelos em Git Worktrees isoladas, e mergeia resultados. Pipeline integrado: Planner → DAG Executor → Worker Runner com retry. Workers podem operar em modo one-shot (direto) ou multi-step via **Worker Pipeline Profiles** — pipelines declarativas reutilizáveis com 7 tipos de step. Catálogo dinâmico de modelos 2025+ carregados em tempo real da OpenRouter API.

## Comandos

```bash
npm install            # Instalar dependências
npm run build          # Transpile TS → JS (dist/)
npm run dev            # tsc --watch
npm start              # fetch-benchmarks + node dist/cli.js (auto-atualiza JSON offline)
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run fetch-benchmarks  # Fetch OR + AA → src/data/bundled-benchmarks.json + cache global
```

## Stack

Node.js >=20, TypeScript strict (ES2022/NodeNext), Ink v6 + React 19, Zod, LangChain.js, Pi Coding Agent SDK, OpenRouter.

## Estrutura

```
src/
├── cli.tsx, cli-args.ts             # Entry point + CLI args parser
├── app.tsx                          # Router (state machine + StatusBar)
├── data/models.ts                   # Catálogo dinâmico de modelos (OpenRouter API)
│   ├── openrouter-client.ts         # Client HTTP + cache para OpenRouter /models
│   ├── artificial-analysis-client.ts # Client HTTP + cache para Artificial Analysis API
│   ├── enriched-model.ts            # Tipo enriquecido: OpenRouter + AA benchmarks
│   └── bundled-benchmarks.json      # Fallback offline (commitado no repo, atualizado por npm start)
├── schemas/
│   ├── dag.schema.ts                # DAG output do Planner
│   ├── config.schema.ts             # Config persistida (selectedAgents + legado)
│   ├── worker-result.schema.ts      # Resultado do worker (+ pipelineTrace, failureReason)
│   ├── worker-profile.schema.ts     # Perfis de pipeline: steps, validação, catálogo
│   ├── worker-pipeline-state.schema.ts  # Estado efêmero de runtime do pipeline
│   └── errors.ts                    # Mensagens de erro de config
├── screens/                         # 11 telas Ink
│   ├── config-screen.tsx            # API keys (OpenRouter + AA) + seleção de modelos
│   ├── context-screen.tsx           # Seleção de arquivos/dirs
│   ├── task-screen.tsx              # Input da macro-task
│   ├── options-screen.tsx           # [o] Opcoes: sub-menus (API Keys, Modelos, Pipelines, Guia)
│   ├── profile-select-screen.tsx    # Seleção de perfil antes da execução
│   ├── profile-builder-screen.tsx   # Wizard visual para criar perfis (via opcoes)
│   ├── ai-pipeline-builder-screen.tsx # Criação de pipeline via IA (LangChain)
│   ├── dag-view-screen.tsx          # Visualização do DAG
│   ├── execution-screen.tsx         # Dashboard de execução real-time
│   ├── result-screen.tsx            # Resultado final + retry + pipeline trace
│   └── diff-screen.tsx              # Diff completo da branch
├── components/                      # 12 componentes
│   ├── model-table.tsx              # Tabela basica de modelos OpenRouter
│   ├── enhanced-model-table.tsx     # Tabela avancada: scroll, sort selector, column selector
│   ├── table-columns.ts            # Definicoes de colunas (label, description, sortable)
│   ├── filter-parser.ts            # Parser de filtros compostos (texto OR, metricas AND)
│   ├── filter-builder-modal.tsx     # Modal visual para construir filtros
│   ├── column-selector-modal.tsx    # Modal de checkboxes para metricas visiveis
│   ├── sort-selector-modal.tsx      # Modal seletor de criterio de ordenacao
│   ├── model-selector.tsx           # Seletor DRY: useModels + loading + ModelTable
│   ├── multi-line-input.tsx         # Input multi-linha com paste e scroll
│   ├── status-bar.tsx               # Barra informacional de modelos atuais
│   ├── pipeline-trace.tsx           # Trace step-by-step de pipeline
│   ├── dag-node-row.tsx, tree-node.tsx, worker-log.tsx
├── prompts/                         # Planner, Explorer, Worker, Pipeline Builder
│   └── pipeline-builder.ts         # Prompts few-shot para AI Pipeline Builder
├── agents/                          # Explorer ReAct (LangChain), Worker Runner (Pi SDK)
├── pipeline/
│   ├── orchestrator.ts              # Pipeline end-to-end (planner → DAG → workers)
│   ├── planner.pipeline.ts          # Planner + Explorer + Zod validation
│   ├── dag-executor.ts              # Executor topológico + paralelismo por waves
│   ├── retry-handler.ts             # Retry com temperature decay + model fallback
│   ├── worker-pipeline-runtime.ts   # Runtime multi-step para perfis de worker
│   ├── variable-resolver.ts         # Resolução de $vars em templates (funções puras)
│   └── step-handlers/               # 7 handlers V1
│       ├── types.ts                 # Contratos: StepHandler, StepHandlerContext, StepHandlerResult
│       ├── index.ts                 # ReadonlyMap registry de handlers
│       ├── ai-handlers.ts           # pi_agent (Pi SDK), langchain_prompt (ChatOpenAI)
│       ├── control-handlers.ts      # condition, goto, set_variable, fail
│       └── git-diff-handler.ts      # git_diff (captura diff do worktree)
├── services/
│   ├── profile-catalog.ts           # Persistência de perfis (global + local, Result<T>)
│   ├── ai-pipeline-generator.ts     # Geração de pipelines via LangChain (2 chamadas LLM)
│   └── offline-benchmark-cache.ts   # Cache offline em disco (~/.pi-dag-cli/benchmark-cache.json)
├── git/                             # git-wrapper, worktree-manager, conflict-resolver
├── hooks/                           # use-config, use-file-tree, use-api-validation, use-elapsed-time, use-models, use-artificial-analysis
└── utils/                           # file-tree, path-guard
```

77 arquivos, ~13.000 LOC (~169 LOC/arquivo).

## Worker Pipeline Profiles

Perfis definem pipelines multi-step dentro de cada worker. O DAG permanece como scheduler de alto nível — a execução multi-step ocorre **dentro** de cada node.

**7 step types V1:** `pi_agent`, `langchain_prompt`, `condition`, `goto`, `set_variable`, `git_diff`, `fail`

**Variáveis:** reservadas (`$task`, `$diff`, `$error`, `$context`) + custom (`$custom_*`)

**Catálogo dual:** global (`~/.pi-dag-cli/worker-profiles.json`) + local (`.pi-dag/worker-profiles.json`). Local tem precedência.

**Fluxo:** task → profile-select → executing. Sem perfil = comportamento original preservado.

**Schema do perfil:** `id` em kebab-case como label principal, `seats` (1-16) para limitar concorrência por perfil e `initialVariables` para seed de variáveis `custom_*`.

**Atalho [o] opcoes:** acessível de qualquer tela (exceto config/loading/executing). Menu principal com sub-menus: API Keys (OpenRouter + AA), Modelos (Planner/Worker — travados se OpenRouter key ausente), Pipeline Profiles (AI Builder + Manual Wizard), Guia de Referencia. Sem AA key, benchmarks nao aparecem na tabela de modelos. Legenda `[o] opcoes` aparece no rodapé de cada tela.

## Artificial Analysis Integration

Integração opcional com a API da Artificial Analysis para enriquecer a tabela de modelos com benchmarks independentes.

**Config:** `artificialAnalysisApiKey` em `~/.pi-dag-cli.json` (opcional, solicitado no setup inicial).

**Dados enriquecidos:** Intelligence Index (0-100), Coding Index, Math Index, MMLU-Pro, GPQA, HLE, LiveCodeBench, SciCode, MATH-500, AIME, tokens/s, TTFT, custo-benefício (I/$).

**Enhanced Model Table:** Tabela avançada com scroll horizontal (←→), vertical (↑↓, `<>` para página), seletor de ordenação (`s` abre modal de seleção, `S` inverte direção), seletor de colunas (`c` abre modal de checkboxes com descrições de cada métrica — substitui legenda fixa), filtros preset (`p`), filtro de texto (`f` para digitar, `F` para construtor visual), **atualização manual** (`u` busca dados frescos das APIs e salva no cache global). Filtros compostos: texto OR'd, métricas AND'd (ex: `openai|google|$Intel>=40|$MMLU>=70` → (openai OR google) AND Intel>=40 AND MMLU>=70). Matching automático entre modelos OpenRouter e AA por nome normalizado.

**Cache offline:** Hierarquia de 4 níveis: (1) memória do processo, (2) disco global `~/.pi-dag-cli/benchmark-cache.json` (TTL 24h), (3) bundled fallback `src/data/bundled-benchmarks.json` (commitado no repo, atualizado automaticamente por `npm start`), (4) fetch das APIs. Ao abrir o app, tenta disco/bundled antes de chamar APIs. Tecla `u` na tabela invalida caches e busca dados frescos. `npm start` roda `npm run fetch-benchmarks` antes do CLI (falha silenciosa se sem rede/key). Script puxa dados das duas APIs, cruza e salva no JSON em `src/data/` e no cache global. Client em `src/data/artificial-analysis-client.ts`, tipo enriquecido em `src/data/enriched-model.ts`, cache em `src/services/offline-benchmark-cache.ts`.

## AI Pipeline Builder

Modo de criação de pipelines via IA. O usuário descreve o que deseja em linguagem natural e duas chamadas LLM sequenciais geram o perfil completo automaticamente.

**Fluxo:** descrição → scope (local/global) → seats → modelo LLM → geração → preview → salvar.

**Duas chamadas LLM:**
1. **Steps:** gera steps, entryStepId, maxStepExecutions, initialVariables
2. **Metadata:** gera id (kebab-case) e description a partir dos steps

**Modelo default:** `deepseek/deepseek-chat`. Configurável para qualquer modelo suportado pelo LangChain via OpenRouter (DeepSeek, GPT, Claude, Gemini, Qwen).

**Prompt engineering:** few-shot com 3 exemplos reais do sistema, contexto estruturado em XML tags (`<system_knowledge>`, `<few_shot_examples>`, `<output_format>`), output JSON puro sem fences.

**Validação:** resultado passa por Zod (WorkerProfileSchema) + `validateProfileReferences()` antes de salvar.

**Validação:** Zod `superRefine` (entryStepId, set_variable XOR, step IDs duplicados, namespace de initialVariables) + `validateProfileReferences()` (integridade referencial de targets)

**Seleção de modelo:** Na execução, o usuário pode manter o modelo default do perfil ou escolher qualquer modelo do catálogo OpenRouter. O `ModelSelector` (DRY) é usado em todas as telas que precisam de seleção de modelo.

**Regra de variáveis:** `pi_agent` NÃO pode definir variáveis — apenas modifica arquivos. Use `langchain_prompt` para análise/decisão (salva em `outputTarget`), `set_variable` para contadores/flags, `git_diff` para capturar diff.

**Runtime:** imutável (spread operators), seed de `initialVariables`, loop guard via `maxStepExecutions`, trace com timestamps epoch

## Convenções de código

- **LOC:** 200-300 por arquivo (max 500), 20-30 por função (max 50)
- **Complexidade ciclomática:** <=7 (max 10)
- **TSDoc:** `@param`, `@returns`, `@throws`, `@example` em toda exportação
- **Imutabilidade:** retornar novos objetos, nunca mutar
- **Validação:** Zod em toda boundary (user input, API, agentes, catálogos)
- **Error handling:** `Result<T>` pattern para flow control (sem throw/catch); `PipelineFailError` para falhas de negócio vs erros técnicos
- **Comentários:** explicar o "porquê", nunca o "quê"
- **Sem `any`** (ESLint enforced), sem `console.log` em produção

Referência: `docs/general/file-agent-patterns.md`.

## Limites

**SEMPRE:**
- Validar inputs com Zod em boundaries
- TSDoc com `@throws` e `@example` em exportações
- Imutabilidade: novos objetos, nunca mutações
- Commits atômicos, conventional format (`feat:`, `fix:`, etc.)
- Modelo selecionado pelo usuário deve chegar ao Pi SDK via `getModel()`
- Usar `selectedAgents` como fonte de verdade para modelos; `plannerModel`/`workerModel` são campos legados mantidos em sync pelo schema transform
- Perfil de worker é efêmero por execução (não persiste `activeProfileId` na config)
- Step handlers retornam `StepHandlerResult` com `stateUpdates` parciais — runtime aplica imutavelmente
- Variáveis custom devem usar prefixo `custom_` (validado por `VariableNameSchema`)

**PERGUNTAR ANTES:**
- LOC acima de 500/arquivo
- Novas dependências
- Modificar arquitetura do pipeline (orchestrator, dag-executor)
- Alterar client da OpenRouter (`src/data/openrouter-client.ts`) ou Artificial Analysis (`src/data/artificial-analysis-client.ts`)
- Adicionar novos step types ao registry

**NUNCA:**
- Hardcodear secrets, API keys ou modelos
- `console.log` em produção
- `any` para escapar type checking
- Mutar objetos existentes
- Modificar prompts sem testar com exemplos reais
- Operar no working tree do usuário (apenas worktrees)
- Persistir `activeProfileId` na config (seleção é efêmera por run)
