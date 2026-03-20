# Guia definitivo de system prompts para automação com LLMs em 2025-2026

**LLMs como GPT-4.1, Gemini 2.5 e DeepSeek V3 já conseguem converter linguagem natural em ações programáveis com taxa de conformidade de schema acima de 98%, desde que o system prompt seja arquitetado corretamente.** O segredo está na combinação de catálogos de ações explícitos, enforcement de schema via APIs nativas e camadas de validação determinísticas. Este guia compila as melhores práticas verificadas de fontes oficiais — incluindo o GPT-4.1 Prompting Guide da OpenAI, documentação do Gemini 2.5 e API docs do DeepSeek — para construir prompts de sistema que transformem LLMs em funcionários virtuais confiáveis dentro de plataformas de automação.

O cenário mudou significativamente entre 2024 e 2026. O lançamento de Structured Outputs nativos pela OpenAI,   a adoção de JSON Schema padrão pelo Gemini,   e o modo strict do DeepSeek representam uma convergência: **todos os principais provedores agora oferecem mecanismos de constrained decoding que garantem conformidade estrutural na geração**. Frameworks como Instructor (3M+ downloads/mês), XGrammar (backend padrão do vLLM) e Guidance (Microsoft)  consolidaram padrões de produção para extração estruturada.  A diferença entre um sistema que funciona em demo e um que funciona em produção está nos detalhes de implementação por modelo, nas técnicas anti-alucinação e nos padrões de fallback — exatamente o que este guia cobre.

-----

## Anatomia de um system prompt para automação

Todo system prompt que converte intenções em ações programáveis precisa de **cinco componentes obrigatórios**, independentemente do modelo. A ausência de qualquer um deles é a causa mais frequente de falhas em produção.

**1. Definição de papel e restrição de escopo.** O LLM deve saber que é um roteador de ações, não um assistente genérico. Uma instrução como “Você é um roteador de automação. Sua ÚNICA função é interpretar a intenção do usuário e retornar a ação correspondente do catálogo abaixo” estabelece o closed-world assumption — o princípio de que se uma ação não está listada, ela não existe.

**2. Catálogo de ações com schema tipado.** Cada ação deve incluir: nome único, descrição funcional, parâmetros obrigatórios e opcionais com tipos, e restrições (enums, ranges). Exemplo:

```json
{
  "actions": [
    {
      "name": "send_email",
      "description": "Envia um email para um destinatário",
      "parameters": {
        "to": {"type": "string", "required": true, "description": "Email do destinatário"},
        "subject": {"type": "string", "required": true},
        "body": {"type": "string", "required": true},
        "priority": {"type": "string", "enum": ["low", "normal", "high"], "default": "normal"}
      }
    },
    {
      "name": "create_task",
      "description": "Cria uma tarefa no sistema de gestão",
      "parameters": {
        "title": {"type": "string", "required": true},
        "assignee": {"type": "string", "required": false},
        "due_date": {"type": "string", "format": "date", "required": false}
      }
    }
  ]
}
```

**3. Regras de comportamento explícitas.** GPT-4.1, em particular, segue instruções de forma literal  — expectativas não declaradas simplesmente não serão atendidas.  As regras devem cobrir: o que fazer quando nenhuma ação corresponde, como lidar com parâmetros ausentes, quando pedir esclarecimento, e o que nunca fazer (inventar ações, adivinhar valores).

**4. Schema de output estruturado.** Definir exatamente o formato de resposta esperado, incluindo campos para a ação selecionada, parâmetros extraídos, confiança e raciocínio breve. **5. Exemplos few-shot diversificados.** Entre 5 e 12 exemplos cobrindo: casos normais, ambiguidades, ações não suportadas e parâmetros incompletos. Pesquisas demonstram que **12+ exemplos melhoram a acurácia em 15-40%** sobre zero-shot para tarefas de extração estruturada. 

-----

## GPT-4.1: o mais obediente, o mais literal

O GPT-4.1, lançado em abril de 2025,  foi projetado especificamente para workflows agênticos.  Sua janela de contexto de **1.047.576 tokens**  (equivalente a ~750.000 palavras) permite incluir catálogos de ações massivos em uma única chamada.  No benchmark MultiChallenge de instruction following, alcança **38.3% vs 27.8% do GPT-4o** — uma melhoria de 10.5 pontos  que se traduz diretamente em melhor conformidade com prompts complexos.

**Structured Outputs nativo.** O GPT-4.1 oferece duas modalidades de output estruturado com constrained decoding, ambas garantindo conformidade com JSON Schema: 

```python
# Via response_format (para respostas estruturadas ao usuário)
response = client.chat.completions.create(
    model="gpt-4.1-2025-04-14",
    messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_input}],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "action_response",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["send_email", "create_task", "unsupported"]},
                    "parameters": {"type": "object"},
                    "confidence": {"type": "number"}
                },
                "required": ["action", "parameters", "confidence"],
                "additionalProperties": False
            }
        }
    }
)

# Via function calling com strict:true (para tool use)
tools = [{
    "type": "function",
    "function": {
        "name": "execute_action",
        "description": "Executa uma ação de automação",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["send_email", "create_task"]},
                "params": {"type": "object"}
            },
            "required": ["action", "params"],
            "additionalProperties": False
        },
        "strict": True
    }
}]
```

A taxa de violação de schema do GPT-4.1 mini é **inferior a 1%**, contra ~6% do GPT-4o.  Restrições importantes: `additionalProperties` deve ser `false`, todos os campos devem estar em `required`, e parallel tool calls são incompatíveis com strict mode  (use `parallel_tool_calls: false`). 

**Fórmula de três partes para prompts agênticos.** A OpenAI demonstrou que incluir estas três instruções no system prompt melhora performance em ~20% no SWE-bench: 

```
1. PERSISTÊNCIA: "Continue trabalhando até resolver completamente a solicitação do usuário."
2. USO DE FERRAMENTAS: "Se não tiver certeza, use suas ferramentas. NÃO invente respostas."
3. PLANEJAMENTO: "Planeje extensivamente antes de cada chamada e reflita sobre os resultados."
```

**Posicionamento de instruções.** Para contextos longos (catálogos grandes), use o método sandwich: instruções no início E no final do prompt.  Instruções apenas abaixo do contexto é o pior cenário. **Quando há conflito entre instruções, o GPT-4.1 segue a instrução mais próxima do final do prompt.** 

**Preços.** GPT-4.1: $2/$8 por 1M tokens (input/output).  GPT-4.1 Mini: $0.40/$1.60. GPT-4.1 Nano: $0.10/$0.40.  Cache de prompt: 75% de desconto. Batch API: 50% adicional. 

-----

## Gemini 2.5: flexibilidade de schema e modo thinking nativo

O Gemini 2.5 (Pro e Flash) oferece suporte completo a structured outputs via dois mecanismos: o legado `responseSchema` (OpenAPI 3.0) e o recomendado **`responseJsonSchema` (JSON Schema padrão)**, introduzido em novembro de 2025 com suporte a `anyOf`, `$ref`, schemas recursivos e tipos nullable. 

```python
from google import genai
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum

class ActionType(str, Enum):
    send_email = "send_email"
    create_task = "create_task"
    unsupported = "unsupported"

class AutomationResponse(BaseModel):
    action: ActionType
    parameters: dict
    confidence: float = Field(ge=0, le=1)
    reasoning: str

client = genai.Client()
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=user_input,
    config={
        "system_instruction": system_prompt,
        "response_mime_type": "application/json",
        "response_json_schema": AutomationResponse.model_json_schema(),
    },
)
parsed = AutomationResponse.model_validate_json(response.text)
```

**Function calling com modos de controle.** Uma vantagem exclusiva do Gemini são os modos de invocação: `AUTO` (modelo decide), **`ANY` (força chamada de função — garante aderência ao schema)**, `NONE` (proíbe chamadas) e `VALIDATED` (preview, valida schema mas permite texto). O modo `ANY` com `allowed_function_names` é ideal para automação: força o modelo a sempre retornar uma chamada de função válida.

**Thinking mode e structured output.** O Gemini 2.5 Pro e Flash são modelos de raciocínio (“thinking models”) que raciocinam internamente antes de responder. Isso **melhora significativamente a qualidade do function calling e structured output** — o modelo “pensa” e depois produz JSON conforme o schema. O budget de thinking é controlável: `thinking_budget=1024` (fixo), `-1` (dinâmico), ou `0` (desligado, apenas Flash). Tokens de pensamento são cobrados como output.

**Classificação via enum.** Para tarefas de classificação de intenção, o Gemini suporta `response_mime_type: "text/x.enum"` — retorna diretamente um valor de uma lista enumerada, sem JSON wrapping.  Ideal para o primeiro passo de um pipeline classify→fill.

**Limitação importante.** No Gemini 2.5, **não é possível combinar structured output com function calling simultaneamente** — essa feature só está disponível na série Gemini 3.  Streaming com tool calling também não é suportado.

**Preços.** Pro: $1.25/$10 por 1M tokens. Flash: $0.30/$2.50. Context caching: ~90% de economia em tokens repetidos. Ambos com janela de 1M tokens.

-----

## DeepSeek V3.2: custo mínimo, cuidados máximos

O DeepSeek V3.2 (dezembro 2025) unificou os modelos V3 e R1 em uma arquitetura híbrida:  `deepseek-chat` (modo não-thinking) e `deepseek-reasoner` (modo thinking).  Com **671B de parâmetros totais (37B ativados por token)** via Mixture-of-Experts,   oferece performance competitiva a um custo **10-30x menor que GPT-4.1**. 

**API 100% compatível com OpenAI.** A maior vantagem prática: basta trocar `base_url` e `api_key` no SDK da OpenAI: 

```python
from openai import OpenAI
client = OpenAI(api_key="<key>", base_url="https://api.deepseek.com")

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "system", "content": "Retorne a ação em formato JSON. " + system_prompt},
        {"role": "user", "content": user_input}
    ],
    response_format={"type": "json_object"}
)
```

**Limitações críticas para automação.** O DeepSeek **não suporta `json_schema` nativo** como a OpenAI — apenas `json_object`, que garante JSON válido mas não aderência ao schema. Para enforcement de schema, use o **modo strict em beta** (requer `base_url="https://api.deepseek.com/beta"`) com `"strict": true` nas definições de ferramentas. Restrições do strict mode: todos os campos devem ser `required`, `additionalProperties: false`,   suporta `anyOf`, `$ref`,  regex via `pattern`.  

**Bugs conhecidos.** A documentação oficial reconhece que o JSON mode **pode retornar conteúdo vazio ocasionalmente**  — sempre implemente try/catch e retry. A taxa de parsing de JSON historicamente era 78%, melhorou para 97% com regex post-processing.  **Multi-turn function calling é fraco**  — arquitete em torno de chamadas single-turn quando possível.

**Quando usar V3 vs R1 (reasoner).** Para structured output em automação, **sempre use `deepseek-chat`** (V3.2 non-thinking): tem suporte completo a JSON mode e tool calls,  taxa de alucinação de ~3.9%,  e responde bem a system prompts e few-shot.  O `deepseek-reasoner` (R1) tem taxa de alucinação de ~14.3%,  ignora system prompts (coloque tudo no user role), e não aceita few-shot   — é para raciocínio complexo, não para extração estruturada.

**Preços.** $0.28/$0.42 por 1M tokens (input/output). Cache hit: $0.028 (90% de desconto). Contexto: 128K tokens  (8x menor que GPT-4.1 e Gemini).

-----

## Padrões de design para roteamento de intenção

**Padrão 1: Single-step (intent + slot filling em uma chamada).** Ideal para catálogos com ≤10 ações. O LLM classifica a intenção e extrai parâmetros simultaneamente.   Menor latência, uma única chamada de API. Funciona bem com structured outputs nativos de qualquer modelo.

**Padrão 2: Two-step (classificar → preencher).** Para catálogos com 10-50 ações. Primeira chamada classifica a intenção (pode usar `text/x.enum` no Gemini ou um schema com enum no GPT-4.1). Segunda chamada extrai parâmetros específicos daquela ação. Cada passo é mais simples e preciso, com schemas menores. 

**Padrão 3: Hierarchical tree-walking.** Para catálogos com 50+ ações. Navega uma árvore: categoria → subcategoria → ação específica. Cada nível é uma classificação simples. Pesquisa da Universidade de Würzburg demonstra que essa decomposição mantém alta acurácia mesmo com centenas de ações. 

**Padrão 4: Semantic tool selection (pré-filtragem vetorial).** Embed as descrições de todas as ações em um vector store. Na query, recupere apenas as top-K ações mais relevantes antes de apresentá-las ao LLM. Pesquisa demonstra **redução de 86.4% em chamadas alucinadas** e **89% de economia em tokens**. 

**Fallback obrigatório para todos os padrões:**

```json
{
  "action": "unsupported",
  "message": "Não consigo executar essa ação. Ações disponíveis: [lista]"
}
{
  "action": "clarify", 
  "question": "Você quer enviar email ou criar uma tarefa?"
}
{
  "action": "needs_info",
  "missing": ["destinatario"],
  "question": "Para quem devo enviar o email?"
}
```

-----

## Técnicas avançadas 2025-2026 e enforcement de output

A escolha do mecanismo de enforcement depende do modelo e da infraestrutura:

|Mecanismo                           |Garantia                    |Funciona com                                |Melhor para                      |
|------------------------------------|----------------------------|--------------------------------------------|---------------------------------|
|**Structured Outputs (json_schema)**|100% conformidade estrutural|GPT-4.1, Gemini 2.5                         |Respostas estruturadas ao usuário|
|**Function calling + strict**       |100% conformidade de args   |GPT-4.1, Gemini (ANY), DeepSeek (beta)      |Chamadas de ferramentas/ações    |
|**JSON mode (json_object)**         |JSON válido, sem schema     |Todos                                       |Prototipagem rápida              |
|**Constrained decoding local**      |100% estrutural             |Modelos self-hosted (via XGrammar, Guidance)|Produção com modelos locais      |
|**Instructor + retry**              |Alta (com retries)          |15+ provedores via API                      |Extração com validação Pydantic  |

**Constrained decoding** é a técnica mais impactante de 2025-2026. Funciona mascarando tokens inválidos durante a geração  — o modelo literalmente não consegue produzir output malformado.  A OpenAI e o Gemini implementam isso nativamente em suas APIs. Para modelos self-hosted, o **XGrammar** (backend padrão do vLLM e SGLang,  overhead <40µs por token)  e o **Guidance** (melhor performance no JSONSchemaBench) são as escolhas de produção.  

**Instructor** é o framework mais adotado para APIs (3M+ downloads/mês,  usado em produção pela LSEG e times da OpenAI/Google). Sua abordagem de retry com feedback de erro resolve a maioria das falhas em 1-2 tentativas:  

```python
import instructor
from pydantic import BaseModel, Field
from enum import Enum

class ActionEnum(str, Enum):
    send_email = "send_email"
    create_task = "create_task"
    unsupported = "unsupported"

class AutomationAction(BaseModel):
    action: ActionEnum
    parameters: dict
    confidence: float = Field(ge=0, le=1)

# Funciona com OpenAI, Gemini, DeepSeek
client = instructor.from_provider("openai/gpt-4.1-mini")
result = client.chat.completions.create(
    response_model=AutomationAction,
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": "Envie um email para João sobre a reunião"}
    ],
    max_retries=3
)
```

-----

## Anti-padrões e armadilhas com soluções

**1. Injetar definições de ferramentas no texto do prompt em vez de usar o campo `tools` da API.** A OpenAI verificou que usar o campo `tools` dedicado melhora a acurácia em 2% no SWE-bench vs injeção manual.  Sempre use os mecanismos nativos da API.  

**2. Exigir “sempre chame uma ferramenta antes de responder” sem válvula de escape.** Isso causa chamadas alucinadas com inputs nulos. Solução: adicione “se não tiver informação suficiente para chamar a ferramenta, pergunte ao usuário”. 

**3. Usar o mesmo prompt em todos os modelos sem adaptação.** Cada modelo tem idiossincrasias: GPT-4.1 é literal (não infere expectativas implícitas);  DeepSeek ignora system prompts no modo reasoner;   Gemini requer `response_mime_type` explícito. Prompts devem ser testados e ajustados por modelo. 

**4. Confiar apenas no prompt para prevenir alucinações.** A abordagem mais confiável é **defesa em profundidade**: structured output API (camada 1) + enumeração de ações no prompt (camada 2) + validação determinística no código (camada 3) + retry com feedback (camada 4). Nenhuma técnica isolada é suficiente. 

**5. Não tratar o output do DeepSeek como potencialmente vazio.** O bug de conteúdo vazio no JSON mode é documentado oficialmente.  Sempre implemente: `if not response.choices[0].message.content: retry()`.

**6. Usar GPT-4.1 Nano para needle-in-haystack em catálogos grandes.** Testes independentes (PromptHub) mostram que o Nano falha completamente em recuperação de informação em contextos longos, apesar do benchmark oficial de 100%.  Use Mini ou o modelo base para catálogos extensos.

**7. Ignorar prompt injection em sistemas de automação.** O input do usuário é não-confiável. Implemente: separação estrita de contextos system/user, validação de ações contra o catálogo ANTES da execução, princípio de menor privilégio (ações destrutivas requerem aprovação humana), e classificadores de prompt injection  (Lakera Guard, OpenAI Guardrails). 

-----

## Tabela comparativa cross-model

|Característica                    |GPT-4.1                                         |Gemini 2.5 Flash                         |DeepSeek V3.2                                      |
|----------------------------------|------------------------------------------------|-----------------------------------------|---------------------------------------------------|
|**Structured Output nativo**      |✅ json_schema (constrained decoding)            |✅ responseJsonSchema (JSON Schema padrão)|⚠️ Apenas json_object (sem schema)                  |
|**Function calling strict**       |✅ `strict: true`                                |✅ modo `ANY`                             |⚠️ Beta (`/beta` endpoint)                          |
|**Taxa de violação de schema**    |<1.5%                                           |~0% (com schema)                         |~3% (json_object, sem schema nativo)               |
|**Contexto máximo**               |1M tokens                                       |1M tokens                                |128K tokens                                        |
|**Preço input/output (1M tokens)**|$2.00 / $8.00                                   |$0.30 / $2.50                            |$0.28 / $0.42                                      |
|**Cache de prompt**               |75% desconto                                    |~90% desconto                            |90% desconto                                       |
|**Thinking/Reasoning**            |❌ (requer CoT explícito)                        |✅ Nativo (budget controlável)            |✅ Via deepseek-reasoner                            |
|**Compatibilidade OpenAI SDK**    |Nativo                                          |✅ (endpoint compatível)                  |✅ (drop-in replacement)                            |
|**Instruction following**         |Excelente (literal)                             |Muito bom                                |Bom (V3), Fraco (R1 para system prompts)           |
|**Multi-turn tool calling**       |Forte                                           |Forte                                    |Fraco                                              |
|**Enum classification**           |Via schema enum                                 |✅ `text/x.enum`                          |Via prompt + JSON                                  |
|**Melhor para**                   |Workflows agênticos complexos, alta conformidade|Alto volume, custo-performance, thinking |Orçamento mínimo, prototipagem, modelos open-source|

-----

## Templates prontos para uso

### Template 1: Roteador de ações universal (GPT-4.1 com Structured Outputs)

```python
SYSTEM_PROMPT = """Você é um roteador de automação. Sua ÚNICA função é:
1. Interpretar a intenção do usuário
2. Selecionar a ação correta do catálogo
3. Extrair os parâmetros necessários
4. Retornar um JSON estruturado

## CATÁLOGO DE AÇÕES
- send_email(to: string, subject: string, body: string, priority?: "low"|"normal"|"high")
- create_task(title: string, description?: string, assignee?: string, due_date?: string)
- update_status(task_id: string, new_status: "todo"|"in_progress"|"done")
- search_contacts(query: string)

## REGRAS INVIOLÁVEIS
- Selecione APENAS ações do catálogo acima
- NUNCA invente ações que não existem
- NUNCA adivinhe valores de parâmetros — pergunte se necessário
- Se nenhuma ação corresponde: action = "unsupported"
- Se a intenção é ambígua: action = "clarify"
- Se faltam parâmetros obrigatórios: action = "needs_info"
- Sempre inclua confidence score (0.0-1.0)

## EXEMPLOS
User: "Manda um email pro João sobre o relatório mensal"
Output: {"action": "send_email", "parameters": {"to": "João", "subject": "Relatório mensal", "body": ""}, "confidence": 0.7, "reasoning": "Ação clara mas falta o corpo do email", "follow_up": "O que gostaria de escrever no corpo do email?"}

User: "Marca a tarefa 42 como concluída"
Output: {"action": "update_status", "parameters": {"task_id": "42", "new_status": "done"}, "confidence": 0.95, "reasoning": "Intenção clara, todos os parâmetros presentes"}

User: "Faz um post no Instagram"
Output: {"action": "unsupported", "parameters": {}, "confidence": 0.9, "reasoning": "Publicar no Instagram não está no catálogo de ações disponíveis", "message": "Não consigo publicar no Instagram. Posso: enviar emails, criar tarefas, atualizar status ou buscar contatos."}

User: "Deleta"
Output: {"action": "clarify", "parameters": {}, "confidence": 0.1, "reasoning": "Comando ambíguo sem objeto especificado", "question": "O que você gostaria de deletar? Não tenho ação de exclusão no momento, mas posso ajudar com emails, tarefas ou contatos."}"""

# Implementação com schema enforcement
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["send_email", "create_task", "update_status", 
                                                "search_contacts", "unsupported", "clarify", "needs_info"]},
        "parameters": {"type": "object"},
        "confidence": {"type": "number"},
        "reasoning": {"type": "string"},
        "message": {"type": "string"},
        "question": {"type": "string"},
        "follow_up": {"type": "string"}
    },
    "required": ["action", "parameters", "confidence", "reasoning"],
    "additionalProperties": False
}
```

### Template 2: Classificador de intenção (Gemini 2.5 Flash com enum)

```python
from google import genai

# Step 1: Classificação rápida via enum
intent = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=user_message,
    config={
        "system_instruction": "Classifique a intenção do usuário em uma das categorias disponíveis.",
        "response_mime_type": "text/x.enum",
        "response_json_schema": {
            "type": "string",
            "enum": ["send_email", "create_task", "update_status", "search", "unsupported"]
        },
        "thinking_config": {"thinking_budget": 256}
    }
)

# Step 2: Extração de parâmetros (apenas para ações suportadas)
if intent.text != "unsupported":
    params = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"Intenção: {intent.text}\nMensagem: {user_message}",
        config={
            "system_instruction": f"Extraia os parâmetros para a ação '{intent.text}'.",
            "response_mime_type": "application/json",
            "response_json_schema": ACTION_SCHEMAS[intent.text]
        }
    )
```

### Template 3: Pipeline robusto com validação (DeepSeek + Instructor)

```python
import instructor
from openai import OpenAI
from pydantic import BaseModel, Field, field_validator
from enum import Enum

class ActionType(str, Enum):
    send_email = "send_email"
    create_task = "create_task"
    unsupported = "unsupported"
    clarify = "clarify"

class AutomationAction(BaseModel):
    action: ActionType
    parameters: dict = Field(default_factory=dict)
    confidence: float = Field(ge=0, le=1)
    reasoning: str
    
    @field_validator("parameters")
    @classmethod
    def validate_params(cls, v, info):
        action = info.data.get("action")
        if action == "send_email" and "to" not in v:
            raise ValueError("send_email requer parâmetro 'to'")
        return v

client = instructor.from_openai(
    OpenAI(api_key="<key>", base_url="https://api.deepseek.com"),
    mode=instructor.Mode.JSON  # MD_JSON para reasoner
)

result = client.chat.completions.create(
    model="deepseek-chat",
    response_model=AutomationAction,
    messages=[
        {"role": "system", "content": "Retorne a ação em formato JSON. " + SYSTEM_PROMPT},
        {"role": "user", "content": user_input}
    ],
    max_retries=3
)

# Camada de validação determinística (neurosymbolic guardrail)
ALLOWED_ACTIONS = {"send_email", "create_task", "update_status", "search_contacts"}
if result.action.value not in ALLOWED_ACTIONS | {"unsupported", "clarify"}:
    result = AutomationAction(action=ActionType.unsupported, parameters={}, 
                               confidence=0, reasoning="Ação bloqueada pela camada de validação")
```

-----

## Conclusão: escolha por caso de uso

A decisão entre modelos e técnicas segue uma lógica pragmática. **Para máxima confiabilidade de schema**, use GPT-4.1 com Structured Outputs nativos — a taxa de violação inferior a 1.5% e o instruction following literal são imbatíveis para sistemas onde cada output malformado é um bug de produção. **Para volume alto com custo controlado**, Gemini 2.5 Flash oferece o melhor equilíbrio: thinking nativo melhora a qualidade de tool calling, o modo `ANY` força chamadas de função, e o preço de $0.30/1M tokens de input viabiliza catálogos grandes em contexto. **Para orçamento mínimo ou infraestrutura própria**, DeepSeek V3.2 custa 10-30x menos, mas exige camadas extras de validação — modo strict em beta, Instructor com retry, e sempre tratamento de conteúdo vazio.

O insight mais valioso que emerge desta pesquisa é que **a confiabilidade de um sistema de automação com LLMs depende mais da arquitetura ao redor do modelo do que do modelo em si**. Constrained decoding, validação Pydantic, guardrails determinísticos, pre-filtragem vetorial de ferramentas e pipelines de retry são o que transforma uma demo impressionante em um sistema de produção. O modelo fornece a inteligência; a engenharia fornece a confiabilidade.