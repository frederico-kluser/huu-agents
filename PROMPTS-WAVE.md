# Prompts da Wave Atual (7 subtasks paralelizaveis)

---

## Subtask 2.3: Pipeline Planner (orquestração)

**Arquivo a criar:** `src/pipeline/planner-pipeline.ts` (~200 LOC)

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @docs/general/file-agent-patterns.md — métricas (max 200 LOC)
- @docs/general/prompt-engineering.md — structured outputs nativos: strict:true (OpenAI), responseJsonSchema (Gemini), json_object (DeepSeek, sem schema); retry com feedback de erro
- @docs/langchain/langchain-models-2026.md — tabela de capacidades por modelo, limitações DeepSeek (json_object only, conteúdo vazio possível), GPT-4.1 (strict true), Gemini (responseJsonSchema)
- @src/schemas/dag.schema.ts — DAGSchema Zod para validação
- @src/prompts/planner.ts — generatePlannerPrompt()
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

## Subtask 2.4: Tela de visualização do DAG

**Arquivos a criar:** `src/screens/dag-screen.tsx` (~200 LOC), `src/components/dag-node.tsx` (~80 LOC)

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

## Subtask 3.2: DAG Executor (topological sort + paralelismo)

**Arquivo a criar:** `src/pipeline/dag-executor.ts` (~250 LOC)

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

## Subtask 4.2: Worker Runner (Pi Agent SDK)

**Arquivo a criar:** `src/agents/worker-runner.ts` (~250 LOC)

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

## Subtask 4.3: Tela de execução em tempo real

**Arquivos a criar:** `src/screens/execution-screen.tsx` (~250 LOC), `src/components/worker-log.tsx` (~100 LOC)

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

## Subtask 5.2: Git conflict resolution

**Arquivo a criar:** `src/git/conflict-resolver.ts` (~200 LOC)

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

## Subtask 5.3: Tela de status final

**Arquivo a criar:** `src/screens/result-screen.tsx` (~150 LOC)

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
