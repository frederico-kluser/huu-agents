# Pi DAG Task CLI (POC)

**Pi DAG Task CLI** é uma Prova de Conceito de uma ferramenta de automação de desenvolvimento baseada em terminal que decompõe macro-tarefas de engenharia de software em um Grafo Direcionado Acíclico (DAG) de dependências resolvíveis, executando agentes de IA em paralelo — cada um isolado em seu proprio Git Worktree — com merges automaticos de repasse de dependencia.

A arquitetura combina a filosofia YOLO minimalista do [Pi Coding Agent](https://github.com/badlogic/pi-mono), orquestração via LangChain.js, e padrões avançados de engenharia de contexto e prompting para produção.

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

O CLI opera com dois tiers de modelos independentes via OpenRouter:

1. **Agente Arquiteto (Planner):** Modelo de raciocínio pesado para task decomposition. Recebe a macro-task e contexto selecionado, produz um DAG estruturado (validado via Zod) com nodes atômicos e dependências.
2. **Agentes Operários (Workers):** Modelos rápidos que executam subtasks cirúrgicas dentro de worktrees isoladas, seguindo padrões agent-friendly embutidos no system prompt.

### Fluxo de operação (6 fases)

```
┌────────────────────────────────────────────────────────────────┐
│  FASE 0: Setup                                                 │
│  Scaffold TS/ESM, schemas Zod, CLAUDE.md, padrões de código    │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│  FASE 1: Configuração (Ink TUI)                                │
│  API key OpenRouter, seleção de modelos, contexto, macro-task  │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│  FASE 2: Decomposição Inteligente                              │
│  Planner → DAG JSON (Zod-validated)                            │
│  Se contexto insuficiente: sub-agente ReAct Explorer           │
│  Structured outputs nativos por provider                       │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│  FASE 3: Git Worktrees                                         │
│  Branch base task-[ts] → worktree por node do DAG              │
│  DAG Executor com topological sort + paralelismo               │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│  FASE 4: Workers (Pi Agent SDK)                                │
│  Cada worker opera em worktree isolada                         │
│  System prompt com 4 camadas de contexto + file-agent-patterns │
│  Merge automático ao completar → libera nodes dependentes      │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│  FASE 5: Resiliência                                           │
│  Retry com temperature decay, fallback de modelo               │
│  Resolução de conflitos Git, status final                      │
└────────────────────────────────────────────────────────────────┘
```

Para detalhes de cada fase, subtasks, arquivos e prompts, consultar [ROADMAP.md](./ROADMAP.md).

### 17 subtasks e suas dependências

```
0.1 ─────────┐
(scaffold)   │
             ├──→ 0.2 (CLAUDE.md)         depende de 0.1
             │
             ├──→ 0.3 (schemas Zod)        depende de 0.1
             │
0.3 ─────────┼──→ 1.1 (config screen)     depende de 0.3
             │
0.1 ─────────┼──→ 1.2 (context screen)    depende de 0.1
             │
0.3 ─────────┼──→ 1.3 (task screen)       depende de 0.3
             │
1.1+1.2+1.3 ─┼──→ 1.4 (app router)        depende de 1.1, 1.2, 1.3
             │
0.3 ─────────┼──→ 2.1 (planner prompt)    depende de 0.3
             │
0.1 ─────────┼──→ 2.2 (explorer ReAct)    depende de 0.1
             │
2.1+2.2 ─────┼──→ 2.3 (planner pipeline)  depende de 2.1, 2.2
             │
0.3 ─────────┼──→ 2.4 (dag screen)        depende de 0.3
             │
0.1 ─────────┼──→ 3.1 (git wrapper)       depende de 0.1
             │
0.3+3.1 ─────┼──→ 3.2 (dag executor)      depende de 0.3, 3.1
             │
0.3 ─────────┼──→ 4.1 (worker prompt)     depende de 0.3
             │
4.1 ─────────┼──→ 4.2 (worker runner)     depende de 4.1
             │
0.3 ─────────┼──→ 4.3 (execution screen)  depende de 0.3
             │
4.2 ─────────┼──→ 5.1 (retry handler)     depende de 4.2
             │
3.1 ─────────┼──→ 5.2 (conflict resolver) depende de 3.1
             │
0.3 ─────────┴──→ 5.3 (result screen)     depende de 0.3
```

### Waves de paralelismo

| Wave | Subtasks paralelas | Pré-requisito |
|------|-------------------|---------------|
| **1** | `0.1` | nenhum |
| **2** | `0.2` `0.3` | 0.1 |
| **3** | `1.1` `1.2` `1.3` `2.1` `2.2` `2.4` `3.1` `4.1` `4.3` `5.3` | 0.3 |
| **4** | `1.4` `2.3` `3.2` `4.2` `5.2` | wave 3 (parcial) |
| **5** | `5.1` | 4.2 |

**Wave 3** e o pico de paralelismo: 10 subtasks independentes que nao compartilham arquivos entre si (domínios isolados: UI, prompts, git, agentes). Poderiam ser 10 worktrees paralelas — dogfooding da propria arquitetura do projeto.

### Caminho critico

```
0.1 → 0.3 → 2.1 → 2.3 → 3.2 → 4.1 → 4.2 → 5.1
```

8 steps sequenciais. Com paralelismo maximo na Wave 3, o throughput total e dominado por essa cadeia.

## Padrões de código (agent-friendly)

Todo código da CLI — e todo código que os Workers geram — segue os padrões definidos em `docs/general/file-agent-patterns.md`:

| Métrica | Alvo | Limite |
|---------|------|--------|
| Linhas por arquivo | 200-300 | 500 |
| Funções por arquivo | 5-10 | 15 |
| Linhas por função | 20-30 | 50 |
| Complexidade ciclomática | <= 7 | 10 |

Regras adicionais:
- TypeScript strict, sem `any` (enforced via ESLint)
- TSDoc com `@throws` e `@example` em funções exportadas
- Comentar o "porquê", nunca o "quê"
- Schemas Zod validam toda interface entre módulos
- Imutabilidade: retornar novos objetos, nunca mutar

## Estrutura do projeto

```
src/
├── cli.tsx                          # Entry point
├── app.tsx                          # Router de telas (state machine)
├── schemas/
│   ├── dag.schema.ts                # DAG output do Planner
│   ├── config.schema.ts             # ~/.pi-dag-cli.json
│   └── worker-result.schema.ts      # Resultado de cada Worker
├── screens/
│   ├── config-screen.tsx            # Config API key + modelos
│   ├── context-screen.tsx           # Seleção de arquivos/dirs
│   ├── task-screen.tsx              # Input da macro-task
│   ├── dag-screen.tsx               # Visualização do DAG
│   ├── execution-screen.tsx         # Dashboard de execução
│   └── result-screen.tsx            # Resultado final
├── components/
│   ├── dag-node.tsx                 # Componente de nó do DAG
│   └── worker-log.tsx               # Log streaming por worker
├── prompts/
│   ├── planner.prompt.ts            # System prompt do Planner
│   ├── explorer.prompt.ts           # System prompt do Explorer
│   └── worker.prompt.ts             # Gerador de prompt por Worker
├── agents/
│   ├── explorer.agent.ts            # Sub-agente ReAct
│   └── worker-runner.ts             # Runner do Pi Agent SDK
├── tools/
│   └── explorer-tools.ts            # Tools do Explorer (read-only)
├── pipeline/
│   ├── planner-pipeline.ts          # Orquestração Planner + Explorer
│   ├── dag-executor.ts              # Executor topológico + paralelismo
│   └── retry-handler.ts             # Retry com temperature decay
├── git/
│   ├── git-wrapper.ts               # Operações Git atômicas
│   ├── worktree-manager.ts          # Lifecycle de worktrees
│   └── conflict-resolver.ts         # Resolução de conflitos
├── hooks/
│   ├── use-config.ts                # Persistência de config
│   └── use-file-tree.ts             # Listagem de arquivos
└── utils/
    └── openrouter.ts                # Validação de API key
```

25 arquivos, ~4.800 LOC estimadas (media ~192 LOC/arquivo).

## Por que Git Worktrees?

Agentes rodando em paralelo na mesma working tree enfrentam:
- **Race conditions de I/O:** arquivos salvos parcialmente por um agente são lidos por outro
- **Lock do index Git:** `git lock` bloqueia operações concorrentes de staging

Worktrees são containers temporários baratos, isolados no filesystem, com merge trivial e limpeza segura — sem risco de corromper a working tree do usuario.

## Documentação de referência

| Diretório | Tema | Papel no projeto |
|-----------|------|-----------------|
| `docs/general/file-agent-patterns.md` | Métricas de código agent-friendly | Governa TODO código (CLI + Workers) |
| `docs/general/prompt-engineering.md` | Anti-patterns e best practices de prompting | Guia criação dos system prompts |
| `docs/general/prompts-guide.md` | System prompts para automação (5 componentes) | Template dos prompts Planner/Worker |
| `docs/general/context-building.md` | Engenharia de contexto em 5 camadas | Arquitetura de contexto dos Workers |
| `docs/general/story-breaking.md` | Decomposição hierárquica (narrativa + IA) | Framework de task decomposition |
| `docs/general/ink.md` | Ink v6 + React 19 no terminal | Referência para toda UI |
| `docs/langchain/ReAct-langchain-tec-guide.md` | Ciclo Thought→Action→Observation | Implementação do Explorer |
| `docs/langchain/langchain-models-2026.md` | Catálogo de modelos 2025-2026 | Seleção de modelos Planner/Worker |
| `docs/langchain/langchain-langgraph-production.md` | LangGraph.js em produção | Orquestração do pipeline |
| `docs/pi/pi-agent-nodejs.md` | Pi SDK para Node.js | Integração dos Workers |
| `docs/pi/pi-agent-anatomia.md` | Anatomia do Pi (hooks, loop, tools) | Customização dos Workers |
| `docs/pi/pi-agent-sdk-vs-rpc.md` | SDK vs RPC para orquestração | Decisão arquitetural de integração |

## Pre-requisitos

- Node.js >= 20
- Git com suporte a worktrees (>= 2.5)
- Chave de API do OpenRouter
