# Plano de Implementacao

Este arquivo passa a ser a fonte de verdade para esta implementação específica. Ele descreve o alvo desejado, a ordem de execução e os critérios de aceite. Nada descrito aqui deve ser tratado como já implementado até que o código e a validação confirmem a entrega.

## Escopo desta implementação

Objetivo principal: tornar a configuração dos agentes escolhidos uma feature planejada e rastreável, sem alterar o código antes da execução formal do trabalho.

Resultado esperado ao final da implementação futura:

- O usuário consegue alterar os agentes escolhidos de forma explícita e consistente.
- A configuração salva reflete exatamente os agentes selecionados para planner e worker.
- A UI, o arquivo de configuração e o pipeline permanecem sincronizados.
- O comportamento continua compatível com o código existente durante a transição.

## Status atual

**Implementado em 2026-03-22.**

Todas as 5 fases foram concluídas e validadas:

- Fase 1: `SelectedAgentsSchema` criado em `config.schema.ts` com Zod transform
- Fase 2: `use-config.ts` migra automaticamente configs legadas via `ConfigSchema.parse()`
- Fase 3: `config-screen.tsx` aceita `existingConfig` — preserva `worktreeBasePath` e pré-seleciona modelos
- Fase 4: `app.tsx` usa `selectedAgents` na StatusBar e passa config completa ao ConfigScreen
- Fase 5: Typecheck passa, code review realizado

Critérios de aceite atendidos:
- [x] Schema explícito para agentes selecionados
- [x] Configs antigas continuam carregando (migração automática)
- [x] Configs novas salvas no formato alvo
- [x] UI preserva escolha atual ao reabrir via `[m]`
- [x] `plannerModel`, `workerModel` e `selectedAgents` sempre coerentes
- [x] Typecheck passa

## Fonte de verdade

Para esta frente de trabalho, este arquivo define:

- o problema a resolver
- o formato alvo da configuração
- os passos de implementação
- os critérios de aceite
- os riscos e validações obrigatórias

Se houver conflito entre este documento e o backlog amplo em `BACKLOG.md`, este documento prevalece para esta implementação específica.

## Problema a resolver

Hoje a troca de modelos existe na UI, mas a implementação desejada ainda não está formalizada como uma feature completa de configuração persistida dos agentes escolhidos.

Os gaps desta frente são:

- falta uma definição única do formato de configuração para planner e worker
- falta definir como manter compatibilidade com `plannerModel` e `workerModel`
- falta definir como a UI deve refletir e editar o valor já salvo
- falta definir a validação e o comportamento esperado antes de mexer no pipeline

## Formato alvo da configuração

A implementação futura deve introduzir uma estrutura explícita para os agentes escolhidos.

Formato alvo:

```json
{
  "openrouterApiKey": "sk-or-...",
  "plannerModel": "openai/gpt-5.4",
  "workerModel": "xiaomi/mimo-v2-flash",
  "selectedAgents": {
    "planner": "openai/gpt-5.4",
    "worker": "xiaomi/mimo-v2-flash"
  },
  "worktreeBasePath": ".pi-dag-worktrees"
}
```

Regras do formato alvo:

- `selectedAgents.planner` representa o agente escolhido para o planner.
- `selectedAgents.worker` representa o agente escolhido para os workers.
- `plannerModel` e `workerModel` devem continuar existindo durante a transição por compatibilidade.
- enquanto a migração existir, os campos legados e `selectedAgents` devem permanecer sincronizados.
- o schema deve decidir claramente qual campo prevalece em caso de divergência.

## Plano de implementação

### Fase 1. Definição do schema

- atualizar `src/schemas/config.schema.ts`
- introduzir schema explícito para `selectedAgents`
- manter compatibilidade com `plannerModel` e `workerModel`
- documentar precedence entre campos legados e novos
- validar com Zod sem usar `any`

### Fase 2. Persistência e carregamento

- revisar `src/hooks/use-config.ts`
- garantir que configs antigas continuem carregando
- garantir que configs novas sejam salvas no formato alvo
- tratar erros de migração e divergência de dados

### Fase 3. UI de configuração

- revisar `src/screens/config-screen.tsx`
- permitir edição preservando o estado atual salvo
- evitar sobrescrever `worktreeBasePath` ou outros campos não relacionados
- garantir que a reconfiguração por `[m]` reflita o valor já persistido

### Fase 4. Integração com a aplicação

- revisar `src/app.tsx`
- garantir que o fluxo de troca de modelos use a configuração atual como base
- garantir que o resultado salvo volte consistente para o pipeline

### Fase 5. Validação

- executar typecheck
- revisar impacto no fluxo de configuração inicial
- revisar impacto no fluxo de troca via `[m]`
- revisar compatibilidade com configs existentes
- revisar regressões na persistência

## Restrições

- não modificar arquitetura do pipeline além do necessário para a config
- não alterar catálogo de modelos em `src/data/models.ts`
- não introduzir dependências novas sem necessidade
- não mudar prompts nesta frente
- não implementar outros itens do backlog junto com esta mudança

## Critérios de aceite

- existe um schema explícito para os agentes escolhidos
- a aplicação continua aceitando config antiga
- a aplicação salva config nova no formato alvo definido aqui
- a UI mostra e preserva a escolha atual quando o usuário reabre a troca de modelos
- `plannerModel`, `workerModel` e `selectedAgents` permanecem coerentes
- typecheck passa

## Riscos

- sobrescrever campos de config que não pertencem ao fluxo de troca de agentes
- criar divergência entre campos legados e novos
- tratar o formato novo como implementado antes da validação real
- quebrar reconfiguração via `[m]`

## Fora de escopo

- implementar catálogo dinâmico do OpenRouter
- resolver temperature/OpenRouter no Pi SDK
- adicionar flags de CLI
- alterar retry, executor do DAG ou prompts
- atacar backlog amplo fora desta frente