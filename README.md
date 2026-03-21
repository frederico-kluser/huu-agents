# Pi DAG Task CLI (POC)

**Pi DAG Task CLI** é uma Prova de Conceito (POC) de uma ferramenta de automação de desenvolvimento baseada em terminal. O objetivo deste projeto é explorar a viabilidade de decompor macro-tarefas de engenharia de software em um Grafo Direcionado Acíclico (DAG) de dependências resolvíveis, e rodar agentes de inteligência artificial em paralelo para resolver as ramificações simultaneamente.

Para garantir a ausência de conflitos (race conditions), manter o context isolado e limpar a área de trabalho do usuário, este CLI utiliza a estratégia de gerenciar cada sub-tarefa em seu próprio **Git Worktree** com merges automáticos de repasse de dependência.

A arquitetura engloba a filosofia Yolo minimalista e expansível do [Pi Coding Agent](https://github.com/badlogic/pi-mono).

## Arquitetura & Fluxo

1. **Seleção de Contexto:** Interface em Node (via `ink` v6) que lista arquivos Markdown para contextualização do problema.
2. **Decomposição Inteligente:** Conexão com interface universal de modelos (OpenRouter) pedindo output focado apenas no schema do DAG detalhando as sub-tarefas e ramificações.
3. **Isolamento e Paralelismo:**
   - Uma branch base (`task-[timestamp]`) é gerada.
   - Cada nó paralelo do DAG gera sua própria branch + Git Worktree (`.pi-dag-worktrees/task-[timestamp]-subtask-[id]`).
   - O Agente interage estritamente no root *deste* worktree particular.
   - Após a sua parte do objetivo ser concluída, o orquestrador gera o commit e encerra iterativamente a sessão.
4. **Handoff (Repasse de Estado):** O motor junta as modificações parciais (via `git merge`) e libera o próximo branch e worktree das tarefas encadeadas abaixo no DAG, contando inteiramente com a capacidade atômica da versão git.

## Ferramentas Principais

* **[Pi Coding Agent]**: Framework central para disparar sessões em Node.
* **[Ink v6]**: Frontend framework baseado em React para prover a renderização do pipeline em CLI e gerenciamento e interações de inputs.
* **[OpenRouter]**: O provedor agnóstico e principal.

## Por que Git Worktrees?

Agentes rodando em paralelo em cima da mesma working tree esbarram em:
- Arquivos salvos em tempos diferentes pelas ferramentas reativas causariam problemas aos outros agentes trabalhando do lado lendo-o parcialmente.
- Travar a camada de index (`git lock`).

Worktrees promovem containers temporários virtuais extremamente baratos, fáceis de mergear e seguros de se limpar do computador caso erros ocorram, não bagunçando a base de dados do usuário final.