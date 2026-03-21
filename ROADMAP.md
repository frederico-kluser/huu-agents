# ROADMAP: Pi DAG Task CLI (POC)

Um cronograma pragmático estipulando entregáveis palpáveis voltados para se comprovar a tese a cada passo (MVP).
*Obrigatório o alinhamento total de código e arquitetura aos documentos definidos na premissa.*

## Fase 1: Fundação do CLI, Menus Ink e Model Config (MVP 1)
**Objetivo:** Uma interface de usuário inicial de CLI em TUI interativo baseada em React/Ink.
- [ ] Ler mandatoriamente: `docs/general/ink.md` antes de codificar a UI.
- [ ] Inicialização da aplicação node/TS ESM base.
- [ ] Instalação core tools (`ink`, `@mariozechner/pi-coding-agent`, etc).
- [ ] Tela Ink 1: Verificar se existe chave OpenRouter, Modelos de Arquiteto (Planner) e Operários (Workers) no `~/.pi-dag-cli.json` local. Se não, pedir inputs.
- [ ] Tela Ink 2: Lista checkbox baseada focada em selecionar contexto pro Arquiteto.
- [ ] Campo de entrada final da macro-task.
**Teste de Aceitação:** Comando CLI invocado renderiza menus em flexbox.

## Fase 2: Decomposição Inteligente e Coleta ReAct (MVP 2)
**Objetivo:** O Planner destrinchar a requisição em JSON Schema exato, ativando agents investigadores perimetrais.
- [ ] Ler mandatoriamente: `docs/langchain/ReAct-langchain-tec-guide.md` e `docs/general/story-breaking.md`.
- [ ] Construir Prompt do Planner seguindo regras de ouro de limites em `docs/general/prompts-guide.md`.
- [ ] Implementar a condicional: Se a task necessita ver arquivos/quantidade para dividir (ex: refatorar todos `.js`), ativa-se o Sub-Agente Explorador (loop ReAct) listando a malha do projeto para encher o Prompt do Planner Arquiteto com dados concretos de "Estado Atual".
- [ ] Arquiteto quebra o json final estruturado usando LangChain/Zod ou TypeBox (Guiado por `docs/langchain/langchain-models-2026.md`).
**Teste de Aceitação:** Macro task vaga ex: "Apague a pasta X" dispara o ReAct que devolve a lista de arquivos da pasta X para o planner gerar um node pra cada arquivo na DAG exibida na UI.

## Fase 3: Controlador Git & Worktrees Isoladas (MVP 3)
**Objetivo:** Automação confiável baseada em Child-Process controlando o sistema subjacente de isolamento via Git sem encostar no index e source na branch ativa do usuário.
- [ ] Utilitário de Git Wrapper criando a branch base `task-[timestamp]`.
- [ ] Geração dinâmica de path no file system (`.pi-dag-worktrees/task-ID-sub-[id]`).
- [ ] Criação de branch para tasks independentes de first-level via `git branch`.
- [ ] Script de merge automático (ex: `Task C` faz um `git checkout C`, `git merge A B`).
- [ ] Script de remoção de worktree isolada após hit "done" de um evento.
**Teste de Aceitação:** Script rodado com array mockado de DAG constrói fisicamente o repasse de 3 estados das pastas/branches locais encadeados corretamente sem break-ups.

## Fase 4: O Worker de Agente Pi via LLM Contextualizada (MVP 4)
**Objetivo:** Acoplar o provedor de agentes às engrenagens seguras de branch criadas na fase 3, provendo contexto rico para IA no terminal do Worktree.
- [ ] Ler mandatoriamente: `docs/general/context-building.md`, `docs/general/file-agent-patterns.md`.
- [ ] Implementar Node-Runner paralelos no `dag-executor.ts` via orquestração pura orientada pela promisse de `LangGraph` simplificada.
- [ ] Start das inMemory Session PI Agents com os Operários selecionados focados exclusivamente no file-system temporário.
- [ ] System Prompt dos workers injetado contendo os metadados do `git log` local dos merges passados da worktree, prevenindo de enviar arquivos completos para não exaustar o Token window (`docs/general/context-building-2.md`).
- [ ] Renderizar e parear o log interativo no Tui do Ink.
**Teste de Aceitação:** Aplicar CLI numa feature multi-steps de 4 arquivos fictícios; CLI retorna um `dag-completed`, na the history do repositório final o commit está isolado linear e intacto por refatoramento IA obedecente.

## Fase 5: Estabilidade, Retries & Fallbacks (Opcional - MVP 5)
**Objetivo:** Qualidade do código da própria POC e tratamentos vitais das calls LLMs.
- [ ] Falhas no Git Manager (merge fails) resetam graciosamente sem deletar source file users.
- [ ] UI visualiza Nodes do DAG como em Pending -> Running... Erro! (Vermelho) -> Retentando (com menor temperature).