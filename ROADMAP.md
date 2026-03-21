# ROADMAP: Pi DAG Task CLI (POC)

Um cronograma pragmático estipulando entregáveis palpáveis voltados para se comprovar a tese a cada passo (MVP).

## Fase 1: Fundação do CLI e Setup (MVP 1)
**Objetivo:** Uma interface de usuário inicial de CLI em TUI interativo validando setup da chave e persistência em state simples.
- [ ] Inicialização da aplicação node/TS ESM base.
- [ ] Instalação core tools (`ink`, `@mariozechner/pi-coding-agent`, etc).
- [ ] Tela Ink 1: Verificar se existe chave OpenRouter salva localmente; se não, pedir input do usuário e persistir (em `~/.pi-dag-cli.json`).
- [ ] Tela Ink 2: Lista contendo marcação via `checkbox` dos arquivos markdown locais (via engine tipo `glob`).
- [ ] Campo de entrada de texto final ("Descreva a macro task da feature").
**Teste de Aceitação:** Comando CLI invocado renderiza menus em flexbox com os modais esperados e consegue salvar/carregar state.

## Fase 2: Módulo Planner & DAG Generation (MVP 2)
**Objetivo:** Obter saídas coesas JSON com arrays compreensíveis de dependências via API.
- [ ] Modulo de construção do *Prompt de Automação de Categoria Planner* ("converta isso neste restrito schema").
- [ ] Estabelecer interface `Zod` ou `TypeBox` para os nodes do Graph resultantes.
- [ ] Instaciar uma sessão efêmera e crua do Pi no modelo LLM para puxar a task escolhida + docs anexados.
- [ ] Renderizar na UI log mockado se conectando na LLM e exibindo a árvore estática do DAG gerado na tela.
**Teste de Aceitação:** Simulando um pedido e os arquivos locais, o log do console imprime a arvore DAG formatada e parseável em código isolado, possuindo nós pais sem dep e nós filhos contínuos.

## Fase 3: Controlador Git & Worktrees Isoladas (MVP 3)
**Objetivo:** Dominar automação com Git via child-process/`execa` para habilitar a sandbox da ferramenta subjacente.
- [ ] Utilitário de Git Wrapper criando a branch base `task-[timestamp]`.
- [ ] Geração dinâmica de path no file system (`.pi-dag-worktrees/...`).
- [ ] Ramo orquestrador: Lógica baseada em Set e Loop contêiner criando branch para tasks base via `git branch sub-[id] pai`
- [ ] Criação e injeção do path correspondente no worktree vinculado.
- [ ] Script de encerramento do worker (`git add .`, `git commit`, exclusão explícita de that directory).
- [ ] Merge Script (Caso dep C precisa do repasse do finish da A e B).
**Teste de Aceitação:** Script hardcoded executa simulando 3 steps; O repo na main folder continua ileso e uma branch limpa `task-XXXX` fica cheia de pequenos historicos de commits automáticos.

## Fase 4: O Orquestrador e Worker de Agente Pi (MVP 4)
**Objetivo:** Juntar a inteligência ao motor isolado do Git. 
- [ ] Implementar fila do `dag-executor.ts` (Máquina de gerenciar Promises).
- [ ] Quando nó de tarefas ganha estágio `running`: inicia processo do `pi-worker.ts`- injetando o Path WorkTree exato dele nas flags de boot da inMemory Session.
- [ ] Atualização do state da UI com status do array.
- [ ] Fechamento e ciclo seguro.
**Teste de Aceitação:** Testar a refatoração inteira paralela de um mock app, conferir os arquivos localmente gerados nos merges via branch final entregada.

## Fase 5: Refinamentos UX, TUI Logs & Limpeza (Opcional - MVP 5)
**Objetivo:** Deixar o uso apresentável.
- [ ] View Dashboard via React Ink gerenciando outputs dos logs paralelos em colunas ou componentes independentes.
- [ ] Tratamento de falhas, retries, logs de fallbacks e git rollbacks se abortar.