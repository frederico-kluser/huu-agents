# Pi DAG Task CLI (POC)

**Pi DAG Task CLI** decompoe macro-tarefas de engenharia de software em um Grafo Direcionado Aciclico (DAG), executa agentes de IA em paralelo — cada um isolado em seu proprio Git Worktree — e mergeia os resultados automaticamente.

Combina a filosofia YOLO minimalista do [Pi Coding Agent](https://github.com/badlogic/pi-mono), orquestração via LangChain.js, e padrões de engenharia de contexto e prompting para produção.

## Stack

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Runtime | Node.js (ESM) | >= 20 |
| Linguagem | TypeScript (strict) | ES2022, NodeNext |
| UI Terminal | Ink + React | v6 + React 19 |
| Schemas | Zod | validação de DAG, config, resultados |
| Orquestração | LangChain.js + LangGraph.js | v1.0+ |
| Agentes Worker | Pi Coding Agent SDK | v0.60.0+ |
| Multi-provider LLM | OpenRouter | 2K+ modelos |
| Isolamento | Git Worktrees | nativo |

## Arquitetura

Dois tiers de modelos independentes via OpenRouter:

1. **Planner (Arquiteto):** Modelo de raciocínio pesado para task decomposition. Produz DAG Zod-validado com nodes atômicos e dependências. Usa sub-agente ReAct Explorer quando precisa de contexto adicional do codebase.
2. **Workers (Operários):** Modelos rápidos que executam subtasks em worktrees isoladas, com system prompts adaptados por provider (XML para Claude, Markdown para GPT) e padrões agent-friendly embutidos.

### Pipeline integrado

```
Usuário → Ink TUI (config → contexto → macro-task)
                          ↓
              Planner (LangChain + structured output)
              ├── ReAct Explorer (se contexto insuficiente)
              └── DAG JSON (Zod-validated)
                          ↓
              DAG Executor (topological sort por waves)
              ├── Wave 1: nodes sem dependências → paralelo
              ├── Wave 2: merge → liberar dependentes → paralelo
              └── Wave N: até todos done/failed/blocked
                          ↓
              Worker Runner (Pi SDK por worktree)
              ├── System prompt contextualizado (4 camadas)
              ├── Auto-commit após conclusão
              ├── Retry com temperature decay + model fallback
              └── Merge na branch base
                          ↓
              Result Screen (resumo + retry falhados + diff)
```

## Como rodar

```bash
npm install
npm run build
node dist/cli.js
```

## Estrutura do projeto

```
src/
├── cli.tsx                          # Entry point
├── app.tsx                          # Router de telas (state machine)
├── schemas/
│   ├── dag.schema.ts                # DAG output do Planner (Zod)
│   ├── config.schema.ts             # ~/.pi-dag-cli.json (Zod)
│   └── worker-result.schema.ts      # Resultado de cada Worker (Zod)
├── screens/
│   ├── config-screen.tsx            # Config API key + modelos
│   ├── context-screen.tsx           # Seleção de arquivos/dirs
│   ├── task-screen.tsx              # Input da macro-task
│   ├── dag-view-screen.tsx          # Visualização do DAG
│   ├── execution-screen.tsx         # Dashboard de execução real-time
│   └── result-screen.tsx            # Resultado final + retry
├── components/
│   ├── dag-node-row.tsx             # Linha de nó do DAG
│   ├── tree-node.tsx                # Nó da árvore de arquivos
│   └── worker-log.tsx               # Log streaming por worker
├── prompts/
│   ├── planner.ts                   # System prompt do Planner
│   ├── explorer.prompt.ts           # System prompt do Explorer
│   └── worker.prompt.ts             # Gerador de prompt por Worker
├── agents/
│   ├── explorer.agent.ts            # Sub-agente ReAct (LangChain)
│   ├── explorer-tools.ts            # Tools read-only do Explorer
│   └── worker-runner.ts             # Runner do Pi Agent SDK
├── pipeline/
│   ├── orchestrator.ts              # Pipeline end-to-end
│   ├── planner.pipeline.ts          # Planner + Explorer + Zod validation
│   ├── dag-executor.ts              # Executor topológico + paralelismo
│   └── retry-handler.ts             # Retry com temperature decay
├── git/
│   ├── git-types.ts                 # Tipos Result, GitError, CommitHash
│   ├── git-wrapper.ts               # Operações Git atômicas (execFile)
│   ├── worktree-manager.ts          # Lifecycle de worktrees
│   ├── conflict-resolver.ts         # Resolução de conflitos
│   └── index.ts                     # Re-exports
├── hooks/
│   ├── use-config.ts                # Persistência de config
│   ├── use-file-tree.ts             # Listagem de arquivos
│   ├── use-api-validation.ts        # Validação de API key
│   └── use-elapsed-time.ts          # Timer de execução
└── utils/
    ├── file-tree.ts                 # Árvore de arquivos (git ls-files)
    └── path-guard.ts                # Proteção contra path traversal
```

35 arquivos, ~4.500 LOC (média ~130 LOC/arquivo).

## Padrões de código (agent-friendly)

Todo código da CLI — e todo código que os Workers geram — segue `docs/general/file-agent-patterns.md`:

| Métrica | Alvo | Limite |
|---------|------|--------|
| Linhas por arquivo | 200-300 | 500 |
| Funções por arquivo | 5-10 | 15 |
| Linhas por função | 20-30 | 50 |
| Complexidade ciclomática | <= 7 | 10 |

TypeScript strict, sem `any`, TSDoc com `@throws` e `@example`, imutabilidade, Zod em toda boundary.

## Por que Git Worktrees?

Agentes rodando em paralelo na mesma working tree enfrentam:
- **Race conditions de I/O:** arquivos salvos parcialmente por um agente são lidos por outro
- **Lock do index Git:** `git lock` bloqueia operações concorrentes de staging

Worktrees são containers temporários baratos, isolados no filesystem, com merge trivial e limpeza segura.

## Documentação de referência

| Doc | Papel |
|-----|-------|
| `docs/general/file-agent-patterns.md` | Métricas de código — governa CLI + Workers |
| `docs/general/prompt-engineering.md` | Anti-patterns e best practices de prompting |
| `docs/general/prompts-guide.md` | System prompts para automação (5 componentes) |
| `docs/general/context-building.md` | Engenharia de contexto em 5 camadas |
| `docs/general/story-breaking.md` | Framework de task decomposition |
| `docs/general/ink.md` | Ink v6 + React 19 no terminal |
| `docs/langchain/ReAct-langchain-tec-guide.md` | Implementação do Explorer |
| `docs/langchain/langchain-models-2026.md` | Catálogo de modelos 2025-2026 |
| `docs/langchain/langchain-langgraph-production.md` | Orquestração do pipeline |
| `docs/pi/pi-agent-nodejs.md` | Pi SDK para Node.js |
| `docs/pi/pi-agent-anatomia.md` | Anatomia do Pi (hooks, loop, tools) |

## Pre-requisitos

- Node.js >= 20
- Git >= 2.5 (suporte a worktrees)
- Chave de API do OpenRouter
