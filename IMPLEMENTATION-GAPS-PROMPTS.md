# Gaps Restantes e Prompts de Implementacao

Este arquivo organiza os gaps reais que ainda faltam no projeto e traz um prompt XML pronto para cada task.

Regras de uso:
- Execute uma task por vez.
- Leia primeiro todas as referencias `@...` da task antes de editar.
- Preserve o estilo atual do projeto e as convencoes de [CLAUDE.md](/Volumes/Extension/Projects/huu-agents/CLAUDE.md).
- Mantenha `selectedAgents` como fonte de verdade de configuracao; campos legados continuam apenas por compatibilidade.
- Prefira diffs pequenos, sem refactors paralelos.
- Sempre valide com os comandos relevantes ao final de cada task.

## Task 1: Corrigir lint quebrado no ESLint 9

Problema atual:
- `npm run lint` falha porque o projeto usa ESLint 9 sem `eslint.config.*` flat config.

Arquivos e contexto relevantes:
- @CLAUDE.md
- @docs/general/file-agent-patterns.md
- @docs/general/prompt-engineering.md
- @docs/general/prompts-guide.md
- @README.md
- @package.json
- @tsconfig.json

Prompt XML:

```xml
<task_prompt>
  <background_information>
    Voce esta trabalhando no Pi DAG Task CLI. O typecheck ja passa, mas o lint esta quebrado por incompatibilidade de configuracao com ESLint 9. A meta e restaurar um pipeline basico de lint sem alterar o comportamento funcional do produto.
  </background_information>

  <references>
    <item>@CLAUDE.md</item>
    <item>@docs/general/file-agent-patterns.md</item>
    <item>@docs/general/prompt-engineering.md</item>
    <item>@docs/general/prompts-guide.md</item>
    <item>@README.md</item>
    <item>@package.json</item>
    <item>@tsconfig.json</item>
  </references>

  <objective>
    Corrigir a infraestrutura de lint para ESLint 9 usando flat config, com o menor diff possivel, mantendo TypeScript strict e as convencoes do projeto. Nao introduza refactors amplos no codigo-fonte so para satisfazer lint; se houver regras novas, ajuste-as de forma pragmatica e minima.
  </objective>

  <instructions>
    <item>Inspecione a configuracao atual de lint no package.json e arquivos de projeto existentes.</item>
    <item>Crie a configuracao flat do ESLint 9 apropriada para TypeScript ESM/NodeNext e JSX usado pelo Ink.</item>
    <item>Se for necessario adicionar dependencias de lint que estejam faltando, mantenha o conjunto minimo e coerente com o stack atual.</item>
    <item>Nao mude regras para algo excessivamente restritivo; o objetivo e restaurar lint util e executavel.</item>
    <item>Se surgirem erros de lint preexistentes, corrija apenas os que forem necessarios para deixar o comando verde ou documente claramente o menor conjunto de exclusoes/ajustes para evitar uma task acoplada de limpeza massiva.</item>
    <item>Atualize a documentacao apenas se o comando de lint ou seus pre-requisitos mudarem.</item>
  </instructions>

  <constraints>
    <item>Preserve o comportamento atual do runtime.</item>
    <item>Sem refactor de arquitetura.</item>
    <item>Sem trocar TypeScript strict por configuracoes permissivas.</item>
    <item>Sem usar any para contornar problemas.</item>
  </constraints>

  <acceptance_criteria>
    <item>`npm run lint` termina com sucesso.</item>
    <item>`npm run typecheck` continua passando.</item>
    <item>A configuracao final esta alinhada com ESLint 9 flat config.</item>
    <item>O diff e focado em tooling e pequenos ajustes correlatos.</item>
  </acceptance_criteria>

  <validation>
    <item>Execute `npm run lint`.</item>
    <item>Execute `npm run typecheck`.</item>
  </validation>
</task_prompt>
```

## Task 2: Implementar diff final real no fluxo de resultado

Problema atual:
- A tela final oferece `[d] ver diff`, mas o callback ainda esta stubado em `onViewDiff={() => {}}`.

Arquivos e contexto relevantes:
- @CLAUDE.md
- @docs/general/file-agent-patterns.md
- @docs/general/ink.md
- @docs/general/story-breaking.md
- @README.md
- @src/app.tsx
- @src/screens/result-screen.tsx
- @src/pipeline/orchestrator.ts
- @src/git/git-wrapper.ts

Prompt XML:

```xml
<task_prompt>
  <background_information>
    O produto ja exibe resumo final de branch e diff stat, mas a acao de visualizar o diff completo ainda nao funciona. Ha expectativa explicita de UX no terminal para [d] ver diff. A implementacao deve respeitar o padrao atual de telas Ink e manter a navegacao simples.
  </background_information>

  <references>
    <item>@CLAUDE.md</item>
    <item>@docs/general/file-agent-patterns.md</item>
    <item>@docs/general/ink.md</item>
    <item>@docs/general/story-breaking.md</item>
    <item>@README.md</item>
    <item>@src/app.tsx</item>
    <item>@src/screens/result-screen.tsx</item>
    <item>@src/pipeline/orchestrator.ts</item>
    <item>@src/git/git-wrapper.ts</item>
  </references>

  <objective>
    Implementar um fluxo real para visualizacao do diff final da execucao, sem quebrar a TUI. O usuario deve conseguir sair da tela de resultado, abrir o diff completo, inspecionar o patch final da branch gerada e voltar de forma previsivel ou encerrar o CLI sem estados inconsistentes.
  </objective>

  <instructions>
    <item>Analise como o diff stat e atualmente calculado e identifique a melhor origem para o diff completo.</item>
    <item>Escolha uma implementacao minima e consistente com Ink. Pode ser uma nova tela de diff, um viewer simples paginado, ou uma estrategia equivalente claramente integrada ao fluxo atual.</item>
    <item>Evite depender de comportamento externo opaco; a experiencia precisa ser previsivel dentro do CLI.</item>
    <item>Se criar nova tela ou componente, mantenha responsabilidade unica e nomes descritivos.</item>
    <item>Reutilize o branch final e o contexto de execucao existentes em vez de recalcular dados sem necessidade.</item>
    <item>Garanta que o keybinding `[d]` realmente abre algo util e que `[q]` continua funcionando.</item>
  </instructions>

  <constraints>
    <item>Nao implemente um diff fake baseado apenas no diffStat.</item>
    <item>Nao esconda o problema com logs no console.</item>
    <item>Nao altere o contrato de resultado de forma que quebre a tela final.</item>
  </constraints>

  <acceptance_criteria>
    <item>Ao final da execucao, `[d]` mostra o diff completo real da branch final.</item>
    <item>O usuario consegue voltar ou sair sem travar a TUI.</item>
    <item>O fluxo continua compativel com Ink e com o estado atual do app.</item>
    <item>`npm run typecheck` passa.</item>
  </acceptance_criteria>

  <validation>
    <item>Execute `npm run typecheck`.</item>
    <item>Rode um fluxo manual simples e valide que `[d]` exibe diff real.</item>
  </validation>
</task_prompt>
```

## Task 3: Implementar retry seletivo de nodes falhados

Problema atual:
- A `ResultScreen` entrega `failedNodeIds`, mas o app reinicia o pipeline inteiro em vez de reexecutar seletivamente apenas os nodes necessarios.

Arquivos e contexto relevantes:
- @CLAUDE.md
- @docs/general/file-agent-patterns.md
- @docs/general/ink.md
- @docs/general/story-breaking.md
- @README.md
- @src/app.tsx
- @src/screens/result-screen.tsx
- @src/pipeline/orchestrator.ts
- @src/pipeline/dag-executor.ts
- @src/schemas/dag.schema.ts
- @src/schemas/worker-result.schema.ts

Prompt XML:

```xml
<task_prompt>
  <background_information>
    O produto ja comunica a intencao correta de UX: retry apenas dos nodes falhados. Hoje isso nao acontece porque o app reinicia toda a execucao. A correcao precisa tratar estado, DAG, resultados ja bem-sucedidos e dependencias sem introduzir comportamento ambiguo.
  </background_information>

  <references>
    <item>@CLAUDE.md</item>
    <item>@docs/general/file-agent-patterns.md</item>
    <item>@docs/general/ink.md</item>
    <item>@docs/general/story-breaking.md</item>
    <item>@README.md</item>
    <item>@src/app.tsx</item>
    <item>@src/screens/result-screen.tsx</item>
    <item>@src/pipeline/orchestrator.ts</item>
    <item>@src/pipeline/dag-executor.ts</item>
    <item>@src/schemas/dag.schema.ts</item>
    <item>@src/schemas/worker-result.schema.ts</item>
  </references>

  <objective>
    Implementar retry seletivo real: o usuario deve conseguir reexecutar apenas os nodes falhados, preservando os resultados bem-sucedidos que continuam validos e recalculando apenas o minimo necessario para manter coerencia do DAG.
  </objective>

  <instructions>
    <item>Mapeie o contrato atual entre ResultScreen, App, Orchestrator e DAG Executor.</item>
    <item>Defina com precisao quais nodes entram no retry: apenas falhados, falhados mais dependentes bloqueados, ou outro criterio. Documente esse criterio no codigo de forma sucinta se ele nao for obvio.</item>
    <item>Evite rerodar o planner se nao for estritamente necessario.</item>
    <item>Preserve resultados bem-sucedidos e seus metadados quando eles continuarem validos.</item>
    <item>Garanta que a UI de execucao e de resultado reflitam corretamente uma reexecucao parcial.</item>
    <item>Se a implementacao exigir extensao de contrato, faca a menor mudanca coerente e tipada possivel.</item>
  </instructions>

  <constraints>
    <item>Nao faca retry total disfarcado.</item>
    <item>Nao descarte resultados anteriores sem necessidade.</item>
    <item>Nao introduza estado mutavel dificil de rastrear.</item>
  </constraints>

  <acceptance_criteria>
    <item>`onRetry(failedNodeIds)` leva a uma reexecucao seletiva real.</item>
    <item>Nodes bem-sucedidos nao sao rerodados sem necessidade.</item>
    <item>A DAG final e os resultados permanecem coerentes apos o retry.</item>
    <item>`npm run typecheck` passa.</item>
  </acceptance_criteria>

  <validation>
    <item>Execute `npm run typecheck`.</item>
    <item>Simule um caso com pelo menos um node falhado e confirme que apenas o subconjunto esperado e reexecutado.</item>
  </validation>
</task_prompt>
```

## Task 4: Adicionar argumentos reais de CLI

Problema atual:
- O entrypoint apenas renderiza a TUI; nao ha parsing de argumentos como task inicial, arquivos de contexto, modelos, help ou version.

Arquivos e contexto relevantes:
- @CLAUDE.md
- @docs/general/file-agent-patterns.md
- @docs/general/context-building.md
- @docs/general/context-building-2.md
- @docs/general/story-breaking.md
- @README.md
- @package.json
- @src/cli.tsx
- @src/app.tsx
- @src/hooks/use-config.ts
- @src/schemas/config.schema.ts

Prompt XML:

```xml
<task_prompt>
  <background_information>
    O projeto se apresenta como CLI, mas hoje opera apenas no modo TUI interativo. Falta uma camada real de argumentos para automatizacao, integracao com shell e bootstrap mais rapido. A implementacao deve manter compatibilidade com o fluxo atual, sem destruir a experiencia interativa existente.
  </background_information>

  <references>
    <item>@CLAUDE.md</item>
    <item>@docs/general/file-agent-patterns.md</item>
    <item>@docs/general/context-building.md</item>
    <item>@docs/general/context-building-2.md</item>
    <item>@docs/general/story-breaking.md</item>
    <item>@README.md</item>
    <item>@package.json</item>
    <item>@src/cli.tsx</item>
    <item>@src/app.tsx</item>
    <item>@src/hooks/use-config.ts</item>
    <item>@src/schemas/config.schema.ts</item>
  </references>

  <objective>
    Adicionar parsing real de argumentos no CLI com um conjunto pequeno, util e bem definido. O produto deve continuar funcionando em modo interativo por padrao, mas permitir bootstrap por flags para reduzir friccao e habilitar automacao.
  </objective>

  <instructions>
    <item>Defina um conjunto minimo de flags de alto valor, por exemplo `--help`, `--version`, `--task`, `--context`, `--planner`, `--worker`, e outras que facam sentido pelo estado atual do projeto.</item>
    <item>Evite criar uma superficie grande demais; priorize flags realmente sustentadas pelo runtime atual.</item>
    <item>Projete a integracao com `App` e `useConfig` de modo tipado, sem duplicar regras de validacao.</item>
    <item>Se uma flag puder entrar em conflito com config persistida, estabeleca precedencia explicita e coerente.</item>
    <item>Atualize a README para refletir o novo contrato da CLI.</item>
    <item>Se decidir adicionar suporte a uma flag de concorrencia, alinhe com a task de limite configuravel de concorrencia em vez de duplicar modelagem.</item>
  </instructions>

  <constraints>
    <item>Nao quebre o fluxo TUI existente por padrao.</item>
    <item>Nao implemente flags que o runtime ainda nao consegue honrar.</item>
    <item>Nao espalhe parsing manual sem tipagem e validacao centralizada.</item>
  </constraints>

  <acceptance_criteria>
    <item>O CLI responde a `--help` e `--version`.</item>
    <item>E possivel preconfigurar pelo menos task e contexto por argumentos reais.</item>
    <item>A precedencia entre flags e config persistida esta clara e implementada.</item>
    <item>A README documenta os argumentos suportados.</item>
    <item>`npm run typecheck` passa.</item>
  </acceptance_criteria>

  <validation>
    <item>Execute `npm run typecheck`.</item>
    <item>Teste manualmente `node dist/cli.js --help` e ao menos um fluxo com `--task` e `--context`.</item>
  </validation>
</task_prompt>
```

## Task 5: Integrar resolvedor avancado de conflito ao executor

Problema atual:
- O projeto possui `mergeWithResolution` em `src/git/conflict-resolver.ts`, mas o `dag-executor` ainda usa merge simples.
- Existe tambem a oportunidade de avaliar uma etapa mais inteligente de commit/merge assistida por agente Pi apenas quando o merge normal falhar, em vez de alterar o worker para assumir responsabilidades que hoje pertencem ao orquestrador.

Arquivos e contexto relevantes:
- @CLAUDE.md
- @docs/general/file-agent-patterns.md
- @docs/general/prompt-engineering.md
- @docs/general/prompts-guide.md
- @docs/general/context-building.md
- @docs/general/story-breaking.md
- @README.md
- @src/pipeline/dag-executor.ts
- @src/git/conflict-resolver.ts
- @src/git/git-wrapper.ts
- @src/agents/worker-runner.ts
- @src/prompts/worker.prompt.ts
- @src/pipeline/orchestrator.ts

Prompt XML:

```xml
<task_prompt>
  <background_information>
    O projeto ja isolou um resolvedor de conflitos mais sofisticado, mas ele nao participa do caminho principal de merge. Ao mesmo tempo, o prompt do worker foi simplificado para deixar commit/merge no orquestrador. A task precisa melhorar a confiabilidade de merge sem embaralhar responsabilidades entre worker e pipeline.
  </background_information>

  <references>
    <item>@CLAUDE.md</item>
    <item>@docs/general/file-agent-patterns.md</item>
    <item>@docs/general/prompt-engineering.md</item>
    <item>@docs/general/prompts-guide.md</item>
    <item>@docs/general/context-building.md</item>
    <item>@docs/general/story-breaking.md</item>
    <item>@README.md</item>
    <item>@src/pipeline/dag-executor.ts</item>
    <item>@src/git/conflict-resolver.ts</item>
    <item>@src/git/git-wrapper.ts</item>
    <item>@src/agents/worker-runner.ts</item>
    <item>@src/prompts/worker.prompt.ts</item>
    <item>@src/pipeline/orchestrator.ts</item>
  </references>

  <objective>
    Integrar o caminho avancado de resolucao de conflitos ao fluxo principal de execucao, priorizando a menor mudanca robusta. Avalie explicitamente se a solucao deve ser: (a) trocar merge simples por `mergeWithResolution`, ou (b) adicionar um fallback controlado, possivelmente assistido por agente, apenas quando o merge direto falhar. Prefira a opcao mais simples que aumente confiabilidade real.
  </objective>

  <instructions>
    <item>Mapeie o fluxo de merge atual no DAG Executor e identifique o ponto exato onde o resolvedor avancado deve entrar.</item>
    <item>Mantenha a responsabilidade de edicao de arquivos no worker e a responsabilidade de integracao no pipeline/orquestrador.</item>
    <item>Se houver fallback assistido por agente, ele deve ser opcional, contido e acionado apenas em caso de conflito real, nunca no caminho feliz.</item>
    <item>Evite transformar o worker em resolvedor de merge generico.</item>
    <item>Garanta logging/resultado suficiente para diagnosticar quando merge simples, merge com resolucao e fallback assistido forem usados.</item>
    <item>Documente claramente o criterio de fallback no codigo se ele nao for autoevidente.</item>
  </instructions>

  <constraints>
    <item>Nao reescreva a arquitetura inteira do executor.</item>
    <item>Nao mova commit/merge para dentro do worker por conveniencia.</item>
    <item>Nao adicione um agente extra no caminho feliz sem justificativa forte.</item>
  </constraints>

  <acceptance_criteria>
    <item>O caminho principal de merge deixa de depender apenas de `merge(...)` simples.</item>
    <item>Conflitos reais passam a ter uma estrategia de resolucao integrada e previsivel.</item>
    <item>O contrato de responsabilidades entre worker e orquestrador permanece claro.</item>
    <item>`npm run typecheck` passa.</item>
  </acceptance_criteria>

  <validation>
    <item>Execute `npm run typecheck`.</item>
    <item>Valide pelo menos um cenario de merge sem conflito e um cenario com conflito controlado.</item>
  </validation>
</task_prompt>
```

## Task 6: Adicionar limite configuravel de concorrencia

Problema atual:
- O executor processa por waves, mas nao existe um limite explicito e configuravel de concorrencia para controlar quantos workers rodam ao mesmo tempo.

Arquivos e contexto relevantes:
- @CLAUDE.md
- @docs/general/file-agent-patterns.md
- @docs/general/story-breaking.md
- @docs/general/context-building.md
- @README.md
- @src/pipeline/dag-executor.ts
- @src/pipeline/orchestrator.ts
- @src/schemas/config.schema.ts
- @src/hooks/use-config.ts
- @src/screens/config-screen.tsx

Prompt XML:

```xml
<task_prompt>
  <background_information>
    A execucao paralela por waves existe, mas falta governanca operacional sobre concorrencia. Sem um limite configuravel, o comportamento pode variar demais conforme o tamanho da DAG, o numero de worktrees e o custo dos modelos escolhidos. A task deve introduzir esse controle sem desfigurar o pipeline atual.
  </background_information>

  <references>
    <item>@CLAUDE.md</item>
    <item>@docs/general/file-agent-patterns.md</item>
    <item>@docs/general/story-breaking.md</item>
    <item>@docs/general/context-building.md</item>
    <item>@README.md</item>
    <item>@src/pipeline/dag-executor.ts</item>
    <item>@src/pipeline/orchestrator.ts</item>
    <item>@src/schemas/config.schema.ts</item>
    <item>@src/hooks/use-config.ts</item>
    <item>@src/screens/config-screen.tsx</item>
  </references>

  <objective>
    Introduzir um limite explicito e configuravel de concorrencia, persistido na configuracao do usuario e respeitado pelo executor. A experiencia deve continuar simples: valor default sensato, validacao forte e impacto minimo na UX atual.
  </objective>

  <instructions>
    <item>Modele um campo de configuracao tipado e validado com Zod para concorrencia maxima.</item>
    <item>Defina um default conservador e explique no codigo apenas se a escolha nao for obvia.</item>
    <item>Integre o limite no DAG Executor sem quebrar a semantica de waves e dependencias.</item>
    <item>Atualize a UI de configuracao apenas na medida necessaria para o usuario conseguir alterar esse valor.</item>
    <item>Se existir legado de config, preserve compatibilidade e migracao coerente.</item>
    <item>Atualize a README se a configuracao passar a fazer parte do contrato do produto.</item>
  </instructions>

  <constraints>
    <item>Nao transforme a task em um scheduler completamente novo.</item>
    <item>Nao introduza configuracao sem validacao ou sem default seguro.</item>
    <item>Nao misture concorrencia com retry seletivo se nao for estritamente necessario.</item>
  </constraints>

  <acceptance_criteria>
    <item>Existe um campo de config persistido para limite maximo de concorrencia.</item>
    <item>O DAG Executor respeita esse limite durante a execucao.</item>
    <item>Compatibilidade com config existente e mantida.</item>
    <item>`npm run typecheck` passa.</item>
  </acceptance_criteria>

  <validation>
    <item>Execute `npm run typecheck`.</item>
    <item>Teste manualmente com valores baixos de concorrencia para verificar limitacao real de paralelismo.</item>
  </validation>
</task_prompt>
```

## Task 7: Aprofundar tratamento de erro em config e validacao de API

Problema atual:
- `use-config` reduz diferentes falhas de leitura/parse para estados rasos.
- `use-api-validation` diferencia pouco os erros de rede/autenticacao/limite e devolve mensagens genericas demais.

Arquivos e contexto relevantes:
- @CLAUDE.md
- @docs/general/file-agent-patterns.md
- @docs/general/context-building.md
- @docs/general/context-building-2.md
- @docs/general/prompt-engineering.md
- @README.md
- @src/hooks/use-config.ts
- @src/hooks/use-api-validation.ts
- @src/screens/config-screen.tsx
- @src/app.tsx
- @src/schemas/config.schema.ts

Prompt XML:

```xml
<task_prompt>
  <background_information>
    O fluxo atual de configuracao funciona, mas trata erros de maneira superficial demais. Isso reduz observabilidade e piora a UX quando a config esta corrompida, a API key esta invalida, ha rate limit, timeout, erro de permissao ou falha temporaria de rede. A task deve aprofundar a classificacao de erro sem inflar a complexidade desnecessariamente.
  </background_information>

  <references>
    <item>@CLAUDE.md</item>
    <item>@docs/general/file-agent-patterns.md</item>
    <item>@docs/general/context-building.md</item>
    <item>@docs/general/context-building-2.md</item>
    <item>@docs/general/prompt-engineering.md</item>
    <item>@README.md</item>
    <item>@src/hooks/use-config.ts</item>
    <item>@src/hooks/use-api-validation.ts</item>
    <item>@src/screens/config-screen.tsx</item>
    <item>@src/app.tsx</item>
    <item>@src/schemas/config.schema.ts</item>
  </references>

  <objective>
    Melhorar o tratamento de erro de configuracao e validacao de API para que estados distintos sejam identificados e comunicados corretamente ao usuario. O objetivo nao e criar uma infraestrutura pesada de observabilidade, e sim distinguir erros relevantes de forma tipada, previsivel e com mensagens acionaveis.
  </objective>

  <instructions>
    <item>Modele erros de configuracao com granularidade suficiente para diferenciar arquivo ausente, JSON invalido, schema invalido, erro de permissao e falha de IO.</item>
    <item>Modele erros de validacao de API com granularidade suficiente para diferenciar chave invalida, erro de rede, timeout, rate limit e indisponibilidade remota quando isso puder ser inferido com seguranca.</item>
    <item>Propague esses estados para a UI de configuracao sem espalhar condicionais opacas.</item>
    <item>Reutilize Zod e tipos discriminados sempre que fizer sentido.</item>
    <item>Mantenha a experiencia de usuario enxuta: mensagens claras, sem despejar stack traces na tela.</item>
    <item>Se alterar o shape da config em memoria, preserve compatibilidade com o contrato atual.</item>
  </instructions>

  <constraints>
    <item>Nao transforme a task em sistema completo de telemetria.</item>
    <item>Nao esconda erros diferentes sob o mesmo status generico.</item>
    <item>Nao degrade o fluxo feliz de configuracao.</item>
  </constraints>

  <acceptance_criteria>
    <item>Falhas de config relevantes sao distinguidas em estados tipados.</item>
    <item>Falhas de validacao de API relevantes sao distinguidas em estados tipados.</item>
    <item>A tela de configuracao apresenta mensagens acionaveis coerentes com cada caso.</item>
    <item>`npm run typecheck` passa.</item>
  </acceptance_criteria>

  <validation>
    <item>Execute `npm run typecheck`.</item>
    <item>Teste manualmente ao menos um caso de config invalida e um caso de API key invalida.</item>
  </validation>
</task_prompt>
```

## Dependencias Entre Tasks

Dependencias fortes:
- Task 4 depende parcialmente da Task 6 se voce quiser expor `maxConcurrency` via argumento de CLI. Se a Task 4 ficar limitada a `--help`, `--version`, `--task`, `--context`, `--planner` e `--worker`, ela pode ser feita antes.

Dependencias recomendadas de ordem:
- Task 1 antes de todas as outras, para restaurar um baseline de validacao local com lint.
- Task 7 antes da Task 4, se voce quiser que erros de argumentos/config aparecam de forma mais precisa no bootstrap do CLI.
- Task 6 antes da Task 4, se flags de concorrencia fizerem parte do escopo do CLI.
- Task 2 e Task 3 sao independentes entre si, mas ambas tocam o fluxo final de UX; vale sequenciar para evitar conflitos de estado em `src/app.tsx`.
- Task 5 e independente das demais no plano tecnico, mas deve ser tratada depois do baseline de lint/typecheck estar verde para facilitar iteracao segura.

Ordem recomendada de execucao:
1. Task 1
2. Task 7
3. Task 6
4. Task 4
5. Task 2
6. Task 3
7. Task 5