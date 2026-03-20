# Anatomia completa do Pi Coding Agent: do prompt ao terminal

O Pi transforma um prompt de texto em ações no terminal através de um pipeline surpreendentemente enxuto: **duas nested loops em ~200 linhas de TypeScript**, um sistema de dispatch baseado em registry para normalizar 5 providers de LLM, e um mecanismo de extensões por ordem de registro que intercepta cada estágio via 20+ hooks. Este documento mapeia cada arquivo, função e decisão arquitetural relevante do repositório `github.com/badlogic/pi-mono` (v0.60.0, março 2026), com foco no código-fonte real dos pacotes `pi-ai`, `pi-agent-core` e `pi-coding-agent`.

---

## 1. Mapa do fluxo completo

O caminho de um prompt até a execução no terminal atravessa quatro pacotes em sequência. Cada estágio é interceptável por extensões.

```
┌─ ENTRADA ─────────────────────────────────────────────────────────┐
│  Usuário digita prompt no TUI (ou SDK/RPC/Print mode)            │
│  ↓                                                                │
│  AgentSession.prompt() → packages/coding-agent/src/core/          │
│    agent-session.ts                                               │
│  ↓                                                                │
│  Hook: input → extensões podem interceptar/transformar            │
│  Hook: before_agent_start → pode injetar mensagem, mudar prompt   │
└───────────────────────────────────────────────────────────────────┘
         ↓
┌─ MONTAGEM DE CONTEXTO ────────────────────────────────────────────┐
│  system-prompt.ts monta:                                          │
│    base identity + tool descriptions + guidelines +               │
│    skills (nomes+descrições) + AGENTS.md + data atual             │
│  ↓                                                                │
│  Se SYSTEM.md existe → SUBSTITUI o prompt base inteiro            │
│  APPEND_SYSTEM.md → ACRESCENTA ao final                           │
│  ↓                                                                │
│  agent.setSystemPrompt(prompt_montado)                            │
│  agent.setTools([read, write, edit, bash, ...extensionTools])     │
└───────────────────────────────────────────────────────────────────┘
         ↓
┌─ AGENT LOOP (pi-agent-core) ─────────────────────────────────────┐
│  packages/agent/src/agent-loop.ts → runLoop()                     │
│                                                                   │
│  OUTER while(true):                                               │
│    INNER while(hasMoreToolCalls || pendingMessages.length > 0):   │
│      ├─ Hook: context → extensões modificam messages[]            │
│      ├─ transformContext() → compactação, pruning                 │
│      ├─ convertToLlm() → AgentMessage[] → Message[]              │
│      ├─ Hook: before_provider_request → última chance             │
│      ├─ streamSimple() → pi-ai dispatch por model.api            │
│      │   ├─ api-registry.ts resolve provider                     │
│      │   ├─ providers/{anthropic,openai-*,google,bedrock}.ts      │
│      │   ├─ TypeBox schemas → JSON Schema por provider            │
│      │   └─ Eventos normalizados: text_delta, toolcall_*, done   │
│      ├─ Parse resposta: tool_calls detectados                     │
│      ├─ Para cada tool_call:                                      │
│      │   ├─ Hook: tool_call → {block:true} cancela               │
│      │   ├─ Validação AJV contra TypeBox schema                  │
│      │   ├─ tool.execute(id, params, signal, onUpdate)           │
│      │   ├─ Hook: tool_result → pode modificar                   │
│      │   └─ Resultado → mensagem tool_result → context           │
│      └─ getSteeringMessages() → interrompe se houver             │
│    ↓                                                              │
│    getFollowUpMessages() → se houver, OUTER continua             │
│    Senão: break → agent_end                                       │
└───────────────────────────────────────────────────────────────────┘
         ↓
┌─ PERSISTÊNCIA ────────────────────────────────────────────────────┐
│  session-manager.ts → JSONL com tree structure (id + parentId)    │
│  Compactação automática se tokens > threshold                     │
│  Hook: session_before_compact → custom summarization              │
└───────────────────────────────────────────────────────────────────┘
```

O fluxo inteiro é síncrono dentro de cada turno — o loop não avança até que todas as tools do turno atual completem (em paralelo por padrão) ou sejam interrompidas por steering. A filosofia é explícita: **sem max-steps**, o loop roda até o modelo parar voluntariamente ou ocorrer erro fatal.

---

## 2. O agent loop dissecado

O coração do Pi vive em `packages/agent/src/agent-loop.ts`. Apesar do nome do diretório ser `packages/agent/`, o pacote npm é `@mariozechner/pi-agent-core`. O arquivo exporta três funções — `agentLoop`, `agentLoopContinue` e a interna `runLoop` — que implementam o ciclo completo de interação com o LLM.

### A estrutura de duas loops aninhadas

`runLoop` opera com **duas loops `while` aninhadas**. A loop externa controla follow-up messages — mensagens enfileiradas que só devem ser entregues após o agente parar naturalmente. A loop interna processa tool calls e steering messages até não haver mais trabalho pendente.

```typescript
// packages/agent/src/agent-loop.ts — runLoop() (reconstruído)
while (true) {  // OUTER: follow-up messages
    while (hasMoreToolCalls || pendingMessages.length > 0) {  // INNER
        // 1. Injeta pending messages no contexto
        // 2. Hook: context + transformContext + convertToLlm
        // 3. streamSimple() → chamada LLM
        // 4. executeToolCalls() → execução paralela/sequencial
        // 5. getSteeringMessages() → interrompe se houver
    }
    const followUps = (await config.getFollowUpMessages?.()) || [];
    if (followUps.length > 0) { pendingMessages = followUps; continue; }
    break;  // Fim real do loop
}
```

A interface `AgentLoopConfig` define os pontos de extensão do loop. Dois callbacks são particularmente críticos: **`transformContext`** recebe o array de `AgentMessage[]` e pode podá-lo, reordená-lo ou injetar contexto antes de cada chamada ao LLM; **`convertToLlm`** traduz o formato interno `AgentMessage` (que suporta tipos customizados de mensagem) para o formato `Message[]` que o LLM entende (user, assistant, toolResult).

### Condições de parada

O loop termina em quatro cenários: **parada natural** (`stopReason === "stop"`) quando o LLM responde sem tool calls; **erro ou abort** (`stopReason === "error" | "aborted"`) que causa saída imediata sem retry — o Issue #1430 documenta que até erros recuperáveis como falhas de JSON parse são tratados como fatais neste nível; **context length exceeded** (`stopReason === "length"`); e **esgotamento de trabalho** quando não há mais tool calls pendentes nem pending messages.

A ausência deliberada de um knob `maxSteps` reflete a filosofia de Mario Zechner: *"the loop just loops until the agent says it's done"*. Limites de segurança devem ser implementados por extensões via o hook `tool_call` retornando `{ block: true }`.

### Execução de tools e interrupção por steering

A função `executeToolCalls` gerencia a execução paralela (padrão) ou sequencial de tool calls. **Mesmo em modo paralelo, o preflight de extensões (`tool_call` hook) roda sequencialmente** antes de cada tool executar. O fluxo para cada tool segue: validação AJV do schema TypeBox → `beforeToolCall` hook → `tool.execute()` → `afterToolCall` hook.

O mecanismo de steering é elegante: durante a execução paralela de tools, se `getSteeringMessages()` retorna mensagens, as tools restantes são **imediatamente puladas** com resultado `"Skipped due to queued user message"` (`isError: true`). Isso permite que o usuário interrompa uma sequência de 5 tool calls no meio do caminho, e o modelo recebe feedback explícito de quais tools foram canceladas.

### State management na classe Agent

A classe `Agent` em `packages/agent/src/agent.ts` encapsula o estado mutável: modelo ativo, system prompt, conjunto de tools, nível de thinking, e o array de mensagens. Mudanças via `setModel()`, `setTools()`, `setSystemPrompt()` **tomam efeito no próximo turno**, não no turno atual. A acumulação de mensagens é incremental: user messages ao chamar `agentLoop()`, assistant messages após cada resposta do LLM, tool results após execução, e steering/follow-up messages injetados entre turnos.

Erros de API são capturados no nível da classe `Agent` e transformados em `AgentMessage` com `stopReason: "error"` e `errorMessage`. O usuário pode então chamar `agentLoopContinue()` para **retomar do ponto de erro** — o LLM vê a mensagem de erro anterior e pode ajustar sua estratégia.

### Os 5 arquivos do pacote

| Arquivo | Responsabilidade |
|---------|-----------------|
| `packages/agent/src/agent-loop.ts` | `runLoop`, `agentLoop`, `agentLoopContinue`, `executeToolCalls` |
| `packages/agent/src/agent.ts` | Classe `Agent` com state management, event subscriptions, message queuing |
| `packages/agent/src/types.ts` | `AgentMessage`, `AgentTool`, `AgentLoopConfig`, `AgentLoopEvent`, `AgentContext` |
| `packages/agent/src/proxy.ts` | Transport abstraction para web (`ProxyAssistantMessageEvent`, `processProxyEvent`) |
| `packages/agent/src/index.ts` | Re-exports do pacote |

---

## 3. Pipeline de contexto: do system prompt ao LLM

A montagem do contexto que o LLM recebe é orquestrada pelo `AgentSession` em `packages/coding-agent/src/core/agent-session.ts`, com o system prompt construído em `packages/coding-agent/src/core/system-prompt.ts` e recursos carregados pelo `DefaultResourceLoader` em `packages/coding-agent/src/core/resource-loader.ts`.

### Ordem de montagem do system prompt

O `system-prompt.ts` constrói o prompt em seções concatenadas: **identidade base** ("You are an expert coding assistant operating inside pi, a coding agent harness..."), **seção de tools disponíveis** (nomes + descrições das tools nativas e de extensões que fornecem `promptSnippet`), **guidelines** de uso (tools de extensão com `promptGuidelines` recebem bullets aqui), **skills disponíveis** (apenas nomes e descrições em formato compacto — o conteúdo completo dos SKILL.md não é incluído), **referência à documentação do Pi** (caminho absoluto do README), e **data atual** em formato ISO date-only (sem hora, para manter cache de prefixo estável entre sessões — fix #2131).

O total deliberado é **menos de 1.000 tokens incluindo tool definitions**. Zechner argumenta que modelos frontier foram "RL-trained up the wazoo" e não precisam de system prompts de 10.000 tokens.

### SYSTEM.md e AGENTS.md: override vs. append

O `DefaultResourceLoader` (`resource-loader.ts`, linhas 27-112) implementa dois mecanismos distintos. **SYSTEM.md** (em `.pi/SYSTEM.md` ou `~/.pi/agent/SYSTEM.md`) **substitui completamente** o prompt base — é um override total. **APPEND_SYSTEM.md** é apenas acrescentado ao final sem substituir. AGENTS.md segue uma lógica de camadas: o global `~/.pi/agent/AGENTS.md` é incluído primeiro, depois ancestrais do diretório atual **de fora para dentro** (o mais específico vem por último e tem a palavra final). O Pi aceita tanto `AGENTS.md` quanto `CLAUDE.md` para compatibilidade cruzada.

### O pipeline de transformação em cada turno

Em cada turno do loop, as mensagens passam por uma cadeia de transformações antes de chegar ao LLM. O `AgentSession` invoca: hook **`context`** (extensões podem reescrever o array de mensagens), **`transformContext`** do `AgentLoopConfig` (onde compactação e pruning acontecem), **`convertToLlm`** (filtra mensagens custom, converte `AgentMessage[]` para `Message[]`, remove imagens quando `blockImages` está ativo), e por fim o hook **`before_provider_request`** (última chance de inspecionar ou substituir o payload final).

Quando há compactação ativa, a mensagem mais antiga do contexto é um user message prefixado com `COMPACTION_SUMMARY_PREFIX` ("The conversation history before this point was compacted into the following summary:"), definido em `packages/coding-agent/src/core/messages.ts`. Branch summaries usam `BRANCH_SUMMARY_PREFIX` com formato análogo.

---

## 4. As 4 tools por dentro

As tools nativas vivem em `packages/coding-agent/src/core/tools/` com factory functions exportadas por `index.ts`. Cada tool segue o mesmo padrão: TypeBox schema → `createXxxTool(cwd, options?)` → `AgentTool<T>` com interface `XxxOperations` plugável para execução remota.

### read: truncamento inteligente e imagens

`createReadTool` (em `tools/read.ts`) aceita `path`, `offset` (1-indexed) e `limit`. Texto é truncado a **2.000 linhas ou 50KB** (o que vier primeiro) via `truncateHead()` de `tools/truncate.ts`, que preserva o final do arquivo (conteúdo mais recente). Imagens (jpg, png, gif, webp) são retornadas como attachments, com resize automático via `autoResizeImages`. A interface `ReadOperations` (`readFile`, `access`) permite override para SSH ou containers.

### write: simplicidade deliberada sem backup

`createWriteTool` (em `tools/write.ts`, 118 linhas) é a mais simples: resolve o path via `resolveToCwd()`, cria diretórios pai com `mkdir({ recursive: true })`, e sobrescreve o arquivo. **Não há mecanismo de backup** — o histórico da sessão JSONL serve como backup implícito. Suporta `AbortSignal` com cleanup de listeners.

### edit: matching exato com fallback fuzzy

`createEditTool` (em `tools/edit.ts` + `tools/edit-diff.ts`) usa uma **estratégia de duas fases**. Primeiro tenta match exato com `content.includes(oldText)`. Se falhar, aplica `normalizeForFuzzyMatch()` que normaliza: trailing whitespace, smart quotes → aspas normais, dashes Unicode → ASCII, BOM removal, CRLF → LF, e **normalização Unicode NFC/NFKC** para caracteres CJK e fullwidth (fix #2044). Quando o match falha mesmo após normalização, retorna `isError: true` com mensagem "oldText not found", permitindo que o modelo retente com texto corrigido. O TUI computa e exibe um **diff preview** assincronamente antes do resultado chegar.

### bash: spawn hook e tree kill

`createBashTool` (em `tools/bash.ts`) é a mais complexa. Output é truncado a **50KB / 2.000 linhas** via `truncateTail()` (preserva o final). O `spawnHook` permite transformar comando, cwd e env antes da execução — essencial para sandboxing. `createLocalBashOperations()` provê o backend local com resolução de shell e **terminação de árvore de processos** (process-tree kill). O `AbortSignal` integra com o cancel do TUI (Esc).

```typescript
// Exemplo: spawnHook para sandboxing
createBashTool(cwd, {
  spawnHook: ({ command, cwd, env }) => ({
    command: `source ~/.profile\n${command}`,
    cwd: `/mnt/sandbox${cwd}`,
    env: { ...env, CI: "1" },
  }),
});
```

Além das 4 tools core, o Pi inclui **grep**, **find** e **ls** como tools adicionais, exportadas via `createReadOnlyTools` para cenários de acesso somente-leitura.

---

## 5. Streaming e normalização multi-provider

O `pi-ai` abstrai 5 APIs de LLM distintas (OpenAI Completions, OpenAI Responses, Anthropic Messages, Google Generative AI, Amazon Bedrock Converse Stream) numa interface unificada. O padrão é **registry-based dispatch**, não herança.

### O dispatch via api-registry

`packages/ai/src/stream.ts` exporta `streamSimple()` como entry point principal. A função lê `model.api` (string como `"anthropic-messages"` ou `"openai-completions"`), consulta o **API Registry** em `packages/ai/src/api-registry.ts` que mapeia cada `Api` para `{ stream, streamSimple }`, e delega ao provider específico. Providers são **lazy-loaded** via `packages/ai/src/providers/register-builtins.ts` para startup rápido (PR #2297).

### Protocolo de eventos normalizados

Todo provider retorna `AssistantMessageEventStream` (async iterable) emitindo eventos com tipos padronizados: `start`, `text_start`/`text_delta`/`text_end`, `thinking_start`/`thinking_delta`/`thinking_end`, `toolcall_start`/`toolcall_delta`/`toolcall_end`, `done`, `error`. Cada evento carrega `contentIndex` para correlação e reconstrução progressiva da mensagem.

### Serialização de tools por provider

TypeBox schemas são JSON Schema nativo e passam quase diretamente para cada provider. A conversão acontece dentro de cada arquivo em `packages/ai/src/providers/`: Anthropic usa `input_schema`, OpenAI Completions usa `function.parameters`, OpenAI Responses usa `parameters` diretamente, Google encapsula em `function_declarations`, e Bedrock usa `toolSpec.inputSchema.json`. Um quirk notável: quando usando tokens OAuth Anthropic (prefixo `sk-ant-oat`), tool names são convertidos para casing Claude Code via `toClaudeCodeName` (ex: `read` → `Read`).

### Thinking/reasoning cross-provider

`SimpleStreamOptions` expõe `reasoning?: ThinkingLevel` (valores: `"minimal"` a `"xhigh"`) traduzido por provider: Anthropic Opus/Sonnet 4.6 usam adaptive thinking com `effort`; modelos mais antigos usam `thinkingBudgetTokens`; OpenAI usa `reasoningEffort`; Google Gemini 3 usa `thinking.level` e Gemini 2.5 usa `thinking.budgetTokens`. Cross-provider context handoff converte traces de thinking do Anthropic para tags `<thinking></thinking>` quando alternando para OpenAI.

---

## 6. Compactação automática

O sistema de compactação vive em `packages/coding-agent/src/core/compaction/` e é orquestrado pelo `AgentSession` em `agent-session.ts`.

### Threshold e decisão

Após cada turno do assistente, o `AgentSession` verifica: `contextTokensUsed + reserveTokens >= model.contextWindow`. O **`reserveTokens` padrão é 16.384 tokens**, configurável em `~/.pi/agent/settings.json`. Quando o threshold é atingido, `handleAutoCompaction()` é disparado automaticamente. O usuário pode desabilitar via `/autocompact` ou forçar manualmente com `/compact [instruções customizadas]`.

### O fluxo de compactação

`handleAutoCompaction()` segue uma sequência precisa: desinscreve do agent para parar de processar eventos, aborta o run atual e aguarda idle, gera o summary usando `pi-ai` diretamente (**sem tools, reasoning desligado**), persiste um `CompactionEntry` no JSONL, reconstrói as mensagens do agente (summary como user message + mensagens mantidas), e reinscreve no agent.

O prompt de sumarização interno instrui o LLM a criar um "handoff summary" incluindo: progresso atual, decisões tomadas, caminhos absolutos de arquivos modificados, próximos passos, e dados/referências críticas. O `maxTokens` para o summary é aproximadamente **13.107 tokens**. Tool results dentro das mensagens a sumarizar são **truncados a 2K caracteres** para evitar estouro de contexto (fix #1796).

### Customização via hooks

Extensões interceptam a compactação via `session_before_compact`, recebendo `messagesToSummarize`, `turnPrefixMessages`, `tokensBefore`, `firstKeptEntryId` e `previousSummary`. Isso permite usar um modelo diferente para sumarização (ex: Gemini Flash, mais barato) ou armazenar metadata customizada no campo `details` do `CompactionEntry`. Um exemplo completo existe em `packages/coding-agent/examples/extensions/custom-compaction.ts`.

### Regras de boundary

A compactação nunca corta entre um tool call e seu resultado — pares são mantidos juntos. O `keepLastMessages` conta apenas mensagens entre compaction boundaries e nunca cruza uma boundary anterior. Para conversas onde compactação ocorre mid-turn, duas summaries são geradas e merged.

---

## 7. Sistema de extensões: ordem de execução

O sistema de extensões é implementado em `packages/coding-agent/src/core/extensions/`, com `extension-runner.ts` gerenciando o ciclo de vida e `extension-api.ts` expondo a interface `ExtensionAPI`.

### Loading e registro

Extensões são descobertas pelo `DefaultResourceLoader` com precedência projeto-primeiro (`.pi/` sobrescreve `~/.pi/agent/`). O `ExtensionRunner` carrega arquivos TypeScript via **jiti** (transpilação just-in-time sem pré-compilação). O CLI faz **two-pass parsing**: primeiro extrai `--extension` paths, carrega extensões que registram flags customizadas via `registerFlag()`, depois refaz o parse completo incluindo as novas flags.

Cada extensão exporta uma função default recebendo `ExtensionAPI`:

```typescript
export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => { ... });
  pi.registerTool({ name: "custom", ... });
  pi.registerCommand("hello", { ... });
}
```

### Ordem de execução e `{ block: true }`

**Handlers são executados na ordem de registro** — determinada pela ordem de carregamento das extensões, seguida pela ordem de registro dentro de cada extensão. **Não existe sistema de prioridade explícito.** Para eventos como `input`, transforms encadeiam: o output de um handler alimenta o input do próximo.

Quando um handler de `tool_call` retorna `{ block: true, reason: "..." }`, a **execução da tool é impedida** e a `reason` é devolvida ao LLM como tool result com `isError: true`. O modelo vê explicitamente por que foi bloqueado e pode ajustar. Isso é usado para diálogos de confirmação, controle de acesso e guardrails de segurança.

### Contextos por modo de operação

Extensões recebem contextos diferentes conforme o modo: **Interactive** recebe `ExtensionUIContext` com capabilities completas de TUI (overlays, editors customizados, widgets — Zechner demonstrou rodando Doom no TUI), **RPC** recebe `ExtensionUIContext` com protocolo JSON request/response, e **Print** recebe métodos no-op. Hot reload via `ctx.reload()` permite que o agente escreva código de extensão, recarregue e teste iterativamente.

### 20+ hooks disponíveis

Os hooks completos, em ordem de lifecycle: `session_directory`, `session_start`, `input`, `before_agent_start`, `agent_start`, `turn_start`, `context`, `before_provider_request`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_call`, `tool_execution_update`, `tool_result`, `tool_execution_end`, `turn_end`, `agent_end`, `model_select`, `session_before_compact`.

---

## 8. Prompts ocultos e injeções internas

Uma investigação exaustiva do código-fonte revela que **não existe um esquema `pi-internal://`** — isso era uma hipótese que não se confirmou. A filosofia do Pi é explícita: *"Existing harnesses make [context engineering] extremely hard or impossible by injecting stuff behind your back that isn't even surfaced in the UI"* (Zechner).

### O que é injetado sem o usuário escrever

Seis categorias de conteúdo são adicionadas automaticamente. O **system prompt base** de `system-prompt.ts` contém a identidade do agente, descrições das tools e guidelines — visível ao usuário mas não escrito por ele. A **data atual** em ISO format é injetada para consciência temporal (date-only para estabilidade de cache). **Tool `promptSnippet` e `promptGuidelines`** de extensões são inseridos nas seções correspondentes do system prompt. **Compaction summaries** e **branch summaries** com seus prefixos padronizados são injetados como user messages. **Steering/followUp messages** de extensões são enfileirados programaticamente sem input direto do usuário.

### Modificações invisíveis via hooks

O hook `context` permite extensões reescreverem o array de mensagens antes de cada chamada ao LLM. O `before_provider_request` pode substituir o payload final. Essas modificações são funcionalmente invisíveis na interface padrão, embora o modo `/tree` com filtro "all" mostre cada mensagem incluindo tool calls. São a única fonte real de "hidden prompts" no sistema, e são instaladas conscientemente pelo usuário.

### Metadata em session entries

Cada entrada JSONL carrega metadata estruturada: `type`, `id`, `parentId` (para navegação em árvore), `timestamp`, `tokensBefore` (em `CompactionEntry`), `fromHook` (boolean indicando se foi gerado por extensão), e `details` (JSON arbitrário). Isso possibilita debug completo do contexto que cada turno do LLM recebeu.

---

## 9. Mapa de arquivos para o forker

| Arquivo / Diretório | Responsabilidade | Se você quer mudar X, comece aqui |
|---|---|---|
| `packages/agent/src/agent-loop.ts` | Core loop: prompt→LLM→tools→next | Lógica de turnos, stop conditions, steering |
| `packages/agent/src/agent.ts` | Classe Agent, state, events, queuing | State management, message accumulation |
| `packages/agent/src/types.ts` | AgentMessage, AgentTool, AgentLoopConfig | Adicionar campos a mensagens ou tools |
| `packages/agent/src/proxy.ts` | Transport web, bandwidth optimization | Protocolo RPC/web |
| `packages/ai/src/stream.ts` | Dispatch: streamSimple, complete | Entry point para chamadas LLM |
| `packages/ai/src/api-registry.ts` | Registry Api→provider | Adicionar novo provider |
| `packages/ai/src/types.ts` | Model, Tool, Context, eventos stream | Tipos compartilhados entre providers |
| `packages/ai/src/providers/anthropic.ts` | Anthropic Messages API | Quirks Anthropic, OAuth stealth mode |
| `packages/ai/src/providers/openai-completions.ts` | OpenAI Chat Completions | Compat flags para providers OpenAI-compat |
| `packages/ai/src/providers/google.ts` | Google Generative AI | Gemini quirks, thinking budgets |
| `packages/ai/src/models.generated.ts` | Catálogo auto-gerado de 2000+ modelos | Adicionar modelos ou corrigir custos |
| `packages/coding-agent/src/core/agent-session.ts` | Orquestrador principal, compactação auto | Fluxo de sessão, context assembly |
| `packages/coding-agent/src/core/system-prompt.ts` | Montagem do system prompt | Conteúdo/estrutura do prompt |
| `packages/coding-agent/src/core/resource-loader.ts` | AGENTS.md, SYSTEM.md, skills, extensões | Descoberta de contexto de projeto |
| `packages/coding-agent/src/core/compaction/` | Sumarização, threshold, boundaries | Lógica e prompt de compactação |
| `packages/coding-agent/src/core/tools/edit.ts` + `edit-diff.ts` | Edit tool + fuzzy matching | Algoritmo de match, normalização Unicode |
| `packages/coding-agent/src/core/tools/bash.ts` | Bash tool, spawn, process management | Sandboxing, timeouts, output capture |
| `packages/coding-agent/src/core/tools/truncate.ts` | Limites 50KB/2000 linhas | Thresholds de truncamento |
| `packages/coding-agent/src/core/extensions/extension-runner.ts` | Carregamento jiti, lifecycle | Loading, reload, discovery de extensões |
| `packages/coding-agent/src/core/extensions/types.ts` | Tipos de eventos, handler signatures | Adicionar novos hooks |
| `packages/coding-agent/src/core/skills/discovery.ts` | Auto-descoberta de skills | Paths de busca, validação de frontmatter |
| `packages/coding-agent/src/core/tools/registry.ts` | ToolRegistry, dedup | Gerenciamento do conjunto de tools |
| `packages/ai/src/utils/overflow.ts` | Detecção de context overflow | Heurísticas de erro por provider |

---

## 10. Pontos de extensão documentados vs. não-documentados

### API oficial e estável

A documentação em `packages/coding-agent/docs/extensions.md` cobre explicitamente: `pi.on()` para os 20+ eventos do lifecycle, `pi.registerTool()` para tools customizadas, `pi.registerCommand()` para slash commands, `pi.registerFlag()` para CLI flags customizadas, `pi.registerProvider()` para providers LLM adicionais, `pi.sendUserMessage()` para injeção programática, e `ctx.ui.*` para componentes TUI. O hook `session_before_compact` é documentado com exemplo funcional em `examples/extensions/custom-compaction.ts`. Esses são os pontos de extensão com expectativa razoável de estabilidade.

### Pontos semi-documentados com risco de breaking changes

O `before_provider_request` foi adicionado em v0.57.0 e permite interceptar o payload HTTP final — útil mas recente. O `spawnHook` em `createBashTool` é documentado no SDK mas não na documentação de extensões. As interfaces `ReadOperations`, `WriteOperations`, `EditOperations` e `BashOperations` permitem substituir I/O para execução remota, mas a assinatura exata pode mudar. O campo `compat` no tipo `Model` carrega flags provider-específicas (26+ flags documentadas) que são internals práticos mas sem contrato de estabilidade — ex: `requiresMistralToolIds`, `openRouterRouting`, `vercelGatewayRouting`.

### Riscos reais de breaking changes

O projeto está em v0.x com breaking changes frequentes. Exemplos recentes: v0.57.0 mudou o framing RPC de readline para **strict LF-delimited JSONL**; a classe `Agent` e transport abstractions foram movidos de `pi-web-ui` para `pi-agent-core`; tool interception migrou de wrapper-based para hooks `beforeToolCall`/`afterToolCall` no agent-core. O CONTRIBUTING.md é explícito: *"Pi's core is minimal. If your feature doesn't belong in the core, it should be an extension. PRs that bloat the core will likely be rejected."* Para forkers, isso significa que extensões devem evitar depender de internals não-exportados e favorecer os hooks documentados, aceitando que até APIs públicas v0.x podem quebrar entre minor versions. O canal mais seguro para extensões robustas é a interface `ExtensionAPI` + os eventos listados em `types.ts` — tudo fora disso é território de [INFERIDO] monkey-patching sem garantias.