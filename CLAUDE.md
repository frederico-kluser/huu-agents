# Pi DAG Task CLI — Convenções para Agentes

## Projeto

**Pi DAG Task CLI** decompõe macro-tarefas em DAG, executa agentes IA paralelos em Git Worktrees isoladas, e mergeia resultados. Pipeline integrado: Planner → DAG Executor → Worker Runner com retry. 18 modelos selecionáveis de 10 providers via OpenRouter.

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
├── cli.tsx, app.tsx              # Entry point + router (state machine + StatusBar)
├── data/models.ts                # Catálogo 18 modelos (preço, speed, SWE-Bench)
├── schemas/                      # Zod: dag, config (selectedAgents + legado), worker-result
├── screens/                      # 6 telas: config, context, task, dag-view, execution, result
├── components/                   # model-table, status-bar, dag-node-row, tree-node, worker-log
├── prompts/                      # Planner, Explorer, Worker (adaptados por provider)
├── agents/                       # Explorer ReAct (LangChain), Worker Runner (Pi SDK)
├── pipeline/                     # orchestrator, planner-pipeline, dag-executor, retry-handler
├── git/                          # git-wrapper (execFile), worktree-manager, conflict-resolver
├── hooks/                        # use-config, use-file-tree, use-api-validation, use-elapsed-time
└── utils/                        # file-tree, path-guard
```

38 arquivos, ~4.800 LOC (~126 LOC/arquivo).

## Convenções de código

- **LOC:** 200-300 por arquivo (max 500), 20-30 por função (max 50)
- **Complexidade ciclomática:** <=7 (max 10)
- **TSDoc:** `@param`, `@returns`, `@throws`, `@example` em toda exportação
- **Imutabilidade:** retornar novos objetos, nunca mutar
- **Validação:** Zod em toda boundary (user input, API, agentes)
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

**PERGUNTAR ANTES:**
- LOC acima de 500/arquivo
- Novas dependências
- Modificar arquitetura do pipeline (orchestrator, dag-executor)
- Alterar catálogo de modelos (`src/data/models.ts`)

**NUNCA:**
- Hardcodear secrets, API keys ou modelos
- `console.log` em produção
- `any` para escapar type checking
- Mutar objetos existentes
- Modificar prompts sem testar com exemplos reais
- Operar no working tree do usuário (apenas worktrees)
