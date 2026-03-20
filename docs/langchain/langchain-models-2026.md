# Modelos LLM no LangChain.js: mapa completo 2025–2026

> **Última atualização:** Seção OpenAI revisada com base direto em `developers.openai.com/api/docs/models` e no GitHub do LangChain.js. Família GPT-5 completa adicionada.

**Resumo executivo:** OpenAI e Anthropic oferecem o suporte mais completo às três capacidades investigadas — controle de temperatura, modo de pensamento e janela de contexto ampla — seguidos de perto por Google Gemini e xAI. A OpenAI **unificou reasoning e geração geral na família GPT-5**, onde todos os modelos suportam `reasoning.effort` configurável (incluindo `"none"` para desligar o raciocínio) e temperatura. O diferencial da GPT-5.4 é a janela de **1.050.000 tokens** e suporte nativo a computer use. O Google Gemini destaca-se com janelas de **1M tokens** e thinking configurável via `thinking_budget` (2.5) ou `thinking_level` (3+). O DeepSeek oferece integração dedicada via `ChatDeepSeek`, mas o controle de temperatura é **ignorado silenciosamente** no modo reasoner. A Mistral introduziu raciocínio via modelos Magistral, e o Meta Llama 4 requer provedores intermediários sem modo de thinking nativo.

---

## OpenAI: a família GPT-5 e a convergência entre reasoning e geração geral

Todos os modelos OpenAI de 2025 utilizam a classe **`ChatOpenAI`** do pacote `@langchain/openai`. A grande mudança arquitetural de 2025 foi a **fusão entre modelos de raciocínio e generativos** na família GPT-5: diferente da divisão série-o vs GPT-4.1, os modelos GPT-5+ são modelos de raciocínio com `reasoning.effort` configurável — incluindo `"none"` para operar sem raciocínio (baixa latência) e `"xhigh"` para máximo esforço cognitivo.

**Temperatura na família GPT-5:** Todos os modelos GPT-5 aceitam o parâmetro `temperature` pela API (padrão 1.0). Diferente dos antigos modelos série-o que ignoravam temperatura, os GPT-5 a aceitam formalmente — incluindo `temperature: 0` para saídas determinísticas. Para comportamento de reasoning controlado, o parâmetro com mais impacto direto é `reasoning.effort`.

**Responses API vs Chat Completions:** A OpenAI recomenda fortemente a **Responses API** (`v1/responses`) para modelos GPT-5. No LangChain.js, isso é ativado via `useResponsesApi: true` na instanciação do `ChatOpenAI`. Todos os modelos GPT-5 também suportam a Chat Completions API (`v1/chat/completions`), **exceto os modelos pro**, que são exclusivos da Responses API.

**Resumo dos níveis de `reasoning.effort` por subfamília:**

| Subfamília | Níveis suportados |
|---|---|
| GPT-5 (original) | `minimal`, `low`, `medium`, `high` |
| GPT-5.1 | `none` (padrão), `low`, `medium`, `high` |
| GPT-5.2 | `none` (padrão), `low`, `medium`, `high`, `xhigh` |
| GPT-5.4 | `none` (padrão), `low`, `medium`, `high`, `xhigh` |
| GPT-5 mini / nano | Herdam do GPT-5 (reasoning token support confirmado) |
| GPT-5.x-pro | `medium`, `high`, `xhigh` (sem `none` ou `low`) |

### Tabela principal — família GPT-5 (todos lançados em 2025)

| Nome do Modelo | Model String | Classe LangChain.js | Temperatura | Reasoning Mode | Contexto | Observações |
|---|---|---|---|---|---|---|
| **GPT-5** | `gpt-5` / `gpt-5-2025-08-07` | `ChatOpenAI` | ✅ (padrão 1.0) | ✅ `reasoning.effort`: minimal/low/medium/high | 400.000 tokens | Lançado Mai 2025. Modelo original da família. Superado pelo GPT-5.1 |
| **GPT-5 mini** | `gpt-5-mini` / `gpt-5-mini-2025-08-07` | `ChatOpenAI` | ✅ (padrão 1.0) | ✅ `reasoning.effort` (herda do GPT-5) | 400.000 tokens | Lançado Mai 2025. Versão rápida/barata. Fine-tuning disponível. $0.25/M in |
| **GPT-5 nano** | `gpt-5-nano` / `gpt-5-nano-2025-08-07` | `ChatOpenAI` | ✅ (padrão 1.0) | ✅ `reasoning.effort` (herda do GPT-5) | 400.000 tokens | Lançado Mai 2025. Mais barato da família ($0.05/M in). Fine-tuning disponível |
| **GPT-5 pro** | `gpt-5-pro` | `ChatOpenAI` + `useResponsesApi: true` | ✅ | ✅ `reasoning.effort`: medium/high/xhigh | 400.000 tokens | **Responses API exclusivo.** Pode levar minutos; usar `background: true` |
| **GPT-5.1** | `gpt-5.1` / `gpt-5.1-2025-09-30` | `ChatOpenAI` | ✅ (padrão 1.0) | ✅ `reasoning.effort`: none (padrão)/low/medium/high | 400.000 tokens | Lançado Set 2025. Atualiza GPT-5. Introduz `none` como default de effort |
| **GPT-5.2** | `gpt-5.2` / `gpt-5.2-2025-12-11` | `ChatOpenAI` | ✅ (padrão 1.0) | ✅ `reasoning.effort`: none/low/medium/high/**xhigh** | 400.000 tokens | Lançado Dez 2025. Introduz `xhigh` + resumos concisos de raciocínio. $1.75/M in |
| **GPT-5.2 pro** | `gpt-5.2-pro` / `gpt-5.2-pro-2025-12-11` | `ChatOpenAI` + `useResponsesApi: true` | ✅ | ✅ `reasoning.effort`: medium/high/xhigh | 400.000 tokens | Lançado Dez 2025. **Responses API exclusivo.** Superado pelo GPT-5.4 pro |
| **GPT-5.4** | `gpt-5.4` | `ChatOpenAI` | ✅ (padrão 1.0) | ✅ `reasoning.effort`: none/low/medium/high/**xhigh** | **1.050.000 tokens** | **Flagship atual.** 1M contexto, computer use nativo, compaction. $2.50/M in |
| **GPT-5.4 pro** | `gpt-5.4-pro` | `ChatOpenAI` + `useResponsesApi: true` | ✅ | ✅ `reasoning.effort`: medium/high/xhigh | **1.050.000 tokens** | **Responses API exclusivo.** Pro mais poderoso. $30/M in, $150/M out |
| **gpt-oss-120b** | `gpt-oss-120b` | `ChatOpenAI` | ✅ | ❌ (não documentado) | Não documentado | Open-weight Apache 2.0. Cabe em 1 GPU H100. Para self-hosting |
| **gpt-oss-20b** | `gpt-oss-20b` | `ChatOpenAI` | ✅ | ❌ (não documentado) | Não documentado | Open-weight Apache 2.0. Baixa latência. Menor da família OSS |

### Tabela complementar — modelos anteriores ainda ativos (série o e GPT-4.x)

| Nome do Modelo | Model String | Classe LangChain.js | Temperatura | Reasoning Mode | Contexto | Observações |
|---|---|---|---|---|---|---|
| **o3-mini** | `o3-mini` / `o3-mini-2025-01-31` | `ChatOpenAI` | ❌ ignorada | ✅ `reasoningEffort`: low/medium/high | 200.000 tokens | Jan 2025. Sem visão. Superado pelos GPT-5 |
| **o3** | `o3` / `o3-2025-04-16` | `ChatOpenAI` | ❌ ignorada | ✅ `reasoningEffort`: low/medium/high | 200.000 tokens | Abr 2025. Com visão |
| **o4-mini** | `o4-mini` / `o4-mini-2025-04-16` | `ChatOpenAI` | ❌ ignorada | ✅ `reasoningEffort`: low/medium/high | 200.000 tokens | Abr 2025. Custo-eficiente |
| **o3-pro** | `o3-pro` / `o3-pro-2025-06-10` | `ChatOpenAI` | ❌ ignorada | ✅ compute fixo (sem effort configurável) | 200.000 tokens | Jun 2025. Responses API only |
| **GPT-4.1** | `gpt-4.1` / `gpt-4.1-2025-04-14` | `ChatOpenAI` | ✅ (0–2) | ❌ | ~1.047.576 tokens | Abr 2025. Melhor modelo não-reasoning. Fine-tuning |
| **GPT-4.1 mini** | `gpt-4.1-mini` / `gpt-4.1-mini-2025-04-14` | `ChatOpenAI` | ✅ (0–2) | ❌ | ~1.047.576 tokens | Abr 2025. Rápido e econômico |
| **GPT-4.1 nano** | `gpt-4.1-nano` / `gpt-4.1-nano-2025-04-14` | `ChatOpenAI` | ✅ (0–2) | ❌ | ~1.047.576 tokens | Abr 2025. Mais barato da linha 4.1 |

### Como usar GPT-5 no LangChain.js (TypeScript)

**Modo sem raciocínio (baixa latência, comportamento generativo puro):**
```typescript
import { ChatOpenAI } from "@langchain/openai";

const llm = new ChatOpenAI({
  model: "gpt-5.4",
  temperature: 0,                  // aceita 0–2 (padrão 1.0)
  useResponsesApi: true,           // recomendado pela OpenAI para GPT-5
});

const response = await llm.invoke("Resuma o conceito de recursão.", {
  reasoning: { effort: "none" },   // desativa raciocínio para menor latência
});

console.log(response.content);
```

**Modo raciocínio médio (balanceia qualidade e custo):**
```typescript
import { ChatOpenAI } from "@langchain/openai";

const reasoningLlm = new ChatOpenAI({
  model: "gpt-5.4",
  useResponsesApi: true,
});

const response = await reasoningLlm.invoke(
  "Projete a arquitetura de um sistema de recomendação em tempo real.",
  {
    reasoning: {
      effort: "medium",
      summary: "auto",  // retorna resumo do raciocínio na resposta
    },
  }
);

console.log(response.content);
// Resumo do raciocínio (requer organização verificada no dashboard OpenAI)
console.log(response.additional_kwargs?.reasoning);
```

**Modelo pro com máximo esforço (Responses API exclusiva):**
```typescript
import { ChatOpenAI } from "@langchain/openai";

const proLlm = new ChatOpenAI({
  model: "gpt-5.4-pro",
  useResponsesApi: true,            // OBRIGATÓRIO para modelos pro
});

// Pro pode levar vários minutos — usar background mode
const response = await proLlm.invoke(
  "Verifique formalmente a corretude deste algoritmo...",
  {
    reasoning: { effort: "xhigh" },  // pro suporta somente medium/high/xhigh
    background: true,                 // evita timeout em tarefas longas
  }
);
```

**ATENÇÃO — Bug #9663 em `@langchain/openai` v0.3:** Ao instanciar com `reasoning` no construtor em versões `< 1.0`, o parâmetro é silenciosamente sobrescrito por `{ effort: undefined }`. Use call options ou migre para `>= 1.0.0`:
```typescript
// ❌ BUGADO em v0.3 (reasoning ignorado no construtor)
const model = new ChatOpenAI({ model: "gpt-5.2", reasoning: { effort: "low" } });

// ✅ CORRETO: passar reasoning via call options
const model = new ChatOpenAI({ model: "gpt-5.2", useResponsesApi: true });
const response = await model.invoke("...", { reasoning: { effort: "low" } });
```

---

## Anthropic: extended thinking em toda a linha Claude 4+

Todos os modelos Anthropic usam **`ChatAnthropic`** de `@langchain/anthropic`. Desde o Claude Sonnet 4, **temperatura (0–1) é compatível com thinking mode**. O thinking é configurado via parâmetro `thinking: { type: "enabled", budget_tokens: N }` com mínimo de **1.024 tokens** de orçamento. Modelos mais recentes (Opus 4.6, Sonnet 4.6) suportam **thinking adaptativo** (`type: "adaptive"`) com `effort`.

| Nome do Modelo | Model String | Classe LangChain.js | Temperatura | Thinking Mode | Contexto | Observações |
|---|---|---|---|---|---|---|
| **Claude Sonnet 4** | `claude-sonnet-4-20250514` | `ChatAnthropic` | ✅ 0–1 | ✅ `thinking: { type: "enabled", budget_tokens: N }` | 200K (1M β) | Mai 2025. Saída máx. 64K |
| **Claude Opus 4** | `claude-opus-4-20250514` | `ChatAnthropic` | ✅ 0–1 | ✅ manual + thinking | 200K | Mai 2025. ASL-3. Saída máx. 32K |
| **Claude Opus 4.1** | `claude-opus-4-1-20250805` | `ChatAnthropic` | ✅ 0–1 | ✅ manual + interleaved thinking | 200K | Ago 2025. Saída máx. 32K |
| **Claude Sonnet 4.5** | `claude-sonnet-4-5-20250929` | `ChatAnthropic` | ✅ 0–1 | ✅ manual + interleaved thinking | 200K (1M β) | Set 2025. Melhor para agentes |
| **Claude Haiku 4.5** | `claude-haiku-4-5-20251001` | `ChatAnthropic` | ✅ 0–1 | ✅ primeiro "small" com thinking | 200K | Out 2025. Mais rápido/barato |
| **Claude Opus 4.5** | `claude-opus-4-5-20251101` | `ChatAnthropic` | ✅ 0–1 | ✅ maior budget de thinking | 200K | Nov 2025. Saída máx. 128K |
| **Claude Opus 4.6** | `claude-opus-4-6` | `ChatAnthropic` | ✅ 0–1 | ✅ **thinking adaptativo**: `{ type: "adaptive" }` + `effort` | 200K (1M β) | Fev 2026. Mais inteligente atual. Saída máx. 128K |
| **Claude Sonnet 4.6** | `claude-sonnet-4-6` | `ChatAnthropic` | ✅ 0–1 | ✅ manual e adaptativo | 200K (1M β) | Fev 2026. Default no claude.ai. Saída máx. 64K |

---

## Google Gemini: 1M de contexto e thinking configurável

Integração via **`ChatGoogleGenerativeAI`** de `@langchain/google-genai`. Os modelos Gemini 2.5 (GA desde Jun 2025) têm **1M tokens de contexto** e thinking controlável via `thinking_budget`. Os modelos Gemini 3+ introduzem `thinking_level` e exigem temperatura 1.0 forçada pelo LangChain.js.

| Nome do Modelo | Model String | Classe LangChain.js | Temperatura | Thinking Mode | Contexto | Observações |
|---|---|---|---|---|---|---|
| **Gemini 2.5 Pro** | `gemini-2.5-pro` | `ChatGoogleGenerativeAI` | ✅ 0–2 | ✅ `thinking_budget`: 0/-1/até 32K | 1M tokens | GA Jun 2025. Saída máx. 64K |
| **Gemini 2.5 Flash** | `gemini-2.5-flash` | `ChatGoogleGenerativeAI` | ✅ 0–2 | ✅ `thinking_budget` (ativo por padrão) | 1M tokens | GA Jun 2025. Melhor custo-benefício |
| **Gemini 2.5 Flash-Lite** | `gemini-2.5-flash-lite` | `ChatGoogleGenerativeAI` | ✅ 0–2 | ✅ `thinking_budget` (desativado por padrão) | 1M tokens | Jun 2025. Menor latência |
| **Gemini 3.1 Pro Preview** | `gemini-3.1-pro-preview` | `ChatGoogleGenerativeAI` | ✅ (forçado 1.0 pelo LangChain.js) | ✅ `thinking_level`: "low"/"medium"/etc. | ~1M+ tokens | Fev 2026. Preview |
| **Gemini 3.1 Flash Lite Preview** | `gemini-3.1-flash-lite-preview` | `ChatGoogleGenerativeAI` | ✅ (forçado 1.0) | ✅ `thinking_level` | Não documentado | Mar 2026. Preview mais recente |

---

## Seção especial DeepSeek: V3, V3-0324 e R1 no LangChain.js

### Arquitetura e versionamento

O DeepSeek opera com apenas **dois identificadores na API oficial**, atualizados in-place:
- **`deepseek-chat`** → modo não-thinking (atualmente **DeepSeek-V3.2**, desde dez/2025)
- **`deepseek-reasoner`** → modo thinking/raciocínio (também **DeepSeek-V3.2**, desde dez/2025)

Evolução de `deepseek-chat`: V3 (dez/2024) → **V3-0324** (mar/2025) → V3.1 (ago/2025) → **V3.2** (dez/2025).

O **DeepSeek-V3-0324** foi atualização in-place em 25/03/2025. Acesso específico ao V3-0324 requer provedores terceiros (OpenRouter: `deepseek/deepseek-chat-v3-0324`; Together AI: `deepseek-ai/DeepSeek-V3-0324`). Não existe model string separado na API oficial.

**Use `ChatDeepSeek` de `@langchain/deepseek`.** Não use `ChatOpenAI` com baseURL customizada para modelos de raciocínio — o `reasoning_content` será silenciosamente descartado (issue #35059).

| Nome do Modelo | Model String | Classe LangChain.js | Temperatura | Thinking Mode | Contexto | Observações |
|---|---|---|---|---|---|---|
| **DeepSeek-V3.2 (chat)** | `deepseek-chat` | `ChatDeepSeek` | ✅ 0–2 (padrão 1.0) | ❌ (ativável via `thinking` param) | 128.000 tokens | 671B params (37B ativos, MoE). Saída máx. 8K |
| **DeepSeek-V3.2 (reasoner)** | `deepseek-reasoner` | `ChatDeepSeek` | ❌ **ignorada silenciosamente** | ✅ sempre ativo. CoT em `additional_kwargs.reasoning_content` | 128.000 tokens | Saída máx. 64K. Temp sem efeito |
| **DeepSeek-V3-0324** | `deepseek-chat` (histórico) / `deepseek-ai/DeepSeek-V3-0324` (terceiros) | `ChatDeepSeek` / `ChatOpenAI` (terceiros) | ✅ 0–2 | ❌ nativo | 128.000 tokens | Não mais acessível via API oficial isoladamente |

### Snippets TypeScript

```typescript
import { ChatDeepSeek } from "@langchain/deepseek";

// Modo chat (não-thinking)
const llm = new ChatDeepSeek({
  model: "deepseek-chat",
  temperature: 0,   // válido: 0–2
});

// Modo reasoning
const reasoner = new ChatDeepSeek({ model: "deepseek-reasoner" });
const response = await reasoner.invoke("Prove que √2 é irracional.");
console.log(response.content);                              // resposta final
console.log(response.additional_kwargs.reasoning_content); // CoT completo

// Streaming com reasoning
for await (const chunk of await reasoner.stream("Explique 0.1 + 0.2 !== 0.3")) {
  if (chunk.additional_kwargs?.reasoning_content)
    process.stdout.write(`[THINKING] ${chunk.additional_kwargs.reasoning_content}`);
  if (chunk.content)
    process.stdout.write(String(chunk.content));
}
```

---

## Mistral: Magistral traz raciocínio automático

Integração via **`ChatMistralAI`** de `@langchain/mistralai`. Os modelos Magistral têm **CoT automático** sem toggle explícito.

| Nome do Modelo | Model String | Classe LangChain.js | Temperatura | Thinking Mode | Contexto | Observações |
|---|---|---|---|---|---|---|
| **Mistral Small 3.2** | `mistral-small-2506` | `ChatMistralAI` | ✅ | ❌ | 131K | Jun 2025. 24B, visão. Open-weight |
| **Mistral Medium 3.1** | `mistral-medium-latest` | `ChatMistralAI` | ✅ | ❌ | 131K | Ago 2025. Premier multimodal proprietário |
| **Mistral Large 3** | `mistral-large-2512` | `ChatMistralAI` | ✅ | ❌ | 256K | Dez 2025. 675B MoE (41B ativos). Apache 2.0 |
| **Magistral Small 1.2** | `magistral-small-2509` | `ChatMistralAI` | ✅ | ✅ CoT automático | 128K | Set 2025. 24B. Open-weight |
| **Magistral Medium 1.2** | `magistral-medium-2509` | `ChatMistralAI` | ✅ | ✅ CoT automático | 128K | Set 2025. Premier de raciocínio |
| **Codestral** | `codestral-2508` | `ChatMistralAI` | ✅ | ❌ | 256K | Ago 2025. Suporta FIM |
| **Devstral 2** | `devstral-2-2512` | `ChatMistralAI` | ✅ | ❌ | 256K | Dez 2025. 123B denso. MIT. Coding agêntico |

---

## Meta Llama 4: contexto massivo sem API direta

O Meta não fornece API própria. Llama é acessado via provedores intermediários. Nenhum modelo Llama 4 tem modo de thinking/reasoning nativo.

| Nome do Modelo | Model String (Groq) | Classes LangChain.js | Temperatura | Thinking | Contexto | Observações |
|---|---|---|---|---|---|---|
| **Llama 4 Scout** | `meta-llama/llama-4-scout-17b-16e-instruct` | `ChatGroq`, `ChatOllama`, `ChatFireworks`, `ChatBedrockConverse` | ✅ 0–2 | ❌ | 10M teórico / **131K real** | Abr 2025. 109B total, 17B ativos (MoE 16). Multimodal |
| **Llama 4 Maverick** | `meta-llama/llama-4-maverick-17b-128e-instruct` | `ChatGroq`, `ChatOllama`, `ChatFireworks`, `ChatBedrockConverse` | ✅ 0–2 | ❌ | 1M teórico / **131K real** | Abr 2025. 400B total, 17B ativos (MoE 128). Multimodal |

---

## xAI Grok: janela de 2M tokens e reasoning sempre ativo

Pacote **`@langchain/xai`** com classe **`ChatXAI`**.

| Nome do Modelo | Model String | Classe LangChain.js | Temperatura | Thinking Mode | Contexto | Observações |
|---|---|---|---|---|---|---|
| **Grok 3** | `grok-3` | `ChatXAI` | ✅ | ✅ `reasoning_effort` configurável | 131K | Fev 2025. Enterprise |
| **Grok 3 Mini** | `grok-3-mini` | `ChatXAI` | ✅ | ✅ `reasoning_effort`: "low"\|"high" | 131K | 2025. Math/quantitativo |
| **Grok 4** | `grok-4-0709` | `ChatXAI` | ✅ (restrições) | ✅ **sempre ativo** (effort causa erro) | 256K | Jul 2025. Flagship |
| **Grok 4.1 Fast** | `grok-4-1-fast-reasoning` | `ChatXAI` | ✅ | ✅ reasoning ativo | **2.000.000 tokens** | Set 2025. Maior contexto |

---

## Tabela comparativa consolidada (todos os modelos)

| Provedor | Nome do Modelo | Model String | Classe LangChain.js | Temp. | Thinking | Contexto |
|---|---|---|---|---|---|---|
| OpenAI | GPT-5 | `gpt-5` | `ChatOpenAI` | ✅ 0–2 | ✅ minimal–high | 400K |
| OpenAI | GPT-5 mini | `gpt-5-mini` | `ChatOpenAI` | ✅ 0–2 | ✅ effort | 400K |
| OpenAI | GPT-5 nano | `gpt-5-nano` | `ChatOpenAI` | ✅ 0–2 | ✅ effort | 400K |
| OpenAI | GPT-5 pro | `gpt-5-pro` | `ChatOpenAI` (Resp. API) | ✅ | ✅ medium–xhigh | 400K |
| OpenAI | GPT-5.1 | `gpt-5.1` | `ChatOpenAI` | ✅ 0–2 | ✅ none–high | 400K |
| OpenAI | GPT-5.2 | `gpt-5.2` | `ChatOpenAI` | ✅ 0–2 | ✅ none–**xhigh** | 400K |
| OpenAI | GPT-5.2 pro | `gpt-5.2-pro` | `ChatOpenAI` (Resp. API) | ✅ | ✅ medium–xhigh | 400K |
| OpenAI | **GPT-5.4** 🏆 | `gpt-5.4` | `ChatOpenAI` | ✅ 0–2 | ✅ none–xhigh | **1.050K** |
| OpenAI | GPT-5.4 pro | `gpt-5.4-pro` | `ChatOpenAI` (Resp. API) | ✅ | ✅ medium–xhigh | 1.050K |
| OpenAI | gpt-oss-120b | `gpt-oss-120b` | `ChatOpenAI` | ✅ | ❌ | N/D |
| OpenAI | gpt-oss-20b | `gpt-oss-20b` | `ChatOpenAI` | ✅ | ❌ | N/D |
| OpenAI | o3-mini | `o3-mini` | `ChatOpenAI` | ❌ | ✅ `reasoningEffort` | 200K |
| OpenAI | o3 | `o3` | `ChatOpenAI` | ❌ | ✅ `reasoningEffort` | 200K |
| OpenAI | o4-mini | `o4-mini` | `ChatOpenAI` | ❌ | ✅ `reasoningEffort` | 200K |
| OpenAI | o3-pro | `o3-pro` | `ChatOpenAI` | ❌ | ✅ compute fixo | 200K |
| OpenAI | GPT-4.1 | `gpt-4.1` | `ChatOpenAI` | ✅ 0–2 | ❌ | ~1M |
| OpenAI | GPT-4.1 mini | `gpt-4.1-mini` | `ChatOpenAI` | ✅ 0–2 | ❌ | ~1M |
| OpenAI | GPT-4.1 nano | `gpt-4.1-nano` | `ChatOpenAI` | ✅ 0–2 | ❌ | ~1M |
| Anthropic | Claude Sonnet 4 | `claude-sonnet-4-20250514` | `ChatAnthropic` | ✅ 0–1 | ✅ `thinking.budget_tokens` | 200K (1M β) |
| Anthropic | Claude Opus 4 | `claude-opus-4-20250514` | `ChatAnthropic` | ✅ 0–1 | ✅ thinking | 200K |
| Anthropic | Claude Opus 4.1 | `claude-opus-4-1-20250805` | `ChatAnthropic` | ✅ 0–1 | ✅ interleaved | 200K |
| Anthropic | Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` | `ChatAnthropic` | ✅ 0–1 | ✅ interleaved | 200K (1M β) |
| Anthropic | Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | `ChatAnthropic` | ✅ 0–1 | ✅ | 200K |
| Anthropic | Claude Opus 4.5 | `claude-opus-4-5-20251101` | `ChatAnthropic` | ✅ 0–1 | ✅ maior budget | 200K |
| Anthropic | Claude Opus 4.6 | `claude-opus-4-6` | `ChatAnthropic` | ✅ 0–1 | ✅ **adaptativo** | 200K (1M β) |
| Anthropic | Claude Sonnet 4.6 | `claude-sonnet-4-6` | `ChatAnthropic` | ✅ 0–1 | ✅ manual + adaptativo | 200K (1M β) |
| Google | Gemini 2.5 Pro | `gemini-2.5-pro` | `ChatGoogleGenerativeAI` | ✅ 0–2 | ✅ `thinking_budget` | 1M |
| Google | Gemini 2.5 Flash | `gemini-2.5-flash` | `ChatGoogleGenerativeAI` | ✅ 0–2 | ✅ `thinking_budget` | 1M |
| Google | Gemini 2.5 Flash-Lite | `gemini-2.5-flash-lite` | `ChatGoogleGenerativeAI` | ✅ 0–2 | ✅ (off padrão) | 1M |
| Google | Gemini 3.1 Pro Preview | `gemini-3.1-pro-preview` | `ChatGoogleGenerativeAI` | ✅ (forçado 1.0) | ✅ `thinking_level` | ~1M+ |
| Google | Gemini 3.1 Flash Lite | `gemini-3.1-flash-lite-preview` | `ChatGoogleGenerativeAI` | ✅ (forçado 1.0) | ✅ `thinking_level` | N/D |
| DeepSeek | V3.2 (chat) | `deepseek-chat` | `ChatDeepSeek` | ✅ 0–2 | ❌ (ativável) | 128K |
| DeepSeek | V3.2 (reasoner) | `deepseek-reasoner` | `ChatDeepSeek` | ❌ ignorada | ✅ sempre ativo | 128K |
| Mistral | Small 3.2 | `mistral-small-2506` | `ChatMistralAI` | ✅ | ❌ | 131K |
| Mistral | Medium 3.1 | `mistral-medium-latest` | `ChatMistralAI` | ✅ | ❌ | 131K |
| Mistral | Large 3 | `mistral-large-2512` | `ChatMistralAI` | ✅ | ❌ | 256K |
| Mistral | Magistral Small | `magistral-small-2509` | `ChatMistralAI` | ✅ | ✅ CoT auto | 128K |
| Mistral | Magistral Medium | `magistral-medium-2509` | `ChatMistralAI` | ✅ | ✅ CoT auto | 128K |
| Meta | Llama 4 Scout | (varia por provedor) | `ChatGroq` / `ChatOllama` / etc. | ✅ 0–2 | ❌ | 10M (131K real) |
| Meta | Llama 4 Maverick | (varia por provedor) | `ChatGroq` / `ChatOllama` / etc. | ✅ 0–2 | ❌ | 1M (131K real) |
| xAI | Grok 3 | `grok-3` | `ChatXAI` | ✅ | ✅ `reasoning_effort` | 131K |
| xAI | Grok 3 Mini | `grok-3-mini` | `ChatXAI` | ✅ | ✅ effort low/high | 131K |
| xAI | Grok 4 | `grok-4-0709` | `ChatXAI` | ✅ | ✅ sempre ativo | 256K |
| xAI | Grok 4.1 Fast | `grok-4-1-fast-reasoning` | `ChatXAI` | ✅ | ✅ | 2M |

---

## Gaps, incertezas e comportamentos inconsistentes

**Bug #9663 em `@langchain/openai` v0.3 — `reasoning` silenciado no construtor.** Ao instanciar `ChatOpenAI` com `reasoning: { effort: "low" }` em versões `< 1.0`, a precedência incorreta do operador `??` faz o campo ser sobrescrito por `{ effort: undefined }`. O parâmetro é aceito sem erro mas não enviado à API. **Solução:** migrar para `>= 1.0.0` ou passar `reasoning` via call options.

**Bug #9072 — GPT-5 + tools + Responses API (stateless).** Chamadas sequenciais stateless com tools e reasoning ativo retornam HTTP 400 (`reasoning without its required following item`). O LangChain.js não inclui o bloco de reasoning ao reconstruir o histórico multi-turn. Workaround: usar `store: true` (estado no servidor OpenAI) ou `effort: "none"` em fluxos com tools.

**Bug #8713 — `gpt-5-chat-latest` classificado incorretamente como reasoning.** O helper `isReasoningModel()` usava regex `model.startsWith("gpt-5")`, classificando `gpt-5-chat-latest` como modelo de raciocínio e desabilitando temperatura + system messages. Corrigido com exclusão do prefixo `gpt-5-chat`.

**GPT-5 e temperatura — efeito prático com reasoning ativo não documentado.** A API aceita `temperature` em todos os modelos GPT-5 (padrão 1.0, confirmado em traces). O efeito com `reasoning.effort > "none"` não está claramente especificado pela OpenAI.

**GPT-5.4 e GPT-5.4 pro — precificação diferenciada por volume.** Para prompts com mais de 272K tokens de entrada, o preço sobe para 2× input e 1,5× output para toda a sessão. O LangChain.js não avisa sobre este limiar automaticamente.

**Modelos pro são Responses API exclusivos.** O `gpt-5.2-pro` e `gpt-5.4-pro` só funcionam com `useResponsesApi: true`. Chamadas à Chat Completions API retornam erro.

**Snapshots dos GPT-5 intermediários.** GPT-5.4 e GPT-5.4-pro ainda não têm snapshots com data publicados nos docs (diferente de `gpt-5.2-2025-12-11`). Usar o alias sem data fixa pode causar variação de comportamento conforme novas versões são liberadas.

**`gpt-5-chat-latest` não recomendado para API.** A OpenAI marca explicitamente os modelos `gpt-5-chat-latest`, `gpt-5.1-chat-latest` e `gpt-5.2-chat-latest` como "not recommended for API use". Eles têm contexto de 128K e saída máxima de 16.384 tokens — muito mais limitados que seus equivalentes de API.

**Versionamento DeepSeek sem pinning.** A API oficial não permite fixar versão. O `deepseek-chat` já apontou para V3, V3-0324, V3.1 e V3.2 sem aviso explícito.

**Temperatura no DeepSeek-reasoner ignorada silenciosamente.** Versões anteriores retornavam erro 400; desde o V3.1+ o parâmetro é aceito mas sem efeito.

**Thinking adaptativo no Anthropic em transição.** O Claude Opus 4.6 marca o thinking manual como deprecated em favor do adaptativo. O Claude Sonnet 4.6 ainda suporta ambos.

**Janela de contexto do Gemini 3.1 Flash Lite não confirmada oficialmente.** As especificações não estão publicadas.

**Gemini 3+ exige temperatura 1.0.** Temperaturas abaixo de 1.0 causam degradação ou loops. O LangChain.js força `temperature: 1.0` automaticamente sem sinalizar ao desenvolvedor.

---

## Referências

1. `developers.openai.com/api/docs/models` — Catálogo completo de modelos OpenAI (acesso: Mar 2026)
2. `developers.openai.com/api/docs/models/gpt-5.4` — GPT-5.4 specs (acesso: Mar 2026)
3. `developers.openai.com/api/docs/models/gpt-5.2` — GPT-5.2 specs (acesso: Mar 2026)
4. `developers.openai.com/api/docs/models/gpt-5.1` — GPT-5.1 specs (acesso: Mar 2026)
5. `developers.openai.com/api/docs/models/gpt-5` — GPT-5 specs (acesso: Mar 2026)
6. `developers.openai.com/api/docs/models/gpt-5-mini` — GPT-5 mini specs (acesso: Mar 2026)
7. `developers.openai.com/api/docs/models/gpt-5-nano` — GPT-5 nano specs (acesso: Mar 2026)
8. `developers.openai.com/api/docs/models/gpt-5.2-pro` — GPT-5.2 pro specs (acesso: Mar 2026)
9. `developers.openai.com/api/docs/models/gpt-5.4-pro` — GPT-5.4 pro specs (acesso: Mar 2026)
10. `developers.openai.com/api/docs/guides/latest-model/` — Guia GPT-5.4 (acesso: Mar 2026)
11. `developers.openai.com/api/docs/changelog/` — OpenAI API Changelog (acesso: Mar 2026)
12. `github.com/langchain-ai/langchainjs/issues/9663` — Bug: reasoning silenciado no construtor v0.3 (Dez 2025)
13. `github.com/langchain-ai/langchainjs/issues/9072` — Bug: GPT-5 reasoning+tools stateless 400 (Set 2025)
14. `github.com/langchain-ai/langchainjs/issues/8713` — Bug: gpt-5-chat-latest como reasoning model (Ago 2025)
15. `docs.langchain.com/oss/javascript/integrations/tools/openai` — Integração OpenAI tools LangChain.js (acesso: Mar 2026)
16. `forum.langchain.com/t/.../1802` — Reasoning summaries GPT-5 com @langchain/openai (Out 2025)
17. `reference.langchain.com/javascript/langchain-deepseek` — Ref. ChatDeepSeek (acesso: Mar 2026)
18. `api-docs.deepseek.com/guides/thinking_mode` — DeepSeek thinking mode (acesso: Mar 2026)
19. `platform.claude.com/docs/en/about-claude/models/overview` — Modelos Claude (acesso: Mar 2026)
20. `developers.googleblog.com/en/gemini-2-5-thinking-model-updates/` — Gemini 2.5 thinking (2025)