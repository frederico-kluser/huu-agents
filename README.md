# Pi DAG Task CLI (POC)

**Pi DAG Task CLI** decompoe macro-tarefas de engenharia de software em um Grafo Direcionado Aciclico (DAG), executa agentes de IA em paralelo — cada um isolado em seu proprio Git Worktree — e mergeia os resultados automaticamente.

Combina a filosofia YOLO minimalista do [Pi Coding Agent](https://github.com/badlogic/pi-mono), orquestração via LangChain.js, e padrões de engenharia de contexto e prompting para produção.

## Como rodar

```bash
npm install
npm run build
node dist/cli.js
```

## Argumentos CLI

O modo interativo (TUI) continua sendo o default. Flags permitem bootstrap rapido e automacao.

```
USO:
  pi-dag [opcoes]

OPCOES:
  -h, --help               Mostra ajuda e sai
  -v, --version            Mostra a versao e sai
  -t, --task <texto>       Macro-task a ser decomposta (pula tela de input)
  -c, --context <caminhos> Arquivos/dirs de contexto, separados por virgula
      --planner <modelo>   Modelo para o planner (override config persistida)
      --worker <modelo>    Modelo para os workers (override config persistida)
```

### Precedencia

```
Flags CLI > config persistida (~/.pi-dag-cli.json) > defaults
```

Flags de modelo (`--planner`, `--worker`) sobrescrevem a config persistida apenas para a sessao atual — nao alteram o arquivo de configuracao.

### Exemplos

```bash
# Modo interativo (default)
pi-dag

# Pular direto para execucao com task e contexto
pi-dag --task "Adicionar autenticacao JWT" --context src/auth,src/middleware

# Apenas pre-configurar contexto, digitar task interativamente
pi-dag -c src/payments,src/utils

# Override de modelos para uma sessao
pi-dag --planner google/gemini-3.1-pro --worker xiaomi/mimo-v2-flash

# Automacao em script
pi-dag -t "Corrigir bug #42" -c src/handlers --planner openai/gpt-5.4
```

## Stack

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Runtime | Node.js (ESM) | >= 20 |
| Linguagem | TypeScript (strict) | ES2022, NodeNext |
| UI Terminal | Ink + React | v6 + React 19 |
| Schemas | Zod | validação de DAG, config, resultados |
| Orquestração | LangChain.js | v1.0+ |
| Agentes Worker | Pi Coding Agent SDK | v0.60.0+ |
| Multi-provider LLM | OpenRouter | 18 modelos configuráveis |
| Isolamento | Git Worktrees | nativo |

## Arquitetura

Dois tiers de modelos independentes, ambos selecionáveis pelo usuário via tabela filtrável com 18 modelos (preço, velocidade, SWE-Bench, perf/cost ratio):

1. **Planner (Arquiteto):** Modelo de raciocínio pesado para task decomposition. Produz DAG Zod-validado. Usa sub-agente ReAct Explorer quando precisa de contexto adicional.
2. **Workers (Operários):** Modelos rápidos que executam subtasks em worktrees isoladas. System prompts adaptados por provider (XML Claude, Markdown GPT). Auto-commit + merge automático.

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

### Seleção de modelos

StatusBar sempre visível mostra modelos atuais. Atalho `[m]` abre seleção a qualquer momento sem perder estado.

```
┌───────────────────────────────────────────────────────────────────────┐
│ Planner: Gemini 3.1 Pro ($2/$12)  |  Worker: MiMo-V2-Flash ($0.1/$0.3)  |  [m] modelos │
└───────────────────────────────────────────────────────────────────────┘
```

18 modelos de 10 providers com filtro, velocidade, preço e benchmarks:

| Tier | Modelos | Range preço (in/out) |
|------|---------|---------------------|
| Planner | Opus 4.6, GPT-5.4, Gemini 3.1 Pro, Codex 5.3 | $1.75-$5.00 / $12-$25 |
| Both | MiniMax M2.5, Sonnet 4.6, Haiku 4.5, Kimi K2.5, DeepSeek V3.2 | $0.15-$3.00 / $0.42-$15 |
| Worker | MiMo-V2, Step 3.5, Devstral S2, Gemini Flash, Grok, Qwen3 + 3 mais | $0.10-$0.50 / $0.30-$3.00 |

## Estrutura do projeto

```
src/
├── cli.tsx                          # Entry point
├── app.tsx                          # Router de telas + StatusBar + [m]
├── data/
│   └── models.ts                    # Catálogo de 18 modelos (preço, bench, speed)
├── schemas/
│   ├── dag.schema.ts                # DAG output do Planner (Zod)
│   ├── config.schema.ts             # ~/.pi-dag-cli.json (Zod, selectedAgents + legado)
│   └── worker-result.schema.ts      # Resultado de cada Worker (Zod)
├── screens/
│   ├── config-screen.tsx            # Config API key + seleção via ModelTable
│   ├── context-screen.tsx           # Seleção de arquivos/dirs
│   ├── task-screen.tsx              # Input da macro-task
│   ├── dag-view-screen.tsx          # Visualização do DAG
│   ├── execution-screen.tsx         # Dashboard de execução real-time
│   └── result-screen.tsx            # Resultado final + retry
├── components/
│   ├── model-table.tsx              # Tabela filtrável de modelos
│   ├── status-bar.tsx               # Barra de modelos atuais
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

38 arquivos, ~4.800 LOC (média ~126 LOC/arquivo).

## Padrões de código

Segue `docs/general/file-agent-patterns.md`:

| Métrica | Alvo | Limite |
|---------|------|--------|
| Linhas por arquivo | 200-300 | 500 |
| Funções por arquivo | 5-10 | 15 |
| Linhas por função | 20-30 | 50 |
| Complexidade ciclomática | <= 7 | 10 |

TypeScript strict, sem `any`, TSDoc com `@throws` e `@example`, imutabilidade, Zod em toda boundary.

## Por que Git Worktrees?

Agentes rodando em paralelo na mesma working tree enfrentam race conditions de I/O e lock do index Git. Worktrees são containers temporários baratos, isolados no filesystem, com merge trivial e limpeza segura.

## Configuracao

A configuracao e persistida em `~/.pi-dag-cli.json` e inclui:

| Campo | Tipo | Default | Descricao |
|-------|------|---------|-----------|
| `openrouterApiKey` | string | — | Chave de API do OpenRouter |
| `selectedAgents` | `{ planner, worker }` | GPT-4.1 / GPT-4.1-mini | Modelos para planner e workers |
| `maxConcurrency` | number (1-16) | 4 | Workers paralelos por wave do DAG |
| `worktreeBasePath` | string | `.pi-dag-worktrees` | Diretorio base para worktrees |

`maxConcurrency` limita quantos workers executam simultaneamente dentro de cada wave. Valores baixos (1-2) reduzem carga no sistema e uso de API; valores altos (8-16) maximizam paralelismo em DAGs grandes.

## Pre-requisitos

- Node.js >= 20
- Git >= 2.5
- Chave de API do OpenRouter
