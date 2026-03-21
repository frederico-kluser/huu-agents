# Pi DAG Task CLI — Convenções para Agentes

## Projeto

**Pi DAG Task CLI** decompõe macro-tarefas em um Grafo Acíclico Direcionado (DAG) executado por agentes paralelos isolados em Git Worktrees. Combina filosofia minimalista do Pi Coding Agent com LangChain.js, orquestração via LangGraph.js e padrões de context engineering avançados para produção.

## Comandos essenciais

```bash
# Setup
npm install
npm run build

# Desenvolvimento
npm run dev                    # Ink TUI em modo interativo
npm run lint                   # ESLint + TypeScript strict
npm run type-check             # tsc --noEmit

# Testes
npm run test                   # Unit tests + coverage 80%+
npm run test:watch             # Watch mode

# Build/Deploy
npm run build                  # Transpile TS → JS (dist/)
```

## Stack

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Runtime | Node.js (ESM) | ≥20 |
| Linguagem | TypeScript (strict) | ES2022, NodeNext |
| UI Terminal | Ink + React | v6 + React 19 |
| Schemas | Zod | validação DAG, config, resultados |
| Orquestração | LangChain.js + LangGraph.js | v1.0+ |
| Agentes | Pi Coding Agent SDK | v0.60.0+ |
| LLM (multi-provider) | OpenRouter | 2K+ modelos |

## Estrutura de diretórios

```
src/
├── cli.tsx                 # Entry point
├── app.tsx                 # Router de telas (state machine)
├── schemas/                # Zod schemas (DAG, config, resultados)
├── screens/                # 6 telas Ink/React
├── components/             # DAG nodes, worker logs
├── prompts/                # System prompts (Planner, Explorer, Worker)
├── agents/                 # Explorer (ReAct), Worker Runner (Pi SDK)
├── pipeline/               # Orquestração (Planner, DAG Executor, Retry)
├── git/                    # Git wrapper, worktrees, conflitos
├── hooks/                  # use-config, use-file-tree
└── utils/                  # OpenRouter validation
```

**25 arquivos, ~4.800 LOC esperadas (~192 LOC/arquivo).**

## Convenções de código

### Métricas (enforce via ESLint)

- **Linhas/arquivo:** 200–300 ideal, máximo 500
- **Funções/arquivo:** 5–10, máximo 15
- **Linhas/função:** 20–30, máximo 50
- **Complexidade ciclomática:** ≤7 ideal, máximo 10

### Documentação TSDoc

Funções exportadas **obrigatoriamente** com `@param`, `@returns`, `@throws` e `@example`:

```typescript
/**
 * Decompõe macro-task em DAG de subtasks atômicas via modelo de raciocínio.
 * Usa Explorer ReAct se contexto insuficiente para task decomposition.
 *
 * @param task - Descrição da macro-task
 * @param context - Contexto selecionado do repositório
 * @returns DAG Zod-validado com nodes e dependências
 * @throws {InvalidContextError} Contexto vazio
 * @throws {PlannerError} Modelo de raciocínio falhou
 * @example
 * const dag = await planTask("Refactor auth module", context);
 * console.log(dag.nodes.length); // 5
 */
export async function planTask(
  task: string,
  context: RepositoryContext
): Promise<DAGSchema> { ... }
```

### Princípios imutáveis

- **Nunca mutar** objetos existentes — retornar novos objetos
- **Validação com Zod** em todas as fronteiras (API, agentes, persistência)
- **Comentar o "porquê"**, nunca o "quê"
- **Sem `any`** (enforced by ESLint `@typescript-eslint/no-explicit-any`)

### Padrões do projeto

Referência obrigatória: `docs/general/file-agent-patterns.md` (métricas, JSDoc, decomposição de arquivos).

Não duplicar regras já enforçadas por linters (ESLint, TypeScript strict, Prettier).

## Limites explícitos

### ✅ SEMPRE fazer

- Validar inputs com Zod em boundaries (user input, API, agentes)
- TSDoc com `@throws` e `@example` em exportações
- Testes unitários + integração (80%+ coverage)
- Imutabilidade: novos objetos, nunca mutações
- Git commits atômicos, conventional format (`feat:`, `fix:`, etc.)

### ❓ PERGUNTAR ANTES

- Aumentar limite de LOC acima de 500/arquivo
- Adicionar novas dependências (avaliar impacto de bundle)
- Modificar arquitetura do DAG Executor ou pipeline Planner
- Usar callbacks síncronos em código async (risk de blocking)

### ❌ NUNCA fazer

- Hardcodear secrets, API keys ou config (usar `.env`, variáveis de ambiente)
- `console.log` em produção (use estruturado logging via pino/winston)
- Ignorar erros ou usar `any` para escapar de type checking
- Mutar objetos — sempre retornar cópias imutáveis
- Commits não-atômicos ou sem mensagem clara
- Modificar system prompts sem validação (testar com exemplos reais)

---

**Última atualização:** 2026-03-21
