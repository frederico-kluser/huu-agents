# Guia completo para consumir a API de modelos da OpenRouter em Node.js

**A OpenRouter agrega mais de 400 modelos de IA — de GPT-4 a Gemini, Claude e Llama — através de uma única API compatível com o formato OpenAI.** O endpoint `GET /api/v1/models` retorna metadados estruturados de cada modelo disponível, incluindo preços, arquitetura, limites de contexto e parâmetros suportados. Este guia ensina como consumir esse endpoint com Node.js, mapear todos os 14 campos do schema, transformar os dados em tabelas navegáveis e exportar para CSV/JSON — tudo com código pronto para copiar e executar. Se você precisa construir dashboards de comparação, seletores dinâmicos de modelos ou ferramentas de análise de custos, este é o ponto de partida.

---

## Setup do projeto e dependências necessárias

O projeto usa **fetch nativo do Node.js 18+**, eliminando a necessidade de bibliotecas HTTP externas. Para exibição em tabela no terminal e exportação CSV, instalamos duas dependências leves.

```bash
mkdir openrouter-models && cd openrouter-models
npm init -y
npm install cli-table3 json2csv
```

Crie um arquivo `.env` na raiz do projeto com sua chave de API:

```env
OPENROUTER_API_KEY=sk-or-v1-sua-chave-aqui
```

Para carregar variáveis de ambiente sem dependências extras, use o flag `--env-file` do Node.js 20+:

```bash
node --env-file=.env index.mjs
```

**Obtenção da API key:** acesse https://openrouter.ai/keys, crie uma nova chave e copie o valor gerado. A OpenRouter é parceira do GitHub Secret Scanning — se sua chave vazar em um repositório público, você receberá um alerta por email automaticamente.

A autenticação é feita via header `Authorization: Bearer <token>`. Para o endpoint `/api/v1/models`, o token é **opcional** (funciona sem autenticação), mas é **obrigatório** para `/api/v1/models/user` e para os endpoints de modelo específico.

```javascript
// config.mjs
export const BASE_URL = 'https://openrouter.ai/api/v1';

export const headers = {
  'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
  'HTTP-Referer': 'https://seu-site.com',      // recomendado pela OpenRouter
  'X-OpenRouter-Title': 'Meu App de Modelos',  // aparece no dashboard
};
```

---

## Chamada básica ao endpoint de modelos

O código abaixo faz a requisição GET, valida a resposta e retorna o array de modelos. A resposta é um objeto JSON com uma única chave `data` contendo um array de objetos padronizados — um por modelo.

```javascript
// fetchModels.mjs
import { BASE_URL, headers } from './config.mjs';

export async function fetchModels(queryParams = {}) {
  const url = new URL(`${BASE_URL}/models`);

  // Adiciona query parameters dinamicamente
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`API Error ${response.status}: ${JSON.stringify(error)}`);
  }

  const { data } = await response.json();
  console.log(`✅ ${data.length} modelos carregados`);
  return data;
}

// Uso básico — retorna apenas modelos com output de texto (padrão)
const models = await fetchModels();

// Com filtros
const imageModels = await fetchModels({ output_modalities: 'image' });
const toolModels = await fetchModels({ supported_parameters: 'tools' });
const allModels = await fetchModels({ output_modalities: 'all' });
```

**Importante:** por padrão, o endpoint retorna **apenas modelos com output de texto**. Para ver modelos de geração de imagem, áudio ou embeddings, é necessário passar `output_modalities=image`, `output_modalities=audio`, `output_modalities=embeddings` ou `output_modalities=all`.

---

## Os 14 campos do Model Object explicados

Cada objeto no array `data` segue um schema padronizado com **14 campos**. A tabela abaixo é a referência completa:

| Campo | Tipo | Nullable | Descrição | Exemplo |
|-------|------|----------|-----------|---------|
| `id` | `string` | Não | Identificador único no formato `autor/modelo` | `"google/gemini-2.5-pro-preview"` |
| `canonical_slug` | `string` | Não | Slug permanente que nunca muda | `"google/gemini-2.5-pro-preview"` |
| `name` | `string` | Não | Nome legível para exibição | `"Google: Gemini 2.5 Pro"` |
| `created` | `number` | Não | Unix timestamp de quando foi adicionado | `1740506212` |
| `description` | `string` | Não | Descrição em Markdown com links internos | `"Gemini 2.0 Flash Lite oferece..."` |
| `context_length` | `number` | Não | Janela de contexto máxima em tokens | `1048576` |
| `architecture` | `object` | Não | Capacidades técnicas (modalidades, tokenizer) | Ver seção dedicada |
| `pricing` | `object` | Não | Menor preço disponível por token/request | Ver seção dedicada |
| `top_provider` | `object` | Não | Configuração do provedor principal | Ver seção dedicada |
| `per_request_limits` | `object \| null` | **Sim** | Limites de rate por requisição | `null` na maioria dos modelos |
| `supported_parameters` | `string[]` | Não | Parâmetros de API suportados | `["temperature", "top_p", "tools"]` |
| `default_parameters` | `object \| null` | **Sim** | Valores padrão de parâmetros | `null` quando não há defaults |
| `expiration_date` | `string \| null` | **Sim** | Data de descontinuação (ISO 8601) | `null` ou `"2025-06-01"` |

Três campos são frequentemente `null`: **`per_request_limits`** (a maioria dos modelos não impõe limites por request), **`default_parameters`** (poucos modelos definem defaults) e **`expiration_date`** (apenas modelos com descontinuação agendada). O campo `architecture.instruct_type` também é `null` para a maioria dos modelos modernos.

---

## Sub-objetos aninhados: Architecture, Pricing e Top Provider

### Architecture — o que o modelo aceita e produz

```javascript
{
  "modality": "text+image->text",       // campo legado, formato descritivo
  "input_modalities": ["text", "image"], // array: "text", "image", "file", "audio", "video"
  "output_modalities": ["text"],         // array: "text", "image", "audio", "embeddings"
  "tokenizer": "Gemini",                // "GPT", "Claude", "Llama", "Gemini", "PaLM"
  "instruct_type": null                  // "chatml" ou null (maioria dos modelos modernos)
}
```

O campo `modality` é **legado** — use `input_modalities` e `output_modalities` para lógica programática. Modelos multimodais como Gemini 2.5 Pro aceitam `["text", "image", "file"]` como input, enquanto modelos de geração de imagem produzem `["image"]` como output.

### Pricing — todos os custos em USD por unidade

**Todos os valores de preço são strings**, não números. Essa decisão de design evita problemas de precisão de ponto flutuante com valores como `"0.000000075"`.

```javascript
{
  "prompt": "0.000000075",        // USD por token de input
  "completion": "0.0000003",      // USD por token de output
  "request": "0",                 // custo fixo por requisição
  "image": "0",                   // USD por imagem (input ou output)
  "web_search": "0",              // USD por operação de busca web
  "internal_reasoning": "0",      // USD por token de raciocínio interno
  "input_cache_read": "0",        // USD por token lido do cache
  "input_cache_write": "0"        // USD por token escrito no cache
}
```

Modelos gratuitos (IDs terminando em `:free`) têm **todos os campos** como `"0"`. Modelos de geração de imagem podem ter `prompt` e `completion` como `"0"` mas `image` com valor positivo. O campo `internal_reasoning` cobre tokens de "pensamento" em modelos como o1 e DeepSeek R1. O campo `web_search` se aplica a variantes `:online`.

### Top Provider — configuração do provedor principal

```javascript
{
  "context_length": 1048576,      // limite de contexto específico do provedor
  "max_completion_tokens": 8192,  // máximo de tokens na resposta
  "is_moderated": false           // true para OpenAI/Anthropic, false para open-source
}
```

Note que `top_provider.context_length` pode diferir do `context_length` raiz — o campo raiz representa o máximo entre todos os provedores disponíveis para aquele modelo.

### Interface TypeScript completa para referência

```typescript
interface OpenRouterModel {
  id: string;
  canonical_slug: string;
  name: string;
  created: number;
  description: string;
  context_length: number;
  architecture: {
    modality: string;
    input_modalities: ('text' | 'image' | 'file' | 'audio' | 'video')[];
    output_modalities: ('text' | 'image' | 'audio' | 'embeddings')[];
    tokenizer: string;
    instruct_type: string | null;
  };
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image: string;
    web_search: string;
    internal_reasoning: string;
    input_cache_read: string;
    input_cache_write: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number;
    is_moderated: boolean;
  };
  per_request_limits: Record<string, string> | null;
  supported_parameters: string[];
  default_parameters: Record<string, unknown> | null;
  expiration_date: string | null;
}

interface ModelsResponse {
  data: OpenRouterModel[];
}
```

---

## Query parameters para filtragem server-side

O endpoint aceita **5 query parameters** que filtram modelos antes de retornar a resposta, reduzindo payload e processamento no cliente.

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `output_modalities` | `string` | Filtra por modalidade de output. Valores: `text` (padrão), `image`, `audio`, `embeddings`, `all`. Aceita lista separada por vírgula. |
| `category` | `enum` | Filtra por categoria de uso. 12 valores: `programming`, `roleplay`, `marketing`, `technology`, `science`, `translation`, `legal`, `finance`, `health`, `trivia`, `academia` e um 12º valor. |
| `supported_parameters` | `string` | Filtra por parâmetro suportado (ex: `tools`, `structured_outputs`, `reasoning`). |
| `use_rss` | `string` | Quando `"true"`, retorna feed RSS ao invés de JSON. |
| `use_rss_chat_links` | `string` | Modifica links do RSS para links de chat. |

```javascript
// Exemplos de filtragem server-side
const programmingModels = await fetchModels({ category: 'programming' });
const imageGenModels = await fetchModels({ output_modalities: 'image' });
const multiModalModels = await fetchModels({ output_modalities: 'text,image' });
const toolCallingModels = await fetchModels({ supported_parameters: 'tools' });
const reasoningModels = await fetchModels({ supported_parameters: 'reasoning' });
```

---

## Endpoints complementares: modelos do usuário e endpoints de provedores

### GET /api/v1/models/user — modelos filtrados por preferências

Este endpoint retorna modelos filtrados pelas **preferências de provedor, configurações de privacidade e guardrails** do usuário autenticado. Requer Bearer token obrigatório. Se a requisição for feita via `eu.openrouter.ai`, os resultados são filtrados para modelos que satisfazem o roteamento in-region da UE.

```javascript
export async function fetchUserModels() {
  const response = await fetch(`${BASE_URL}/models/user`, { headers });

  if (response.status === 401) {
    throw new Error('Autenticação obrigatória para /models/user');
  }
  if (!response.ok) throw new Error(`Erro: ${response.status}`);

  const { data } = await response.json();
  console.log(`👤 ${data.length} modelos do usuário carregados`);
  return data; // mesmo schema, mas com 13 campos (sem expiration_date)
}
```

### GET /api/v1/models/:author/:slug/endpoints — provedores de um modelo

Lista todos os **endpoints de provedores** disponíveis para um modelo específico, incluindo métricas de latência, throughput e uptime em tempo real.

```javascript
export async function fetchModelEndpoints(modelId) {
  // modelId formato: "openai/gpt-4" → author="openai", slug="gpt-4"
  const url = `${BASE_URL}/models/${modelId}/endpoints`;
  const response = await fetch(url, { headers });

  if (response.status === 404) {
    throw new Error(`Modelo ${modelId} não encontrado`);
  }
  if (!response.ok) throw new Error(`Erro: ${response.status}`);

  const { data } = await response.json();

  console.log(`🔌 ${data.endpoints.length} endpoints para ${data.name}:`);
  for (const ep of data.endpoints) {
    console.log(`   - ${ep.provider_name} (${ep.quantization}) | ` +
      `Latência p50: ${ep.latency_last_30m?.p50}s | ` +
      `Uptime: ${ep.uptime_last_30m}%`);
  }
  return data;
}

// Exemplo
await fetchModelEndpoints('openai/gpt-4');
```

Cada endpoint retorna campos valiosos: **`provider_name`**, **`quantization`** (fp16, int8, etc.), `pricing` específico do provedor, `uptime_last_30m`, `latency_last_30m` (percentis p50/p75/p90/p99), `throughput_last_30m` e `supports_implicit_caching`.

---

## Transformação de dados: parsing, preços e tratamento de nulos

A conversão de preços de string para número e o cálculo de custos por escala são essenciais para qualquer ferramenta de comparação. O código abaixo normaliza cada modelo em um formato pronto para análise.

```javascript
// transform.mjs

/**
 * Converte string de preço para número com segurança
 * @param {string|undefined} priceStr - Preço em USD por token (string)
 * @returns {number} - Valor numérico
 */
function toNumber(priceStr) {
  if (!priceStr) return 0;
  const num = parseFloat(priceStr);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Normaliza um modelo cru da API para formato analítico
 * @param {OpenRouterModel} model
 */
export function normalizeModel(model) {
  const promptPerToken = toNumber(model.pricing?.prompt);
  const completionPerToken = toNumber(model.pricing?.completion);

  return {
    id: model.id,
    name: model.name,
    created: new Date(model.created * 1000).toISOString().split('T')[0],
    contextLength: model.context_length,

    // Preços convertidos para escalas úteis
    promptPer1K: +(promptPerToken * 1_000).toFixed(6),
    promptPer1M: +(promptPerToken * 1_000_000).toFixed(4),
    completionPer1K: +(completionPerToken * 1_000).toFixed(6),
    completionPer1M: +(completionPerToken * 1_000_000).toFixed(4),
    requestCost: toNumber(model.pricing?.request),
    imageCost: toNumber(model.pricing?.image),

    // Arquitetura
    inputModalities: model.architecture?.input_modalities?.join(', ') ?? 'text',
    outputModalities: model.architecture?.output_modalities?.join(', ') ?? 'text',
    tokenizer: model.architecture?.tokenizer ?? 'desconhecido',
    instructType: model.architecture?.instruct_type ?? '—',

    // Top Provider
    maxCompletionTokens: model.top_provider?.max_completion_tokens ?? 0,
    isModerated: model.top_provider?.is_moderated ?? false,

    // Campos nullable com fallback seguro
    hasTools: model.supported_parameters?.includes('tools') ?? false,
    hasReasoning: model.supported_parameters?.includes('reasoning') ?? false,
    hasStructuredOutput: model.supported_parameters?.includes('structured_outputs') ?? false,
    supportedParams: model.supported_parameters?.join(', ') ?? '—',
    isFree: promptPerToken === 0 && completionPerToken === 0,
    expirationDate: model.expiration_date ?? '—',
    defaultParameters: model.default_parameters
      ? JSON.stringify(model.default_parameters)
      : '—',
    perRequestLimits: model.per_request_limits
      ? JSON.stringify(model.per_request_limits)
      : '—',
  };
}
```

Os campos `per_request_limits`, `default_parameters` e `expiration_date` são tratados com fallbacks explícitos. Preços são calculados em três escalas: **por token** (valor original), **por 1K tokens** e **por 1M tokens** — esta última é o padrão da indústria para comparação de custos.

---

## Tabela formatada no terminal e exportação para CSV e JSON

### Exibição no terminal com cli-table3

```javascript
// table.mjs
import Table from 'cli-table3';
import { fetchModels } from './fetchModels.mjs';
import { normalizeModel } from './transform.mjs';

const rawModels = await fetchModels({ output_modalities: 'all' });
const models = rawModels.map(normalizeModel);

// Tabela resumida no terminal
const table = new Table({
  head: ['Modelo', 'Contexto', 'Input $/1M', 'Output $/1M', 'Modalidades', 'Tools'],
  colWidths: [35, 12, 12, 12, 20, 7],
  wordWrap: true,
});

// Top 30 modelos mais baratos (não-gratuitos)
const paidSorted = models
  .filter(m => !m.isFree)
  .sort((a, b) => a.promptPer1M - b.promptPer1M)
  .slice(0, 30);

for (const m of paidSorted) {
  table.push([
    m.name.slice(0, 33),
    m.contextLength.toLocaleString(),
    `$${m.promptPer1M}`,
    `$${m.completionPer1M}`,
    m.outputModalities,
    m.hasTools ? '✅' : '—',
  ]);
}

console.log('\n📊 Top 30 modelos pagos mais baratos (por preço de input/1M tokens):\n');
console.log(table.toString());
```

### Exportação para JSON e CSV

```javascript
// export.mjs
import { writeFileSync } from 'node:fs';
import { Parser } from '@json2csv/plainjs';
import { fetchModels } from './fetchModels.mjs';
import { normalizeModel } from './transform.mjs';

const rawModels = await fetchModels({ output_modalities: 'all' });
const models = rawModels.map(normalizeModel);

// --- JSON ---
writeFileSync('models.json', JSON.stringify(models, null, 2));
console.log(`📁 models.json salvo (${models.length} modelos)`);

// --- CSV ---
const csvFields = [
  'id', 'name', 'contextLength', 'promptPer1M', 'completionPer1M',
  'inputModalities', 'outputModalities', 'tokenizer', 'hasTools',
  'hasReasoning', 'isFree', 'isModerated', 'maxCompletionTokens',
];

const parser = new Parser({ fields: csvFields });
const csv = parser.parse(models);
writeFileSync('models.csv', csv);
console.log(`📁 models.csv salvo (${models.length} modelos)`);
```

---

## Doze receitas prontas para filtragem programática

Estas receitas operam sobre os dados já carregados, permitindo filtragem client-side rápida sem novas requisições à API.

```javascript
// recipes.mjs
import { fetchModels } from './fetchModels.mjs';
import { normalizeModel } from './transform.mjs';

const raw = await fetchModels({ output_modalities: 'all' });
const models = raw.map(normalizeModel);

// 1. Modelos gratuitos
const free = models.filter(m => m.isFree);
console.log(`🆓 ${free.length} modelos gratuitos`);

// 2. Modelos com tool calling (function calling)
const withTools = models.filter(m => m.hasTools);
console.log(`🔧 ${withTools.length} modelos com tools`);

// 3. Modelos com reasoning/pensamento
const reasoning = models.filter(m => m.hasReasoning);
console.log(`🧠 ${reasoning.length} modelos com reasoning`);

// 4. Modelos multimodais (aceitam imagem como input)
const vision = models.filter(m => m.inputModalities.includes('image'));
console.log(`👁️ ${vision.length} modelos com visão`);

// 5. Modelos de geração de imagem
const imageGen = models.filter(m => m.outputModalities.includes('image'));
console.log(`🎨 ${imageGen.length} modelos de geração de imagem`);

// 6. Top 10 maiores janelas de contexto
const byContext = [...models]
  .sort((a, b) => b.contextLength - a.contextLength)
  .slice(0, 10);
console.log('\n📏 Top 10 por contexto:');
byContext.forEach(m => console.log(`   ${m.name}: ${m.contextLength.toLocaleString()} tokens`));

// 7. Ordenar por preço de input (mais barato primeiro, ignorando gratuitos)
const byPrice = models
  .filter(m => !m.isFree)
  .sort((a, b) => a.promptPer1M - b.promptPer1M)
  .slice(0, 10);
console.log('\n💰 Top 10 mais baratos (input $/1M):');
byPrice.forEach(m => console.log(`   ${m.name}: $${m.promptPer1M}/1M tokens`));

// 8. Modelos com structured output
const structured = models.filter(m => m.hasStructuredOutput);
console.log(`\n📋 ${structured.length} modelos com structured outputs`);

// 9. Modelos não-moderados (sem content filtering)
const unmoderated = models.filter(m => !m.isModerated);
console.log(`🔓 ${unmoderated.length} modelos não-moderados`);

// 10. Modelos por tokenizer específico
const byTokenizer = Object.groupBy(models, m => m.tokenizer);
for (const [tok, group] of Object.entries(byTokenizer)) {
  console.log(`🔤 ${tok}: ${group.length} modelos`);
}

// 11. Modelos com data de expiração definida
const expiring = models.filter(m => m.expirationDate !== '—');
console.log(`⏰ ${expiring.length} modelos com data de expiração`);

// 12. Custo estimado para 10K tokens de input + 2K tokens de output
const costEstimate = models
  .filter(m => !m.isFree)
  .map(m => ({
    name: m.name,
    estimatedCost: +(m.promptPer1M * 0.01 + m.completionPer1M * 0.002).toFixed(4),
  }))
  .sort((a, b) => a.estimatedCost - b.estimatedCost)
  .slice(0, 10);

console.log('\n🧮 Top 10 mais baratos para cenário 10K in + 2K out:');
costEstimate.forEach(m => console.log(`   ${m.name}: $${m.estimatedCost}`));
```

---

## Boas práticas: cache, error handling e tipagem

### Cache inteligente dos resultados

A API de modelos da OpenRouter é **cacheada no edge (CDN)**. O catálogo de modelos muda com pouca frequência, então uma estratégia simples de cache local é suficiente para a maioria dos casos.

```javascript
// cache.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CACHE_FILE = '.models-cache.json';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

export function getCachedModels() {
  if (!existsSync(CACHE_FILE)) return null;

  const cached = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  const age = Date.now() - cached.timestamp;

  if (age > CACHE_TTL_MS) {
    console.log('🔄 Cache expirado, buscando dados frescos...');
    return null;
  }

  console.log(`📦 Usando cache (idade: ${Math.round(age / 60000)} min)`);
  return cached.data;
}

export function setCachedModels(data) {
  writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: Date.now(), data }));
}
```

### Error handling robusto com retry

```javascript
// fetchWithRetry.mjs
export async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        const retryAfter = response.headers.get('X-RateLimit-Reset');
        const waitMs = retryAfter
          ? (parseInt(retryAfter) * 1000) - Date.now()
          : attempt * 2000;
        console.warn(`⚠️ Rate limit (429). Aguardando ${waitMs}ms...`);
        await new Promise(r => setTimeout(r, Math.max(waitMs, 1000)));
        continue;
      }

      if (response.status === 402) {
        throw new Error('Créditos insuficientes. Recarregue em openrouter.ai/credits');
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.warn(`⚠️ Tentativa ${attempt}/${maxRetries} falhou: ${err.message}`);
      await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }
}
```

### Rate limiting — o que saber

Modelos gratuitos (sufixo `:free`) têm limite de **20 requisições por minuto**. Contas com menos de 10 créditos comprados ficam restritas a **50 requisições/dia** para modelos gratuitos; com 10+ créditos, o limite sobe para **1.000/dia**. Modelos pagos não possuem rate limiting de plataforma para contas Pay-as-you-go. A OpenRouter retorna headers `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `X-RateLimit-Reset` em respostas 429.

### Tipagem com JSDoc para projetos JavaScript

Se você não usa TypeScript, JSDoc oferece autocomplete e verificação de tipos diretamente no VS Code:

```javascript
/**
 * @typedef {import('./types.d.ts').OpenRouterModel} OpenRouterModel
 */

/**
 * Busca e normaliza modelos da OpenRouter
 * @param {Record<string, string>} [queryParams]
 * @returns {Promise<OpenRouterModel[]>}
 */
export async function fetchModels(queryParams = {}) {
  // ...implementação
}
```

### Alternativa com o SDK oficial

A OpenRouter oferece um SDK oficial em `@openrouter/sdk` (pacote ESM-only) que abstrai a autenticação e serialização:

```javascript
import { OpenRouter } from '@openrouter/sdk';

const client = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const { data } = await client.models.list();
const userModels = await client.models.listForUser();
const keyInfo = await client.apiKeys.getCurrent(); // saldo e limites
```

O SDK é uma opção sólida para projetos que já usam o ecossistema OpenRouter. Para máximo controle sobre parsing e transformação — como neste guia — o fetch nativo oferece mais flexibilidade.

---

## Conclusão

A API de modelos da OpenRouter é uma das interfaces mais densas em metadados para catálogos de IA disponíveis hoje. O schema de **14 campos com 3 sub-objetos aninhados** cobre desde custos granulares por tipo de token até capacidades de modalidade e métricas de provedor em tempo real. Três insights se destacam para quem está construindo ferramentas sobre esta API.

Primeiro, **preços como strings é uma decisão arquitetural deliberada** — trate a conversão para número apenas no momento do cálculo, nunca ao armazenar. Segundo, o endpoint `/models/{author}/{slug}/endpoints` é subutilizado mas extremamente valioso: ele expõe latência p50/p99, throughput e uptime por provedor, dados essenciais para roteamento inteligente. Terceiro, o filtro `output_modalities=all` é necessário para qualquer dashboard completo — sem ele, você está vendo apenas modelos de texto, ignorando centenas de modelos de imagem, áudio e embeddings.

O código deste guia é modular por design. Os módulos `fetchModels.mjs`, `transform.mjs`, `cache.mjs` e `recipes.mjs` podem ser combinados diretamente em CLIs, APIs internas ou pipelines de dados. Com a interface TypeScript como referência de tipagem, a integração com projetos existentes é direta — copie os tipos, conecte ao fetch e comece a filtrar.