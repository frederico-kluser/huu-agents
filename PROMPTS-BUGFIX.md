# Prompts para Correção dos Bugs Críticos (9 tasks)

Princípios aplicados (conforme @docs/general/prompt-engineering.md e @docs/general/prompts-guide.md):
- Max ~300 palavras por prompt (evitar over-prompting)
- 5 componentes: role, contexto, constraints, behavior, examples
- Structured output: mudanças cirúrgicas com diff claro (antes/depois)
- Sem CoT genérico — passos concretos e específicos
- Sandwich method onde aplicável

---

## Task 1.1: Adicionar `model` e `temperature` ao `WorkerRunnerConfig`

**Arquivo:** `src/agents/worker-runner.ts`
**Tipo:** Interface change (sem lógica)

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @src/agents/worker-runner.ts — interface WorkerRunnerConfig (linhas 32-41) e função runWorker (linhas 83-145)
- @docs/general/file-agent-patterns.md — métricas de arquivo, minimal diffs
</context>

<role>
Você é um engenheiro TypeScript fazendo uma correção cirúrgica de interface.
</role>

<constraints>
- Minimal diff — alterar APENAS a interface WorkerRunnerConfig
- Adicionar 2 campos obrigatórios: model (string, formato "provider/modelId") e temperature (number, 0-1)
- Remover o campo opcional `provider` que era hardcoded para 'anthropic'
- Manter todos os campos existentes (apiKey, timeoutMs, onProgress)
- Não alterar nenhuma lógica de função neste passo
</constraints>

<behavior>
Editar WorkerRunnerConfig de:
  readonly apiKey: string;
  readonly provider?: string;     ← REMOVER
  readonly timeoutMs?: number;
  readonly onProgress?: (...) => void;

Para:
  readonly model: string;         ← NOVO (formato "openai/gpt-4.1-mini")
  readonly apiKey: string;
  readonly temperature?: number;  ← NOVO (default 0.7)
  readonly timeoutMs?: number;
  readonly onProgress?: (...) => void;
</behavior>
```

---

## Task 1.2: Parsear modelo e criar sessão Pi SDK corretamente

**Arquivo:** `src/agents/worker-runner.ts`
**Tipo:** Lógica de criação de sessão

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @src/agents/worker-runner.ts — função createPiSession (linhas 151-165)
- @docs/pi/pi-agent-nodejs.md — seção sobre getModel(provider, modelId) e createAgentSession({ model })
- @docs/pi/pi-agent-anatomia.md — seção sobre model registry e dispatch por provider
- @docs/general/file-agent-patterns.md — métricas, TSDoc
</context>

<role>
Você é um engenheiro de integração Pi SDK. Corrija a função createPiSession para usar o modelo selecionado pelo usuário.
</role>

<constraints>
- Importar getModel de "@mariozechner/pi-ai"
- Parsear config.model (formato "provider/modelId") em { provider, modelId }
- Chamar getModel(provider, modelId) para obter objeto Model
- Passar model ao createAgentSession
- Derivar provider para authStorage.setRuntimeApiKey do campo model (não mais hardcoded 'anthropic')
- Se model não contém '/', usar "anthropic" como provider default e model inteiro como modelId
- Max 50 LOC na função
- TSDoc atualizado com @throws para modelo inválido
</constraints>

<behavior>
1. Parsear config.model: split por '/' → [provider, modelId]
2. const piModel = getModel(provider, modelId)
3. authStorage.setRuntimeApiKey(provider, config.apiKey)
4. createAgentSession({ model: piModel, sessionManager, authStorage, cwd })
5. Remover new ModelRegistry(authStorage) se getModel já resolve o registry
</behavior>

<examples>
// Input: config.model = "openai/gpt-4.1-mini"
// → provider = "openai", modelId = "gpt-4.1-mini"
// → piModel = getModel("openai", "gpt-4.1-mini")
// → authStorage.setRuntimeApiKey("openai", "sk-or-...")
// → createAgentSession({ model: piModel, ... })

// Input: config.model = "anthropic/claude-sonnet-4-20250514"
// → provider = "anthropic", modelId = "claude-sonnet-4-20250514"
// → authStorage.setRuntimeApiKey("anthropic", "sk-or-...")
</examples>
```

---

## Task 1.3: Passar modelo do orchestrator ao runner

**Arquivo:** `src/pipeline/orchestrator.ts`
**Tipo:** Wiring (conectar parâmetros)

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @src/pipeline/orchestrator.ts — workerFn (linhas 141-172), especialmente a chamada a runWorker (linhas 159-162)
- @src/agents/worker-runner.ts — nova interface WorkerRunnerConfig (após task 1.1)
- @docs/general/file-agent-patterns.md — minimal diffs
</context>

<role>
Você é um engenheiro fazendo wiring de parâmetros entre orchestrator e worker runner.
</role>

<constraints>
- Minimal diff — alterar APENAS a chamada a runWorker dentro da workerFn
- Adicionar campo model: config.workerModel ao objeto de config passado a runWorker
- Manter todos os campos existentes (apiKey, onProgress)
- Não alterar nenhuma outra parte do orchestrator
</constraints>

<behavior>
Mudar linhas 159-162 de:
  return runWorker(node, worktreePath, systemPrompt, {
    apiKey: config.openrouterApiKey,
    onProgress: onWorkerProgress,
  });

Para:
  return runWorker(node, worktreePath, systemPrompt, {
    model: config.workerModel,
    apiKey: config.openrouterApiKey,
    onProgress: onWorkerProgress,
  });
</behavior>
```

---

## Task 1.4: Conectar retry handler ao modelo e temperatura reais

**Arquivo:** `src/pipeline/orchestrator.ts`
**Tipo:** Wiring (conectar parâmetros do retry)

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @src/pipeline/orchestrator.ts — retryWorker executor callback (linhas 157-165)
- @src/pipeline/retry-handler.ts — interface RetryConfig e WorkerExecutor type (linhas 7-23)
- @src/agents/worker-runner.ts — nova interface WorkerRunnerConfig com model e temperature
- @docs/general/file-agent-patterns.md — minimal diffs
</context>

<role>
Você é um engenheiro conectando o retry handler ao worker runner com parâmetros reais.
</role>

<constraints>
- Minimal diff — alterar APENAS o callback do retryWorker e a temperatura no retryConfig
- O callback recebe (model, temperature) do retry handler — usar esses valores em vez de ignorá-los
- O retryConfig.temperature deve ser configurável (default 0.7 por enquanto)
</constraints>

<behavior>
Mudar linhas 151-165 de:
  const retryConfig: RetryConfig = {
    model: config.workerModel,
    temperature: 0.7,
    fallbackModel: undefined,
  };
  const outcome = await retryWorker(
    async (_model, _temperature) => {
      return runWorker(node, worktreePath, systemPrompt, {
        apiKey: config.openrouterApiKey,
        onProgress: onWorkerProgress,
      });
    },
    retryConfig,
  );

Para:
  const retryConfig: RetryConfig = {
    model: config.workerModel,
    temperature: 0.7,
    fallbackModel: undefined,
  };
  const outcome = await retryWorker(
    async (model, temperature) => {
      return runWorker(node, worktreePath, systemPrompt, {
        model,
        apiKey: config.openrouterApiKey,
        temperature,
        onProgress: onWorkerProgress,
      });
    },
    retryConfig,
  );
</behavior>
```

---

## Task 1.5: Investigar compatibilidade OpenRouter no Pi SDK

**Tipo:** Pesquisa (sem código)

```xml
<context>
Leia obrigatoriamente antes de investigar:
- @docs/pi/pi-agent-nodejs.md — seção sobre providers, AuthStorage, ModelRegistry, getModel()
- @docs/pi/pi-agent-anatomia.md — seção sobre api-registry.ts, providers suportados, streamSimple() dispatch
- @docs/pi/pi-agent-sdk-vs-rpc.md — seção sobre autenticação multi-provider
</context>

<role>
Você é um pesquisador técnico investigando compatibilidade entre Pi SDK e OpenRouter.
</role>

<questions>
Responda com evidência dos docs:

1. O Pi SDK suporta "openrouter" como provider em getModel()?
   - Se sim: getModel("openrouter", "openai/gpt-4.1-mini") funciona?
   - Se não: qual é a alternativa?

2. É possível usar API key OpenRouter com provider direto?
   - Ex: getModel("openai", "gpt-4.1-mini") + authStorage.setRuntimeApiKey("openai", OPENROUTER_KEY)
   - Isso funcionaria se redirecionasse baseURL para openrouter.ai/api/v1?

3. O ModelRegistry suporta custom baseURL por provider?
   - Ex: redirecionar chamadas "openai" para openrouter.ai/api/v1

4. Qual é o approach recomendado pelos docs do Pi para multi-provider via proxy?

Retorne: abordagem recomendada com código de exemplo.
</questions>
```

---

## Task 2.1: Runner faz commit após agente completar

**Arquivo:** `src/agents/worker-runner.ts`
**Tipo:** Lógica de persistência

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @src/agents/worker-runner.ts — função runWorker (linhas 83-145), especialmente linhas 132-144 (getModifiedFiles → return)
- @src/git/git-wrapper.ts — função commit (linhas 146-160): faz git add -A + git commit + retorna CommitHash
- @docs/general/file-agent-patterns.md — métricas, minimal diffs, TSDoc
</context>

<role>
Você é um engenheiro corrigindo o bug onde mudanças dos workers evaporam por falta de commit.
</role>

<constraints>
- Importar commit de '../git/git-wrapper.js'
- Após getModifiedFiles(), se há mudanças, chamar commit() no worktree
- Mensagem de commit em conventional format: "feat(dag): {task truncada em 72 chars}"
- Se commit falha (ex: no_changes), commitHash fica null — merge será skippado pelo executor
- Substituir o hardcoded commitHash: null pelo valor real
- Não alterar nenhuma outra lógica do runner
- Max 10 linhas adicionais
</constraints>

<behavior>
Após linha 132 (const filesModified = await getModifiedFiles(worktreePath)):

1. Declarar let commitHash: string | null = null
2. Se filesModified.length > 0:
   a. const commitResult = await commit(worktreePath, `feat(dag): ${node.task.slice(0, 72)}`)
   b. Se commitResult.ok: commitHash = commitResult.value
3. No return (linhas 138-144): trocar commitHash: null por commitHash

Emitir log de progresso: emit('done', `Commit: ${commitHash?.slice(0, 7) ?? 'sem mudanças'}`)
</behavior>

<examples>
// Worker modifica 2 arquivos com sucesso:
// filesModified = ['src/format.ts', 'src/types.ts']
// commit() → ok('a1b2c3d...')
// return { nodeId: 'task-001', status: 'success', filesModified: [...], commitHash: 'a1b2c3d...', error: null }

// Worker falha sem modificar nada:
// filesModified = []
// commit() não é chamado
// return { nodeId: 'task-001', status: 'failure', filesModified: [], commitHash: null, error: 'timeout' }
</examples>
```

---

## Task 2.2: Atualizar prompt do worker (remover instrução de git add)

**Arquivo:** `src/prompts/worker.prompt.ts`
**Tipo:** Texto de prompt

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @src/prompts/worker.prompt.ts — buildAnthropicPrompt linha 76 e buildMarkdownPrompt linha 114
- @docs/general/prompt-engineering.md — instruções positivas superam negativas ("Use X" em vez de "NÃO use Y")
- @docs/general/file-agent-patterns.md — minimal diffs
</context>

<role>
Você é um engenheiro de prompts ajustando a instrução de git para refletir que o commit agora é automático.
</role>

<constraints>
- Alterar APENAS as linhas de instrução sobre git (1 linha em cada builder)
- Usar instrução positiva (dizer o que fazer, não o que não fazer)
- Manter todas as outras regras intactas
- Não alterar estrutura do prompt (sandwich method preservado)
</constraints>

<behavior>
Em buildAnthropicPrompt (linha 76), mudar:
  'Ao terminar: git add dos arquivos modificados. NAO faca commit.'
Para:
  'Ao terminar: salve todos os arquivos modificados no disco. O commit e merge serao feitos automaticamente pelo orquestrador.'

Em buildMarkdownPrompt (linha 114), mudar:
  '- Ao terminar: git add dos arquivos modificados. NAO faca commit.'
Para:
  '- Ao terminar: salve todos os arquivos modificados no disco. O commit e merge serao feitos automaticamente pelo orquestrador.'
</behavior>
```

---

## Task 2.3: Validar lógica de merge no executor para status partial

**Arquivo:** `src/pipeline/dag-executor.ts`
**Tipo:** Verificação + decisão de design

```xml
<context>
Leia obrigatoriamente antes de analisar:
- @src/pipeline/dag-executor.ts — executeNode (linhas 152-184), especialmente o bloco de merge (linhas 168-177) e o status check (linhas 164-166)
- @src/schemas/worker-result.schema.ts — WorkerStatus: success | failure | partial
- @docs/general/file-agent-patterns.md — responsabilidade única, clareza de intenção
</context>

<role>
Você é um engenheiro de confiabilidade revisando a lógica de merge do DAG executor.
</role>

<constraints>
- NÃO alterar a lógica existente se estiver correta
- Analisar e responder às seguintes perguntas com código se necessário
- Minimal diffs — apenas adicionar se houver gap real
</constraints>

<questions>
1. Com o fix da task 2.1, um worker 'partial' que produziu mudanças terá commitHash preenchido.
   O executor vai mergear essas mudanças parciais. Isso é desejado?
   - Se SIM: documentar com comentário explícito
   - Se NÃO: adicionar check de status !== 'partial' antes do merge

2. O executor marca 'partial' como 'completed' (não causa throw na linha 164-166).
   Isso está correto? O node aparecerá como "done" na UI mesmo com execução parcial.
   - Se queremos distinguir: criar status 'partial_completed' ou emitir evento diferente

3. O finally (linha 182) remove worktree incondicionalmente.
   Após o fix da task 2.1, o commit já persistiu as mudanças — então a remoção é segura.
   Confirmar que não há edge case onde o commit falha E o worktree é removido com dados não salvos.

Responda cada questão e implemente apenas mudanças necessárias (se houver).
</questions>
```

---

## Task 2.4: Adicionar logging de segurança no runner para cleanup

**Arquivo:** `src/agents/worker-runner.ts`
**Tipo:** Logging defensivo

```xml
<context>
Leia obrigatoriamente antes de implementar:
- @src/agents/worker-runner.ts — função runWorker, especificamente o bloco final de return (linhas 136-144) e emit de progresso (linha 136)
- @docs/general/file-agent-patterns.md — minimal diffs, comentar o porquê
</context>

<role>
Você é um engenheiro adicionando logging defensivo para detectar mudanças perdidas.
</role>

<constraints>
- Adicionar APENAS 1 emit extra antes do return final
- Se filesModified.length > 0 E commitHash é null: emitir warning via emit('error', ...)
- Não alterar nenhuma lógica — apenas observabilidade
- Max 5 linhas adicionais
</constraints>

<behavior>
Antes do return final (linha 138), adicionar:

if (filesModified.length > 0 && !commitHash) {
  emit('error', `AVISO: ${filesModified.length} arquivo(s) modificado(s) mas commit falhou — mudancas podem ser perdidas no cleanup do worktree`);
}

Porquê: se o commit falha (permissão, disco cheio) mas o agente produziu mudanças, o executor vai remover o worktree no finally e as mudanças serão perdidas. Este log permite diagnóstico.
</behavior>
```
