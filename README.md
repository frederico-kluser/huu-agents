# Pi DAG Task CLI

**Pi DAG Task CLI** decompoe macro-tarefas de engenharia de software em um Grafo Direcionado Aciclico (DAG), executa agentes de IA em paralelo — cada um isolado em seu proprio Git Worktree — e mergeia os resultados automaticamente.

Workers podem operar em modo **one-shot** (execucao direta) ou **multi-step** via **Worker Pipeline Profiles** — pipelines declarativas reutilizaveis com 7 tipos de step, variaveis compartilhadas, branching condicional e observabilidade step-by-step.

Combina a filosofia YOLO minimalista do [Pi Coding Agent](https://github.com/badlogic/pi-mono), orquestracao via LangChain.js, e padroes de engenharia de contexto e prompting para producao.

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

| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| Runtime | Node.js (ESM) | >= 20 |
| Linguagem | TypeScript (strict) | ES2022, NodeNext |
| UI Terminal | Ink + React | v6 + React 19 |
| Schemas | Zod | validacao de DAG, config, profiles, resultados |
| Orquestracao | LangChain.js | v1.0+ |
| Agentes Worker | Pi Coding Agent SDK | v0.60.0+ |
| Multi-provider LLM | OpenRouter | 18 modelos configuraveis |
| Isolamento | Git Worktrees | nativo |

## Arquitetura

Dois tiers de modelos independentes, ambos selecionaveis pelo usuario via tabela filtravel com 18 modelos (preco, velocidade, SWE-Bench, perf/cost ratio):

1. **Planner (Arquiteto):** Modelo de raciocinio pesado para task decomposition. Produz DAG Zod-validado. Usa sub-agente ReAct Explorer quando precisa de contexto adicional.
2. **Workers (Operarios):** Modelos rapidos que executam subtasks em worktrees isoladas. System prompts adaptados por provider (XML Claude, Markdown GPT). Auto-commit + merge automatico.

### Pipeline integrado

```
Usuario -> Ink TUI (config -> contexto -> macro-task)
                          |
              Planner (LangChain + structured output)
              |-- ReAct Explorer (se contexto insuficiente)
              '-- DAG JSON (Zod-validated)
                          |
              DAG Executor (topological sort por waves)
              |-- Wave 1: nodes sem dependencias -> paralelo
              |-- Wave 2: merge -> liberar dependentes -> paralelo
              '-- Wave N: ate todos done/failed/blocked
                          |
              Worker Execution (por node, em worktree isolada)
              |-- [Sem perfil] Worker Runner direto (Pi SDK)
              |   |-- System prompt contextualizado (4 camadas)
              |   |-- Retry com temperature decay + model fallback
              |   '-- Auto-commit apos conclusao
              |
              '-- [Com perfil] Worker Pipeline Runtime (multi-step)
                  |-- Loop de steps declarativos
                  |-- 7 step types: pi_agent, langchain_prompt,
                  |   condition, goto, set_variable, git_diff, fail
                  |-- Variaveis: $task, $diff, $error + $custom_*
                  |-- Trace por step (duracao, outcome, erro)
                  '-- Loop guard via maxStepExecutions
                          |
              Merge na branch base
                          |
              Result Screen (resumo + retry + pipeline trace)
```

### Worker Pipeline Profiles

Perfis de worker definem pipelines declarativas multi-step que substituem a execucao one-shot dentro de cada node do DAG. O DAG continua como scheduler de alto nivel — a novidade esta dentro de cada worker.

**Step types disponiveis (V1):**

| Step | Funcao |
|------|--------|
| `pi_agent` | Executa Pi Coding Agent no worktree com task template |
| `langchain_prompt` | Gera/refina texto via LLM (ChatOpenAI + OpenRouter) |
| `condition` | Avalia expressao ($var == value) e bifurca execucao |
| `goto` | Salto incondicional para outro step ou `__end__` |
| `set_variable` | Define variavel (literal ou expressao aritmetica) |
| `git_diff` | Captura diff do worktree e armazena em variavel |
| `fail` | Encerra pipeline com erro de negocio explicito |

**Variaveis:**
- Reservadas: `$task` (descricao), `$diff` (worktree diff), `$error` (ultimo erro)
- Custom: `$custom_*` (namespace do usuario, ex: `$custom_tries`)
- Resolucao graciosa: variavel nao encontrada permanece como `$var` no template

**Catalogo dual:**
- Global: `~/.pi-dag-cli/worker-profiles.json`
- Local (projeto): `.pi-dag/worker-profiles.json`
- Merge automatico: local vence em colisao de ID

**Fluxo de selecao:**
1. Usuario submete task
2. Tela de selecao de perfil: lista perfis disponiveis + "No profile"
3. Se perfil selecionado: orchestrator usa `runWorkerPipeline()` em vez de `runWorker()`
4. Se "No profile": comportamento original 100% preservado

**Validacao:**
- Zod `superRefine`: entryStepId existe nos steps, set_variable tem value XOR valueExpression
- `validateProfileReferences()`: verifica integridade referencial de todos os targets
- `VariableNameSchema`: nomes devem ser reservados ou comecar com `custom_`

**Exemplo de perfil (test-driven-fixer):**
```json
{
  "id": "test-driven-fixer",
  "name": "Test Driven Fixer",
  "scope": "project",
  "entryStepId": "init-tries",
  "maxStepExecutions": 20,
  "steps": [
    { "id": "init-tries", "type": "set_variable", "target": "custom_tries", "value": 0, "next": "write-tests" },
    { "id": "write-tests", "type": "pi_agent", "taskTemplate": "Write tests for: $task", "next": "run-fix" },
    { "id": "run-fix", "type": "pi_agent", "taskTemplate": "Fix code to pass tests: $task", "next": "check" },
    { "id": "check", "type": "condition", "expression": "$custom_tries >= 3", "whenTrue": "done", "whenFalse": "increment" },
    { "id": "increment", "type": "set_variable", "target": "custom_tries", "valueExpression": "$custom_tries + 1", "next": "write-tests" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ]
}
```

### Selecao de modelos

StatusBar sempre visivel mostra modelos atuais. Atalho `[m]` abre selecao a qualquer momento sem perder estado.

```
+---------------------------------------------------------------------------+
| Planner: Gemini 3.1 Pro ($2/$12)  |  Worker: MiMo-V2-Flash ($0.1/$0.3)  |  [m] modelos |
+---------------------------------------------------------------------------+
```

18 modelos de 10 providers com filtro, velocidade, preco e benchmarks:

| Tier | Modelos | Range preco (in/out) |
|------|---------|---------------------|
| Planner | Opus 4.6, GPT-5.4, Gemini 3.1 Pro, Codex 5.3 | $1.75-$5.00 / $12-$25 |
| Both | MiniMax M2.5, Sonnet 4.6, Haiku 4.5, Kimi K2.5, DeepSeek V3.2 | $0.15-$3.00 / $0.42-$15 |
| Worker | MiMo-V2, Step 3.5, Devstral S2, Gemini Flash, Grok, Qwen3 + 3 mais | $0.10-$0.50 / $0.30-$3.00 |

## Estrutura do projeto

```
src/
├── cli.tsx                          # Entry point
├── cli-args.ts                      # Parser de argumentos CLI
├── app.tsx                          # Router de telas + StatusBar + [m]
├── data/
│   └── models.ts                    # Catalogo de 18 modelos (preco, bench, speed)
├── schemas/
│   ├── dag.schema.ts                # DAG output do Planner (Zod)
│   ├── config.schema.ts             # ~/.pi-dag-cli.json (Zod, selectedAgents + legado)
│   ├── worker-result.schema.ts      # Resultado de cada Worker (+ pipelineTrace, failureReason)
│   ├── worker-profile.schema.ts     # Perfis de pipeline: steps, validacao, catalogo
│   ├── worker-pipeline-state.schema.ts  # Estado efemero de runtime do pipeline
│   └── errors.ts                    # Mensagens de erro de config
├── screens/
│   ├── config-screen.tsx            # Config API key + selecao via ModelTable
│   ├── context-screen.tsx           # Selecao de arquivos/dirs
│   ├── task-screen.tsx              # Input da macro-task
│   ├── profile-select-screen.tsx    # Selecao de perfil antes da execucao
│   ├── profile-builder-screen.tsx   # Wizard visual para criar perfis
│   ├── dag-view-screen.tsx          # Visualizacao do DAG
│   ├── execution-screen.tsx         # Dashboard de execucao real-time
│   ├── result-screen.tsx            # Resultado final + retry + pipeline trace
│   └── diff-screen.tsx              # Diff completo da branch
├── components/
│   ├── model-table.tsx              # Tabela filtravel de modelos
│   ├── status-bar.tsx               # Barra de modelos atuais
│   ├── pipeline-trace.tsx           # Trace step-by-step de execucao de pipeline
│   ├── dag-node-row.tsx             # Linha de no do DAG
│   ├── tree-node.tsx                # No da arvore de arquivos
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
│   ├── orchestrator.ts              # Pipeline end-to-end (planner -> DAG -> workers)
│   ├── planner.pipeline.ts          # Planner + Explorer + Zod validation
│   ├── dag-executor.ts              # Executor topologico + paralelismo por waves
│   ├── retry-handler.ts             # Retry com temperature decay + model fallback
│   ├── worker-pipeline-runtime.ts   # Runtime multi-step para perfis de worker
│   ├── variable-resolver.ts         # Resolucao de $vars em templates (funcoes puras)
│   └── step-handlers/               # 7 handlers de step V1
│       ├── types.ts                 # StepHandler, StepHandlerContext, StepHandlerResult
│       ├── index.ts                 # ReadonlyMap registry de handlers
│       ├── ai-handlers.ts           # pi_agent (Pi SDK), langchain_prompt (ChatOpenAI)
│       ├── control-handlers.ts      # condition, goto, set_variable, fail
│       └── git-diff-handler.ts      # git_diff (captura diff do worktree)
├── services/
│   └── profile-catalog.ts           # Persistencia de perfis (global + local, Result<T>)
├── git/
│   ├── git-types.ts                 # Tipos Result, GitError, CommitHash
│   ├── git-wrapper.ts               # Operacoes Git atomicas (execFile)
│   ├── worktree-manager.ts          # Lifecycle de worktrees
│   ├── conflict-resolver.ts         # Resolucao de conflitos
│   └── index.ts                     # Re-exports
├── hooks/
│   ├── use-config.ts                # Persistencia de config
│   ├── use-file-tree.ts             # Listagem de arquivos
│   ├── use-api-validation.ts        # Validacao de API key
│   └── use-elapsed-time.ts          # Timer de execucao
└── utils/
    ├── file-tree.ts                 # Arvore de arquivos (git ls-files)
    └── path-guard.ts                # Protecao contra path traversal
```

54 arquivos, ~6.800 LOC (media ~126 LOC/arquivo).

## Padroes de codigo

Segue `docs/general/file-agent-patterns.md`:

| Metrica | Alvo | Limite |
|---------|------|--------|
| Linhas por arquivo | 200-300 | 500 |
| Funcoes por arquivo | 5-10 | 15 |
| Linhas por funcao | 20-30 | 50 |
| Complexidade ciclomatica | <= 7 | 10 |

TypeScript strict, sem `any`, TSDoc com `@throws` e `@example`, imutabilidade, Zod em toda boundary.

**Error handling:** `Result<T>` pattern com error discrimination para flow control (sem throw/catch). `PipelineFailError` distingue falhas de negocio de erros tecnicos no runtime de pipeline.

## Por que Git Worktrees?

Agentes rodando em paralelo na mesma working tree enfrentam race conditions de I/O e lock do index Git. Worktrees sao containers temporarios baratos, isolados no filesystem, com merge trivial e limpeza segura.

## Configuracao

A configuracao e persistida em `~/.pi-dag-cli.json` e inclui:

| Campo | Tipo | Default | Descricao |
|-------|------|---------|-----------|
| `openrouterApiKey` | string | — | Chave de API do OpenRouter |
| `selectedAgents` | `{ planner, worker }` | GPT-4.1 / GPT-4.1-mini | Modelos para planner e workers |
| `maxConcurrency` | number (1-16) | 4 | Workers paralelos por wave do DAG |
| `worktreeBasePath` | string | `.pi-dag-worktrees` | Diretorio base para worktrees |

`maxConcurrency` limita quantos workers executam simultaneamente dentro de cada wave. Valores baixos (1-2) reduzem carga no sistema e uso de API; valores altos (8-16) maximizam paralelismo em DAGs grandes.

### Perfis de worker

Perfis sao persistidos separadamente em catalogos JSON:

| Catalogo | Caminho | Precedencia |
|----------|---------|-------------|
| Global | `~/.pi-dag-cli/worker-profiles.json` | Menor |
| Local | `.pi-dag/worker-profiles.json` | Maior (vence colisao de ID) |

Selecao de perfil e efemera por execucao — nao persiste na config.

## Pre-requisitos

- Node.js >= 20
- Git >= 2.5
- Chave de API do OpenRouter
