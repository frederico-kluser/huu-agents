# Código agent-friendly: JSDoc, métricas de arquivo e padrões que LLMs entendem melhor

## Resumo executivo

**A documentação e a estrutura de arquivos são os fatores de maior impacto na performance de agentes de codificação baseados em LLM.** Pesquisas recentes demonstram que o problema central não é o tamanho da janela de contexto, mas a relação sinal-ruído dentro dela — um fenômeno chamado "context rot", onde cada token irrelevante degrada a qualidade das respostas do modelo. A abordagem híbrida TypeScript + JSDoc emergiu como consenso entre praticantes e ferramentas: TypeScript fornece estrutura verificável pelo compilador, enquanto JSDoc agrega contexto semântico que tipos sozinhos não expressam — propósito, exemplos de uso, erros lançados e relações entre módulos. Métricas concretas apontam para um "sweet spot" de **200–500 linhas por arquivo** (ideal ~300), **5–10 funções por arquivo** e **máximo de 50 linhas por função**, com complexidade ciclomática abaixo de 10. Anti-patterns como documentação desatualizada, uso indiscriminado de `any`, e comentários que descrevem o "quê" em vez do "porquê" são responsáveis por degradação mensurável na acurácia dos agentes. O padrão AGENTS.md, adotado por mais de 60.000 repositórios e suportado por Claude Code, Cursor, Copilot, Aider e Windsurf, consolidou-se como o mecanismo universal para comunicar convenções a agentes.

---

## Padrões JSDoc que agentes interpretam com maior acurácia

A documentação inline funciona como um "mapa semântico" para agentes de codificação. Estudos da IBM demonstraram até **47% de melhoria na acurácia** de respostas de IA quando a documentação é bem estruturada. Porém, nem todas as tags JSDoc têm o mesmo peso. A hierarquia abaixo reflete o impacto observado na prática com ferramentas como Copilot, Claude Code e Cursor.

### Tags essenciais (Tier 1)

As tags `@param`, `@returns`, `@type` e `@typedef` formam a base mínima. Agentes dependem fortemente de `@param` para compreender contratos de função e de `@returns` para inferir o tipo de saída sem precisar analisar toda a implementação. A tag `@typedef` é crítica para definir shapes de objetos complexos que transitam pela codebase, especialmente em projetos JavaScript puro.

### Tags de alto valor (Tier 2)

As tags `@example`, `@throws`, `@template` e `@deprecated` adicionam camadas de contexto que diferenciam uma documentação funcional de uma excelente. A Anthropic recomenda explicitamente o uso de exemplos (few-shot prompting) como uma das práticas mais eficazes para orientar LLMs. A tag `@throws` é particularmente valiosa porque **TypeScript não possui sintaxe nativa para declarar exceções** — análises da CodeRabbit revelaram que gaps de error handling são ~2x mais prevalentes em código gerado por IA. A tag `@deprecated` previne que agentes utilizem APIs obsoletas.

### Exemplo de documentação ideal (abordagem híbrida)

```typescript
/**
 * Processa pagamento via gateway configurado.
 *
 * @param transaction - Dados da transação de pagamento
 * @returns Resultado com ID da transação e status
 * @throws {PaymentGatewayError} Gateway inacessível
 * @throws {InsufficientFundsError} Saldo insuficiente
 * @example
 * const result = await processPayment({
 *   amount: 29.99,
 *   currency: 'BRL',
 *   customerId: 'cust_123'
 * });
 * console.log(result.transactionId); // "txn_abc123"
 */
async function processPayment(
  transaction: PaymentTransaction
): Promise<PaymentResult> {
  // implementação
}
```

### Exemplo de documentação que degrada a performance

```javascript
// ❌ RUIM: Verbosidade que consome contexto sem agregar informação
/**
 * Esta função é responsável por processar o pagamento do usuário.
 * Ela recebe como parâmetro um objeto de transação que contém os
 * dados necessários para processar o pagamento. Primeiro, ela valida
 * os dados da transação verificando se o valor é positivo e se a
 * moeda é suportada. Em seguida, ela se conecta ao gateway de
 * pagamento configurado no arquivo de environment variables e envia
 * a requisição de pagamento. Se a requisição for bem sucedida, ela
 * retorna um objeto com o ID da transação...
 * @param {Object} transaction - O objeto de transação
 * @param {number} transaction.amount - O valor do pagamento
 * @param {string} transaction.currency - A moeda do pagamento
 */
function processPayment(transaction) { ... }
```

O primeiro exemplo ocupa ~12 linhas e comunica contrato, erros e uso. O segundo ocupa ~13 linhas, replica o que o código já diz, duplica informação de tipos que poderiam ser inferidos, e consome tokens preciosos da janela de contexto do agente.

### Princípio-chave: documente o "porquê", não o "quê"

Múltiplas fontes convergem neste ponto: comentários devem explicar **intenção, decisões de design e lógica não-óbvia** — nunca o que o código já torna evidente. O guia da Marmelab sobre "Agent Experience" recomenda usar "sinônimos" em comentários (mencionar "Cliente" e "Usuário" perto de "Customer") para melhorar a descobribilidade por agentes que fazem busca textual na codebase.

---

## Métricas ideais: linhas, funções e complexidade por arquivo

A pesquisa sobre "context rot" da Chroma testou **18 modelos frontier** (incluindo GPT-4.1, Claude Opus 4 e Gemini 2.5) e descobriu que **todos os modelos degradam à medida que o input cresce**, mesmo em tarefas simples. O fenômeno "Lost in the Middle", documentado por Liu et al. (Stanford/TACL 2024), demonstra uma **curva de performance em U**: LLMs compreendem melhor informações no início e no fim do contexto, com queda de **30%+ na acurácia** quando a informação relevante está no meio.

### Recomendações numéricas consolidadas

| Métrica | Faixa recomendada | Limite máximo | Justificativa |
|---------|-------------------|---------------|---------------|
| **Linhas por arquivo** | 200–500 | 800 | 300 linhas ≈ 3K tokens; minimiza diluição de atenção |
| **Funções por arquivo** | 5–10 | 15 | Alinhado com responsabilidade única por arquivo |
| **Linhas por função** | 20–50 | 50 | Funções >50 linhas correlacionam com falhas de qualidade IA |
| **Complexidade ciclomática** | ≤7 | 10 | CodeScene: score de saúde ≥9.5/10 correlaciona com sucesso IA |
| **Complexidade aninhada** | Mínima possível | — | Mais preditiva que complexidade ciclomática para IA |

### A aritmética de tokens

Cada linha de JavaScript/TypeScript equivale a aproximadamente **7–10 tokens**. Um arquivo de 300 linhas consome ~2.100–3.000 tokens — uma fração confortável de qualquer janela de contexto moderna. Porém, o Claude Code adiciona **70% de overhead** ao carregar arquivos (devido à formatação de números de linha), e arquivos carregados via `@` são **silenciosamente truncados em 2.000 linhas**. Na prática, a qualidade do Claude Code degrada ao redor de **147K–152K tokens**, cerca de 25% abaixo do limite nominal de 200K.

### Por que arquivos menores vencem: evidência do SWE-Bench

Dados do SWE-Bench Pro revelam um padrão claro: em tarefas que exigem modificação de **1 arquivo com <15 linhas**, modelos frontier atingem **80%+ de sucesso**. Em tarefas multi-arquivo (4+ arquivos, ~107 linhas de patch), a taxa cai para **menos de 25%**. A conclusão é direta: **quanto menor e mais focado o escopo que o agente precisa processar, maior a probabilidade de acerto**.

---

## Decomposição de arquivos e navegação por agentes

### Responsabilidade única é inegociável

O princípio de "uma responsabilidade por arquivo" aparece como recomendação universal em todas as ferramentas pesquisadas. A Marmelab o resume como "Code SEO para agentes": arquivos focados permitem que o agente encontre e compreenda funcionalidades sem carregar contexto irrelevante. Nomes descritivos e únicos são essenciais — **múltiplos arquivos `index.ts`** confundem agentes que perdem tempo lendo todos para encontrar o correto.

### Barrel files: usem com cautela

A comunidade é dividida quanto a barrel files. Do ponto de vista de agent-friendliness, imports explícitos apontando para o arquivo real da implementação superam re-exports via barrel files, pois agentes navegam mais rápido até o código-fonte. A Mercari, por exemplo, usa `exports.ts` como entry points de módulos, mas com referências explícitas.

### Progressive disclosure em monorepos

O padrão emergente para monorepos é a **documentação hierárquica**: um AGENTS.md na raiz com orientações gerais e AGENTS.md em subdiretórios com regras específicas de cada pacote. A Mercari Engineering utiliza referências cruzadas no formato `@docs/architecture.md` para carregar contexto sob demanda, evitando que o agente processe toda a documentação de uma vez.

### READMEs por diretório

A recomendação da Marmelab de incluir um **README.md em cada diretório importante** — sumarizando propósito e conteúdo — funciona como um índice navegável para agentes. Combinado com nomes de diretórios descritivos e baseados no domínio (não na tecnologia), cria-se uma codebase que agentes "entendem" pela estrutura, antes mesmo de ler o código.

---

## Anti-patterns que degradam a performance dos agentes

### Documentação desatualizada é pior que nenhuma documentação

Pesquisa da Universidade KAIST revelou que **mesmo o GPT-4 gera afirmações factualmente incorretas em ~1/5 dos comentários gerados**. Quando a documentação existente contradiz o código, agentes podem seguir qualquer um dos dois caminhos — criando comportamento imprevisível. O princípio é claro: **o código é a fonte de verdade**. Documentação que contradiz o código é um bug.

### Os 7 anti-patterns mais destrutivos

- **Comentários-papagaio**: a OX Security encontrou o padrão "Comments Everywhere" em **90–100% dos repositórios gerados por IA**. Comentários que descrevem o óbvio (`// incrementa o contador` acima de `counter++`) consomem tokens sem valor.
- **Tipo `any` como escape**: quando o agente não descobre o tipo correto, recorre ao `any`. Isso "perfura o sistema de tipos" e gera erros em runtime semanas depois. Use a regra ESLint `@typescript-eslint/no-explicit-any`.
- **Terminologia inconsistente**: chamar o mesmo conceito de "caso", "ticket" e "issue" em diferentes partes do código confunde agentes, especialmente em instruções longas.
- **Instruções negativas**: frases como "NÃO use moment.js" são menos eficazes que "Use date-fns em vez de moment.js porque moment.js está deprecated e aumenta o bundle size" — a explicação do "porquê" ajuda o agente a tomar decisões corretas em edge cases.
- **Over-abstraction**: instruções vagas como "escreva bom código" ou "siga best practices" têm **valor zero** para agentes. Incluir exemplos concretos com restrições específicas.
- **Paths hardcoded na documentação**: caminhos de arquivo mudam constantemente. Se o AGENTS.md diz "lógica de auth em `src/auth/handlers.ts`" e o arquivo é renomeado, o agente buscará no lugar errado com confiança.
- **Documentação auto-gerada sem curadoria**: a Anthropic alerta explicitamente para **nunca auto-gerar o CLAUDE.md** — arquivos auto-gerados priorizam abrangência sobre precisão, resultando em excesso de contexto com pouco sinal.

---

## JSDoc puro vs TypeScript types vs abordagem híbrida

A tabela abaixo sintetiza a análise comparativa sob a perspectiva de agent-readability, baseada em pesquisa acadêmica sobre type-constrained decoding, experiência prática de migrações JS→TS com agentes, e documentação oficial das ferramentas.

| Aspecto | JSDoc puro | TypeScript puro | Híbrido (TS + JSDoc/TSDoc) |
|---------|-----------|----------------|---------------------------|
| **Segurança de tipos** | Baseada em comentários, opt-in | Nativa, verificada pelo compilador | ✅ Máxima — compilador + semântica |
| **Contexto semântico** | ✅ Excelente (@description, @example, @see) | Limitado a nomes de tipos | ✅ Combina ambos |
| **Documentação de erros** | ✅ @throws suportado | ❌ Sem sintaxe nativa | ✅ Via JSDoc/TSDoc |
| **Peso no contexto** | Médio-alto (blocos verbosos) | Baixo (inline, conciso) | Médio — balanceado |
| **Build step necessário** | Nenhum | Transpilação obrigatória | Transpilação obrigatória |
| **Compreensão por LLM** | Boa (semântica) | Excelente (estrutural) | ✅ **Ótima (estrutural + semântica)** |
| **Manutenibilidade** | Risco de drift tipo↔código | Tipos sempre sincronizados | Risco parcial em JSDoc textual |
| **Genéricos complexos** | Sintaxe verbosa | ✅ Sintaxe limpa | ✅ Tipos em TS, docs em JSDoc |
| **Projetos recomendados** | JS legado, libs sem build | Projetos novos, aplicações | **Qualquer projeto TS moderno** |

**A pesquisa sobre type-constrained decoding** (arXiv 2504.09246) demonstrou que anotações de tipo TypeScript **reduzem significativamente erros de compilação e aumentam a correção funcional** do código gerado por LLMs. Felix Arntz, ao migrar 80+ arquivos JS para TypeScript usando Cline/Gemini, concluiu: "Ao fornecer tipos explícitos do TypeScript, você dá ao LLM um mapa muito mais detalhado e inequívoco da codebase."

### Regra prática para projetos TypeScript

Em projetos TypeScript, **não duplique informação de tipo no JSDoc**. Use TypeScript para toda informação de tipo e JSDoc/TSDoc exclusivamente para:

```typescript
// ✅ Correto: TSDoc complementa tipos sem duplicar
/**
 * Calcula frete com base na região e peso.
 * Utiliza a tabela de preços atualizada mensalmente pelo time de logística.
 *
 * @throws {RegionNotSupportedError} Região fora da cobertura
 * @example
 * const frete = calcularFrete({ regiao: 'sudeste', pesoKg: 2.5 });
 * // frete.valor === 15.90
 */
function calcularFrete(params: FreteParams): ResultadoFrete { ... }

// ❌ Errado: JSDoc duplicando o que TypeScript já declara
/**
 * @param {FreteParams} params - Parâmetros do frete
 * @returns {ResultadoFrete} Resultado do cálculo
 */
function calcularFrete(params: FreteParams): ResultadoFrete { ... }
```

---

## Convenções de projetos agent-friendly notáveis

O guia "Agent Experience: 40+ Best Practices" da Marmelab (janeiro 2026) é a publicação mais abrangente sobre o tema e introduz o conceito de **"Code SEO"** — tornar código encontrável por agentes da mesma forma que páginas web são otimizadas para buscadores. Práticas como usar sinônimos em comentários, evitar abreviações e manter nomes de arquivo únicos derivam dessa analogia.

O padrão **AGENTS.md**, adotado por mais de **60.000 repositórios** e governado pela Linux Foundation, estabeleceu-se como o mecanismo cross-tool para documentação de projeto. Todas as ferramentas pesquisadas o suportam: Claude Code (via CLAUDE.md com fallback para AGENTS.md), Cursor, Copilot, Aider, Windsurf e Cline. A recomendação da Factory.ai é manter o arquivo com **≤150 linhas**, priorizando comandos de build/test, visão arquitetural e limites explícitos.

Projetos como o da **Mercari** demonstram o padrão na prática: AGENTS.md na raiz com links para `@docs/commands.md`, `@docs/code-style.md` e `@docs/architecture.md`, implementando progressive disclosure. O repositório **awesome-cursorrules** (38.6k stars) e o **Aider-AI/conventions** oferecem templates concretos organizados por tecnologia. Ferramentas como **Repomix** (38k+ stars) comprimem repositórios inteiros em formato LLM-friendly com **~70% de redução de tokens** via tree-sitter.

---

## Checklist de recomendações consolidadas

### Estrutura de arquivos
1. Manter **200–500 linhas por arquivo** (ideal ~300); hard limit de 800
2. Limitar a **5–10 funções por arquivo**, cada uma com máximo de 50 linhas
3. Aplicar responsabilidade única: um conceito/domínio por arquivo
4. Usar nomes de arquivo **únicos e descritivos** — eliminar múltiplos `index.ts`
5. Incluir **README.md** em cada diretório importante da codebase

### Documentação JSDoc/TSDoc
6. Documentar toda função exportada com `@param`, `@returns`, `@throws` e `@example`
7. Em projetos TypeScript, **não duplicar tipos no JSDoc** — usar TSDoc para semântica
8. Incluir 1–2 exemplos representativos por função (happy path + edge case)
9. Comentar o **"porquê"**, nunca o "quê" — o código é a explicação do "quê"
10. Manter documentação **sincronizada com o código** — tratar docs desatualizados como bugs

### Configuração de agentes
11. Criar **AGENTS.md / CLAUDE.md** com ≤150 linhas: comandos, stack, estrutura, limites
12. Usar **progressive disclosure** em monorepos: docs hierárquicos por diretório
13. Incluir exemplos de código reais do projeto (um snippet vale mais que três parágrafos)
14. Definir **limites explícitos** em três níveis: sempre fazer, perguntar antes, nunca fazer
15. Não incluir regras que linters já aplicam — economizar budget de instruções

### Qualidade e guardrails
16. Manter complexidade ciclomática **≤7** (máximo 10); minimizar aninhamento
17. Proibir `any` via ESLint (`@typescript-eslint/no-explicit-any`)
18. Usar **hooks pré-commit** para formatação e linting automáticos
19. Adotar TDD — testes são o principal loop de feedback para agentes
20. Revisar código gerado por agentes com o **mesmo rigor** de code review humano

---

## Conclusão: context engineering como disciplina central

O campo evoluiu de "prompt engineering" para **"context engineering"** — a disciplina de curar os tokens ideais para inferência do modelo. A descoberta mais contraintuitiva desta pesquisa é que **janelas de contexto maiores não resolvem o problema**: o estudo da Chroma provou que todos os 18 modelos frontier testados degradam com inputs maiores, independentemente da capacidade nominal. A implicação prática é que cada linha de código, cada comentário e cada arquivo competem pela atenção finita do modelo.

Codebases agent-friendly não são apenas codebases bem-organizadas — elas são **otimizadas para a curva de atenção em U dos LLMs**, com informação crítica no início e no fim dos arquivos, funções pequenas e autodescritivas, tipos fortes que eliminam ambiguidade, e documentação que agrega valor semântico sem redundância. O checklist acima não é aspiracional: cada item reflete evidência concreta de ferramentas, benchmarks e experiência prática de equipes que já tratam "agent experience" com a mesma seriedade que "developer experience".