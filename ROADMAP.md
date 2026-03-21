# ROADMAP: Correção dos Bugs Críticos do Pipeline

Dois bugs impedem o pipeline de funcionar end-to-end. Ambos estão no caminho crítico: sem corrigi-los, workers rodam mas suas mudanças nunca chegam ao repositório.

---

## Bug 1: Worker model selecionado pelo usuário não é aplicado

### Diagnóstico

O usuário seleciona `workerModel` (ex: `openai/gpt-4.1-mini`) na tela de configuração. Esse valor viaja por:

1. `config-screen.tsx` → salva em `Config.workerModel` ✅
2. `app.tsx` → passa `pipeline.config` ao orchestrator ✅
3. `orchestrator.ts:142` → extrai provider via `extractProvider(config.workerModel)` ✅
4. `orchestrator.ts:157-163` → chama `runWorker()` mas **NÃO passa o modelo** ❌

O `runWorker()` recebe `WorkerRunnerConfig` com apenas `apiKey` e `onProgress`. Dentro dele:

5. `worker-runner.ts:151-165` → `createPiSession()` cria sessão Pi SDK
6. `worker-runner.ts:155-157` → hardcoda `provider: config.provider ?? 'anthropic'` e **não passa nenhum `model`** ao `createAgentSession()`
7. `worker-runner.ts:159-164` → `createAgentSession()` recebe `sessionManager`, `authStorage`, `modelRegistry`, `cwd` — **mas nenhum `model`**

**Resultado:** O Pi SDK usa seu modelo default interno (provável Claude Sonnet via Anthropic), ignorando completamente a seleção do usuário.

### Como o Pi SDK espera receber o modelo

Conforme `docs/pi/pi-agent-nodejs.md` e `docs/pi/pi-agent-sdk-vs-rpc.md`:

```typescript
import { getModel } from "@mariozechner/pi-ai";

const model = getModel("openai", "gpt-4.1-mini");

const { session } = await createAgentSession({
  model,                              // ← OBRIGATÓRIO
  thinkingLevel: "medium",            // ← OPCIONAL
  sessionManager: SessionManager.inMemory(),
  authStorage,
  cwd: worktreePath,
});
```

O `getModel(provider, modelId)` retorna um objeto `Model` que inclui o `api` registry key para dispatch correto do provider.

### Cadeia de mudanças necessárias

```
config.workerModel ("openai/gpt-4.1-mini")
       ↓
orchestrator.ts: parsear em { provider: "openai", modelId: "gpt-4.1-mini" }
       ↓
WorkerRunnerConfig: adicionar campo `model: string` (ou provider + modelId)
       ↓
worker-runner.ts: importar getModel de @mariozechner/pi-ai
       ↓
createPiSession(): chamar getModel(provider, modelId) e passar ao createAgentSession({ model })
```

### Tasks

#### ~~Task 1.1: Adicionar `model` ao `WorkerRunnerConfig`~~ ✅

**Arquivo:** `src/agents/worker-runner.ts`
**Mudança:** Adicionar `model: string` (formato `provider/modelId`) ao `WorkerRunnerConfig`.

#### ~~Task 1.2: Parsear modelo no `createPiSession()`~~ ✅

**Arquivo:** `src/agents/worker-runner.ts`
**Mudança:**
- Importar `getModel` de `@mariozechner/pi-ai`
- Em `createPiSession()`, parsear `config.model` → `{ provider, modelId }`
- Passar `model: getModel(provider, modelId)` ao `createAgentSession()`
- Remover hardcode de `provider ?? 'anthropic'` — derivar do campo `model`

**Atenção:** O `authStorage.setRuntimeApiKey()` precisa usar o provider extraído do modelo (não mais hardcoded `'anthropic'`). Se o modelo for `openai/gpt-4.1-mini`, o provider para auth é `openai`. Se for via OpenRouter, o provider para auth pode ser `openrouter` — verificar se o Pi SDK aceita `openrouter` como provider ou se precisa de tratamento especial.

#### ~~Task 1.3: Passar modelo do orchestrator ao runner~~ ✅

**Arquivo:** `src/pipeline/orchestrator.ts`
**Mudança:** Na `workerFn` (linha 141-172), passar `config.workerModel` ao `runWorker()`:

```typescript
// Antes (linha 159-161):
return runWorker(node, worktreePath, systemPrompt, {
  apiKey: config.openrouterApiKey,
  onProgress: onWorkerProgress,
});

// Depois:
return runWorker(node, worktreePath, systemPrompt, {
  model: config.workerModel,        // ← NOVO
  apiKey: config.openrouterApiKey,
  onProgress: onWorkerProgress,
});
```

#### ~~Task 1.4: Integrar modelo no retry handler~~ ✅

**Arquivo:** `src/pipeline/orchestrator.ts`
**Mudança:** O `retryWorker` já recebe `model` via `RetryConfig`, mas o `executor` callback (linha 158) ignora `_model` e `_temperature`. Conectar esses parâmetros:

```typescript
// Antes (linhas 157-163):
const outcome = await retryWorker(
  async (_model, _temperature) => {
    return runWorker(node, worktreePath, systemPrompt, { ... });
  },
  retryConfig,
);

// Depois:
const outcome = await retryWorker(
  async (model, temperature) => {
    return runWorker(node, worktreePath, systemPrompt, {
      model,           // ← passa modelo do retry (pode ser fallback)
      apiKey: config.openrouterApiKey,
      temperature,     // ← passa temperatura do retry
      onProgress: onWorkerProgress,
    });
  },
  retryConfig,
);
```

Isso implica adicionar `temperature` ao `WorkerRunnerConfig` e propagá-lo ao `createAgentSession()`.

#### ~~Task 1.5: Investigar provider OpenRouter no Pi SDK~~ ✅

**Pesquisa necessária:** O Pi SDK usa `getModel("openai", "gpt-4.1-mini")` com providers diretos. Mas o Pi DAG CLI usa OpenRouter como proxy. Verificar:
- O Pi SDK suporta `getModel("openrouter", "openai/gpt-4.1-mini")`?
- Ou precisa usar `getModel("openai", "gpt-4.1-mini")` + `authStorage.setRuntimeApiKey("openai", openrouterKey)` + override de baseURL?
- O `ModelRegistry` suporta custom baseURL para redirecionar chamadas OpenAI pelo OpenRouter?

Essa investigação determina se o model routing via OpenRouter é transparente ou precisa de adapter.

---

## Bug 2: Pipeline não persiste mudanças dos workers (commit + merge quebrado)

### Diagnóstico

A cadeia de persistência está quebrada em 4 pontos que se encadeiam:

```
worker.prompt.ts:76    → "NAO faca commit"           ← INSTRUÇÃO EXPLÍCITA ao agente
worker-runner.ts:142   → commitHash: null             ← SEMPRE null, nunca commitado
dag-executor.ts:169    → if (result.commitHash) {...} ← NUNCA entra, merge nunca acontece
dag-executor.ts:182    → removeWorktree(path)         ← DELETA worktree com mudanças uncommitted
```

**Resultado:** O agente faz `git add`, as mudanças ficam staged, mas ninguém faz commit. O worktree é deletado no `finally` e as mudanças evaporam.

### A intenção original vs. a implementação

A intenção do prompt (`worker.prompt.ts:76`) era evitar que o **agente** fizesse commit para manter controle do orquestrador sobre o formato/mensagem do commit. Isso é correto — o agente não deveria decidir o formato do commit.

Mas o **runner** (`worker-runner.ts`) deveria fazer o commit após o agente terminar, e não o faz. E o **executor** (`dag-executor.ts`) condiciona o merge à existência de `commitHash`, que nunca é preenchido.

### Fluxo correto desejado

```
1. Worker agent executa task no worktree (modifica arquivos, faz git add)
2. Runner detecta arquivos modificados via git status ✅ (já funciona)
3. Runner faz commit das mudanças staged no worktree ← FALTA
4. Runner retorna commitHash no WorkerResult ← FALTA
5. Executor verifica commitHash e faz merge na branch base ✅ (lógica existe, mas nunca executa)
6. Executor remove worktree ✅ (já funciona)
```

### Tasks

#### ~~Task 2.1: Runner faz commit após agente completar~~ ✅

**Arquivo:** `src/agents/worker-runner.ts`
**Mudança:** Após `getModifiedFiles()`, se há mudanças e status é `success` ou `partial`, fazer commit:

```typescript
// Após linha 132 (const filesModified = await getModifiedFiles(worktreePath)):

let commitHash: string | null = null;

if (filesModified.length > 0) {
  // Importar commit de git-wrapper
  const commitResult = await commit(
    worktreePath,
    `feat(dag): ${node.task.slice(0, 72)}`   // conventional commit com task truncada
  );
  if (commitResult.ok) {
    commitHash = commitResult.value;
  }
  // Se commit falha (ex: no_changes), commitHash fica null — merge será skippado
}
```

E substituir o `commitHash: null` hardcoded pelo valor real:

```typescript
// Antes (linha 138-144):
return WorkerResultSchema.parse({
  nodeId: node.id,
  status,
  filesModified,
  commitHash: null,        // ← SEMPRE null
  error: errorMsg,
});

// Depois:
return WorkerResultSchema.parse({
  nodeId: node.id,
  status,
  filesModified,
  commitHash,              // ← valor real do commit (ou null se sem mudanças)
  error: errorMsg,
});
```

**Atenção:** O `commit()` de `git-wrapper.ts` (linha 146-160) já faz `git add -A` internamente. Mas o agente também faz `git add` via prompt. Isso é idempotente (add de arquivos já staged é no-op), então não causa problema.

#### ~~Task 2.2: Atualizar prompt do worker para não pedir git add~~ ✅

**Arquivo:** `src/prompts/worker.prompt.ts`
**Mudança:** Agora que o runner faz commit automaticamente (incluindo `git add -A`), o prompt não precisa mais pedir ao agente para fazer `git add`. Remover:

```
// Antes (linha 76 anthropic, linha 114 markdown):
'Ao terminar: git add dos arquivos modificados. NAO faca commit.'

// Depois:
'Ao terminar: salve todos os arquivos modificados. O commit sera feito automaticamente pelo orquestrador.'
```

Isso simplifica a instrução ao agente e evita conflito entre `git add` do agente e `git add -A` do `commit()`.

#### ~~Task 2.3: Validar que executor faz merge corretamente~~ ✅

**Arquivo:** `src/pipeline/dag-executor.ts`
**Verificação:** A lógica de merge (linhas 168-177) já está correta — só precisa de `commitHash` preenchido:

```typescript
if (result.commitHash) {
  const mergeResult = await merge(
    `task-${taskTimestamp}`,
    [wtResult.value.branch],
  );
  ...
}
```

O único ajuste potencial: se o worker teve status `partial` mas fez mudanças, o commitHash estará preenchido. O merge vai acontecer para mudanças parciais. **Isso é o comportamento desejado** — mudanças parciais são mergeadas e o node é marcado como `completed` apesar de partial.

Verificar se queremos que `partial` entre no `completed` set ou se deve ter tratamento diferente no executor. Atualmente, `partial` não causa throw (só `failure` causa throw na linha 164-166), então um worker `partial` com commitHash será mergeado e marcado como completed. **Decisão de design a tomar.**

#### ~~Task 2.4: Garantir cleanup seguro do worktree após commit~~ ✅

**Arquivo:** `src/pipeline/dag-executor.ts`
**Verificação:** O `finally` (linha 181-183) remove o worktree incondicionalmente:

```typescript
finally {
  await removeWorktree(wtResult.value.path);
}
```

Isso é correto após o commit, porque o commit já persistiu as mudanças na branch do worktree. O merge na branch base já copiou essas mudanças. A remoção do worktree é segura.

**Porém:** se o commit falha (ex: permissão) E o worktree tem mudanças staged, essas mudanças serão perdidas. Adicionar logging:

```typescript
finally {
  if (!commitHash && filesModified.length > 0) {
    emit('error', `AVISO: worktree ${wtResult.value.path} removido com ${filesModified.length} arquivo(s) não commitados`);
  }
  await removeWorktree(wtResult.value.path);
}
```

Isso não é uma mudança no executor, mas sim no runner (que é quem tem acesso a `filesModified` e `commitHash`). O executor recebe o `WorkerResult` já consolidado.

---

## Grafo de dependências

```
Bug 1 (modelo):
  1.5 (pesquisa OpenRouter) ──→ 1.2 (parsear modelo no createPiSession)
                                       ↓
  1.1 (WorkerRunnerConfig) ───→ 1.3 (orchestrator passa modelo)
                                       ↓
                                 1.4 (retry handler conecta modelo+temp)

Bug 2 (commit/merge):
  2.2 (prompt remove git add) ──→ 2.1 (runner faz commit)
                                       ↓
                                 2.3 (verificar executor merge)
                                       ↓
                                 2.4 (logging de cleanup)
```

### Paralelismo possível

**Wave 1:** `1.1` + `1.5` + `2.2` (independentes)
**Wave 2:** `1.2` (depende de 1.5) + `2.1` (depende de 2.2)
**Wave 3:** `1.3` + `1.4` (dependem de 1.1 + 1.2) + `2.3` + `2.4` (dependem de 2.1)

---

## Arquivos impactados

| Arquivo | Bug 1 | Bug 2 | Tasks |
|---------|:-----:|:-----:|-------|
| `src/agents/worker-runner.ts` | ✓ | ✓ | 1.1, 1.2, 2.1 |
| `src/pipeline/orchestrator.ts` | ✓ | — | 1.3, 1.4 |
| `src/prompts/worker.prompt.ts` | — | ✓ | 2.2 |
| `src/pipeline/dag-executor.ts` | — | ✓ | 2.3, 2.4 |
| `src/pipeline/retry-handler.ts` | ✓ | — | 1.4 (interface) |
| `src/schemas/config.schema.ts` | — | — | (sem mudança) |

**Total: 5 arquivos, 9 tasks, 2 bugs.**
