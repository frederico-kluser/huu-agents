# Guia definitivo de LangChain.js e LangGraph.js em produção

**LangChain.js atingiu a maturidade em 2025-2026.** Com o lançamento simultâneo do LangChain.js 1.0 e LangGraph.js 1.0 em outubro de 2025, o ecossistema JavaScript/TypeScript deixou de ser o "irmão menor" da versão Python e se tornou uma plataforma de produção completa. A API `createAgent` substituiu o antigo `AgentExecutor`, o sistema de middleware revolucionou a customização de agentes, e o LCEL consolidou-se como a forma canônica de compor pipelines. Mas entre a documentação oficial e o código que realmente funciona em produção, existe um abismo de dicas, workarounds e lições que só a comunidade acumulou. Este guia reúne as **20+ dicas mais impactantes** que desenvolvedores descobriram ao implantar sistemas baseados em LLMs com LangChain.js, cobrindo desde arquitetura até debugging, passando por truques de performance que reduzem custos em até 90%. A versão mais recente, **v1.2.13+** (janeiro de 2026), trouxe dynamic tools, recuperação de tool calls alucinadas e melhor sinalização de erros em streaming. Se você está construindo automação com LLMs em TypeScript, este é o mapa que a documentação oficial não oferece — mas que todo desenvolvedor em produção precisou descobrir.

## Quando usar LangChain.js puro versus migrar para LangGraph.js

A decisão arquitetural mais importante no ecossistema é entender os três níveis de abstração definidos pela equipe LangChain. O **LangChain.js** (via `createAgent`) é o "Agent Framework" — abstrações de alto nível para o loop padrão de agente (modelo → tools → resposta). O **LangGraph.js** é o "Agent Runtime" — orquestração de baixo nível para agentes stateful, duráveis e customizados. O **Deep Agents** é o "Agent Harness" — agente batteries-included com planejamento, sub-agentes e filesystem, desenvolvido TypeScript-first.

A regra prática é: **comece com `createAgent`** para shipping rápido. Se seu agente segue o loop padrão e você precisa apenas customizar comportamento via middleware (HITL, sumarização, redação de PII), o LangChain.js puro é suficiente. Migre para `StateGraph` do LangGraph quando precisar de **branching, loops, ciclos, ou checkpointing durável**. Um insight crucial é que `createAgent` já roda sobre o runtime do LangGraph internamente — a migração é gradual, não uma reescrita.

```typescript
// LangChain.js puro — suficiente para 80% dos casos [Estável, v1.0+]
import { createAgent } from "langchain";

const agent = createAgent({
  model: "openai:gpt-4.1",
  tools: [searchTool, calculatorTool],
  systemPrompt: "Você é um assistente de pesquisa.",
  middleware: [summarizationMiddleware({ trigger: { tokens: 4000 } })],
});

// LangGraph.js — quando precisa de controle total [Estável, v1.0+]
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";

const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(Array.isArray(right) ? right : [right]),
    default: () => [],
  }),
});

const graph = new StateGraph(StateAnnotation)
  .addNode("classify", classifyNode)
  .addNode("respond", respondNode)
  .addConditionalEdges("classify", routeByClassification)
  .addEdge("respond", END)
  .compile();
```

O **padrão de composição** funciona assim: chains LCEL para fluxos lineares (prompt → modelo → parser), graphs para fluxos com estado e decisões. Nodes de um LangGraph podem conter chains LCEL internamente — as duas abordagens se complementam, não competem.

### O sistema de middleware que mudou tudo

O middleware, introduzido no LangChain 1.0, é o conceito mais importante para desenvolvedores em produção. Ele intercepta o loop do agente em três pontos: **`beforeModel`** (antes de chamar o LLM), **`modifyModelRequest`** (modifica tools, prompt, mensagens por request) e **`afterModel`** (após a resposta). A execução é sequencial na ida e reversa na volta — idêntico a middleware de servidores web.

```typescript
// Middleware customizado com estado próprio [Estável, v1.0+]
import { createMiddleware, createAgent } from "langchain";
import * as z from "zod";

const callLimiterMiddleware = createMiddleware({
  name: "CallLimiter",
  stateSchema: z.object({ modelCallCount: z.number().default(0) }),
  beforeModel: (state) => {
    if (state.modelCallCount > 10) return { jumpTo: "end" };
    return;
  },
  afterModel: (state) => ({ modelCallCount: state.modelCallCount + 1 }),
});

const agent = createAgent({
  model: "anthropic:claude-sonnet-4-5",
  tools: TOOLS,
  middleware: [
    callLimiterMiddleware,
    summarizationMiddleware({ trigger: { tokens: 4000 }, keep: { messages: 20 } }),
    humanInTheLoopMiddleware({
      interruptOn: { send_email: { allowedDecisions: ["approve", "reject"] } },
    }),
  ],
});
```

Os middlewares built-in incluem: **human-in-the-loop**, **sumarização de conversas longas**, **redação de PII**, **prompt caching para Anthropic**, **limite de chamadas ao modelo**, **seletor de tools por LLM**, **retry de tools** e **fallback de modelo**. Este sistema eliminou a necessidade de grande parte do código boilerplate que antes era necessário.

### LCEL no JavaScript: a armadilha do pipe operator

A diferença mais sutil entre Python e JS no LCEL é que **JavaScript não tem o operador `|`**. Você deve usar `.pipe()` ou `RunnableSequence.from()`. Este é o erro #1 de desenvolvedores vindo de tutoriais Python.

```typescript
// ❌ ERRADO — não existe em JS
// const chain = prompt | model | parser;

// ✅ CORRETO — JS usa .pipe() [Estável, @langchain/core]
const chain = prompt.pipe(model).pipe(new StringOutputParser());

// ✅ ALTERNATIVA — com tipagem explícita
import { RunnableSequence } from "@langchain/core/runnables";
const chain = RunnableSequence.from<{ topic: string }, string>([
  prompt, model, new StringOutputParser()
]);
```

Para tipagem TypeScript correta, sempre use generics em `RunnableSequence.from<InputType, OutputType>()`. Versões antigas tinham conflitos de tipo entre `ChatPromptTemplate` e `RunnableLike` — mantenha os pacotes `@langchain/*` sincronizados na mesma versão de `@langchain/core`.

## Streaming, batching e truques que cortam latência pela metade

O sistema de streaming do LangGraph.js oferece **6 modos** que cobrem praticamente qualquer necessidade de UI: `values` (estado completo), `updates` (deltas), `custom` (dados do desenvolvedor), `messages` (tokens do LLM com metadata), `tools` (lifecycle de tools) e `debug`.

O truque mais poderoso para UIs responsivas é combinar múltiplos stream modes simultaneamente:

```typescript
// Streaming multi-modo para UI rica [Estável, LangGraph 1.0+]
for await (const [mode, chunk] of await graph.stream(
  { topic: "automação" },
  { streamMode: ["messages", "tools", "custom"] }
)) {
  if (mode === "messages") {
    const [messageChunk, metadata] = chunk;
    if (metadata.langgraph_node === "generator") {
      renderToken(messageChunk.content);
    }
  }
  if (mode === "tools") renderToolProgress(chunk);
  if (mode === "custom") renderCustomData(chunk);
}
```

Para **tools com progresso em tempo real**, use async generators — cada `yield` emite um evento de progresso:

```typescript
// Tool com streaming de progresso [Estável, v1.0+]
const searchFlights = tool(
  async function* (input) {
    const airlines = ["LATAM", "Gol", "Azul", "Avianca"];
    for (let i = 0; i < airlines.length; i++) {
      await new Promise((r) => setTimeout(r, 500));
      yield { message: `Buscando ${airlines[i]}...`, progress: (i + 1) / airlines.length };
    }
    return JSON.stringify({ flights: [/* resultados */] });
  },
  { name: "search_flights", schema: z.object({ destination: z.string(), date: z.string() }) }
);
```

Para **batching com controle de concorrência**, sempre passe `maxConcurrency` no config do batch, não no modelo — um bug conhecido (Issue #3440) faz com que `LLMChain.batch()` ignore configurações do modelo:

```typescript
// ✅ CORRETO — maxConcurrency no config [Workaround para bug]
const results = await chain.batch(inputs, { maxConcurrency: 3 });
```

O **prompt caching da Anthropic** reduz latência em até **80%** e custos em até **90%** em porções cacheadas. O middleware dedicado no LangChain 1.0 simplifica a configuração:

```typescript
// Prompt caching Anthropic via middleware [Estável, v1.0+] [JS-específico: middleware]
import { createAgent, anthropicPromptCachingMiddleware } from "langchain";

const agent = createAgent({
  model: "claude-sonnet-4-5-20250929",
  prompt: "<seu system prompt longo aqui>",
  middleware: [anthropicPromptCachingMiddleware({ ttl: "5m" })],
});
```

Para **execução paralela de nós** no LangGraph, simplesmente adicione edges do START para múltiplos nós — eles rodam concorrentemente sem configuração extra. E use `AbortController` nativo do JS para timeouts:

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 10000); // 10s timeout
await model.invoke(messages, { signal: controller.signal });
```

### Gerenciamento de memória: abandone BufferMemory

A abordagem moderna para conversas longas é o `summarizationMiddleware`, não as classes legadas de memória:

| Abordagem | Custo de Tokens | Uso Recomendado | Status |
|-----------|----------------|-----------------|--------|
| `BufferMemory` | Cresce linearmente | Conversas curtas | Legado (`@langchain/classic`) |
| `ConversationBufferWindowMemory` | Janela fixa | Conversas médias | Legado |
| `ConversationSummaryBufferMemory` | Híbrido | Produção (pré-1.0) | Legado |
| **`summarizationMiddleware`** | **Adaptativo** | **Produção (1.0+)** | **[Estável, v1.0+]** |

O middleware aceita triggers por tokens, mensagens ou fração da janela de contexto, e preserva pares AI/tool durante a sumarização.

## Structured output: o guia completo para respostas JSON confiáveis

LangChain 1.0 introduziu duas estratégias distintas para structured output, e entender quando usar cada uma é crítico.

A **`providerStrategy`** usa enforcement nativo de JSON Schema do provider (OpenAI, Grok, Gemini) — é a mais confiável quando disponível, pois a validação acontece no servidor. A **`toolStrategy`** funciona com **todos** os modelos que suportam tool calling, usando uma tool adicional para capturar o output estruturado — tem retry inteligente built-in.

```typescript
// providerStrategy — máxima confiabilidade [Estável, v1.0+]
import { createAgent, providerStrategy, toolStrategy } from "langchain";
import * as z from "zod";

const ContactInfo = z.object({
  name: z.string().describe("Nome completo da pessoa"),
  email: z.string().describe("Endereço de email"),
  phone: z.string().describe("Número de telefone"),
});

// OpenAI/Gemini: usar providerStrategy (enforcement no servidor)
const agent1 = createAgent({
  model: "gpt-4.1",
  responseFormat: providerStrategy(ContactInfo),
});

// Qualquer modelo com tool calling: usar toolStrategy (retry automático)
const agent2 = createAgent({
  model: "anthropic:claude-sonnet-4-5",
  responseFormat: toolStrategy(ContactInfo),
});

// Auto-detecção: passe schema direto, LangChain escolhe a melhor estratégia
const agent3 = createAgent({
  model: "gpt-4.1",
  responseFormat: ContactInfo, // auto-seleciona providerStrategy se suportado
});
```

| Feature | `toolStrategy` | `providerStrategy` |
|---------|---------------|-------------------|
| Mecanismo | Tool call adicional | JSON Schema nativo do provider |
| Confiabilidade | Alta (com retry) | Máxima (server-enforced) |
| Modelos suportados | Todos com tool calling | OpenAI, Grok, Gemini |
| Union types | ✅ Múltiplos schemas | ❌ Schema único |
| Custom error handling | ✅ `handleError` | ❌ |

O **retry inteligente** da `toolStrategy` é especialmente valioso: se o modelo retorna `rating: 10` quando o schema exige `max: 5`, o agente automaticamente envia uma `ToolMessage` com o erro de validação e o modelo corrige na próxima tentativa.

### Zod schemas: as armadilhas que ninguém menciona

Sempre use `.describe()` em **todos** os campos — os modelos usam as descrições para entender o output esperado. Use `zod/v4` para features mais recentes (`import { z } from "zod/v4"`). A armadilha mais crítica (Issue #6479) é que a conversão Zod→JSON Schema do LangChain usa **referências relativas** que a API da OpenAI com `strict: true` não suporta. **Workaround**: mantenha schemas simples e evite reusar sub-schemas via `$ref`. Nas versões 1.0+ isso foi melhorado, mas schemas profundamente aninhados ainda aumentam a taxa de falha.

## Tools e agentes: patterns que sobrevivem à produção

Definir tools que o LLM realmente consegue usar bem exige disciplina. Use **`snake_case`** para nomes (alguns providers rejeitam espaços), escreva descriptions que descrevam a **capacidade** (não apenas a função), e mantenha schemas Zod simples com `.describe()` em cada parâmetro.

```typescript
// Tool bem definida [Estável, v1.0+]
import { tool } from "langchain";
import { z } from "zod";

const searchDatabase = tool(
  async ({ query, limit }) => {
    const results = await db.search(query, limit);
    return JSON.stringify(results);
  },
  {
    name: "search_database",
    description: "Busca registros no banco de dados de clientes que correspondam à query.",
    schema: z.object({
      query: z.string().describe("Termos de busca"),
      limit: z.number().describe("Número máximo de resultados").default(10),
    }),
  }
);
```

### O limite de ~50 tools e como contorná-lo

Acima de **50 tools**, LLMs começam a fazer seleções ruins e alucinar nomes de tools. As definições consomem tokens do contexto, e o overflow é silencioso. Três workarounds funcionam em produção:

1. **Filtragem dinâmica via middleware** — exponha apenas tools relevantes baseado no estágio da conversa ou role do usuário
2. **Agentes hierárquicos** — distribua tools entre sub-agentes especializados (~10-15 tools cada)
3. **Tool search da Anthropic** (v1.3.0+) — o modelo busca entre tools disponíveis em vez de receber todas de uma vez

```typescript
// Filtragem dinâmica de tools [Estável, v1.0+]
const dynamicTools = createMiddleware({
  name: "DynamicTools",
  wrapModelCall: (request, handler) => {
    const isAuth = request.state.authenticated ?? false;
    const filtered = isAuth
      ? request.tools
      : request.tools.filter((t) => t.name.startsWith("public_"));
    return handler({ ...request, tools: filtered });
  },
});
```

### MCP: o protocolo que unifica tudo

A integração MCP (Model Context Protocol) via `@langchain/mcp-adapters` (v0.6.0) transforma qualquer servidor MCP em tools LangChain padrão, usáveis tanto em `createAgent` quanto em LangGraph:

```typescript
// MCP multi-servidor [Estável, @langchain/mcp-adapters v0.6.0]
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent } from "langchain";

const client = new MultiServerMCPClient({
  useStandardContentBlocks: true,
  mcpServers: {
    math: { transport: "stdio", command: "node", args: ["/path/to/math_server.js"],
            restart: { enabled: true, maxAttempts: 3, delayMs: 1000 } },
    weather: { transport: "http", url: "http://localhost:8000/mcp" },
  },
});

const tools = await client.getTools();
const agent = createAgent({ model: "openai:gpt-4.1", tools });
```

### Human-in-the-loop com interrupt/resume

O padrão `interrupt()` + `Command(resume=...)` do LangGraph é production-ready e permite pausar a execução por tempo indeterminado sem consumir recursos:

```typescript
// HITL com interrupt [Estável, LangGraph v1.0+]
import { interrupt, Command } from "@langchain/langgraph";

function approvalNode(state) {
  const isApproved = interrupt({
    question: "Aprovar envio do email?",
    details: state.emailDraft,
  });
  return isApproved
    ? new Command({ goto: "sendEmail" })
    : new Command({ goto: "cancel" });
}

// Para retomar (pode ser dias depois, em outra máquina):
await graph.invoke(new Command({ resume: true }), { configurable: { thread_id: "t1" } });
```

Regra crítica: mantenha chamadas `interrupt()` na mesma ordem entre execuções do nó. Nunca pule condicionalmente um `interrupt` dentro de um nó — múltiplos interrupts são matched por índice.

## RAG que funciona no ecossistema JavaScript

### Document loaders: o que funciona e o que não funciona

| Loader | Estabilidade | Problemas Conhecidos |
|--------|-------------|---------------------|
| `TextLoader`, `CSVLoader`, `JSONLoader` | ⭐⭐⭐⭐⭐ | Nenhum significativo |
| `WebBaseLoader` (Cheerio) | ⭐⭐⭐⭐ | Bem adequado para Node.js |
| `GithubRepoLoader` | ⭐⭐⭐⭐ | Funciona bem para repos de código |
| **`PDFLoader`** | ⭐⭐ | **Dynamic imports quebram em Windows, bundlers, Jest** (Issue #7469). Pin `pdf-parse@1.1.1` ou use Unstructured API |
| `DocxLoader` | ⭐⭐ | Falhas silenciosas em alguns DOCX. Use `officeparser` como alternativa |

### Configuração ótima de text splitters

O **`RecursiveCharacterTextSplitter`** é o padrão recomendado. A configuração **chunkSize: 500-1000** com **chunkOverlap: 200** é o sweet spot para a maioria das aplicações RAG. Para QA factual, reduza para 200-400; para sumarização, aumente para 1000-2000.

```typescript
// Configuração ótima para RAG geral [Estável, @langchain/textsplitters]
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 800,
  chunkOverlap: 200,
  separators: ["\n\n", "\n", " ", ""],
});
```

### Vector stores: ranking de estabilidade em JS

**Tier 1** (pacotes dedicados, máxima estabilidade): **Pinecone** (`@langchain/pinecone`) e **Qdrant** (`@langchain/qdrant`) lideram em maturidade, com suporte completo a MMR e metadata filtering. **Tier 2** (community package): **Supabase** se destaca pela melhor implementação de **hybrid search** nativa em JS, combinando pgvector + Full-Text Search do PostgreSQL. **pgvector** (`@langchain/community`) é excelente para stacks Postgres existentes.

Um aviso crítico: **todos os pacotes `@langchain/*` devem usar a mesma versão de `@langchain/core`**. Use `resolutions` (Yarn), `overrides` (npm) ou `pnpm.overrides` para forçar isso — versões conflitantes causam erros runtime sutis.

### RAG com reranking usando Cohere

```typescript
// RAG pipeline completa com reranking [Estável, @langchain/cohere]
import { CohereRerank } from "@langchain/cohere";
import { ContextualCompressionRetriever } from "langchain/retrievers/contextual_compression";

const reranker = new CohereRerank({
  apiKey: process.env.COHERE_API_KEY,
  model: "rerank-multilingual-v3.0",
  topN: 5,
});

const retriever = new ContextualCompressionRetriever({
  baseCompressor: reranker,
  baseRetriever: vectorStore.asRetriever({ k: 20 }),
});

const ragChain = RunnableSequence.from([
  { context: retriever.pipe(formatDocumentsAsString), question: new RunnablePassthrough() },
  prompt,
  llm,
  new StringOutputParser(),
]);
```

## LangSmith e o padrão "traces viram evals"

Configure LangSmith com variáveis de ambiente — uma vez setadas, **toda operação LangChain.js é automaticamente rastreada** sem código adicional:

```bash
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=<sua-chave>
LANGSMITH_PROJECT="meu-projeto"
```

Em ambientes serverless (Lambda, Workers), callbacks são backgrounded por padrão desde v0.3.0. Use `LANGCHAIN_CALLBACKS_BACKGROUND=false` ou `awaitAllCallbacks` para garantir flush dos traces antes do exit.

O padrão mais valioso em produção é **"traces become evals"**: capture traces de produção com LangSmith → selecione runs interessantes ou problemáticas para um dataset → use LLM-as-judge para labels iniciais → refine com anotação humana → rode experimentos comparando prompts, modelos ou arquiteturas contra esse dataset curado. Isso cria um **ciclo virtuoso**: produção → traces → datasets → evals → melhorias → produção.

Para rastreamento de custos, use `usage_metadata` nas respostas e callbacks customizados:

```typescript
// Tracking de custos em produção [Estável, @langchain/core]
const response = await model.invoke(messages);
console.log(response.usage_metadata);
// { input_tokens: 50, output_tokens: 120, total_tokens: 170 }
```

## Catálogo de anti-patterns com correções

### Erros de importação — o problema mais frustrante

O ecossistema `@langchain/*` é genuinamente confuso. Os problemas mais comuns:

```typescript
// ❌ ERRADO — path não exportado (v1.0+)
import { ChatOpenAI } from "langchain/chat_models";

// ✅ CORRETO — pacote scoped
import { ChatOpenAI } from "@langchain/openai";

// ❌ ERRADO — chains legadas no pacote principal (v1.0+)
import { LLMChain } from "langchain/chains";

// ✅ CORRETO — movido para @langchain/classic
import { LLMChain } from "@langchain/classic/chains";

// ✅ MELHOR — use a API moderna
import { createAgent } from "langchain";
```

Conflitos ESM/CJS (Issues #4060, #4645): LangChain.js é ESM. Com `"module": "Node16"` no tsconfig, imports produzem `require()` que falha em módulos ESM. **Workaround**: use `"module": "CommonJS"` no tsconfig ou migre para ESM com `"type": "module"` no package.json.

### Quando LangChain.js é overhead desnecessário

A comunidade tem um consenso claro: para **chatbots simples** ou **RAG básico** sem multi-modelo, o SDK nativo (OpenAI, Anthropic) + `fetch` é mais leve e fácil de debugar. LangChain.js brilha quando você precisa de **provider optionality** (trocar modelos sem reescrever), **workflows complexos com branching**, ou **observability integrada com LangSmith**. O MUFG Bank demonstrou o padrão ideal: prototipar em Python/LangChain para velocidade, migrar para TypeScript/LangChain.js com Next.js para produção.

### Vulnerabilidade de segurança crítica

**CVE-2025-68665** (dezembro 2025, CVSS 8.6): injeção de serialização no `toJSON()` — a chave 'lc' não era escapada, permitindo que dados controlados pelo atacante fossem tratados como objetos LangChain legítimos. **Corrigido em `@langchain/core` 1.1.8 / 0.3.80 e `langchain` 1.2.3.** Verifique sua versão imediatamente.

## Dicas específicas por provider

| Provider | Modelo | Structured Output | Tool Calling | Prompt Caching | Dica Principal |
|----------|--------|-------------------|-------------|----------------|----------------|
| **OpenAI** | GPT-4.1 | `providerStrategy` (nativo) | ✅ Nativo | Automático (sem config) | Use `json_schema` com constrained decoding para máxima confiabilidade |
| **Anthropic** | Claude Sonnet 4.5 | `toolStrategy` | ✅ Nativo | `anthropicPromptCachingMiddleware` | Extended thinking: `thinking: { type: "enabled", budget_tokens: 2000 }` |
| **Google** | Gemini | `providerStrategy` | ✅ Nativo | — | Aproveite janelas de contexto gigantes para RAG denso |
| **DeepSeek** | R1 / V3 | ❌ R1 / ✅ V3 | ❌ R1 / ✅ V3 | — | **R1 não suporta tool calling** — use V3 (`deepseek-chat`) para tools |
| **Ollama** | Vários | Via `OllamaFunctions` | Parcial | — | `withStructuredOutput` não suporta todos os modelos; use function calling wrapper |

Para **Anthropic com extended thinking**:

```typescript
// Extended thinking com Claude [Estável, @langchain/anthropic]
import { ChatAnthropic } from "@langchain/anthropic";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-5-20250929",
  maxTokens: 5000,
  thinking: { type: "enabled", budget_tokens: 2000 },
});
```

Para **DeepSeek local via Ollama**:

```typescript
// DeepSeek via Ollama [Estável, @langchain/ollama]
import { ChatOllama } from "@langchain/ollama";

const model = new ChatOllama({
  model: "deepseek-r1:7b",
  temperature: 0.8,
  baseUrl: "http://localhost:11434",
  streaming: true,
});
```

## Recursos da comunidade que valem seu tempo

O **Chat LangChain** (chat.langchain.com) é subestimado — permite conversar diretamente com a documentação para encontrar imports corretos e entender conceitos rapidamente. O **LangGraph Studio v2**, lançado no Interrupt 2025, oferece debugging visual de agentes com pull-down de traces.

Dos case studies, três lições se destacam: o **MUFG Bank** reduziu criação de apresentações de horas para 3-5 minutos com RAG sobre relatórios anuais de 100-200 páginas. A **C.H. Robinson** automatiza 5.500 pedidos/dia (600+ horas economizadas) processando 15.000 emails com formatação inconsistente via LangGraph. A **Morningstar** foi de ideia a produção em menos de 60 dias com um time de 5 pessoas, alcançando 30% de economia de tempo para 3.000 usuários internos.

A conferência **Interrupt 2025** (800+ participantes) consolidou o conceito de "Agent Engineer" como nova disciplina e lançou o LangGraph Platform GA, Open Agent Platform e LangSmith com métricas específicas para agentes.

## Cheatsheet: as 20 dicas mais importantes

1. **Comece com `createAgent`, não `StateGraph`** — migre para LangGraph apenas quando precisar de branching/loops
2. **Use `.pipe()` em JS**, não `|` — o operador pipe não existe em JavaScript
3. **Todos os pacotes `@langchain/*` devem compartilhar a mesma versão de `@langchain/core`** — use overrides no package.json
4. **`summarizationMiddleware` substitui BufferMemory** — trigger por tokens, mensagens ou fração do contexto
5. **`providerStrategy` para OpenAI/Gemini, `toolStrategy` para todo o resto** — ou passe schema direto para auto-detecção
6. **Sempre use `.describe()` nos campos Zod** — modelos usam as descrições para gerar output correto
7. **`anthropicPromptCachingMiddleware` reduz latência em 80% e custos em 90%** para prompts longos
8. **Limite tools a ~15-20 por agente** — acima de 50, LLMs começam a alucinar nomes
9. **`maxConcurrency` no config do batch, não no modelo** — workaround para bug #3440
10. **`LANGCHAIN_CALLBACKS_BACKGROUND=false` em serverless** — garante flush de traces antes do exit
11. **Pin `pdf-parse@1.1.1`** — versões mais novas quebram em Windows e bundlers
12. **`RecursiveCharacterTextSplitter` com chunkSize 500-1000, overlap 200** — sweet spot para RAG
13. **Supabase para hybrid search em JS** — implementação mais madura de busca semântica + keyword
14. **Middleware HITL > `interruptBefore` manual** — `humanInTheLoopMiddleware` é mais limpo que interrupt raw
15. **DeepSeek-R1 não suporta tool calling** — use V3 (`deepseek-chat`) para tools e structured output
16. **Atualize `@langchain/core` para ≥1.1.8** — corrige CVE-2025-68665 (injeção de serialização, CVSS 8.6)
17. **`AbortController` nativo para timeouts** — passe `signal` no config de qualquer `invoke()`
18. **"Traces become evals"** — salve traces problemáticas como datasets no LangSmith para criar ciclo de melhoria contínua
19. **`handleToolErrors: true` no ToolNode** — retorna erro como ToolMessage em vez de crashar o agente
20. **Para projetos novos: `langchain` + `@langchain/core` + `@langchain/langgraph`** — esqueça `@langchain/classic` a menos que esteja migrando código legado

---

*Este guia reflete o estado do ecossistema LangChain.js em março de 2026. As versões de referência são LangChain.js v1.2.13+, LangGraph.js 1.0+, e @langchain/mcp-adapters v0.6.0. Fontes primárias incluem a documentação oficial em docs.langchain.com, o blog da LangChain (blog.langchain.com), repositórios GitHub langchain-ai/langchainjs e langchain-ai/langgraphjs, case studies oficiais (MUFG Bank, C.H. Robinson, Morningstar), posts técnicos de Swarnendu De e Aishwarya Srinivasan, e talks da conferência Interrupt 2025.*