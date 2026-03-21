# Backlog de Features: Pi DAG Task CLI

Análise completa do codebase (34 arquivos, 4.500+ LOC) vs documentação de referência (17 docs).
**112 gaps identificados em 17 categorias.**

---

## 1. Valores Hardcoded (14 itens)

| # | Arquivo:linha | Valor hardcoded | Deveria ser |
|---|--------------|-----------------|-------------|
| 1 | `config.schema.ts:25` | `plannerModel: 'openai/gpt-4.1'` | Selecionável do catálogo OpenRouter |
| 2 | `config.schema.ts:30` | `workerModel: 'openai/gpt-4.1-mini'` | Selecionável do catálogo OpenRouter |
| 3 | `config-screen.tsx:15-26` | 3 planner + 3 worker models hardcoded | Fetch dinâmico via OpenRouter `/models` |
| 4 | `explorer-tools.ts:9` | `SKIP_DIRS` (node_modules, .git, dist) | Configurável via `.pi-dag-cli.json` |
| 5 | `explorer-tools.ts:10` | `TEXT_EXTS` regex fixa | Configurável ou inferida |
| 6 | `explorer-tools.ts:122` | `MAX_MATCHES = 30` | Parâmetro da tool |
| 7 | `explorer-tools.ts:58,134` | `MAX_FILE_SIZE = 256KB/512KB` | Config do explorer |
| 8 | `planner.pipeline.ts:46` | `MAX_EXPLORATION_CYCLES = 3` | Config do pipeline |
| 9 | `planner.pipeline.ts:48` | `MAX_VALIDATION_RETRIES = 2` | Config do pipeline |
| 10 | `worker-runner.ts:58` | `DEFAULT_TIMEOUT_MS = 5min` | Config por node (tasks pesadas precisam mais) |
| 11 | `retry-handler.ts:26` | `BACKOFF_MS = [1s, 3s, 9s]` | Config de retry |
| 12 | `use-config.ts:8` | `CONFIG_PATH = ~/.pi-dag-cli.json` | Flag `--config` |
| 13 | `use-api-validation.ts:10` | `AUTH_URL` OpenRouter fixa | Multi-provider |
| 14 | `orchestrator.ts:210` | Formato timestamp YYYYMMDD-HHMMSS | Configurável |

---

## 2. Catálogo de Modelos e Providers (7 itens)

| # | Gap | Referência doc |
|---|-----|---------------|
| 1 | Apenas 6 modelos hardcoded (3+3) vs 2000+ do OpenRouter | `langchain-models-2026.md` |
| 2 | Sem fetch dinâmico do endpoint `/api/v1/models` do OpenRouter | `langchain-models-2026.md` |
| 3 | `normalizeProvider()` reconhece só 3 famílias (anthropic, openai, deepseek) — ignora Gemini, Mistral, Llama, Cohere | `prompt-engineering.md` tabela cross-model |
| 4 | Sem suporte a providers diretos (Anthropic API, Azure OpenAI, Google AI Studio) — só OpenRouter | `pi-agent-full-doc.md` (15+ providers) |
| 5 | Sem headers específicos por provider (ex: `anthropic-beta` para extended thinking) | `langchain-models-2026.md` |
| 6 | Sem reasoning.effort configurável (GPT-5: minimal/low/medium/high/xhigh) | `langchain-models-2026.md` |
| 7 | Sem thinking_budget para Gemini 2.5 (thinking_budget: 1024, -1, 0) | `langchain-models-2026.md` |

---

## 3. CLI Arguments e Flags (11 itens)

| # | Flag faltante | Uso |
|---|--------------|-----|
| 1 | `--help` / `-h` | Ajuda do CLI |
| 2 | `--version` / `-v` | Versão |
| 3 | `--config <path>` | Override do config file |
| 4 | `--planner-model <id>` | Override do modelo planner |
| 5 | `--worker-model <id>` | Override do modelo worker |
| 6 | `--task <string>` | Macro-task direto (sem interação) |
| 7 | `--context <glob>` | Contexto via glob (sem interação) |
| 8 | `--no-interactive` | Modo CI/CD |
| 9 | `--timeout <ms>` | Timeout por worker |
| 10 | `--log-level <level>` | Verbosidade (debug/info/warn/error) |
| 11 | `--output <format>` | Resultado em json/yaml/markdown |

---

## 4. Internacionalização (i18n)

Todas as strings de UI estão hardcoded em português. Sem framework de i18n.

**Arquivos afetados:** todas as 6 screens, explorer-tools, orchestrator, conflict-resolver.

**Solução:** `i18next` + `react-i18next` com fallback pt-BR → en-US.

---

## 5. Logging e Observabilidade (8 itens)

| # | Gap | Impacto |
|---|-----|---------|
| 1 | Sem framework de logging estruturado (pino/winston) | Debugging impossível em produção |
| 2 | Sem rastreamento de tokens consumidos por chamada LLM | Custo invisível |
| 3 | Sem métricas de tempo por fase (planning, execution, merge) | Performance invisível |
| 4 | Sem LangSmith tracing integration | Debugging de chains impossível |
| 5 | Sem logging de operações git (branch criada, merge executado) | Auditoria invisível |
| 6 | Sem logging de retry attempts com detalhes | Diagnóstico de falhas |
| 7 | Sem log de topological sort waves computadas | Debugging de paralelismo |
| 8 | Sem log de context window usage | Validação de prompt caching |

---

## 6. Persistência e Histórico (5 itens)

| # | Gap | Referência doc |
|---|-----|---------------|
| 1 | Workers usam `SessionManager.inMemory()` — sem persistência JSONL | `pi-agent-nodejs.md` (file-based sessions) |
| 2 | Se processo crasha mid-execution, todo progresso é perdido | `pi-agent-anatomia.md` (sessions JSONL) |
| 3 | Sem checkpointing do estado do DAG (resume parcial impossível) | `langchain-langgraph-production.md` |
| 4 | Sem armazenamento de artefatos (diffs, logs, outputs em disco) | — |
| 5 | Sem session ID / run ID para histórico de execuções | — |

---

## 7. Prompt Engineering e Caching (8 itens)

| # | Gap | Referência doc |
|---|-----|---------------|
| 1 | Sem prompt caching headers (Anthropic 90% desconto, OpenAI 50%) | `prompt-engineering.md` |
| 2 | Structured output não adapta por provider (OpenAI strict vs Gemini responseJsonSchema vs DeepSeek json_object) | `prompts-guide.md` tabela cross-model |
| 3 | Explorer usa `bindTools()` mas não `withStructuredOutput()` | `prompts-guide.md` |
| 4 | Sem adaptação de format (XML para Claude, Markdown para GPT, sem system prompt para DeepSeek R1) — parcialmente implementado | `prompt-engineering.md` tabela |
| 5 | Sem few-shot collapse prevention (Gemini 3 Flash: 33%→64%→33% em 0/4/8-shot) | `prompt-engineering.md` |
| 6 | Sem prompt repetition (Google Research: +76% acurácia repetindo prompt 2x) | `prompt-engineering.md` |
| 7 | Sem CoVe (Chain-of-Verification) para afirmações do Planner | `context-building.md` |
| 8 | Sem quote-first pattern para documentos longos | `context-building.md` |

---

## 8. Error Handling Incompleto (11 itens)

| # | Arquivo | Gap |
|---|---------|-----|
| 1 | `explorer-tools.ts:144` | readFileHead retorna string vazia sem logar motivo |
| 2 | `explorer-tools.ts:155` | searchContent catch genérico (não distingue timeout vs permissão) |
| 3 | `use-config.ts:36` | Qualquer erro tratado como 'missing' (não distingue permissão) |
| 4 | `dag-executor.ts:80` | Erro de ciclo sem detalhes do caminho cíclico |
| 5 | `config-screen.tsx:51` | Falha de validação da API key sem feedback visual |
| 6 | `orchestrator.ts:174` | executeDAG sem try-catch para converter erros em progress events |
| 7 | `worker-runner.ts:100-106` | Pi SDK session creation erro cru (sem contexto) |
| 8 | `git-wrapper.ts:50` | classifyError com cast de tipo solto |
| 9 | `retry-handler.ts:121` | Erros 'unknown' com ECONNRESET como exceção hardcoded |
| 10 | `explorer-tools.ts:59` | fileSize não validado (negativo?) |
| 11 | `prompts/worker.prompt.ts:38` | node.files não validados como existentes |

---

## 9. Segurança (6 itens)

| # | Gap | Severidade |
|---|-----|-----------|
| 1 | `explorer-tools.ts`: path traversal via symlinks não validado com `realpath()` | CRITICAL |
| 2 | `explorer-tools.ts:145`: regex do LLM executada sem sanitização — ReDoS possível | HIGH |
| 3 | `git-wrapper.ts:43`: branch names do DAG passados a `execFile` sem validação de chars especiais | HIGH |
| 4 | `prompts/worker.prompt.ts:29`: node.files interpolados no prompt sem escape — prompt injection possível | MEDIUM |
| 5 | `use-api-validation.ts:34`: API key enviada via fetch sem controle de logging | MEDIUM |
| 6 | Sem rate limiting em retry loops — pode exaurir quota OpenRouter | MEDIUM |

---

## 10. Performance (7 itens)

| # | Gap | Impacto |
|---|-----|---------|
| 1 | Sem limite de concorrência no DAG executor — pode spawnar 100+ workers | Exaustão de memória/CPU |
| 2 | Sem prompt caching (cada chamada paga preço full de input tokens) | Custo 2-10x maior |
| 3 | Sem backoff jitter — thundering herd em retries simultâneos | Burst de requests |
| 4 | Sem cache de queries do Explorer (exploração repetida = trabalho redundante) | Latência |
| 5 | Sem early termination se critical path falha | Workers desnecessários |
| 6 | `use-config.ts:32`: readFile em todo mount se config missing (sem cache negativo) | I/O desnecessário |
| 7 | Git log truncado mas não comprimido (hashes redundantes mantidos) | Token waste |

---

## 11. Callbacks Vazios e TODOs (6 itens)

| # | Arquivo:linha | O que falta |
|---|--------------|-------------|
| 1 | `app.tsx:133` | `handleRetry` reseta state mas não re-executa nodes falhados realmente |
| 2 | `app.tsx:137` | `handleQuit` é vazio (comentário "exit chamado via useApp") |
| 3 | `app.tsx:141` | `handleViewDiff` é vazio (comentário "Futuro: diff via pager") |
| 4 | `result-screen.tsx:72` | `onViewDiff` invocado sem implementação no parent |
| 5 | `planner.pipeline.ts:23` | baseUrl não exposto na config |
| 6 | `explorer-tools.ts:155` | Limite de resultados de search não configurável pelo caller |

---

## 12. Keyboard Shortcuts Faltando (7 itens)

| # | Tela | Shortcut faltante |
|---|------|-------------------|
| 1 | Todas | `?` para help/lista de atalhos |
| 2 | Config | `[d]` para usar defaults |
| 3 | Context | Keybindings não documentados na UI |
| 4 | Execution | `[p]` para pausar/resumir |
| 5 | Execution | Toggle mostrar/esconder logs |
| 6 | Todas | `Esc` para voltar à tela anterior |
| 7 | Todas | Graceful shutdown com save state em `Ctrl+C` |

---

## 13. Validação de Input Faltando (8 itens)

| # | Arquivo | Gap |
|---|---------|-----|
| 1 | `use-api-validation.ts:25` | Não valida formato da API key (deveria começar com `sk-or-`) |
| 2 | `task-screen.tsx:34` | Não valida comprimento da task (poderia ser 10K chars) |
| 3 | `explorer-tools.ts:145` | Regex do LLM sem try-catch antes de execução |
| 4 | `orchestrator.ts:70` | macroTask vazio poderia chegar ao Planner |
| 5 | `dag-executor.ts:18` | Dependências não validadas contra IDs existentes antes do sort |
| 6 | `worker.prompt.ts:23` | node.files não validados como existentes no disco |
| 7 | `git/worktree-manager.ts` | Branch names sem validação de chars especiais |
| 8 | `path-guard.ts` | Symlinks não resolvidos com `realpath()` |

---

## 14. Testes: 0% Cobertura

Nenhum arquivo de teste encontrado em todo o projeto.

**Necessário:**
- Framework: `vitest` (compatível com ESM + React)
- Unit tests: schemas, topological sort, retry logic, prompt generation, path guard
- Integration tests: git operations, planner pipeline (mocked LLM), DAG executor
- E2E: ink-testing-library para fluxo completo de telas
- Cobertura alvo: 80%+

---

## 15. Acessibilidade (7 itens)

| # | Gap |
|---|-----|
| 1 | Layout assume terminal 80+ colunas — sem responsive design |
| 2 | Terminal com <13 linhas causa overflow |
| 3 | Status usa apenas cores (vermelho/verde) — sem diferenciação por ícone para daltonismo |
| 4 | Sem modo high-contrast |
| 5 | Sem hints para screen readers |
| 6 | Label "DAG" é críptico — deveria ser "Grafo de tarefas" |
| 7 | Sem opção para desabilitar animações |

---

## 16. Features de Produto (novas)

| # | Feature | Complexidade | Valor |
|---|---------|-------------|-------|
| 1 | **Dashboard web** — visualização do DAG via browser em vez de terminal | Alta | Adoção por não-devs |
| 2 | **Notificações** — Slack/Discord/webhook quando pipeline termina | Média | Awareness assíncrono |
| 3 | **Templates de tasks** — tasks comuns pré-configuradas (refactor, migrate, add tests) | Baixa | Produtividade |
| 4 | **Cost estimation** — estimar custo em $ antes de executar baseado em tokens estimados | Média | Controle de custo |
| 5 | **Dry run** — simular pipeline sem executar workers (valida DAG e prompts) | Baixa | Validação |
| 6 | **Plugin system** — custom tools para o Explorer e Workers | Alta | Extensibilidade |
| 7 | **Multi-repo** — executar DAGs que span múltiplos repositórios | Alta | Monorepo support |
| 8 | **Approval gates** — human-in-the-loop para nodes críticos | Média | Safety |
| 9 | **Diff preview** — mostrar diff estimado antes de mergear | Baixa | Confiança |
| 10 | **Export** — exportar DAG como Mermaid diagram, GitHub issue, Linear ticket | Média | Interoperabilidade |
| 11 | **Watch mode** — re-executar pipeline em file changes | Média | Dev loop |
| 12 | **Streaming output** — mostrar código sendo gerado em tempo real pelo worker | Baixa | UX |
| 13 | **Model benchmarking** — comparar qualidade/custo/velocidade entre modelos para a mesma task | Alta | Decision support |
| 14 | **Context auto-selection** — IA sugere quais arquivos incluir no contexto | Média | UX |
| 15 | **Conflict preview** — prever conflitos de merge antes de executar workers paralelos | Alta | Reliability |

---

## Priorização sugerida

**P0 (Bloqueia uso real):**
1. Testes (0% → 80%)
2. CLI arguments (--task, --no-interactive para CI)
3. Limitar concorrência do DAG executor
4. Retry realmente funcional (handleRetry)
5. Path traversal fix (symlinks)

**P1 (Qualidade de produção):**
6. Logging estruturado
7. Prompt caching
8. Session persistence / checkpointing
9. Validação de inputs em todas as boundaries
10. Modelos dinâmicos via OpenRouter /models

**P2 (Valor alto, pode esperar):**
11. Cost estimation pre-execution
12. Dry run mode
13. i18n
14. Multi-provider support (além de OpenRouter)
15. Export DAG (Mermaid, issues)

**P3 (Nice to have):**
16. Dashboard web
17. Plugin system
18. Acessibilidade completa
19. Watch mode
20. Model benchmarking
