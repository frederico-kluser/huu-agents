# ReAct para desenvolvedores LangChain.js: o guia técnico definitivo

---

## 1. Resumo executivo técnico

O padrão **ReAct (Reasoning + Acting)** é a arquitetura fundacional por trás de praticamente todo agente LLM moderno. Introduzido por Yao et al. (Princeton/Google Brain) no paper canônico publicado no ICLR 2023 [1], ReAct resolve um problema central da engenharia de agentes: permitir que um modelo de linguagem **intercale raciocínio explícito com ações concretas** em um loop iterativo do tipo Thought→Action→Observation. Em vez de gerar uma resposta de uma só vez (como Chain-of-Thought) ou executar ações cegas (como acting-only), o modelo pensa sobre o que precisa fazer, executa uma ação via tool call, observa o resultado, e decide o próximo passo.

Para desenvolvedores TypeScript usando **LangChain.js v0.3+**, ReAct não é conceito abstrato — é o mecanismo que roda dentro de `createReactAgent` do `@langchain/langgraph/prebuilt`, dentro do `AgentExecutor` legado, e que pode ser implementado manualmente com **`bindTools()`**, **`ToolMessage`** e um loop `while`. Compreender a mecânica interna do ciclo ReAct transforma o desenvolvedor de consumidor de abstrações em arquiteto de agentes: permite diagnosticar loops infinitos, otimizar custo de tokens, escolher entre implementação manual e frameworks, e tomar decisões informadas sobre quando um agente é a solução correta versus um chain LCEL determinístico ou um pipeline RAG.

A tese central deste material é direta: **todo desenvolvedor que constrói agentes com LangChain.js precisa entender o loop ReAct no nível do `while`/`tool_calls`/`ToolMessage`**, mesmo que em produção utilize `createReactAgent` do LangGraph. As abstrações falham, os traces ficam opacos, e o debugging se torna impossível sem esse entendimento. Este documento fornece essa base — do paper original ao código TypeScript funcional, das primitivas de API aos anti-patterns em produção.

**Rating de confiança global:** [ALTO — baseado em paper canônico + documentação oficial LangChain.js v0.3]

---

## 2. Fundamentos teóricos do ReAct

**Rating de confiança: [ALTO — paper canônico, ICLR 2023]**

### O paper que definiu a arquitetura de agentes moderna

O paper "ReAct: Synergizing Reasoning and Acting in Language Models" [1], de Shunyu Yao (Princeton), Jeffrey Zhao, Dian Yu, Nan Du, Izhak Shafran (Google Brain) e Karthik Narasimhan (Princeton), Yuan Cao (Google Brain), foi publicado como conference paper no **ICLR 2023**. A ideia central é surpreendentemente simples: aumentar o espaço de ações de um agente LLM para incluir "pensamentos" em linguagem natural que **não afetam o ambiente externo** mas atualizam o contexto interno do modelo para guiar ações futuras.

Formalmente, dado um agente interagindo com um ambiente, no timestep *t* o agente recebe observação *oₜ* e toma ação *aₜ* seguindo a política π(aₜ|cₜ). **ReAct aumenta o espaço de ações de A para  = A ∪ L**, onde L é o espaço de linguagem. Uma ação âₜ ∈ L (um "thought") não afeta o ambiente externo e portanto não gera observação — apenas atualiza o contexto para suportar raciocínio futuro.

A inspiração vem da ciência cognitiva: Vygotsky (1987) e Luria (1965) demonstraram que raciocínio verbal permite auto-regulação e estratégia em humanos. O paper traduz isso para LLMs: **reasoning guia acting, e acting informa reasoning**.

### O ciclo Thought→Action→Observation com exemplo do paper

O exemplo canônico do paper usa HotpotQA (multi-hop QA sobre Wikipedia):

```
Question: Aside from the Apple Remote, what other device can control
the program Apple Remote was originally designed to interact with?

Thought 1: I need to search Apple Remote and find the program it was
           originally designed to interact with.
Action 1:  Search[Apple Remote]
Observation 1: The Apple Remote is a remote control introduced in
               October 2005 by Apple... originally designed to
               control the Front Row media center program...

Thought 2: Apple Remote was originally designed to control Front Row.
           I need to search Front Row next.
Action 2:  Search[Front Row]
Observation 2: Could not find [Front Row]. Similar: [Front Row (software)...]

Thought 3: Front Row is not found. I need to search Front Row (software).
Action 3:  Search[Front Row (software)]
Observation 3: Front Row is a discontinued media center software...

Thought 4: Front Row (software) is controlled by an Apple Remote or
           the keyboard function keys. So the answer is keyboard
           function keys.
Action 4:  Finish[keyboard function keys]
```

O paper identifica **oito tipos de pensamentos úteis**: decomposição de objetivos, extração de informação de observações, raciocínio aritmético/senso comum, reformulação de buscas, tracking de progresso, tratamento de exceções, síntese de respostas finais, e injeção de conhecimento contextual.

### Diagrama textual do ciclo ReAct

```
┌─────────────────────────────────────────────────────────┐
│                    LOOP ReAct                           │
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌─────────────────┐   │
│  │ THOUGHT  │───▶│  ACTION  │───▶│  OBSERVATION    │   │
│  │ (reason) │    │ (tool    │    │  (tool output / │   │
│  │          │    │  call)   │    │   environment)  │   │
│  └──────────┘    └──────────┘    └────────┬────────┘   │
│       ▲                                    │            │
│       │          ┌──────────┐              │            │
│       └──────────│ CONTEXTO │◀─────────────┘            │
│                  │ ATUALIZ. │                           │
│                  └──────────┘                           │
│                                                         │
│  Condição de parada: Action = Finish[resposta]          │
│  ou max_iterations atingido                             │
└─────────────────────────────────────────────────────────┘
```

Na implementação moderna com tool calling, o "Thought" está implícito no raciocínio interno do modelo (ou no campo `content` do `AIMessage`), o "Action" é um `tool_call` no response, e o "Observation" é o `ToolMessage` reinjetado na conversa.

### Diferença formal entre ReAct e Chain-of-Thought (CoT)

A distinção é estrutural e não meramente de grau. **CoT é um sistema fechado**: o modelo usa exclusivamente representações internas para gerar pensamentos e respostas, sem interface com o mundo externo. **ReAct é um sistema aberto**: intercala raciocínio com ações que buscam informação externa.

| Dimensão | CoT (Reason Only) | ReAct (Reason + Act) |
|---|---|---|
| Espaço de ações | Apenas linguagem (L) | A ∪ L (ações + linguagem) |
| Grounding externo | Nenhum — somente conhecimento interno | Interface com ambientes, APIs, bases de dados |
| Fonte de conhecimento | Interna (parametric knowledge) | Interna + externa (retrieval dinâmico) |
| Tipo de sistema | Fechado | Aberto com feedback ambiental |
| Taxa de alucinação (HotpotQA) | **56% dos failures** são alucinação | **0% dos failures** são alucinação |
| Falsos positivos (HotpotQA) | 14% dos acertos usam fatos alucinados | 6% dos acertos usam fatos alucinados |

Como o paper afirma: *"This 'chain-of-thought' reasoning is a static black box, in that the model uses its own internal representations to generate thoughts and is not grounded in the external world, which limits its ability to reason reactively or update its knowledge."* [1]

O resultado prático: **CoT alucina mais porque não pode verificar seus próprios pensamentos contra dados reais**. ReAct reduz alucinação a zero nos casos de falha no HotpotQA, ao custo de maior taxa de erros de busca (23% dos failures são "search result errors").

### Diferença entre ReAct e RAG

A confusão entre ReAct e RAG é comum mas a distinção é precisa:

**RAG (Retrieval-Augmented Generation)** recupera informação **antes** da geração, tipicamente via similaridade vetorial em um passo único e determinístico: query → embedding → vector search → contexto → LLM → resposta. O retrieval é pré-geração e não-iterativo.

**ReAct** busca informação **durante** a geração, via tool calls arbitrários em um loop iterativo e não-determinístico. O agente decide dinamicamente quais ferramentas chamar, com quais argumentos, e quantas vezes — podendo reformular buscas, combinar resultados de múltiplas fontes, e ajustar a estratégia baseado no que encontra.

| Dimensão | RAG | ReAct |
|---|---|---|
| Quando busca informação | Antes da geração (pré-prompt) | Durante a geração (iterativo) |
| Mecanismo de busca | Similaridade vetorial (embedding) | Tool calls arbitrários definidos pelo modelo |
| Número de buscas | Tipicamente 1 (ou k fixo) | Dinâmico — decidido pelo modelo |
| Tipo de decisão | Determinístico | Probabilístico (modelo decide) |
| Complexidade de raciocínio | Baixa (retrieve + generate) | Alta (multi-step reasoning + acting) |
| Custo de tokens | Previsível | Variável (proporcional a iterações) |

Na prática, ReAct pode **usar** retrieval como uma de suas tools. Um agente ReAct que tem uma tool `search_vector_db()` está fazendo RAG como parte de um fluxo mais amplo de raciocínio — a distinção não é excludente, mas de escopo.

### Resultados que validam o padrão

Nos benchmarks do paper com PaLM-540B: ReAct atingiu **60.9%** de acurácia no FEVER (vs 56.3% do CoT) e **71% de success rate** no ALFWorld (vs 45% do Act-only). A combinação ReAct → CoT-SC produziu o melhor resultado absoluto: **35.1 EM** no HotpotQA e **64.6%** no FEVER. O padrão demonstrou robustez cross-model: GPT-3 (text-davinci-002) consistentemente superou PaLM-540B em HotpotQA e ALFWorld, confirmando que ReAct funciona independentemente do modelo base.

---

## 3. Anatomia de uma implementação ReAct manual em TypeScript + LangChain.js

**Rating de confiança: [MÉDIO — documentação oficial + patterns verificados em API reference]**

A implementação manual do loop ReAct sem LangGraph é o exercício mais instrutivo para entender a mecânica. Abaixo, um código TypeScript **completo e funcional** usando exclusivamente primitivas de `@langchain/core` e `@langchain/openai`, compatível com LangChain.js v0.3+.

### Implementação completa do loop ReAct

```typescript
// ============================================================
// ReAct Loop Manual — LangChain.js v0.3+
// Sem LangGraph, sem AgentExecutor, sem createReactAgent
// ============================================================

// --- Imports com paths verificados para @langchain/core v0.3+ ---
// Docs: https://v03.api.js.langchain.com/classes/_langchain_core.messages.HumanMessage.html
import {
  HumanMessage,
  AIMessage,
  ToolMessage,
  SystemMessage,
  BaseMessage,
} from "@langchain/core/messages";

// Docs: https://v03.api.js.langchain.com/functions/_langchain_core.tools.tool-1.html
import { tool } from "@langchain/core/tools";

// Docs: https://v03.api.js.langchain.com/classes/_langchain_openai.ChatOpenAI.html
import { ChatOpenAI } from "@langchain/openai";

// Zod v3 (NÃO v4 — ver seção de pitfalls)
import { z } from "zod";

// --- Step 1: Definir tools com schemas Zod ---
// Cada tool tem name, description, schema (Zod), e handler async
const searchWeb = tool(
  async ({ query }: { query: string }): Promise<string> => {
    // Simulação — em produção, chamar API real
    const results: Record<string, string> = {
      "população brasil 2025": "A população do Brasil em 2025 é estimada em 214 milhões.",
      "capital australia": "A capital da Austrália é Canberra, não Sydney.",
      "PIB japão": "O PIB do Japão em 2024 foi de aproximadamente 4.2 trilhões USD.",
    };
    const key = Object.keys(results).find((k) =>
      query.toLowerCase().includes(k)
    );
    return key
      ? results[key]
      : `Nenhum resultado encontrado para: "${query}"`;
  },
  {
    name: "search_web",
    description:
      "Busca informações na web. Use para encontrar dados factuais atualizados.",
    schema: z.object({
      query: z.string().describe("Termo de busca para pesquisar na web"),
    }),
  }
);

const calculator = tool(
  async ({
    expression,
  }: {
    expression: string;
  }): Promise<string> => {
    try {
      // Avaliação segura — em produção usar math.js ou similar
      const sanitized = expression.replace(/[^0-9+\-*/().% ]/g, "");
      const result = Function(`"use strict"; return (${sanitized})`)();
      return `Resultado: ${result}`;
    } catch {
      return `Erro: expressão inválida "${expression}"`;
    }
  },
  {
    name: "calculator",
    description:
      "Calcula expressões matemáticas. Aceita operações básicas (+, -, *, /).",
    schema: z.object({
      expression: z
        .string()
        .describe("Expressão matemática para calcular, ex: '2 + 2'"),
    }),
  }
);

// --- Step 2: Mapear tools por nome para lookup rápido ---
const tools = [searchWeb, calculator];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

// --- Step 3: Criar modelo com tools bound ---
// bindTools() retorna um novo Runnable que inclui as definições das tools
// no request ao provider. O modelo decide quando/se chamar tools.
const model = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0,
}).bindTools(tools);

// --- Step 4: Configurações do loop ---
const MAX_ITERATIONS = 10;
const SYSTEM_PROMPT = `Você é um assistente que responde perguntas com precisão.
Use as tools disponíveis para buscar informações antes de responder.
Sempre verifique os dados antes de dar uma resposta final.`;

// --- Step 5: Loop ReAct principal ---
async function reactLoop(userQuery: string): Promise<{
  finalAnswer: string;
  iterations: number;
  messages: BaseMessage[];
}> {
  // Inicializar histórico de mensagens
  const messages: BaseMessage[] = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(userQuery),
  ];

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    console.log(`\n--- Iteração ${iterations} ---`);

    // THOUGHT + ACTION: Invocar o modelo
    // O modelo retorna AIMessage que pode conter:
    //   - content (texto): o "Thought" e/ou resposta final
    //   - tool_calls (array): os "Actions" a executar
    const response: AIMessage = (await model.invoke(messages)) as AIMessage;
    messages.push(response);

    // Log do pensamento do modelo (se houver content)
    if (response.content) {
      console.log(`  Thought: ${response.content}`);
    }

    // CONDIÇÃO DE PARADA: Se não há tool_calls, o modelo decidiu
    // que tem informação suficiente para responder
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log(`  ✅ Resposta final (sem mais tool calls)`);
      return {
        finalAnswer: response.content as string,
        iterations,
        messages,
      };
    }

    // OBSERVATION: Executar cada tool call e reinjetar como ToolMessage
    for (const toolCall of response.tool_calls) {
      console.log(
        `  Action: ${toolCall.name}(${JSON.stringify(toolCall.args)})`
      );

      const selectedTool = toolMap[toolCall.name];

      if (!selectedTool) {
        // TOOL HALLUCINATION: modelo inventou uma tool que não existe
        console.warn(`  ⚠️ Tool desconhecida: "${toolCall.name}"`);
        messages.push(
          new ToolMessage({
            tool_call_id: toolCall.id!,
            content: `Erro: a tool "${toolCall.name}" não existe. Tools disponíveis: ${Object.keys(toolMap).join(", ")}`,
          })
        );
        continue;
      }

      try {
        // Executar a tool com os argumentos do modelo
        const toolOutput = await selectedTool.invoke(toolCall.args);
        console.log(`  Observation: ${toolOutput}`);

        // Criar ToolMessage com o resultado
        // tool_call_id DEVE corresponder ao id do tool_call original
        messages.push(
          new ToolMessage({
            tool_call_id: toolCall.id!,
            content:
              typeof toolOutput === "string"
                ? toolOutput
                : JSON.stringify(toolOutput),
            name: toolCall.name, // Opcional mas recomendado
          })
        );
      } catch (error) {
        // TOOL FAILURE: a tool executou mas falhou
        const errorMsg =
          error instanceof Error ? error.message : String(error);
        console.error(`  ❌ Tool error: ${errorMsg}`);

        messages.push(
          new ToolMessage({
            tool_call_id: toolCall.id!,
            content: `Erro ao executar "${toolCall.name}": ${errorMsg}. Tente uma abordagem diferente.`,
          })
        );
      }
    }
  }

  // FALLBACK: max iterations atingido
  console.warn(`  ⚠️ Max iterations (${MAX_ITERATIONS}) atingido`);

  // Forçar uma resposta final pedindo ao modelo para concluir
  messages.push(
    new HumanMessage(
      "Você atingiu o limite de iterações. Por favor, dê sua melhor resposta com as informações que já coletou."
    )
  );

  const fallbackResponse = (await model.invoke(messages)) as AIMessage;
  return {
    finalAnswer: (fallbackResponse.content as string) || "Sem resposta disponível.",
    iterations,
    messages: [...messages, fallbackResponse],
  };
}

// --- Step 6: Executar ---
async function main() {
  const result = await reactLoop(
    "Qual é a população do Brasil em 2025 e quanto é esse número dividido por 26 estados?"
  );
  console.log("\n=== RESULTADO FINAL ===");
  console.log(`Resposta: ${result.finalAnswer}`);
  console.log(`Iterações: ${result.iterations}`);
}

main().catch(console.error);
```

### O que cada etapa faz

O loop implementa o ciclo ReAct completo: **SystemMessage** define o comportamento geral; **HumanMessage** traz a pergunta do usuário; o modelo retorna um **AIMessage** que pode conter `tool_calls` (Actions) ou apenas `content` (resposta final); para cada tool call, executamos a tool correspondente e criamos um **ToolMessage** com o resultado (Observation) e o `tool_call_id` obrigatório que liga a resposta à chamada original; o loop continua até que o modelo retorne uma mensagem sem tool calls ou o limite de iterações seja atingido.

Pontos críticos no código: a detecção de **tool hallucination** (modelo inventa tools inexistentes) no bloco que verifica `toolMap[toolCall.name]`; o **error handling** com try/catch que permite ao modelo saber que uma tool falhou e tentar outra abordagem; e o **fallback** de max iterations que injeta uma HumanMessage forçando conclusão em vez de simplesmente abortar.

---

## 4. APIs LangChain.js para ReAct

**Rating de confiança: [MÉDIO — documentação oficial v0.3 + API reference verificada]**

### Tabela completa de primitivas

| API | Package / Import Path | Uso no contexto ReAct | Status | Documentação |
|---|---|---|---|---|
| `tool()` | `@langchain/core/tools` | Criar tools com schema Zod e handler | ✅ Active | [API Ref](https://v03.api.js.langchain.com/functions/_langchain_core.tools.tool-1.html) |
| `bindTools()` | Método em `ChatOpenAI` (`@langchain/openai`), `ChatAnthropic` (`@langchain/anthropic`) | Vincular tools ao modelo; retorna Runnable que inclui tool definitions no request | ✅ Active | [How-to](https://js.langchain.com/docs/how_to/tool_calling/) |
| `withStructuredOutput()` | Método em chat models (`@langchain/openai`, `@langchain/anthropic`) | Forçar output tipado com Zod schema (sem loop de tools) | ✅ Active | [Docs](https://js.langchain.com/docs/how_to/structured_output/) |
| `ToolMessage` | `@langchain/core/messages` | Representar resultado de tool execution; requer `tool_call_id` | ✅ Active | [API Ref](https://v03.api.js.langchain.com/classes/_langchain_core.messages.ToolMessage.html) |
| `AIMessage` | `@langchain/core/messages` | Response do modelo; contém `tool_calls` array e `content` | ✅ Active | [API Ref](https://v03.api.js.langchain.com/classes/_langchain_core.messages.AIMessage.html) |
| `HumanMessage` | `@langchain/core/messages` | Input do usuário | ✅ Active | [API Ref](https://v03.api.js.langchain.com/classes/_langchain_core.messages.HumanMessage.html) |
| `SystemMessage` | `@langchain/core/messages` | System prompt para o agente | ✅ Active | [API Ref](https://v03.api.js.langchain.com/classes/_langchain_core.messages.SystemMessage.html) |
| `BaseMessage` | `@langchain/core/messages` | Tipo base para tipagem de arrays de mensagens | ✅ Active | [API Ref](https://v03.api.js.langchain.com/classes/_langchain_core.messages.BaseMessage.html) |
| `RunnableSequence` | `@langchain/core/runnables` | Compor chains de runnables; usar para pre/post-processing em pipelines com agentes | ✅ Active | [API Ref](https://v03.api.js.langchain.com/classes/_langchain_core.runnables.RunnableSequence.html) |
| `RunnableBranch` | `@langchain/core/runnables` | Routing condicional — decidir se usar agente ou chain direto | ✅ Active | [API Ref](https://v03.api.js.langchain.com/classes/_langchain_core.runnables.RunnableBranch.html) |
| `RunnableLambda` | `@langchain/core/runnables` | Wrapper de funções para uso em pipelines LCEL | ✅ Active | [API Ref](https://v03.api.js.langchain.com/classes/_langchain_core.runnables.RunnableLambda.html) |
| `DynamicStructuredTool` | `@langchain/core/tools` | Classe retornada por `tool()`. Construção direta via `new` é pattern legado — preferir `tool()` | ✅ Active (preferir `tool()`) | [API Ref](https://v03.api.js.langchain.com/classes/_langchain_core.tools.DynamicStructuredTool.html) |
| `createReactAgent` | `@langchain/langgraph/prebuilt` | Cria agente ReAct completo como LangGraph CompiledStateGraph. Recomendado para v0.3+ | ✅ Active (v0.3) | [LangGraph Ref](https://langchain-ai.github.io/langgraphjs/) |
| `AgentExecutor` | `langchain/agents` | ⚠️ Executor legado do loop ReAct. Funcional mas não recomendado. Em v1.0 movido para `@langchain/classic` | ⚠️ Legacy | [API Ref](https://v03.api.js.langchain.com/classes/langchain.agents.AgentExecutor.html) |
| `createReactAgent` (legacy) | `langchain/agents` | ⚠️ Versão text-based antiga. Requer `AgentExecutor`. Em v1.0 movido para `@langchain/classic` | ⚠️ Legacy | [API Ref](https://v03.api.js.langchain.com/functions/langchain.agents.createReactAgent.html) |

### Notas sobre evolução de imports

Existem duas versões de `createReactAgent` com nomes idênticos mas proveniências completamente diferentes. A versão de `langchain/agents` é **legacy** — usa parsing de texto no formato "Thought/Action/Observation" e requer `AgentExecutor` para rodar. A versão de `@langchain/langgraph/prebuilt` é a **recomendada** — usa tool calling nativo e produz um `CompiledStateGraph` com streaming e state management integrados.

Em v1.0 do LangChain.js (lançado em 2025), a API legada migrou para `@langchain/classic` e `createReactAgent` do LangGraph foi substituído por `createAgent` importado de `"langchain"`. Para projetos v0.3+, os imports da tabela acima continuam válidos. ⚠️ Se estiver migrando para v1.0, consulte o guia de migração oficial em `docs.langchain.com/oss/javascript/migrate/langchain-v1`.

### Alerta sobre Zod v4

A propriedade `withStructuredOutput()` e a função `tool()` funcionam com **Zod v3**. Utilizar Zod v4 (`import { z } from "zod/v4"`) causa quebra de inferência de tipos e pode produzir erros HTTP 400 — há issues abertas no GitHub (#8357, #8413). **Use `import { z } from "zod"` (v3) até que compatibilidade v4 seja oficializada.**

---

## 5. Padrões avançados TypeScript para ReAct

**Rating de confiança: [MÉDIO — documentação oficial + patterns verificados da comunidade]**

### Type safety completo com Zod schemas para tools

O uso de Zod não é apenas para validação — é a base do **type safety end-to-end** das tools:

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// --- Schema como fonte de verdade para tipos ---
const OrderSchema = z.object({
  orderId: z.string().describe("ID do pedido no formato ORD-XXXXX"),
  includeItems: z
    .boolean()
    .default(false)
    .describe("Se deve incluir detalhes dos itens"),
});

// TypeScript infere automaticamente o tipo do input
// typeof input === { orderId: string; includeItems: boolean }
const getOrder = tool(
  async (input) => {
    // input é tipado: input.orderId é string, input.includeItems é boolean
    const order = await fetchOrder(input.orderId);
    if (!order) return `Pedido ${input.orderId} não encontrado.`;
    if (input.includeItems) {
      return JSON.stringify({ ...order, items: await fetchItems(order.id) });
    }
    return JSON.stringify(order);
  },
  {
    name: "get_order",
    description:
      "Busca detalhes de um pedido pelo ID. Retorna dados do pedido em JSON.",
    schema: OrderSchema,
  }
);

// Zod .describe() nos campos é CRÍTICO —
// essa string é enviada ao modelo como parte da tool definition
// e guia a geração de argumentos corretos

// --- Schema para output estruturado (não tool) ---
const AnalysisSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().max(200),
  actionRequired: z.boolean(),
});

// withStructuredOutput retorna o tipo inferido do Zod schema
const analyzeModel = new ChatOpenAI({ model: "gpt-4o" }).withStructuredOutput(
  AnalysisSchema
);
// result é tipado: { sentiment: "positive"|"negative"|"neutral", ... }
const analysis = await analyzeModel.invoke("Analise: O produto é excelente!");
```

### Tratamento robusto de erros no loop ReAct

```typescript
import {
  AIMessage,
  ToolMessage,
  BaseMessage,
  HumanMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { tool, StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";

// --- Tipos para controle do loop ---
interface ReactLoopConfig {
  maxIterations: number;
  maxToolCallsPerIteration: number;
  timeoutMs: number;
  onStep?: (step: ReactStep) => void; // callback para streaming/UI
}

interface ReactStep {
  iteration: number;
  type: "thought" | "action" | "observation" | "error" | "final";
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
}

// --- Loop com tratamento completo de erros ---
async function robustReactLoop(
  model: ReturnType<ChatOpenAI["bindTools"]>,
  toolMap: Record<string, StructuredToolInterface>,
  userQuery: string,
  config: ReactLoopConfig
): Promise<string> {
  const messages: BaseMessage[] = [new HumanMessage(userQuery)];
  let iterations = 0;

  while (iterations < config.maxIterations) {
    iterations++;

    // Timeout por iteração
    const response = (await Promise.race([
      model.invoke(messages),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout na iteração ${iterations}`)),
          config.timeoutMs
        )
      ),
    ])) as AIMessage;

    messages.push(response);

    // Emitir thought para UI
    if (response.content && config.onStep) {
      config.onStep({
        iteration: iterations,
        type: "thought",
        content: response.content as string,
      });
    }

    // Sem tool calls = resposta final
    if (!response.tool_calls || response.tool_calls.length === 0) {
      config.onStep?.({
        iteration: iterations,
        type: "final",
        content: response.content as string,
      });
      return response.content as string;
    }

    // Limitar tool calls por iteração (previne parallel tool call storms)
    const callsToProcess = response.tool_calls.slice(
      0,
      config.maxToolCallsPerIteration
    );

    for (const toolCall of callsToProcess) {
      const selectedTool = toolMap[toolCall.name];

      // CASO 1: Tool não existe (hallucination)
      if (!selectedTool) {
        const errContent = `Erro: tool "${toolCall.name}" não existe. Disponíveis: ${Object.keys(toolMap).join(", ")}`;
        messages.push(
          new ToolMessage({ tool_call_id: toolCall.id!, content: errContent })
        );
        config.onStep?.({
          iteration: iterations,
          type: "error",
          content: errContent,
          toolName: toolCall.name,
        });
        continue;
      }

      try {
        // CASO 2: Execução normal
        const output = await selectedTool.invoke(toolCall.args);
        const outputStr =
          typeof output === "string" ? output : JSON.stringify(output);
        messages.push(
          new ToolMessage({
            tool_call_id: toolCall.id!,
            content: outputStr,
            name: toolCall.name,
          })
        );
        config.onStep?.({
          iteration: iterations,
          type: "observation",
          content: outputStr,
          toolName: toolCall.name,
          toolArgs: toolCall.args as Record<string, unknown>,
        });
      } catch (error) {
        // CASO 3: Tool falhou durante execução
        const errMsg =
          error instanceof Error ? error.message : String(error);
        messages.push(
          new ToolMessage({
            tool_call_id: toolCall.id!,
            content: `Erro ao executar ${toolCall.name}: ${errMsg}`,
          })
        );
        config.onStep?.({
          iteration: iterations,
          type: "error",
          content: errMsg,
          toolName: toolCall.name,
        });
      }
    }

    // Também verificar invalid_tool_calls (malformed pelo modelo)
    if (
      response.additional_kwargs?.tool_calls &&
      (!response.tool_calls || response.tool_calls.length === 0)
    ) {
      // O provider enviou tool calls mas LangChain não conseguiu parsear
      messages.push(
        new HumanMessage(
          "Sua última chamada de tool foi malformada. Tente novamente com argumentos válidos."
        )
      );
    }
  }

  return "Limite de iterações atingido sem resposta final.";
}
```

### Streaming de steps intermediários para UX

```typescript
import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  AIMessage,
  AIMessageChunk,
  ToolMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { concat } from "@langchain/core/utils/stream";

// ⚠️ concat importado de @langchain/core/utils/stream — verificar na
// documentação oficial; path pode variar por versão

const searchTool = tool(
  async ({ query }) => `Resultado para: ${query}`,
  {
    name: "search",
    description: "Busca na web",
    schema: z.object({ query: z.string() }),
  }
);

const tools = [searchTool];
const toolMap = { search: searchTool };
const model = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0,
  streaming: true,
}).bindTools(tools);

async function* streamReactLoop(
  userQuery: string
): AsyncGenerator<{ type: string; content: string }> {
  const messages: BaseMessage[] = [new HumanMessage(userQuery)];
  let iterations = 0;

  while (iterations < 5) {
    iterations++;

    // Stream a resposta do modelo token por token
    let fullResponse: AIMessageChunk | undefined;

    for await (const chunk of await model.stream(messages)) {
      if (!fullResponse) {
        fullResponse = chunk as AIMessageChunk;
      } else {
        fullResponse = concat(fullResponse, chunk as AIMessageChunk);
      }

      // Emitir tokens de texto conforme chegam
      if (chunk.content) {
        yield { type: "token", content: chunk.content as string };
      }
    }

    if (!fullResponse) break;
    messages.push(fullResponse);

    // Verificar tool calls no response completo
    if (!fullResponse.tool_calls || fullResponse.tool_calls.length === 0) {
      yield { type: "final", content: fullResponse.content as string };
      return;
    }

    // Executar tools e emitir observations
    for (const tc of fullResponse.tool_calls) {
      yield {
        type: "tool_call",
        content: `Chamando ${tc.name}(${JSON.stringify(tc.args)})`,
      };

      const result = await toolMap[tc.name]?.invoke(tc.args);
      const resultStr = typeof result === "string" ? result : JSON.stringify(result);

      messages.push(
        new ToolMessage({
          tool_call_id: tc.id!,
          content: resultStr,
        })
      );

      yield { type: "observation", content: resultStr };
    }
  }

  yield { type: "error", content: "Max iterations atingido" };
}

// Uso:
// for await (const step of streamReactLoop("Qual a capital da Austrália?")) {
//   console.log(`[${step.type}] ${step.content}`);
// }
```

### tool_choice forçado para análise antes de responder

Forçar o modelo a chamar uma tool específica é útil quando você quer garantir que o agente sempre consulte uma fonte antes de responder — evitando respostas baseadas apenas em conhecimento parametric:

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
// Docs: https://js.langchain.com/docs/how_to/tool_choice/

const tools = [searchTool, calculator]; // definidos anteriormente

const model = new ChatOpenAI({ model: "gpt-4o" });

// Forçar uma tool específica pelo nome
const modelForcedSearch = model.bindTools(tools, {
  tool_choice: "search_web",
});
// O modelo SEMPRE chamará search_web, independente do prompt

// Forçar qualquer tool (mas pelo menos uma)
const modelMustUseTool = model.bindTools(tools, {
  tool_choice: "any", // OpenAI aceita "required"; LangChain normaliza
});

// Deixar o modelo decidir (default)
const modelAutoTool = model.bindTools(tools, {
  tool_choice: "auto",
});

// Proibir tool calls
const modelNoTools = model.bindTools(tools, {
  tool_choice: "none",
});
```

Um pattern avançado: usar `tool_choice` forçado na **primeira iteração** para garantir retrieval, e `"auto"` nas iterações seguintes para permitir que o modelo decida quando parar.

### Combinação de ReAct com RunnableBranch para routing

```typescript
import { RunnableBranch, RunnableLambda } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

// Step 1: Classificar a intenção do usuário
const classifierModel = new ChatOpenAI({ model: "gpt-4o-mini" }).withStructuredOutput(
  z.object({
    intent: z.enum(["simple_fact", "complex_reasoning", "calculation"]),
    complexity: z.number().min(1).max(10),
  })
);

const classifyIntent = RunnableLambda.from(async (query: string) => {
  const classification = await classifierModel.invoke(
    `Classifique a intenção: "${query}"`
  );
  return { query, ...classification };
});

// Step 2: Branches para diferentes abordagens
const simpleBranch = RunnableLambda.from(async (input: { query: string }) => {
  // Resposta direta sem agente — mais rápido e barato
  const model = new ChatOpenAI({ model: "gpt-4o-mini" });
  const response = await model.invoke(input.query);
  return response.content as string;
});

const agentBranch = RunnableLambda.from(async (input: { query: string }) => {
  // Loop ReAct completo para queries complexas
  return await reactLoop(input.query); // função definida na seção 3
});

// Step 3: Routing condicional
const router = RunnableBranch.from([
  [
    (input: { intent: string; complexity: number }) =>
      input.intent === "simple_fact" && input.complexity <= 3,
    simpleBranch,
  ],
  [
    (input: { intent: string }) => input.intent === "calculation",
    RunnableLambda.from(async (input: { query: string }) => {
      // Chain direto com calculator, sem loop
      const result = await calculator.invoke({ expression: input.query });
      return result;
    }),
  ],
  // Default: agente ReAct completo
  agentBranch,
]);

// Pipeline completo: classify → route → execute
const pipeline = classifyIntent.pipe(router);
// const answer = await pipeline.invoke("Qual a raiz quadrada de 144?");
```

---

## 6. Comparação de abordagens para implementar ReAct

**Rating de confiança: [MÉDIO — documentação oficial + benchmarks LangChain]**

| Dimensão | ReAct Manual (while loop) | `createReactAgent` (LangGraph prebuilt) | `AgentExecutor` (Legacy) | LangGraph Custom Graph |
|---|---|---|---|---|
| **Controle** | Total — cada linha do loop é sua | Moderado — config via params, middleware hooks | Baixo — caixa preta com callbacks | Total — define nodes, edges, conditions |
| **Observabilidade** | Manual (console.log, custom) | Integrada (LangSmith automático) | Limitada (callbacks) | Integrada + custom (LangSmith) |
| **Complexidade de implementação** | Baixa (~50 linhas core) | Muito baixa (~5 linhas) | Baixa (~10 linhas) | Média (~30-50 linhas) |
| **Suporte a streaming** | Manual (AsyncGenerator) | Nativo (`.stream()`, `.streamEvents()`) | Parcial (callbacks) | Nativo (múltiplos modos) |
| **Suporte a multi-step** | Sim — controle total | Sim — automático | Sim — automático | Sim — controle total |
| **Overhead de dependências** | Mínimo (`@langchain/core` + provider) | `@langchain/langgraph` + `@langchain/core` + provider | `langchain` + `@langchain/core` + provider | `@langchain/langgraph` + `@langchain/core` + provider |
| **Persistência/checkpointing** | Manual | Nativo (MemorySaver, etc.) | Não nativo | Nativo |
| **Human-in-the-loop** | Manual | Nativo (interrupt/resume) | Não nativo | Nativo |
| **Compatibilidade com LCEL puro** | Total — usa primitivas LCEL | Parcial — é um StateGraph, não um Runnable puro | Sim — é um Runnable | Parcial — StateGraph |
| **Quando usar** | Protótipos, aprendizado, casos com requisitos de controle total sem dependência de framework | **A maioria dos casos em produção v0.3+** | ❌ Não usar em novos projetos | Workflows complexos com steps determinísticos + agentes |

A recomendação oficial da LangChain é clara: **`createReactAgent` do `@langchain/langgraph/prebuilt` para v0.3**, com migração para `createAgent` do package `langchain` quando migrar para v1.0. O loop manual é mais valioso como ferramenta de aprendizado e para cenários onde o overhead de dependências ou a necessidade de controle total justifiquem a complexidade adicional.

---

## 7. Pitfalls e anti-patterns em produção

**Rating de confiança: [MÉDIO — benchmarks LangChain + community patterns + documentação]**

### Loops infinitos destroem orçamentos silenciosamente

**Problema:** O agente repete os mesmos tool calls indefinidamente, acumulando custo de tokens sem progredir. Causa raiz: o modelo não interpreta corretamente sinais de conclusão, ou observações não-informativas não mudam o estado do contexto suficientemente para que o modelo mude de estratégia.

**Solução em código:**

```typescript
// 1. Hard limit de iterações (obrigatório)
const MAX_ITERATIONS = 10;

// 2. Detecção de repetição
const recentActions: string[] = [];
for (const toolCall of response.tool_calls) {
  const actionKey = `${toolCall.name}:${JSON.stringify(toolCall.args)}`;
  if (recentActions.filter((a) => a === actionKey).length >= 2) {
    // Mesmo tool call 3x seguidas = stuck
    messages.push(
      new ToolMessage({
        tool_call_id: toolCall.id!,
        content: "Você já tentou esta ação múltiplas vezes com o mesmo resultado. Tente uma abordagem diferente ou forneça sua melhor resposta.",
      })
    );
    continue;
  }
  recentActions.push(actionKey);
}

// 3. Timeout global por request
const result = await Promise.race([
  reactLoop(query),
  new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error("Agent timeout: 30s")), 30_000)
  ),
]);
```

### Tool hallucination corrompe o fluxo de mensagens

**Problema:** O modelo gera tool calls para tools inexistentes ou com argumentos malformados. Isso é mais comum com modelos menores e quando há muitas tools disponíveis. Causa raiz: o modelo interpola padrões de nomes de tools a partir do training data em vez de respeitar estritamente as definições fornecidas.

**Solução:** Sempre validar `toolCall.name` contra o `toolMap` antes de executar. Para argumentos malformados, LangChain.js popula `response.invalid_tool_calls` quando o parsing de tool calls falha. Adicionalmente, descriptions de tools devem ser explícitas sobre o que a tool **não faz**:

```typescript
// Descrição defensiva
const myTool = tool(handler, {
  name: "get_user_profile",
  description: "Busca o perfil de um usuário pelo ID. NÃO altera dados. NÃO aceita email como input — apenas user_id numérico.",
  schema: z.object({
    user_id: z.number().int().positive().describe("ID numérico do usuário"),
  }),
});
```

### Degradação severa com muitas tools disponíveis

**Problema:** Performance do agente cai drasticamente quando mais de 5-7 tools ou domínios estão disponíveis. **Benchmarks da LangChain** (fevereiro 2025) mostraram que GPT-4o caiu para **2% de success rate** com 7+ domínios. Cada tool adiciona ~300 tokens de schema ao prompt, competindo com instruções do task.

**Solução:** Implementar seleção dinâmica de tools por contexto. Não oferecer ao modelo todas as tools em todas as iterações — filtrar baseado na fase da conversa, no domínio detectado, ou nos resultados de uma classificação prévia. Para cenários com muitas tools, a arquitetura multi-agent (supervisor + agents especializados) mostrou **~50% de melhoria** sobre um agente único sobrecarregado nos benchmarks da LangChain.

### Custo de tokens escala geometricamente em loops longos

**Problema:** Em cada iteração, todo o histórico de mensagens é reenviado ao modelo. Na iteração N com K tool calls por iteração, o custo é O(N × K × tamanho_médio_mensagem). Um loop de 8 iterações com tools que retornam 500 tokens cada pode facilmente consumir **20.000+ input tokens** por request.

**Solução:**

- Definir `max_tokens: 512` no modelo para forçar respostas concisas em cada step
- Truncar ou sumarizar tool outputs longos antes de criar o ToolMessage
- Para loops longos, implementar window de contexto: manter apenas as últimas N mensagens e um resumo das anteriores
- Usar `temperature: 0` para reduzir variabilidade e acelerar convergência
- Monitorar custo com LangSmith: `LANGSMITH_TRACING=true` captura token counts automaticamente

### Debugging sem traces é voar às cegas

**Problema:** Sem observabilidade, é impossível distinguir entre tool failure, hallucination, loop infinito, ou custo excessivo. Causa raiz: o loop ReAct tem estado interno complexo que não aparece em logs simples.

**Solução:** A configuração mínima de LangSmith requer zero mudança de código:

```bash
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY="ls-..."
export LANGSMITH_PROJECT="meu-agente-react"
```

Com essas variáveis, toda invocação de chain/agent é automaticamente traced com tree de chamadas, inputs/outputs por step, timing, e custo estimado. Em produção, amostrar 10-20% dos requests e configurar alertas para métricas de qualidade.

### Modelos se comportam de formas radicalmente diferentes

**Problema:** O mesmo agente com as mesmas tools produz resultados muito diferentes em GPT-4o, Claude 3.5 Sonnet, e Gemini. Causa raiz: cada provider implementa tool calling de forma diferente internamente (function calling nativo no OpenAI, XML-based no Claude), e modelos têm diferentes capacidades de seguir schemas.

Resultados empíricos dos benchmarks LangChain:

- **GPT-4o**: Rápido (~109 tokens/s), mas sofre degradação severa com mais de 5-7 tools. Performance catastrófica em scheduling com muitos domínios
- **Claude 3.5 Sonnet**: Mais resiliente a múltiplas tools; melhor em contextos longos (200K tokens); mais preciso em tool use
- **Gemini**: Força multimodal, mas taxa alta de erros internos e safety filters agressivos que rejeitam queries benignas
- **Llama 3.3 70B**: Em um benchmark, **esqueceu completamente** de invocar a tool de envio de email, falhando todos os casos

**Solução:** Testar o agente com cada provider antes de produção. Usar `.withFallbacks()` para fallback automático entre providers:

```typescript
const primaryModel = new ChatOpenAI({ model: "gpt-4o" }).bindTools(tools);
const fallbackModel = new ChatAnthropic({ model: "claude-sonnet-4-20250514" }).bindTools(tools);

const resilientModel = primaryModel.withFallbacks({
  fallbacks: [fallbackModel],
});
```

---

## 8. Checklist de decisão arquitetural

**Rating de confiança: [MÉDIO — síntese de documentação oficial + benchmarks + patterns da comunidade]**

Use este fluxograma para decidir qual abordagem adotar. Percorra de cima para baixo, parando na primeira condição verdadeira:

```
INÍCIO: "Meu caso precisa de um agente LLM?"
│
├─ A resposta requer apenas busca em documentos?
│  └─ SIM → Use RAG (vector store + retrieval chain)
│          NÃO precisa de ReAct.
│
├─ A sequência de steps é conhecida e fixa?
│  └─ SIM → Use LCEL chain determinístico
│          (RunnableSequence / pipe). Agente é overhead.
│
├─ Precisa de apenas 1 tool call sem raciocínio?
│  └─ SIM → Use bindTools() + invocação direta.
│          Loop ReAct desnecessário.
│
├─ Precisa de raciocínio multi-step com 1-5 tools?
│  └─ SIM → Use createReactAgent(@langchain/langgraph/prebuilt)
│          Padrão recomendado para v0.3+.
│
├─ Precisa de controle total sobre o loop sem dependências extras?
│  └─ SIM → Implemente o loop ReAct manual (seção 3).
│          Ideal para learning, protótipos, e edge cases.
│
├─ Precisa misturar steps determinísticos com steps agentic?
│  └─ SIM → Use LangGraph custom graph.
│          Define nodes explícitos + conditional edges.
│
├─ Tem 7+ tools ou múltiplos domínios?
│  └─ SIM → Arquitetura multi-agent com supervisor.
│          Single agent degrada acima de ~5-7 domínios.
│
├─ Precisa de persistência, human-in-the-loop, ou resume?
│  └─ SIM → Use LangGraph (prebuilt ou custom)
│          com checkpointer. Loop manual não oferece isso.
│
└─ Operação de alto risco (pagamentos, dados sensíveis)?
   └─ SIM → NÃO use agente autônomo.
           Use workflow determinístico + human-in-the-loop
           com approval gates explícitos.
```

A regra geral: **comece com a abordagem mais simples que resolve o problema**. Se `bindTools()` + uma invocação resolve, não crie um agente. Se `createReactAgent` resolve, não construa um graph custom. A complexidade do agente deve ser proporcional à complexidade real do task.

---

## Conclusão: o que muda quando você entende o loop

Entender ReAct no nível mecânico transforma a relação do desenvolvedor com agentes LLM de três formas concretas. Primeiro, **o debugging deixa de ser mágico**: quando um agente falha, você sabe exatamente onde olhar — a sequência de `tool_calls`, a qualidade das `ToolMessage`s reinjetadas, e se o modelo está em loop ou alucinando tools. Segundo, **decisões arquiteturais se tornam informadas**: a diferença entre RAG, chain determinístico, loop ReAct manual, `createReactAgent`, e LangGraph custom graph não é abstrata — cada um mapeia para um padrão de implementação preciso com tradeoffs mensuráveis em custo, latência, e confiabilidade. Terceiro, **o custo se torna previsível**: cada iteração do loop multiplica tokens, e saber que GPT-4o degrada a 2% com 7+ domínios é a diferença entre um agente que funciona e um que queima orçamento em produção.

O insight mais contra-intuitivo dos benchmarks recentes da LangChain: **dar mais tools ao agente o torna pior, não melhor**. A tendência natural de "adicionar mais capabilities" produz degradação severa. A arquitetura correta é routing + agentes especializados com poucas tools cada, não um super-agente generalista.

Para projetos v0.3+, a recomendação operacional é direta: use `createReactAgent` de `@langchain/langgraph/prebuilt` como default, entenda o loop manual para debugging, e migre para `createAgent` de `langchain` quando adotar v1.0. Mantenha **Zod v3**, configure **LangSmith** desde o dia 1, e nunca deploy um agente sem `maxIterations` e timeout.

---

## Referências

[1] Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., & Cao, Y. (2023). "ReAct: Synergizing Reasoning and Acting in Language Models." ICLR 2023. arXiv:2210.03629. https://arxiv.org/abs/2210.03629

[2] LangChain.js Documentation (v0.3). https://js.langchain.com/docs/

[3] LangChain.js API Reference (v0.3). https://v03.api.js.langchain.com/

[4] LangChain.js — How to do tool calling. https://js.langchain.com/docs/how_to/tool_calling/

[5] LangChain.js — How to use tool_choice. https://js.langchain.com/docs/how_to/tool_choice/

[6] LangChain.js — Agent Migration Guide. https://js.langchain.com/docs/how_to/migrate_agent/

[7] LangChain Blog — "ReAct Agent Benchmarking." https://blog.langchain.com/react-agent-benchmarking/

[8] LangChain Blog — "Benchmarking Multi-Agent Architectures." https://blog.langchain.com/benchmarking-multi-agent-architectures/

[9] LangChain Blog — "Tool Calling with LangChain." https://blog.langchain.com/tool-calling-with-langchain/

[10] LangGraph.js — createReactAgent (prebuilt). https://langchain-ai.github.io/langgraphjs/

[11] LangChain Blog — "LangChain & LangGraph 1.0." https://blog.langchain.com/langchain-langgraph-1dot0/

[12] LangChain Blog — "Context Management for Deep Agents." https://blog.langchain.com/context-management-for-deepagents/