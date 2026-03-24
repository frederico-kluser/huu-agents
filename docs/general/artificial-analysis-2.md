# Todos os benchmarks e métricas da API Artificial Analysis

A API da Artificial Analysis (AA) no endpoint `/api/v2/data/llms/models` retorna **10 campos de benchmark individuais** e **3 índices compostos** no objeto `evaluations`, totalizando 13 campos de avaliação confirmados na documentação oficial. Contudo, a documentação pública parece desatualizada em relação ao Intelligence Index v4.0 (lançado em janeiro de 2026), que substituiu 3 benchmarks por 7 novos — indicando que a resposta real da API provavelmente contém campos adicionais não refletidos no exemplo documentado. Não existem benchmarks de codificação específicos por linguagem de programação; todas as avaliações de código utilizam Python como linguagem de execução.

---

## Estrutura completa da resposta JSON da API

O endpoint principal `GET /api/v2/data/llms/models` requer autenticação via header `x-api-key` e retorna a seguinte estrutura:

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

**Atenção crítica:** este exemplo da documentação oficial provavelmente reflete a versão anterior ao v4.0 do Intelligence Index. Os campos `mmlu_pro`, `livecodebench`, `math_500` e `aime` foram **removidos** do índice composto na v4.0 (janeiro 2026) e substituídos por novos benchmarks. Esses campos antigos provavelmente ainda são retornados como avaliações standalone, mas a API viva quase certamente inclui campos adicionais para os novos benchmarks da v4.0.

---

## Todos os campos de benchmark confirmados e inferidos

### Índices compostos (escala 0–100, normalizados)

| Campo JSON | Descrição | Escala |
|---|---|---|
| `artificial_analysis_intelligence_index` | Intelligence Index v4.0 — média ponderada de 10 avaliações em 4 categorias | 0–100 |
| `artificial_analysis_coding_index` | Coding Index — composto por Terminal-Bench Hard + SciCode | 0–100 |
| `artificial_analysis_math_index` | Math Index — composto por AIME 2025 + MATH-500 | 0–100 |

O **Agentic Index** existe no site da AA (em `/models/capabilities/agentic`) mas **não aparece** como campo documentado na API gratuita. Se existir na resposta, o nome provável seria `artificial_analysis_agentic_index`. O mesmo se aplica ao **Multilingual Index** e ao **Openness Index** — presentes no site, mas não documentados na API pública.

### Benchmarks individuais confirmados na documentação (escala 0–1, proporção pass@1)

| Campo JSON | Benchmark | Questões | Status no Index v4.0 |
|---|---|---|---|
| `gpqa` | GPQA Diamond — raciocínio científico pós-graduação | 198 (MC 4 opções) | ✅ No Index (6,25% peso) |
| `hle` | Humanity's Last Exam — questões de especialistas | 2.158 (texto) | ✅ No Index (12,5% peso) |
| `scicode` | SciCode — codificação científica em Python | 338 sub-problemas | ✅ No Index (8,3% peso) |
| `mmlu_pro` | MMLU-Pro — conhecimento geral aprimorado | 12.032 (MC 10 opções) | ❌ Standalone (removido na v4.0) |
| `livecodebench` | LiveCodeBench — problemas novos de programação | 315 | ❌ Standalone (removido na v4.0) |
| `math_500` | MATH-500 — matemática competitiva | 500 | ❌ Standalone (parte do Math Index) |
| `aime` | AIME 2025 — olimpíada de matemática | 30 (inteiros 0–999) | ❌ Standalone (parte do Math Index) |

### Campos prováveis da v4.0 (inferidos pela metodologia e padrões de nomenclatura)

Estes benchmarks compõem o Intelligence Index v4.0 mas seus nomes JSON exatos não estão confirmados na documentação pública. Os nomes abaixo são **inferidos** pelos padrões de URL slugs e nomenclatura da AA:

| Campo JSON provável | Benchmark | Questões | Peso no Index v4.0 | Categoria |
|---|---|---|---|---|
| `gdpval_aa` | GDPval-AA — trabalho real com ferramentas | 220 tarefas | 16,7% | Agents |
| `tau2_bench_telecom` | τ²-Bench Telecom — agente conversacional | 114 tarefas | 8,3% | Agents |
| `terminal_bench_hard` | Terminal-Bench Hard — codificação em terminal | 44 tarefas | 16,7% | Coding |
| `aa_lcr` | AA-LCR — raciocínio em contexto longo (~100k tokens) | 100 | 6,25% | General |
| `aa_omniscience` | AA-Omniscience — conhecimento e alucinação | 6.000 | 12,5% | General |
| `ifbench` | IFBench — seguimento de instruções | 294 | 6,25% | General |
| `critpt` | CritPt — raciocínio em física | 70 desafios | 6,25% | Scientific Reasoning |

**Para descobrir os nomes definitivos**, é necessário fazer uma chamada real à API com sua chave — veja o código Python na seção final deste relatório.

---

## Intelligence Index v4.0 — composição completa com pesos exatos

O Intelligence Index v4.0 (versão 4.0.2, janeiro 2026) organiza **10 avaliações em 4 categorias com peso igual de 25% cada**. Dentro de cada categoria, os benchmarks têm pesos proporcionais. O índice é normalizado para a escala 0–100, onde os melhores modelos atualmente pontuam em torno de **50** (contra ~73 na versão anterior v3.0, indicando menor saturação).

**Categoria Agents (25% do total):**
- **GDPval-AA** recebe peso de **16,7%** do total. Avalia 220 tarefas de trabalho real em 44 profissões e 9 indústrias, usando o harness agentic Stirrup com 5 ferramentas (Web Fetch, Web Search, View Image, Run Shell, Finish). Pontuação baseada em ELO de comparações pareadas cegas, normalizada como `clamp((ELO - 500) / 2000)`.
- **τ²-Bench Telecom** recebe peso de **8,3%**. Benchmark da Sierra com 114 tarefas de suporte telecom, agente-usuário simulado por Qwen3 235B, avaliação por estado do mundo. Pass@1 com 3 repetições.

**Categoria Coding (25% do total):**
- **Terminal-Bench Hard** recebe peso de **16,7%**. 44 tarefas de engenharia de software, admin de sistemas e processamento de dados em ambiente terminal. Stanford/Laude Institute. Pass@1 com 3 repetições.
- **SciCode** recebe peso de **8,3%**. 338 sub-problemas de 80 problemas de laboratório em 16 disciplinas científicas. Código Python avaliado com contexto científico. Pass@1 com 3 repetições.

**Categoria General (25% do total):**
- **AA-Omniscience** recebe peso de **12,5%**. 6.000 questões em 42 tópicos. Pontuação composta: `0,5 × Acurácia + 0,5 × (1 - Taxa de Alucinação)`. O índice standalone varia de -100 a +100.
- **AA-LCR** recebe peso de **6,25%**. 100 questões que requerem raciocínio sobre documentos de ~100k tokens em 7 categorias. Exige janela de contexto mínima de 128K.
- **IFBench** recebe peso de **6,25%**. 294 questões com 58 tipos de restrições de instrução. Allen AI. Pass@1 com 5 repetições.

**Categoria Scientific Reasoning (25% do total):**
- **HLE (Humanity's Last Exam)** recebe peso de **12,5%**. 2.158 questões apenas texto de especialistas de elite. 1 repetição.
- **GPQA Diamond** recebe peso de **6,25%**. 198 questões científicas de nível pós-doutorado, MC com 4 opções. 5 repetições.
- **CritPt** recebe peso de **6,25%**. 70 desafios de física em nível de pesquisa, criados por 50+ pesquisadores de 30+ instituições. 5 repetições. Possui endpoint de avaliação próprio: `POST /api/v2/critpt/evaluate`.

---

## Coding Index — composição e a questão das linguagens específicas

O Coding Index (`artificial_analysis_coding_index`) é composto por apenas **dois benchmarks**: Terminal-Bench Hard e SciCode. **Não existe nenhum benchmark específico por linguagem de programação** (Python, JavaScript, Rust, etc.) na API da Artificial Analysis. Todas as avaliações de codificação utilizam Python como linguagem primária de execução.

O Terminal-Bench Hard inclui uma única tarefa chamada "polyglot-rust-c", mas isso é um caso isolado dentro de 44 tarefas — não constitui um benchmark separado por linguagem. O LiveCodeBench, anteriormente parte do índice, também utiliza exclusivamente problemas de programação competitiva em Python. A AA não oferece campos como `python_score`, `javascript_score`, ou qualquer `polyglot_index`.

Para benchmarks de codificação multilíngue, seria necessário buscar dados em outras fontes como o MultiPL-E ou BigCodeBench, que não estão disponíveis nesta API.

---

## Math Index e Agentic Index — composição confirmada

O **Math Index** (`artificial_analysis_math_index`) combina AIME 2025 (30 problemas olímpicos, 10 repetições) e MATH-500 (500 problemas competitivos). Ambos foram removidos do Intelligence Index v4.0 e agora operam como avaliações standalone que alimentam apenas este índice composto.

O **Agentic Index** existe na página `/models/capabilities/agentic` do site e combina GDPval-AA e τ²-Bench Telecom. Entretanto, **não há campo documentado** `artificial_analysis_agentic_index` na API pública gratuita. Pode existir na API comercial ou ter sido adicionado à API gratuita sem atualização da documentação.

---

## Benchmarks de visão, áudio, multimodal e tool use

O Intelligence Index v4.0 é **exclusivamente textual e em inglês**. Capacidades multimodais são avaliadas separadamente:

**Visão:** O MMMU-Pro (1.730 questões de raciocínio visual em 30 disciplinas acadêmicas, MC com 10 opções) é utilizado como métrica primária de "Visual Reasoning Intelligence" na página de modelos de visão. Porém, **não existe campo `mmmu_pro`** documentado no endpoint de LLMs da API gratuita (cuidado para não confundir com `mmlu_pro`, que é um benchmark diferente, somente texto).

**Tool use e function calling:** GDPval-AA e τ²-Bench Telecom envolvem uso de ferramentas, mas não há campos separados como `tool_use_score` ou `function_calling_score`. Os scores de tool use estão incorporados nos resultados gerais desses benchmarks agentivos.

**Áudio/Speech:** A API possui endpoints separados para mídia (`/api/v2/data/media/text-to-speech`, etc.) que retornam scores ELO, mas nenhum benchmark de áudio aparece no objeto `evaluations` de LLMs. O benchmark AA-WER v2.0 (taxa de erro de palavras) para Speech-to-Text existe no site mas não na API pública documentada.

**Multilingual:** O Global-MMLU-Lite (~6.000 questões em 16 idiomas) alimenta o Multilingual Index no site, mas não está documentado na API gratuita.

---

## Endpoints e parâmetros de consulta disponíveis

A API gratuita oferece **7 endpoints**, sem parâmetros de filtragem por benchmark. O usuário deve buscar a resposta completa e filtrar localmente:

| Endpoint | Método | Parâmetros |
|---|---|---|
| `/api/v2/data/llms/models` | GET | `prompt_length` (default: `medium`) |
| `/api/v2/data/media/text-to-image` | GET | `include_categories=true` |
| `/api/v2/data/media/image-editing` | GET | — |
| `/api/v2/data/media/text-to-speech` | GET | — |
| `/api/v2/data/media/text-to-video` | GET | `include_categories=true` |
| `/api/v2/data/media/image-to-video` | GET | `include_categories=true` |
| `/api/v2/critpt/evaluate` | POST | Body JSON com submissões de código |

**Não existem** parâmetros para filtrar por benchmark específico, modelo individual, ou tipo de avaliação. Não existe especificação OpenAPI/Swagger pública. O rate limit é de **1.000 requests/dia** (tier gratuito) e **10 requests/24h** para o endpoint CritPt.

Os endpoints de mídia retornam scores **ELO** com campos `elo`, `rank`, `ci95`, `appearances` e `release_date` por modelo. O parâmetro `include_categories` adiciona breakdowns por `style_category`, `subject_matter_category` e `format_category` (vídeo).

---

## Scores brutos versus normalizados

Os benchmarks individuais retornam **scores brutos como proporções (0.0 a 1.0)**, representando a taxa de acerto pass@1. Os três índices compostos retornam **scores normalizados na escala 0–100**.

Exceções notáveis na normalização:
- **GDPval-AA**: usa ELO convertido pela fórmula `clamp((ELO - 500) / 2000)` para transformar em proporção 0–1
- **AA-Omniscience**: o índice standalone varia de **-100 a +100**, mas para o Intelligence Index a fórmula é `0,5 × Acurácia + 0,5 × (1 - Taxa de Alucinação)`
- **Temperatura de avaliação**: 0 para modelos não-reasoning, 0,6 para modelos reasoning
- **Max output tokens**: 16.384 para não-reasoning; máximo permitido para reasoning
- **Ambiente de código**: Ubuntu 22.04, Python 3.12

---

## Código Python para acessar todos os benchmarks

```python
import requests
import json

API_KEY = "sua_chave_aqui"
BASE_URL = "https://artificialanalysis.ai/api/v2"

# ============================================================
# 1. Buscar TODOS os modelos com avaliações
# ============================================================
resp = requests.get(
    f"{BASE_URL}/data/llms/models",
    headers={"x-api-key": API_KEY}
)
data = resp.json()

# ============================================================
# 2. Descobrir TODOS os campos reais do objeto evaluations
#    (essencial para encontrar campos v4.0 não documentados)
# ============================================================
todos_campos = set()
for model in data["data"]:
    if model.get("evaluations"):
        todos_campos.update(model["evaluations"].keys())

print("=== TODOS OS CAMPOS DE AVALIAÇÃO NA API ===")
for campo in sorted(todos_campos):
    print(f"  - {campo}")

# ============================================================
# 3. Acessar cada benchmark para um modelo específico
# ============================================================
for model in data["data"]:
    evals = model.get("evaluations", {})
    print(f"\n{'='*60}")
    print(f"Modelo: {model['name']} ({model['model_creator']['name']})")
    print(f"ID: {model['id']}")
    print(f"Slug: {model['slug']}")

    # Índices compostos (escala 0-100)
    print(f"\n--- Índices Compostos (0-100) ---")
    print(f"  Intelligence Index: {evals.get('artificial_analysis_intelligence_index')}")
    print(f"  Coding Index:       {evals.get('artificial_analysis_coding_index')}")
    print(f"  Math Index:         {evals.get('artificial_analysis_math_index')}")

    # Benchmarks individuais confirmados (escala 0-1)
    print(f"\n--- Benchmarks Confirmados (0.0-1.0) ---")
    campos_confirmados = [
        ("gpqa", "GPQA Diamond"),
        ("hle", "Humanity's Last Exam"),
        ("scicode", "SciCode"),
        ("mmlu_pro", "MMLU-Pro"),
        ("livecodebench", "LiveCodeBench"),
        ("math_500", "MATH-500"),
        ("aime", "AIME 2025"),
    ]
    for campo, nome in campos_confirmados:
        valor = evals.get(campo)
        print(f"  {campo:45s} ({nome}): {valor}")

    # Campos prováveis v4.0 (testar se existem)
    print(f"\n--- Campos Prováveis v4.0 (verificar se existem) ---")
    campos_v4 = [
        ("gdpval_aa", "GDPval-AA (Agents)"),
        ("tau2_bench_telecom", "τ²-Bench Telecom (Agents)"),
        ("terminal_bench_hard", "Terminal-Bench Hard (Coding)"),
        ("aa_lcr", "AA-LCR (Long Context)"),
        ("aa_omniscience", "AA-Omniscience (Knowledge)"),
        ("ifbench", "IFBench (Instruction Following)"),
        ("critpt", "CritPt (Physics)"),
        ("artificial_analysis_agentic_index", "Agentic Index"),
        ("mmmu_pro", "MMMU-Pro (Vision)"),
        ("global_mmlu_lite", "Global-MMLU-Lite (Multilingual)"),
        ("artificial_analysis_openness_index", "Openness Index"),
    ]
    for campo, nome in campos_v4:
        valor = evals.get(campo)
        if valor is not None:
            print(f"  ✅ {campo:45s} ({nome}): {valor}")
        else:
            print(f"  ❌ {campo:45s} ({nome}): NÃO ENCONTRADO")

    # Pricing
    pricing = model.get("pricing", {})
    print(f"\n--- Preços (USD por 1M tokens) ---")
    print(f"  Blended (3:1): ${pricing.get('price_1m_blended_3_to_1')}")
    print(f"  Input:         ${pricing.get('price_1m_input_tokens')}")
    print(f"  Output:        ${pricing.get('price_1m_output_tokens')}")

    # Performance
    print(f"\n--- Performance ---")
    print(f"  Velocidade:    {model.get('median_output_tokens_per_second')} tokens/s")
    print(f"  TTFT:          {model.get('median_time_to_first_token_seconds')}s")
    print(f"  TTFAT:         {model.get('median_time_to_first_answer_token')}s")

    break  # Mostrar apenas o primeiro modelo como exemplo

# ============================================================
# 4. Filtrar modelos por benchmark específico
#    (não há parâmetro de filtro — filtrar localmente)
# ============================================================
print("\n\n=== TOP 5 MODELOS POR CODING INDEX ===")
modelos_com_coding = [
    m for m in data["data"]
    if m.get("evaluations", {}).get("artificial_analysis_coding_index") is not None
]
modelos_com_coding.sort(
    key=lambda m: m["evaluations"]["artificial_analysis_coding_index"],
    reverse=True
)
for i, m in enumerate(modelos_com_coding[:5], 1):
    score = m["evaluations"]["artificial_analysis_coding_index"]
    print(f"  {i}. {m['name']:40s} Coding Index: {score}")

# ============================================================
# 5. Exportar TODOS os campos de avaliação para análise
# ============================================================
print("\n\n=== DUMP COMPLETO DOS CAMPOS DE AVALIAÇÃO (JSON) ===")
for model in data["data"][:3]:
    print(f"\n{model['name']}:")
    print(json.dumps(model.get("evaluations", {}), indent=2))
```

```bash
# Exemplo com curl para descobrir todos os campos reais
curl -s "https://artificialanalysis.ai/api/v2/data/llms/models" \
  -H "x-api-key: $AA_API_KEY" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
campos = set()
for m in data['data']:
    if 'evaluations' in m:
        campos.update(m['evaluations'].keys())
for c in sorted(campos):
    print(c)
"
```

---

## Conclusão

A API gratuita da Artificial Analysis documenta **13 campos de avaliação** no objeto `evaluations`: 3 índices compostos na escala 0–100 e 10 benchmarks individuais na escala 0–1. Contudo, a documentação quase certamente está desatualizada em relação ao Intelligence Index v4.0, que adicionou 7 novos benchmarks (GDPval-AA, τ²-Bench Telecom, Terminal-Bench Hard, AA-LCR, AA-Omniscience, IFBench, CritPt). **O passo mais importante é executar o script Python acima com sua chave de API** para revelar todos os campos reais da resposta atual, incluindo quaisquer benchmarks não documentados.

Três lacunas significativas merecem atenção: (1) não existem benchmarks específicos por linguagem de programação — se você precisa avaliar modelos em Rust, JavaScript ou Go, precisará de fontes externas como MultiPL-E ou BigCodeBench; (2) os índices Agentic, Multilingual e Openness existem no site mas podem não estar na API gratuita — a API comercial ("more comprehensive data") provavelmente os inclui; (3) benchmarks multimodais como MMMU-Pro e métricas de tool use/function calling não possuem campos separados no endpoint de LLMs. O endpoint `POST /api/v2/critpt/evaluate` é o único que permite submissão de código para avaliação direta, com limite de 10 requests por 24 horas.