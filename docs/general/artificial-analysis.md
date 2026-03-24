# Guia completo da API da Artificial Analysis

A Artificial Analysis oferece **uma API gratuita que expõe dados de benchmarks, pricing e velocidade de mais de 300 modelos de IA** — incluindo LLMs, modelos de geração de imagem, vídeo e fala. Com 7 endpoints e até 1.000 requisições/dia sem custo, ela permite que desenvolvedores integrem rankings atualizados de inteligência, custo-benefício e performance diretamente em dashboards, pipelines de decisão e ferramentas internas. Este guia cobre desde a criação da conta até técnicas avançadas de cruzamento de dados entre endpoints.

A plataforma se consolidou como referência independente para comparação de modelos de IA, mantendo o **Intelligence Index v4.0** (composto por 10 avaliações), além de índices separados para código, matemática e capacidades agênticas. Os dados de performance (tokens/segundo, latência) são atualizados **8 vezes ao dia** a partir de servidores padronizados no Google Cloud.

---

## 1. Primeiros passos — conta, API key e custos

### Criação de conta e obtenção da chave

O processo é direto: acesse o **Insights Platform** em `https://artificialanalysis.ai/login`, crie uma conta (e-mail + senha ou login social) e, uma vez autenticado, gere sua API key no painel da plataforma. A chave é um token alfanumérico que deve ser enviado no header `x-api-key` de toda requisição.

### Custos e limites

A API gratuita opera com **1.000 requisições por dia** compartilhadas entre todos os endpoints de dados (GET). O endpoint CritPt (POST) possui um limite separado de **10 requisições por janela de 24 horas**. Não há cobrança por volume dentro desses limites.

Existe um **tier comercial/enterprise** com dados mais granulares — incluindo performance por provider, séries temporais, dados de hardware e benchmarks customizados. A documentação comercial é compartilhada apenas com parceiros. Para acesso enterprise, o contato é `hello@artificialanalysis.ai`. Os serviços enterprise incluem relatórios de inteligência de mercado, guias interativos, advisory estratégico e acesso à API comercial. **Preços do tier comercial não são divulgados publicamente.**

---

## 2. Arquitetura da API — autenticação, base URL e error handling

| Componente | Detalhe |
|---|---|
| **Base URL** | `https://artificialanalysis.ai/api/v2` |
| **Autenticação** | Header `x-api-key: SUA_CHAVE` |
| **Rate limit (dados)** | 1.000 req/dia |
| **Rate limit (CritPt)** | 10 req/24h (custom disponível sob solicitação) |
| **Atribuição** | Obrigatória — linkar para `https://artificialanalysis.ai/` |

### Códigos de erro

| HTTP Code | Significado | Ação recomendada |
|---|---|---|
| `401` | API key inválida ou ausente | Verificar header `x-api-key` |
| `429` | Rate limit excedido | Checar headers `X-RateLimit-Reset` e `Retry-After` |
| `400` | Body da requisição inválido (CritPt) | Validar JSON e campos obrigatórios |
| `500` | Erro interno do servidor | Retry com backoff exponencial |
| `502` | Resposta inválida do sistema de avaliação (CritPt) | Retry após aguardar |
| `504` | Timeout de avaliação (CritPt) | Retry — avaliações podem demorar |

O endpoint CritPt retorna headers adicionais de rate limit: `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `X-RateLimit-Reset` (data legível). Na resposta 429, o campo `retryAfter` indica os segundos para esperar.

---

## 3. Tabela completa dos 7 endpoints

| # | Endpoint | Método | Parâmetros | Descrição |
|---|---|---|---|---|
| 1 | `/data/llms/models` | GET | `prompt_length`, `parallel_queries` | Benchmarks, pricing e velocidade de LLMs |
| 2 | `/data/media/text-to-image` | GET | `include_categories` | ELO ratings de modelos text-to-image |
| 3 | `/data/media/image-editing` | GET | — | ELO ratings de edição de imagem |
| 4 | `/data/media/text-to-speech` | GET | — | ELO ratings de text-to-speech |
| 5 | `/data/media/text-to-video` | GET | `include_categories` | ELO ratings de text-to-video |
| 6 | `/data/media/image-to-video` | GET | `include_categories` | ELO ratings de image-to-video |
| 7 | `/api/v2/critpt/evaluate` | POST | Body JSON | Submissão de código para avaliação CritPt |

### Parâmetros do endpoint LLMs em detalhe

| Parâmetro | Valores | Default | Efeito |
|---|---|---|---|
| `prompt_length` | `medium` (1k tokens), `long` (10k tokens), `100k` (100k tokens) | `medium` | Controla qual workload de velocidade/latência é retornado |
| `parallel_queries` | `1`, `10` | `1` | Requisição única vs. 10 requisições paralelas |

**Nota importante:** a API gratuita **não oferece filtros server-side** (por creator, por benchmark, etc.). Todos os modelos são retornados de uma vez — a filtragem deve ser feita no lado do cliente.

---

## 4. Endpoint LLMs/Models — o coração da API

Este é o endpoint mais rico em dados. Retorna um array com **300+ modelos** contendo benchmarks, pricing e métricas de performance.

### Exemplo de requisição (cURL)

```bash
curl -s "https://artificialanalysis.ai/api/v2/data/llms/models?prompt_length=medium&parallel_queries=1" \
  -H "x-api-key: SUA_CHAVE_AQUI"
```

### Exemplo de requisição (Python)

```python
import requests

API_KEY = "SUA_CHAVE_AQUI"
BASE_URL = "https://artificialanalysis.ai/api/v2"

response = requests.get(
    f"{BASE_URL}/data/llms/models",
    headers={"x-api-key": API_KEY},
    params={"prompt_length": "medium", "parallel_queries": 1}
)
data = response.json()
models = data["data"]
print(f"Total de modelos: {len(models)}")
```

### Estrutura completa da response

```json
{
  "status": 200,
  "prompt_options": {
    "parallel_queries": 1,
    "prompt_length": "medium"
  },
  "data": [
    {
      "id": "2dad8957-4c16-4e74-bf2d-8b21514e0ae9",
      "name": "o3-mini",
      "slug": "o3-mini",
      "model_creator": {
        "id": "e67e56e3-15cd-43db-b679-da4660a69f41",
        "name": "OpenAI",
        "slug": "openai"
      },
      "evaluations": {
        "artificial_analysis_intelligence_index": 62.9,
        "artificial_analysis_coding_index": 55.8,
        "artificial_analysis_math_index": 87.2,
        "mmlu_pro": 0.791,
        "gpqa": 0.748,
        "hle": 0.087,
        "livecodebench": 0.717,
        "scicode": 0.399,
        "math_500": 0.973,
        "aime": 0.77
      },
      "pricing": {
        "price_1m_blended_3_to_1": 1.925,
        "price_1m_input_tokens": 1.1,
        "price_1m_output_tokens": 4.4
      },
      "median_output_tokens_per_second": 153.831,
      "median_time_to_first_token_seconds": 14.939,
      "median_time_to_first_answer_token": 14.939
    }
  ]
}
```

### Dicionário de campos da response

**Metadados do modelo:**

| Campo | Tipo | Descrição | Estável? |
|---|---|---|---|
| `id` | UUID string | Identificador único — **use como chave primária** | ✅ Sim |
| `name` | string | Nome de exibição | ❌ Pode mudar |
| `slug` | string | Identificador URL-friendly | ⚠️ Raramente muda |
| `model_creator.id` | UUID string | ID do criador do modelo | ✅ Sim |
| `model_creator.name` | string | Nome do criador (ex: "OpenAI") | Pode mudar |

**Objeto `evaluations` — benchmarks:**

| Campo | Escala | O que mede |
|---|---|---|
| `artificial_analysis_intelligence_index` | 0–100 | Índice composto: média ponderada de 10 avaliações |
| `artificial_analysis_coding_index` | 0–100 | Índice de código: Terminal-Bench Hard + SciCode |
| `artificial_analysis_math_index` | 0–100 | Índice de matemática |
| `mmlu_pro` | 0–1 | Conhecimento avançado multi-domínio (12k questões, 14 disciplinas) |
| `gpqa` | 0–1 | Raciocínio científico nível PhD (198 questões) |
| `hle` | 0–1 | Humanity's Last Exam — frontier reasoning (2.158 questões) |
| `livecodebench` | 0–1 | Código competitivo livre de contaminação |
| `scicode` | 0–1 | Código científico em Python (16 disciplinas, 338 subproblemas) |
| `math_500` | 0–1 | Matemática de competição (500 problemas) |
| `aime` | 0–1 | Olimpíada matemática AIME 2025 (30 problemas) |

**Objeto `pricing`:**

| Campo | Unidade | Descrição |
|---|---|---|
| `price_1m_blended_3_to_1` | USD / 1M tokens | Preço blended (3 input : 1 output) |
| `price_1m_input_tokens` | USD / 1M tokens | Preço por token de entrada |
| `price_1m_output_tokens` | USD / 1M tokens | Preço por token de saída |

**Métricas de performance (campos de nível superior):**

| Campo | Unidade | Descrição |
|---|---|---|
| `median_output_tokens_per_second` | tokens/s | Velocidade de geração (mediana P50, 72h) |
| `median_time_to_first_token_seconds` | segundos | Latência até o primeiro token (inclui thinking) |
| `median_time_to_first_answer_token` | segundos | Latência até o primeiro token de *resposta* (relevante para modelos de raciocínio) |

**Nota sobre dados provider-level:** A API gratuita retorna dados **no nível do modelo**, não do provider. Comparar providers diferentes para o mesmo modelo (ex: Fireworks vs. Together.ai para Llama) requer a **API comercial**. Na API gratuita, o campo de velocidade reflete o provider primário (API do criador) ou a mediana entre providers.

---

## 5. Endpoints de mídia — ELO ratings para imagem, vídeo e fala

Todos os endpoints de mídia utilizam o sistema **ELO rating** derivado de votos cegos em arenas. Usuários comparam dois outputs gerados pelo mesmo prompt sem saber qual modelo os criou. O cálculo usa o **modelo Bradley-Terry** com intervalos de confiança a 95% via bootstrap (1.000 reamostragens).

### Text-to-Image

```bash
curl -s "https://artificialanalysis.ai/api/v2/data/media/text-to-image?include_categories=true" \
  -H "x-api-key: SUA_CHAVE"
```

**Response (anotada):**

```json
{
  "status": 200,
  "include_categories": true,
  "data": [
    {
      "id": "dall-e-3",
      "name": "DALL·E 3",
      "slug": "dall-e-3",
      "model_creator": { "id": "openai", "name": "OpenAI" },
      "elo": 1250,          // Rating ELO global
      "rank": 1,             // Posição no ranking
      "ci95": "-5/+5",       // Intervalo de confiança 95%
      "appearances": 5432,   // Aparições na arena
      "release_date": "2025-04",
      "categories": [        // Só com include_categories=true
        {
          "style_category": "General & Photorealistic",
          "subject_matter_category": "People: Portraits",
          "elo": 1280,
          "ci95": "-5/+5",
          "appearances": 1234
        }
      ]
    }
  ]
}
```

**Categorias de estilo disponíveis:** Anime, Text & Typography, General & Photorealistic, Traditional Art, Cartoon & Illustration, Vintage & Retro, Futuristic & Sci-Fi, Graphic Design & Digital Rendering, Fantasy & Mythical, UI/UX Design, Commercial.

**Categorias de assunto:** People: Portraits, People: Groups & Activities, Physical Spaces, Nature & Landscapes.

### Image Editing

```bash
curl -s "https://artificialanalysis.ai/api/v2/data/media/image-editing" \
  -H "x-api-key: SUA_CHAVE"
```

Retorna a mesma estrutura base (id, name, elo, rank, ci95, appearances, release_date), sem suporte documentado a `include_categories`. As categorias visíveis no site incluem: Add Object, Remove Object, Modify Object, Edit Text/Document, Edit People/Faces, Change Camera View, Alter Background/Style, Multi-Step Compound Edits.

### Text-to-Speech

```bash
curl -s "https://artificialanalysis.ai/api/v2/data/media/text-to-speech" \
  -H "x-api-key: SUA_CHAVE"
```

Retorna ELO ratings de naturalidade de fala baseados em comparações cegas na Speech Arena. Sem parâmetro `include_categories` documentado.

### Text-to-Video e Image-to-Video

```bash
# Text-to-Video
curl -s "https://artificialanalysis.ai/api/v2/data/media/text-to-video?include_categories=true" \
  -H "x-api-key: SUA_CHAVE"

# Image-to-Video
curl -s "https://artificialanalysis.ai/api/v2/data/media/image-to-video?include_categories=true" \
  -H "x-api-key: SUA_CHAVE"
```

Ambos suportam `include_categories=true` e retornam **três dimensões** de categorias: `style_category` (Photorealistic, 3D Animation, Cartoon/Anime, Sci-Fi, etc.), `subject_matter_category` (People, Nature, Transport, Animals, etc.) e `format_category` (Moving camera, Short prompt, Long prompt, Multi-scene). Os leaderboards de vídeo distinguem entre "With Audio" e "No Audio".

### Campos comuns a todos os endpoints de mídia

| Campo | Tipo | Descrição |
|---|---|---|
| `elo` | number | Rating ELO (higher = better, ~1000 é baseline) |
| `rank` | number | Posição no ranking geral |
| `ci95` | string | Intervalo de confiança 95% (ex: "-5/+5") |
| `appearances` | number | Total de aparições na arena |
| `release_date` | string | Data de lançamento do modelo |

---

## 6. CritPt Evaluation API — submissão de código para avaliação

O CritPt (Complex Research using Integrated Thinking – Physics Test) testa LLMs em **70 desafios de pesquisa de física de fronteira**, cobrindo 11 subáreas (matéria condensada, física quântica, astrofísica, HEP, etc.). Criado por **50+ pesquisadores** de **30+ instituições**.

### Rate limits específicos

**10 requisições por janela de 24 horas** (default). Limites customizados disponíveis sob solicitação. Cada submissão deve incluir respostas para **todos os 70 problemas** do set público — batches incompletos são rejeitados.

### Formato de requisição

```bash
curl -X POST "https://artificialanalysis.ai/api/v2/critpt/evaluate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: SUA_CHAVE" \
  -d '{
    "submissions": [
      {
        "problem_id": "Challenge_1_main",
        "generated_code": "```python\ndef solution():\n    return 42\n```",
        "model": "gpt-5",
        "generation_config": {
          "use_golden_for_prev_steps": false,
          "parsing": false,
          "multiturn_with_answer": false,
          "use_python": false,
          "use_web_search": false
        },
        "messages": []
      }
    ],
    "batch_metadata": {}
  }'
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `submissions` | array | Sim | Deve conter TODOS os 70 problemas |
| `submissions[].problem_id` | string | Sim | ID do problema CritPt (ex: "Challenge_1_main") |
| `submissions[].generated_code` | string | Sim | Código gerado (Python em fence markdown) |
| `submissions[].model` | string | Sim | Identificador do modelo usado |
| `submissions[].generation_config` | object | Sim | Configuração da geração |
| `batch_metadata` | object | Sim | Metadados do batch (livre) |

### Formato da response (sucesso)

```json
{
  "accuracy": 0.15,
  "timeout_rate": 0.0,
  "server_timeout_count": 0,
  "judge_error_count": 0
}
```

O campo `accuracy` retorna a precisão média de **0 a 1** (ex: 0.15 = 15%). Scores atuais dos melhores modelos ficam entre **10-30%**, refletindo a extrema dificuldade do benchmark.

---

## 7. Catálogo completo de benchmarks e métricas

### Intelligence Index v4.0 — 10 avaliações em 4 categorias

O índice atribui **25% de peso a cada categoria** (Agentes, Código, Geral, Raciocínio Científico). Modelos de fronteira pontuam entre **50–57** na escala 0–100.

| # | Benchmark | Categoria (peso) | O que mede | Escala | Como interpretar |
|---|---|---|---|---|---|
| 1 | **GDPval-AA** | Agentes (16.7%) | Tarefas de trabalho real em 44 ocupações/9 indústrias | ELO normalizado | Normalizado via `(ELO - 500) / 2000` |
| 2 | **τ²-Bench Telecom** | Agentes (8.3%) | Tool-use em cenários de suporte telecom | 0–100% pass@1 | Maior = melhor |
| 3 | **Terminal-Bench Hard** | Código (16.7%) | Tarefas agênticas de terminal (sysadmin, devops) | 0–100% pass@1 | Maior = melhor |
| 4 | **SciCode** | Código (8.3%) | Código Python para computação científica (16 disciplinas) | 0–100% pass@1 | Maior = melhor |
| 5 | **AA-LCR** | Geral (6.25%) | Raciocínio sobre documentos longos (10k–100k tokens) | 0–100% pass@1 | Requer ≥128K context |
| 6 | **AA-Omniscience** | Geral (12.5%) | Conhecimento factual + calibração de alucinação | Composto: 50% acurácia + 50% (1 - taxa alucinação) | Index vai de -100 a 100 |
| 7 | **IFBench** | Geral (6.25%) | Seguimento preciso de instruções (58 constraints diversos) | 0–100% pass@1 | Maior = melhor |
| 8 | **HLE** | Científico (12.5%) | 2.158 questões de experts em fronteiras do conhecimento | 0–100% pass@1 | Top ~15-20% |
| 9 | **GPQA Diamond** | Científico (6.25%) | Q&A nível PhD em biologia, física, química (198 questões) | 0–100% pass@1 | Top ~75-80% |
| 10 | **CritPt** | Científico (6.25%) | Física de pesquisa de fronteira (70 desafios) | 0–100% pass@1 | Top ~10-30% |

### Benchmarks standalone (retornados pela API, fora do Index v4.0)

| Benchmark | Campo API | O que mede | Escala |
|---|---|---|---|
| MMLU-Pro | `mmlu_pro` | Conhecimento multi-domínio avançado (14 disciplinas) | 0–1 (proporção) |
| AIME 2025 | `aime` | Matemática olímpica (30 problemas) | 0–1 |
| LiveCodeBench | `livecodebench` | Código competitivo livre de contaminação | 0–1 |
| MATH-500 | `math_500` | Matemática de competição (6 domínios) | 0–1 |
| SciCode | `scicode` | Código científico em Python | 0–1 |
| GPQA Diamond | `gpqa` | Raciocínio científico PhD-level | 0–1 |
| HLE | `hle` | Frontier reasoning | 0–1 |

**Nota sobre evolução dos campos:** O Intelligence Index v4.0 removeu MMLU-Pro, AIME e LiveCodeBench do cálculo do índice composto, mas esses benchmarks **ainda são retornados como campos individuais na API**. O código deve tratar campos ausentes com graceful degradation, pois novos benchmarks podem aparecer (ex: `terminalbench_hard`, `ifbench`, `lcr`, `tau2`).

---

## 8. Guia de cruzamento de dados — inteligência, preço e velocidade

A verdadeira potência da API está no cruzamento de métricas. Aqui está um script Python completo que consome o endpoint LLMs e gera rankings compostos:

```python
import requests
import json

API_KEY = "SUA_CHAVE_AQUI"
BASE_URL = "https://artificialanalysis.ai/api/v2"

# 1. Buscar dados de LLMs
resp = requests.get(
    f"{BASE_URL}/data/llms/models",
    headers={"x-api-key": API_KEY},
    params={"prompt_length": "medium", "parallel_queries": 1}
)
models = resp.json()["data"]

# 2. Filtrar modelos com dados completos
complete_models = [
    m for m in models
    if m.get("evaluations", {}).get("artificial_analysis_intelligence_index")
    and m.get("pricing", {}).get("price_1m_blended_3_to_1")
    and m["pricing"]["price_1m_blended_3_to_1"] > 0
]

# 3. Calcular custo-benefício (intelligence / price)
for m in complete_models:
    intel = m["evaluations"]["artificial_analysis_intelligence_index"]
    price = m["pricing"]["price_1m_blended_3_to_1"]
    m["_intelligence_per_dollar"] = intel / price

# 4. Ranking por custo-benefício (maior = melhor)
ranked = sorted(complete_models, key=lambda x: x["_intelligence_per_dollar"], reverse=True)

print(f"{'Rank':<5} {'Modelo':<35} {'Intel':>6} {'Preço':>8} {'Intel/$':>10} {'Tokens/s':>10}")
print("-" * 80)
for i, m in enumerate(ranked[:20], 1):
    name = m["name"][:33]
    intel = m["evaluations"]["artificial_analysis_intelligence_index"]
    price = m["pricing"]["price_1m_blended_3_to_1"]
    ratio = m["_intelligence_per_dollar"]
    speed = m.get("median_output_tokens_per_second", 0) or 0
    print(f"{i:<5} {name:<35} {intel:>6.1f} ${price:>7.3f} {ratio:>10.1f} {speed:>10.1f}")

# 5. Filtrar por criador específico
openai_models = [
    m for m in complete_models
    if m["model_creator"]["slug"] == "openai"
]
print(f"\nModelos OpenAI com dados completos: {len(openai_models)}")

# 6. Cruzar velocidade vs qualidade
# Identificar "pareto-ótimos": alta inteligência + alta velocidade
fast_smart = sorted(
    complete_models,
    key=lambda x: (
        x["evaluations"]["artificial_analysis_intelligence_index"] *
        (x.get("median_output_tokens_per_second") or 1)
    ),
    reverse=True
)

print(f"\n{'Rank':<5} {'Modelo':<35} {'Intel':>6} {'Speed':>10} {'Score':>12}")
print("-" * 74)
for i, m in enumerate(fast_smart[:10], 1):
    name = m["name"][:33]
    intel = m["evaluations"]["artificial_analysis_intelligence_index"]
    speed = m.get("median_output_tokens_per_second", 0) or 0
    score = intel * speed
    print(f"{i:<5} {name:<35} {intel:>6.1f} {speed:>10.1f} {score:>12.0f}")

# 7. Cruzar dados com endpoint de mídia
media_resp = requests.get(
    f"{BASE_URL}/data/media/text-to-image",
    headers={"x-api-key": API_KEY},
    params={"include_categories": "true"}
)
image_models = media_resp.json()["data"]

print(f"\n--- Top 5 Text-to-Image (ELO) ---")
top_image = sorted(image_models, key=lambda x: x.get("elo", 0), reverse=True)[:5]
for m in top_image:
    print(f"  {m['name']}: ELO {m['elo']} (±{m['ci95']}, {m['appearances']} votos)")
```

### Técnicas-chave de cruzamento

**Custo-benefício (Intelligence/Price Ratio):** Divida o `artificial_analysis_intelligence_index` pelo `price_1m_blended_3_to_1`. Modelos open-source servidos por providers baratos tipicamente dominam esse ranking. Um ratio de **100+** indica altíssimo custo-benefício; abaixo de **10** sugere um modelo premium.

**Speed × Quality Score:** Multiplique intelligence index por `median_output_tokens_per_second` para encontrar modelos que equilibram qualidade e velocidade. Útil para aplicações em tempo real.

**Filtrar por `model_creator.slug`:** Use o campo slug do criador para segmentar por empresa. Exemplos: `"openai"`, `"anthropic"`, `"google"`, `"meta"`, `"deepseek"`.

**Comparar reasoning vs non-reasoning:** Modelos de raciocínio terão `median_time_to_first_answer_token` significativamente maior que `median_time_to_first_token_seconds`. A diferença indica o tempo gasto "pensando". Para aplicações interativas, priorize o TTFAT.

**Cruzar endpoints LLM + Mídia:** Identifique criadores que dominam tanto em LLMs quanto em geração de imagem. Filtre modelos de ambos os endpoints por `model_creator.name` e construa um score composto.

---

## 9. Ferramentas da comunidade e integrações

### MCP Server (Model Context Protocol)

O projeto **`davidhariri/artificial-analysis-mcp`** (TypeScript, MIT) é um servidor MCP não-oficial que permite que assistentes de IA como Claude consultem dados da API. Expõe duas ferramentas: `list_models` (com filtros por creator, sort por diversos campos) e `get_model` (detalhes de um modelo específico). Instalação para Claude Code:

```bash
claude mcp add artificial-analysis -e AA_API_KEY=sua_chave -- npx -y artificial-analysis-mcp
```

### Skill de comparação de modelos

O repositório **`alexfazio/artificial-analysis-compare`** (Python) é uma skill de comparação que consome `/data/llms/models` para gerar tabelas comparativas, rankings e relatórios detalhados. Armazena a API key em `.config/config.json` e trata erros de rate limit e modelos não encontrados.

### Hugging Face Spaces oficiais

A Artificial Analysis mantém **5 Spaces no Hugging Face**, todos com dados derivados de sua plataforma:

- **LLM Performance Leaderboard** — ranking por qualidade, preço e velocidade de 100+ endpoints
- **Text-to-Image Leaderboard & Arena** — rankings ELO com 45.000+ votos
- **Video Generation Leaderboard** — text-to-video e image-to-video
- **Speech Arena Leaderboard** — rankings de text-to-speech
- **MicroEvals** — avaliações rápidas para comparação pontual

### Framework Stirrup

O **`ArtificialAnalysis/Stirrup`** (320+ stars) é o framework open-source de agentes da Artificial Analysis, usado internamente para executar avaliações como GDPval-AA. Não é um consumidor da API de dados, mas sim a infraestrutura de avaliação. Disponível em Python e TypeScript (StirrupJS).

### Dashboard de terceiros

O **AI Dashboard** de Adam Holter agrega dados da Artificial Analysis com OpenRouter, fal e feeds sociais em uma interface unificada para monitorar mudanças de preço, regressões de performance e lançamentos de modelos.

---

## 10. Boas práticas e troubleshooting

### Cache de responses

Com 1.000 req/dia, caching é essencial. Os dados de benchmark mudam lentamente (novos modelos a cada poucos dias; scores só mudam quando o índice é recalculado), mas métricas de velocidade são atualizadas a cada 3 horas. Uma estratégia eficaz: **cache benchmarks e pricing por 24 horas**, velocidade por 3–6 horas.

```python
import json, os, time

CACHE_FILE = "/tmp/aa_cache.json"
CACHE_TTL = 86400  # 24 horas

def get_models_cached(api_key):
    if os.path.exists(CACHE_FILE):
        cache = json.load(open(CACHE_FILE))
        if time.time() - cache["timestamp"] < CACHE_TTL:
            return cache["data"]
    
    resp = requests.get(
        "https://artificialanalysis.ai/api/v2/data/llms/models",
        headers={"x-api-key": api_key}
    )
    result = resp.json()["data"]
    json.dump({"timestamp": time.time(), "data": result}, open(CACHE_FILE, "w"))
    return result
```

### Segurança de API keys

**Nunca exponha a API key em código client-side** (JavaScript no navegador, apps mobile). Use um backend proxy. A documentação oficial é explícita: *"Do not include API keys in client-side code."*

### Use IDs, não slugs

A documentação recomenda usar os campos `id` (UUIDs) como identificadores primários em bancos de dados e mapeamentos. Os campos `slug` e `name` **podem mudar** ao longo do tempo. Se seu sistema precisa de referências estáveis, armazene sempre o UUID.

### Atribuição obrigatória

Todo uso da API gratuita **exige** atribuição visível linkando para `https://artificialanalysis.ai/`. Um brand kit oficial está disponível para download.

### Troubleshooting comum

| Problema | Causa provável | Solução |
|---|---|---|
| Response vazia ou poucos modelos | Modelos sem benchmark completo retornam `null` em alguns campos | Filtrar modelos com campos não-nulos antes de processar |
| Campos de avaliação ausentes | Intelligence Index evoluiu; campos novos podem aparecer | Usar `.get()` com defaults; não assumir campos fixos |
| Velocidade inconsistente entre requests | Dados são mediana P50 de 72h e flutuam | Calcular média própria entre consultas |
| Timeout no CritPt | Avaliação de 70 problemas é computacionalmente pesada | Aguardar — processamento pode levar minutos |
| 429 no CritPt com `remaining: 0` | Limite de 10 req/24h atingido | Checar header `X-RateLimit-Reset` para próxima janela |

---

## Conclusão — além dos rankings estáticos

A API da Artificial Analysis transforma dados de benchmark de IA em matéria-prima para decisões dinâmicas. A combinação de **intelligence scores + pricing + velocidade** em um único endpoint permite calcular métricas compostas que nenhum leaderboard estático oferece — como custo por ponto de inteligência ou o trade-off exato entre latência e qualidade para seu caso de uso específico.

O ecossistema ao redor da API está crescendo: servidores MCP permitem que assistentes de IA consultem benchmarks em tempo real, Hugging Face Spaces democratizam a visualização, e o framework Stirrup abre a caixa-preta das avaliações. A **lacuna principal** da API gratuita é a ausência de dados por provider — saber que o Llama 4 tem um intelligence index de X é útil, mas saber que o Fireworks o serve 3× mais rápido que o Together.ai requer o tier comercial.

Para quem está construindo sistemas de seleção automática de modelos, a estratégia mais robusta é: consumir a API uma vez ao dia, cachear os resultados, e aplicar funções de score customizadas que ponderem inteligência, custo e velocidade conforme as prioridades do seu domínio. Com **1.000 req/dia gratuitas**, uma única chamada diária a cada endpoint cobre todos os casos de uso razoáveis — sobrando margem para consultas ad-hoc e desenvolvimento.