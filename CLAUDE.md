# Pi DAG Task CLI — Convenções para Agentes

## Projeto

**Pi DAG Task CLI** decompõe macro-tarefas em DAG, executa agentes IA paralelos em Git Worktrees isoladas, e mergeia resultados. Pipeline integrado: Planner → DAG Executor → Worker Runner com retry. Workers podem operar em modo one-shot (direto) ou multi-step via **Worker Pipeline Profiles** — pipelines declarativas reutilizáveis com 7 tipos de step. 18 modelos selecionáveis de 10 providers via OpenRouter.

## Comandos

```bash
npm install            # Instalar dependências
npm run build          # Transpile TS → JS (dist/)
npm run dev            # tsc --watch
npm start              # node dist/cli.js
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
```

## Stack

Node.js >=20, TypeScript strict (ES2022/NodeNext), Ink v6 + React 19, Zod, LangChain.js, Pi Coding Agent SDK, OpenRouter.

## Estrutura

```
src/
├── cli.tsx, cli-args.ts             # Entry point + CLI args parser
├── app.tsx                          # Router (state machine + StatusBar)
├── data/models.ts                   # Catálogo 18 modelos (preço, speed, SWE-Bench)
├── schemas/
│   ├── dag.schema.ts                # DAG output do Planner
│   ├── config.schema.ts             # Config persistida (selectedAgents + legado)
│   ├── worker-result.schema.ts      # Resultado do worker (+ pipelineTrace, failureReason)
│   ├── worker-profile.schema.ts     # Perfis de pipeline: steps, validação, catálogo
│   ├── worker-pipeline-state.schema.ts  # Estado efêmero de runtime do pipeline
│   └── errors.ts                    # Mensagens de erro de config
├── screens/                         # 10 telas Ink
│   ├── config-screen.tsx            # API key + seleção de modelos (setup inicial)
│   ├── context-screen.tsx           # Seleção de arquivos/dirs
│   ├── task-screen.tsx              # Input da macro-task
│   ├── options-screen.tsx           # [o] Opcoes: modelos individuais + criar pipelines
│   ├── profile-select-screen.tsx    # Seleção de perfil antes da execução
│   ├── profile-builder-screen.tsx   # Wizard visual para criar perfis (via opcoes)
│   ├── auto-pipeline-screen.tsx     # Criação automática de pipelines via LLM
│   ├── dag-view-screen.tsx          # Visualização do DAG
│   ├── execution-screen.tsx         # Dashboard de execução real-time
│   ├── result-screen.tsx            # Resultado final + retry + pipeline trace
│   └── diff-screen.tsx              # Diff completo da branch
├── components/                      # 6 componentes
│   ├── model-table.tsx              # Tabela filtrável de 18 modelos
│   ├── status-bar.tsx               # Barra informacional de modelos atuais
│   ├── pipeline-trace.tsx           # Trace step-by-step de pipeline
│   ├── dag-node-row.tsx, tree-node.tsx, worker-log.tsx
├── prompts/                         # Planner, Explorer, Worker (adaptados por provider)
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
│   └── auto-pipeline.ts             # Geração automática de pipelines via LangChain
├── git/                             # git-wrapper, worktree-manager, conflict-resolver
├── hooks/                           # use-config, use-file-tree, use-api-validation, use-elapsed-time
└── utils/                           # file-tree, path-guard
```

57 arquivos, ~7.500 LOC (~132 LOC/arquivo).

## Worker Pipeline Profiles

Perfis definem pipelines multi-step dentro de cada worker. O DAG permanece como scheduler de alto nível — a execução multi-step ocorre **dentro** de cada node.

**7 step types V1:** `pi_agent`, `langchain_prompt`, `condition`, `goto`, `set_variable`, `git_diff`, `fail`

**Variáveis:** reservadas (`$task`, `$diff`, `$error`) + custom (`$custom_*`)

**Catálogo dual:** global (`~/.pi-dag-cli/worker-profiles.json`) + local (`.pi-dag/worker-profiles.json`). Local tem precedência.

**Fluxo:** task → profile-select → executing. Sem perfil = comportamento original preservado.

**Schema do perfil:** `id` em kebab-case como label principal, `seats` (1-16) para limitar concorrência por perfil e `initialVariables` para seed de variáveis `custom_*`.

**Atalho [o] opcoes:** acessível de qualquer tela (exceto config/loading/executing). Permite trocar modelo planner ou worker individualmente (catálogo completo de 18 modelos), criar pipeline profiles manualmente, e criar pipelines automaticamente via LLM (Auto-Pipeline). Legenda `[o] opcoes` aparece no rodapé de cada tela.

**Auto-Pipeline:** modo de criação automática de pipelines via LangChain. Duas chamadas LLM: (1) gera steps + variáveis a partir de descrição em linguagem natural, (2) gera id + descrição. Modelo padrão: `deepseek/deepseek-chat` (trocável). Usuário só escolhe escopo (global/project) e seats (1-16). Validação Zod + integridade referencial antes de salvar.

**Validação:** Zod `superRefine` (entryStepId, set_variable XOR, step IDs duplicados, namespace de initialVariables) + `validateProfileReferences()` (integridade referencial de targets)

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
- Alterar catálogo de modelos (`src/data/models.ts`)
- Adicionar novos step types ao registry

**NUNCA:**
- Hardcodear secrets, API keys ou modelos
- `console.log` em produção
- `any` para escapar type checking
- Mutar objetos existentes
- Modificar prompts sem testar com exemplos reais
- Operar no working tree do usuário (apenas worktrees)
- Persistir `activeProfileId` na config (seleção é efêmera por run)
