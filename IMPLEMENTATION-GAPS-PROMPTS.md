# Tasks Novas e Prompts de Correcao

Este documento contem apenas as tasks novas para corrigir os problemas ainda abertos no codigo atual.

Escopo:
- Inclui somente gaps confirmados por revisao de codigo e validacao local.
- Cada task abaixo tem um prompt XML proprio, pronto para execucao.

## Task 1: corrigir o fluxo de `--task` — DONE

Diagnostico:
- O contrato atual de CLI diz que `--task` pula a tela de input da macro-task.
- No codigo atual, isso so acontece quando `--task` e `--context` chegam juntos.
- Com apenas `--task`, a macro-task se perde antes da execucao porque a tela de task inicializa vazia.

Arquivos e contexto relevantes:
- @CLAUDE.md
- @docs/general/file-agent-patterns.md
- @docs/general/context-building.md
- @docs/general/context-building-2.md
- @docs/general/story-breaking.md
- @README.md
- @src/cli.tsx
- @src/cli-args.ts
- @src/app.tsx
- @src/screens/task-screen.tsx

Prompt XML:

```xml
<task_prompt>
  <background_information>
    O fluxo de CLI ja aceita a flag --task, mas o comportamento real nao bate com o contrato documentado. Hoje a macro-task passada por CLI so leva direto para execucao quando tambem existe --context. Com apenas --task, o valor se perde e o usuario precisa redigitar a task manualmente. Isso torna a implementacao incompleta.
  </background_information>

  <references>
    <item>@CLAUDE.md</item>
    <item>@docs/general/file-agent-patterns.md</item>
    <item>@docs/general/context-building.md</item>
    <item>@docs/general/context-building-2.md</item>
    <item>@docs/general/story-breaking.md</item>
    <item>@README.md</item>
    <item>@src/cli.tsx</item>
    <item>@src/cli-args.ts</item>
    <item>@src/app.tsx</item>
    <item>@src/screens/task-screen.tsx</item>
  </references>

  <objective>
    Fazer a flag --task funcionar de forma consistente com o contrato da CLI. A macro-task passada por argumento deve ser preservada corretamente e o fluxo deve evitar redigitacao desnecessaria.
  </objective>

  <instructions>
    <item>Mapeie o bootstrap atual entre parseCliArgs, App e TaskScreen.</item>
    <item>Defina um comportamento unico e claro para --task sem --context e para --task com --context.</item>
    <item>Se a tela de task continuar existindo nesse fluxo, ela deve ser inicializada com o valor vindo da CLI.</item>
    <item>Se optar por pular a tela de task, faca isso apenas quando o comportamento permanecer previsivel.</item>
    <item>Mantenha a precedencia de CLI sobre estado inicial em memoria, sem introduzir mutacao escondida.</item>
    <item>Atualize a README apenas se o contrato final mudar.</item>
  </instructions>

  <constraints>
    <item>Nao duplicar parsing de argumentos em mais de um lugar.</item>
    <item>Nao quebrar o fluxo TUI interativo padrao.</item>
    <item>Nao introduzir logica de bootstrap opaca ou dependente de efeitos colaterais.</item>
  </constraints>

  <acceptance_criteria>
    <item>`--task` sozinho nao perde a macro-task passada.</item>
    <item>`--task` com `--context` continua funcionando.</item>
    <item>O comportamento final bate com a README e com o texto de ajuda.</item>
    <item>`npm run typecheck` passa.</item>
  </acceptance_criteria>

  <validation>
    <item>Execute `npm run typecheck`.</item>
    <item>Teste manualmente `node dist/cli.js --task "Refatorar auth"`.</item>
    <item>Teste manualmente `node dist/cli.js --task "Refatorar auth" --context src/auth`.</item>
  </validation>
</task_prompt>
```

## Task 2: separar overrides de CLI da config persistida — DONE

Diagnostico:
- A README afirma que `--planner` e `--worker` valem apenas para a sessao atual.
- No fluxo atual, esses overrides podem ser salvos no arquivo de config em alguns cenarios, especialmente ao concluir a configuracao.
- Isso cria divergencia entre documentacao e comportamento real.

Arquivos e contexto relevantes:
- @CLAUDE.md
- @docs/general/file-agent-patterns.md
- @docs/general/context-building.md
- @README.md
- @src/cli.tsx
- @src/cli-args.ts
- @src/app.tsx
- @src/hooks/use-config.ts
- @src/schemas/config.schema.ts
- @src/screens/config-screen.tsx

Prompt XML:

```xml
<task_prompt>
  <background_information>
    O sistema aceita overrides de modelos via CLI, mas o contrato atual diz que esses overrides sao apenas da sessao. O codigo atual mistura override de sessao com persistencia de configuracao em alguns caminhos, o que gera comportamento surpreendente e torna a README incorreta na pratica.
  </background_information>

  <references>
    <item>@CLAUDE.md</item>
    <item>@docs/general/file-agent-patterns.md</item>
    <item>@docs/general/context-building.md</item>
    <item>@README.md</item>
    <item>@src/cli.tsx</item>
    <item>@src/cli-args.ts</item>
    <item>@src/app.tsx</item>
    <item>@src/hooks/use-config.ts</item>
    <item>@src/schemas/config.schema.ts</item>
    <item>@src/screens/config-screen.tsx</item>
  </references>

  <objective>
    Separar corretamente override de sessao e configuracao persistida. Flags de modelo da CLI devem afetar apenas a execucao atual, sem contaminar o arquivo salvo, a menos que o contrato do produto mude explicitamente.
  </objective>

  <instructions>
    <item>Mapeie todos os pontos onde applyModelOverrides e saveConfig interagem.</item>
    <item>Garanta que a config persistida reflita apenas escolhas intencionais do usuario, nao overrides temporarios de sessao.</item>
    <item>Mantenha a precedencia CLI em memoria durante a sessao atual.</item>
    <item>Evite introduzir dois estados de config divergentes sem regra clara.</item>
    <item>Se a UX precisar mostrar os modelos efetivos da sessao, isso deve acontecer sem reescrever a config salva.</item>
    <item>Confirme que a README final descreve exatamente o comportamento implementado.</item>
  </instructions>

  <constraints>
    <item>Nao remover suporte a override por CLI.</item>
    <item>Nao alterar o schema de config sem necessidade.</item>
    <item>Nao misturar persistencia com estado de sessao de forma implicita.</item>
  </constraints>

  <acceptance_criteria>
    <item>`--planner` e `--worker` nao vazam para o arquivo de config salvo.</item>
    <item>Os overrides continuam valendo durante a sessao atual.</item>
    <item>A README e o comportamento real ficam alinhados.</item>
    <item>`npm run typecheck` passa.</item>
  </acceptance_criteria>

  <validation>
    <item>Execute `npm run typecheck`.</item>
    <item>Teste um fluxo com override por CLI e confirme que o arquivo `~/.pi-dag-cli.json` nao e reescrito com esses modelos de sessao.</item>
  </validation>
</task_prompt>
```

## Task 3: remover `main` hardcoded do diff final — DONE

Diagnostico:
- O diff final real existe, mas ainda usa `main...branch` diretamente.
- Isso quebra ou distorce o resultado em repositorios cujo branch base nao seja `main`.
- A funcionalidade esta implementada, mas ainda nao esta correta de forma geral.

Arquivos e contexto relevantes:
- @CLAUDE.md
- @docs/general/file-agent-patterns.md
- @docs/general/ink.md
- @docs/general/story-breaking.md
- @README.md
- @src/app.tsx
- @src/screens/diff-screen.tsx
- @src/pipeline/orchestrator.ts
- @src/git/git-wrapper.ts

Prompt XML:

```xml
<task_prompt>
  <background_information>
    O viewer de diff final ja existe, mas ainda assume que a base de comparacao e sempre a branch main. Isso torna a feature incorreta em repositorios cujo branch padrao seja diferente, ou em execucoes cuja base real precise ser derivada dinamicamente.
  </background_information>

  <references>
    <item>@CLAUDE.md</item>
    <item>@docs/general/file-agent-patterns.md</item>
    <item>@docs/general/ink.md</item>
    <item>@docs/general/story-breaking.md</item>
    <item>@README.md</item>
    <item>@src/app.tsx</item>
    <item>@src/screens/diff-screen.tsx</item>
    <item>@src/pipeline/orchestrator.ts</item>
    <item>@src/git/git-wrapper.ts</item>
  </references>

  <objective>
    Tornar o diff final realmente correto em relacao a branch base da execucao, sem depender de `main` hardcoded. O diff stat e o diff completo devem usar a mesma base real.
  </objective>

  <instructions>
    <item>Mapeie de onde deve vir a branch base real da task.</item>
    <item>Escolha uma estrategia robusta para determinar essa base sem depender de convencao local fragil.</item>
    <item>Garanta que o mesmo criterio seja usado tanto no diff stat quanto no viewer de diff.</item>
    <item>Mantenha o contrato de UI atual: resultado final abre diff real e continua navegavel.</item>
    <item>Se precisar propagar a base via estado do app ou do pipeline, faca a menor mudanca tipada possivel.</item>
  </instructions>

  <constraints>
    <item>Nao manter `main` hardcoded como unica base.</item>
    <item>Nao recalcular a base com heuristica inconsistente entre telas.</item>
    <item>Nao transformar a task em refactor amplo do pipeline.</item>
  </constraints>

  <acceptance_criteria>
    <item>Diff stat e diff completo usam a mesma base real.</item>
    <item>A feature funciona em repositorios cujo branch padrao nao e `main`.</item>
    <item>`npm run typecheck` passa.</item>
  </acceptance_criteria>

  <validation>
    <item>Execute `npm run typecheck`.</item>
    <item>Valide manualmente o diff em um repo onde a branch base nao seja `main`, ou simule esse cenario de forma controlada.</item>
  </validation>
</task_prompt>
```

## Task 4: separar `blocked` de `failed` no resultado final

Diagnostico:
- O retry seletivo existe, mas o pipeline ainda trata dependentes bloqueados como se fossem falhas diretas.
- O schema do DAG nao diferencia `blocked`.
- A `ResultScreen` calcula bloqueados olhando para `pending`, o que nao representa o bloqueio real propagado pelo executor.

Arquivos e contexto relevantes:
- @CLAUDE.md
- @docs/general/file-agent-patterns.md
- @docs/general/ink.md
- @docs/general/story-breaking.md
- @README.md
- @src/pipeline/dag-executor.ts
- @src/pipeline/orchestrator.ts
- @src/screens/result-screen.tsx
- @src/schemas/dag.schema.ts
- @src/schemas/worker-result.schema.ts

Prompt XML:

```xml
<task_prompt>
  <background_information>
    O retry seletivo foi implementado, mas a semantica do resultado final ainda esta errada: nodes bloqueados por dependencia falha acabam entrando como failed. Isso distorce o resumo final, embaralha a leitura do DAG e dificulta diagnostico do usuario.
  </background_information>

  <references>
    <item>@CLAUDE.md</item>
    <item>@docs/general/file-agent-patterns.md</item>
    <item>@docs/general/ink.md</item>
    <item>@docs/general/story-breaking.md</item>
    <item>@README.md</item>
    <item>@src/pipeline/dag-executor.ts</item>
    <item>@src/pipeline/orchestrator.ts</item>
    <item>@src/screens/result-screen.tsx</item>
    <item>@src/schemas/dag.schema.ts</item>
    <item>@src/schemas/worker-result.schema.ts</item>
  </references>

  <objective>
    Separar semanticamente `blocked` de `failed` em todo o fluxo relevante: executor, estado do DAG, resultados e tela final. O usuario deve conseguir distinguir falha direta de bloqueio por dependencia.
  </objective>

  <instructions>
    <item>Mapeie o caminho atual de propagacao de falha no executor e no orchestrator.</item>
    <item>Defina um modelo coerente para representar blocked, incluindo schema e resumo final.</item>
    <item>Atualize a ResultScreen para refletir os estados reais e nao inferir bloqueio a partir de pending.</item>
    <item>Mantenha compatibilidade com o retry seletivo ja existente.</item>
    <item>Se for necessario adicionar evento ou status novo, faca isso com o menor impacto tipado possivel.</item>
  </instructions>

  <constraints>
    <item>Nao mascarar blocked como failed.</item>
    <item>Nao quebrar o contrato de retry ja existente.</item>
    <item>Nao deixar a UI derivando semantica errada de um estado generico.</item>
  </constraints>

  <acceptance_criteria>
    <item>O fluxo diferencia blocked de failed de ponta a ponta.</item>
    <item>A tela final mostra contagens e listas coerentes com essa diferenca.</item>
    <item>Retry seletivo continua funcional.</item>
    <item>`npm run typecheck` passa.</item>
  </acceptance_criteria>

  <validation>
    <item>Execute `npm run typecheck`.</item>
    <item>Simule um caso em que um node falha e pelo menos um dependente fica bloqueado.</item>
  </validation>
</task_prompt>
```

## Task 5: tornar falhas de escrita de config visiveis

Diagnostico:
- A classificacao de erros de config melhorou, mas falhas de escrita ainda podem ficar invisiveis.
- O app pode navegar para a proxima tela sem aguardar a persistencia terminar.
- Isso deixa casos de `permission_error` e `write_error` mal resolvidos no fluxo principal.

Arquivos e contexto relevantes:
- @CLAUDE.md
- @docs/general/file-agent-patterns.md
- @docs/general/context-building.md
- @docs/general/context-building-2.md
- @README.md
- @src/app.tsx
- @src/hooks/use-config.ts
- @src/screens/config-screen.tsx
- @src/schemas/errors.ts
- @src/schemas/config.schema.ts

Prompt XML:

```xml
<task_prompt>
  <background_information>
    O tratamento de erro de configuracao esta melhor classificado, mas ainda existe um gap de UX e confiabilidade: se salvar a config falhar, o usuario pode ser levado adiante no fluxo sem ver o erro. Isso torna a correção incompleta para casos reais de permissao, escrita ou IO.
  </background_information>

  <references>
    <item>@CLAUDE.md</item>
    <item>@docs/general/file-agent-patterns.md</item>
    <item>@docs/general/context-building.md</item>
    <item>@docs/general/context-building-2.md</item>
    <item>@README.md</item>
    <item>@src/app.tsx</item>
    <item>@src/hooks/use-config.ts</item>
    <item>@src/screens/config-screen.tsx</item>
    <item>@src/schemas/errors.ts</item>
    <item>@src/schemas/config.schema.ts</item>
  </references>

  <objective>
    Garantir que falhas de escrita da configuracao sejam percebidas e tratadas corretamente pelo usuario antes de o fluxo seguir. O estado de erro precisa ser visivel, acionavel e coerente com a classificacao tipada ja existente.
  </objective>

  <instructions>
    <item>Mapeie o caminho atual entre ConfigScreen, App e saveConfig.</item>
    <item>Garanta que o fluxo nao avance silenciosamente quando persistir a config falhar.</item>
    <item>Reaproveite os tipos e mensagens de erro ja introduzidos em `schemas/errors.ts`.</item>
    <item>Mantenha o fluxo feliz simples e sem regressao visual desnecessaria.</item>
    <item>Se for necessario aguardar `saveConfig`, faca isso explicitamente e com tratamento de erro claro.</item>
  </instructions>

  <constraints>
    <item>Nao esconder falhas de escrita atras de navegacao imediata.</item>
    <item>Nao duplicar classificacao de erro fora do hook de config sem necessidade.</item>
    <item>Nao degradar a UX do caminho feliz.</item>
  </constraints>

  <acceptance_criteria>
    <item>Falhas de escrita de config aparecem de forma visivel ao usuario.</item>
    <item>O app nao avanca de forma silenciosa quando salvar falha.</item>
    <item>As mensagens exibidas sao coerentes com `ConfigErrorKind`.</item>
    <item>`npm run typecheck` passa.</item>
  </acceptance_criteria>

  <validation>
    <item>Execute `npm run typecheck`.</item>
    <item>Simule um erro de permissao ou escrita e confirme que a UI nao segue adiante silenciosamente.</item>
  </validation>
</task_prompt>
```

## Dependencias Entre Tasks

Dependencias fortes:
- Task 1 e Task 2 tocam o mesmo fluxo de bootstrap de CLI e estado inicial em @src/app.tsx. Vale resolver juntas ou em sequencia curta para evitar regressao cruzada.
- Task 5 depende parcialmente do mesmo fluxo de configuracao tocado pela Task 2, porque ambas encostam em persistencia e navegacao apos salvar config.

Dependencias recomendadas de ordem:
- Task 2 antes da Task 5, para estabilizar a fronteira entre config de sessao e config persistida antes de tratar UX de erro de escrita.
- Task 1 pode ser feita junto com a Task 2, mas se for separado, faca a Task 1 primeiro para estabilizar o bootstrap de `cliArgs`.
- Task 4 e independente das demais no nivel de dominio, mas toca fluxo final de execucao e resultado; melhor manter separada das correcoes de CLI/config.
- Task 3 e tecnicamente independente das demais, desde que a base real do diff seja propagada de forma local e tipada.

Ordem recomendada de execucao:
1. Task 1
2. Task 2
3. Task 5
4. Task 3
5. Task 4