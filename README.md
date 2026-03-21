# Pi DAG Task CLI (POC)

**Pi DAG Task CLI** é uma Prova de Conceito (POC) de uma ferramenta de automação de desenvolvimento baseada em terminal, com arquitetura baseada nos princípios contemporâneos de desenvolvimento com LLMs (2025-2026). O objetivo deste projeto é explorar a viabilidade de decompor macro-tarefas de engenharia de software em um Grafo Direcionado Acíclico (DAG) de dependências resolvíveis, e rodar agentes de inteligência artificial em paralelo para resolver as ramificações simultaneamente.

Para garantir a ausência de conflitos (race conditions), manter o context isolado e limpar a área de trabalho do usuário, este CLI utiliza a estratégia de gerenciar cada sub-tarefa em seu próprio **Git Worktree** com merges automáticos de repasse de dependência.

A arquitetura engloba a filosofia YOLO minimalista e expansível do [Pi Coding Agent](https://github.com/badlogic/pi-mono), orquestrada por princípios arquiteturais de LangChain.js e padrões avançados de prompting e engenharia de contexto.

## Arquitetura & Fluxo

O CLI permite a configuração granular de dois tiers de modelos independentes viabilizados via OpenRouter:
1. **O Agente Arquiteto (Planner Model):** Especializado em raciocínio pesado para a fase de *task decomposition*.
2. **Os Agentes Operários (Worker Models):** Modelos mais rápidos e ágeis designados para as execuções cirúrgicas in-file.

As fases de operação dividem-se em:

1. **Configuração e Seleção:** Interface em Node via `ink` v6 que lista arquivos de projeto para contextualização do problema e permite a seleção dos modelos Arquiteto e Worker (respeitando as diretrizes de componentes e ciclo de renderização descritas em `docs/general/ink.md`).
2. **Exploração Dinâmica via ReAct:** Caso o Planner não tenha contexto suficiente de *State* inicial para criar a divisão atômica (ex: "refatore todos os scripts de uma pasta sem eu saber quantos arquivos tem nela"), ele disparará um sub-agente com modo ReAct (estritamente embasado em `docs/langchain/ReAct-langchain-tec-guide.md`) focado em recuperar o state do diretório para basear a quebra do DAG de forma determinística.
3. **Decomposição Inteligente:** O modelo Arquiteto avalia a macro-tarefa e o contexto aderindo às melhores práticas narrativas de quebra de problemas descritos em `docs/general/story-breaking.md`. As restrições do system prompt desse agente, mitigando alucinações e limitando falhas de output (Structured Outputs), deverão respeitar de perto `docs/general/prompt-engineering.md` e `docs/general/prompts-guide.md`.
4. **Isolamento e Paralelismo em Worktrees:**
   - Uma branch base (`task-[timestamp]`) é gerada.
   - Cada nó paralelo do DAG gera sua própria branch + Git Worktree (`.pi-dag-worktrees/task-[timestamp]-subtask-[id]`).
   - Os Agentes Operários agem nestes worktrees utilizando system prompts construídos baseados em `docs/general/context-building.md` e `docs/general/context-building-2.md`, e devem codificar suas modificações respeitando sempre as métricas para inteligência artificial descritas no `docs/general/file-agent-patterns.md`.
   - Após sua parte do objetivo estar concluída, o orquestrador gera o commit e encerra iterativamente a sessão.
5. **Handoff & Repasse de Dependências:** O motor junta as modificações parciais (via merge) e libera as próximas branches baseadas nos vértices pendentes da arvore do DAG, repassando o contexto físico validado das etapas passadas, tudo isso arquitetado sobre os princípios práticos ensinados em `docs/langchain/langchain-langgraph-production.md` e `docs/langchain/langchain-models-2026.md`.

## Por que Git Worktrees?

Agentes rodando em paralelo em cima da mesma working tree esbarram em:
- Arquivos salvos em tempos diferentes pelas ferramentas reativas causariam problemas aos outros agentes trabalhando do lado lendo-o parcialmente.
- Travar a camada de index (`git lock`).

Worktrees promovem containers temporários virtuais extremamente baratos, fáceis de mergear e seguros de se limpar do computador caso erros ocorram, não bagunçando a base de dados do usuário final.