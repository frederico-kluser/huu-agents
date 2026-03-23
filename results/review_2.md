# Revisão Arquitetural: Branches claude/* — Worker Pipeline Profiles

> **Data:** 2026-03-23
> **Base:** `main` @ `876761f`
> **Feature:** Worker Pipeline Profiles V1 (`docs/general/worker-pipeline-profiles-roadmap.md`)
> **Modo:** Read-only — nenhum merge, cherry-pick ou edição realizado.

---

## 1. Premissas

**Branch base assumida:** `main` @ `876761f` — todas as 5 branches compartilham exatamente o mesmo merge-base.

**Branches avaliadas:**

| Branch | Commits | Escopo |
|--------|---------|--------|
| `claude/implement-pi-dag-feature-g7lZ0` | 1 | **Apenas docs** (plan.md, 172 linhas). Sem código. Descartada. |
| `claude/implement-pi-dag-feature-tocNK` | 2 | Feature completa: schema, runtime, handlers (arquivo único), catalog, orchestrator, UI, app.tsx |
| `claude/implement-pi-dag-feature-wXTUC` | 1 | Feature completa: schema + state schema separado, runtime, handlers modulares, catalog, orchestrator, UI, result-screen, eslint |
| `claude/pi-dag-complex-feature-6sD5N` | 2 | Feature completa: schema mais rico (superRefine), runtime, handlers (git-diff separado), catalog, orchestrator leve, PipelineTrace component |
| `claude/pi-dag-complex-feature-dWvt6` | 2 | Feature completa: variable-resolver separado, handler types.ts, task-screen com seleção embutida, ProfileSelector component, PipelineTrace |

**Limitações encontradas:**

- Typecheck não foi executado por branch (read-only, worktrees compartilhadas com main). Baseline de main tem erros pré-existentes em `node:*` imports.
- Nenhuma branch incluiu testes — impede validação funcional automatizada.
- A branch `6sD5N` usa `ink-text-input` sem evidência de que esse pacote está no `package.json`.
- A branch `6sD5N` commita `plan.md` na raiz do repo (ruído).

---

## 2. Scorecard das Branches

**Pesos:** Roadmap V1 (25) · Arquitetura/DAG (20) · Schema/Contratos (15) · Runtime/Safety (15) · UI/Ink (10) · Testes (10) · Mergeabilidade (5)

| Branch | Roadmap | Arquit. | Schema | Runtime | UI | Testes | Merge | **Total** |
|--------|---------|---------|--------|---------|-----|--------|-------|-----------|
| **g7lZ0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| **tocNK** | 20 | 17 | 13 | 12 | 5 | 0 | 3 | **70** |
| **wXTUC** | 21 | 18 | 13 | 13 | 6 | 0 | 4 | **75** |
| **6sD5N** | 22 | 16 | 14 | 12 | 7 | 0 | 2 | **73** |
| **dWvt6** | 20 | 16 | 11 | 13 | 7 | 0 | 3 | **70** |

### Detalhamento por branch

#### tocNK (70/100)

**Principais forças:**

- `VariableNameSchema` com `refine()` valida nomes de variável em parse-time — garante padrão `custom_*` no nível de schema, não em runtime.
- `validateProfileReferences()` garante integridade referencial de `next`, `target`, `whenTrue`, `whenFalse` contra IDs de step existentes ou `__end__`. **Único branch com essa proteção.**
- Catálogo com `Result<T>` pattern e error discrimination: `file_not_found`, `parse_error`, `schema_error`, `write_error`, `profile_not_found`.
- `PipelineProgress` estendido com `activeProfile` e `pipelineTraces` por `nodeId` — a UI recebe dados completos da execução.
- Auto-commit no path de pipeline (`commitIfChanged()` após pipeline).
- `executeOneShot()` extraído como função nomeada — preserva o fluxo original intacto com clareza.

**Principais fraquezas:**

- Handlers em arquivo único (`step-handlers.ts`, 273 LOC) — monolítico, dificulta evolução e testes isolados.
- Step-edit do builder visual é placeholder (mostra tipo/id mas não permite editar campos de step).
- `WorkerPipelineState` é uma interface TypeScript, não um schema Zod — o state de runtime não é validado.
- Casts `readonly` internamente: `(state.reservedVars as Record<string, string>)` — viola imutabilidade declarada.

**Risco de integração:** Médio. Monólito de handlers precisa ser split antes de evoluir. State sem Zod impede catch de bugs de shape em runtime.

---

#### wXTUC (75/100)

**Principais forças:**

- **Melhor separação de concerns**: `worker-pipeline-types.ts` para tipos, `worker-pipeline-state.schema.ts` com Zod separado, handlers split em `ai-handlers.ts` + `control-handlers.ts` com registry `ReadonlyMap<string, StepHandler>` imutável.
- Handler recebe **cópia** do state (`{...state}`) — garante imutabilidade sem cast tricks. Respeita `CLAUDE.md`: "nunca mutar".
- **Única branch que estende `result-screen.tsx`**: mostra os últimos 5 entries de pipeline trace para nós falhados — observabilidade real no resultado (workstream R8A do roadmap).
- Catálogo com `Result<T>` pattern e error discrimination — idêntico ao tocNK em qualidade.
- Constantes nomeadas: `END_STEP_ID = '__end__'`, `RESERVED_VARS`, `CUSTOM_VAR_PREFIX` — elimina magic strings.
- `WorkerResultSchema` estendido com `pipelineTrace` (array de `StepTraceEntry`) e `failureReason` — contrato formal no schema de saída.
- eslint.config.js atualizado (mudança mínima e benéfica).

**Principais fraquezas:**

- Step-edit do builder visual é placeholder (4 fases, mas a fase de edição de campos não funciona).
- Sem `superRefine()` no `WorkerProfileSchema` — não valida que `entryStepId` aponta para step existente no nível de schema. Bug detectável apenas em runtime.
- Sem componente `PipelineTrace` reutilizável — a trace aparece inline no result-screen, mas não há componente extraído para reuso.
- Sem `validateProfileReferences()` — referências inválidas (`next` apontando para step inexistente) são aceitas no save e falham no runtime.
- Zero testes.
- Sem auto-commit explícito após execução de pipeline.

**Risco de integração:** Baixo. Diffs modulares, não toca em telas de alta frequência, não muda assinaturas existentes.

---

#### 6sD5N (73/100)

**Principais forças:**

- **Schema mais robusto**: `superRefine()` valida que `entryStepId` aponta para step existente e que `set_variable` tem `value` ou `valueExpression`. Catch no parse, não no runtime.
- **Lightest orchestrator diff** (33 linhas adicionadas vs 100+ nas outras branches) — menor risco na peça mais sensível do pipeline.
- `PipelineFailError` custom error class — separa erro de negócio (step `fail`) de erro técnico (runtime exception). Semântica mais rica.
- `PipelineTrace` component (71 LOC) — reutilizável, com formatação de duração (ms/s/m), color-coding (green/red), e `failureReason`.
- `git-diff-handler.ts` em arquivo dedicado — single responsibility para o handler que faz I/O.
- State schema com campo `status: 'running'|'succeeded'|'failed'` — FSM explícita no state, não inferida.
- Builder usa `TextInput` do Ink para entrada de campos — UX mais próxima do padrão Ink.
- `createInitialState()` como helper exportado — facilita testes.

**Principais fraquezas:**

- `resolveTemplate()` **lança exceção em variável desconhecida** — um typo em `$custm_name` crasha a pipeline inteira. Deveria degradar graciosamente (como wXTUC, que deixa `$var` inalterado).
- `plan.md` commitado na raiz do repo — artefato que não pertence ao codebase.
- Possível dependência `ink-text-input` não instalada — pode impedir compilação.
- Perfil resolvido na UI e passado como objeto completo no React state (`activeProfile: WorkerProfile | null` em `PipelineState`) — serializa demais no componente tree.
- Catálogo sem `Result<T>` — usa throw/catch para flow control.

**Risco de integração:** Médio-alto. Dependência potencialmente faltante, `resolveTemplate` agressivo, `plan.md` no repo.

---

#### dWvt6 (70/100)

**Principais forças:**

- `variable-resolver.ts` como **módulo dedicado** (131 LOC) — `resolveTemplate()`, `resolveVariable()`, `evaluateExpression()`, `evaluateArithmetic()` separados. Melhor testabilidade e separação de concerns de todo o grupo.
- **Runtime mais enxuto**: 212 LOC — focado, com helpers `applyStepResult()` e `applyFailure()` nomeados.
- `types.ts` para handler interface — `StepHandlerContext`, `StepHandlerResult`, `StepHandler` isolados.
- `ProfileSelector` (63 LOC) e `PipelineTrace` (61 LOC) como componentes reutilizáveis.
- Fallback gracioso quando perfil não encontrado: loga warning e usa worker direto.
- State schema separado (`worker-pipeline-state.schema.ts`, 122 LOC) com `customVars` validado contra prefixo `custom_`.

**Principais fraquezas:**

- Modifica `task-screen.tsx` em **116 linhas** — alto risco de regressão na tela de entrada de task.
- `handleTaskSubmit` muda assinatura para `(task: string, activeProfileId?: string | null)` — **quebra contrato existente**.
- Schema mais enxuto (169 LOC) — menos validações estruturais que tocNK ou 6sD5N.
- Type cast workaround no `ProfileSelector`: `items as Array<{label: string; value: string}>` — code smell.
- Naming inconsistente: `WorkerProfileCatalogSchema` (dWvt6) vs `ProfileCatalogSchema` (outras).

**Risco de integração:** Alto. Mudança de assinatura de `handleTaskSubmit` e diff grande em `task-screen.tsx` maximizam chance de regressão.

---

## 3. Melhor Branch Individual

### 🏆 `claude/implement-pi-dag-feature-wXTUC`

**Por que ela vence as demais:**

1. **Melhor arquitetura de módulos**: handler registry imutável (`ReadonlyMap`), types em arquivo próprio, state schema Zod separado. Respeita os princípios de `file-agent-patterns.md` (arquivos focados ≤300 LOC, funções coesas) e `story-breaking.md` (componentes independentes e paralelizáveis).

2. **Única que completa o workstream R8A (resultado expandido)**: estende `WorkerResultSchema` com `pipelineTrace` e `failureReason` E mostra esses dados no `result-screen.tsx`. As outras branches adicionam campos ao schema mas não os exibem no resultado final.

3. **Handler recebe cópia do state**: garante imutabilidade sem casts. tocNK faz `as Record<string, string>` para mutar; wXTUC faz `{...state}` para copiar. A diferença é conceitual: wXTUC trata state como valor, não como referência.

4. **Catálogo robusto com error typing**: `Result<T>` com discriminação de erro (`file_not_found | parse_error | schema_error | write_error | profile_not_found`). Não usa throw/catch para flow control — superior ao catálogo de 6sD5N e dWvt6.

5. **Menor risco de integração**: não toca `task-screen.tsx`, não muda assinaturas existentes, diffs modulares. O orchestrator extrai `executeWithProfile()` e `executeDirectWorker()` como funções nomeadas — legibilidade clara.

**O que ainda falta na wXTUC:**

| Lacuna | Severidade | Esforço estimado |
|--------|-----------|-----------------|
| Builder visual step-edit incompleto | Alta (V1 requer builder) | Médio — precisa de UI para campos por tipo de step |
| Sem `superRefine()` no schema | Média — bug tardio | Baixo — adicionar validação de entryStepId |
| Sem `validateProfileReferences()` | Média — referências inválidas aceitas | Baixo — copiar de tocNK |
| Sem `PipelineTrace` component | Baixa — trace existe inline | Baixo — extrair component |
| Zero testes | Alta (critério de qualidade) | Alto — cobertura de schema + runtime + handlers + catalog |
| Sem auto-commit após pipeline | Potencialmente alta | Baixo — clarificar se DAG executor commita |

---

## 4. Melhor Combinação Entre Branches

**A combinação supera a melhor branch isolada?** ✅ **Sim**, marginalmente. Três contribuições específicas de outras branches preenchem lacunas reais da wXTUC sem conflito arquitetural.

### Matriz por workstream

| Workstream | Vencedora | Alternativa | Justificativa |
|-----------|-----------|-------------|---------------|
| **Schema base (steps, profile, catalog)** | **wXTUC** | — | Discriminated union limpa, constantes nomeadas, `ProfileCatalogSchema` |
| **Schema validação estrutural** | **6sD5N** | — | `superRefine()` para entryStepId e set_variable completude — catch no parse, não no runtime |
| **Schema pipeline state** | **wXTUC** | dWvt6 | Zod separado (`worker-pipeline-state.schema.ts`), campos tipados, trace entries |
| **Validação de nomes de variável** | **tocNK** | — | `VariableNameSchema` com `refine()` — garante `custom_*` no parse. Nenhuma outra branch tem isso |
| **Integridade referencial** | **tocNK** | — | `validateProfileReferences()` — valida next/target/whenTrue/whenFalse. Exclusivo do tocNK |
| **Catálogo** | **wXTUC** | tocNK | `Result<T>`, error discrimination, parallel load. tocNK é equivalente |
| **Runtime base** | **wXTUC** | — | State copy para handler, immutable updates, `ReadonlyMap` registry |
| **Variable resolver** | **dWvt6** | — | Módulo separado (131 LOC) — melhor testabilidade e separação |
| **Handlers (step execution)** | **wXTUC** | — | Split ai/control + registry `ReadonlyMap`. 6sD5N para git-diff separado |
| **Orchestrator** | **wXTUC** | — | `executeWithProfile()` + `executeDirectWorker()` claros, `Result<T>` do catálogo |
| **Resultado expandido** | **wXTUC** | — | Única que estende `WorkerResultSchema` E `result-screen.tsx` |
| **Observabilidade (PipelineTrace)** | **6sD5N** | dWvt6 | 71 LOC, reutilizável, color-coding, formatação de duração, `failureReason` |
| **Seleção de perfil** | **wXTUC** | tocNK | Screen separada no state machine, sem tocar em task-screen.tsx |
| **Builder visual** | **6sD5N** | — | Usa `TextInput` do Ink (melhor UX), mas step-edit ainda incompleto em todas |
| **Testes** | **Nenhuma** | — | Zero cobertura em todas as branches |

### Justificativa técnica das escolhas de combinação

**Por que tocNK contribui validações, não a arquitetura inteira?** — tocNK tem as duas melhores contribuições de schema defense (`VariableNameSchema` e `validateProfileReferences()`) que nenhuma outra branch possui. São funções puras, autocontidas, sem dependências laterais. Porém seu runtime usa cast-away de readonly e handlers monolíticos — inferiores à wXTUC. Extrair apenas as duas validações é cirúrgico e seguro.

**Por que dWvt6 contribui variable-resolver, não o resto?** — É a única branch que isolou a resolução de variáveis num módulo dedicado de 131 LOC com 4 funções exportadas (`resolveTemplate`, `resolveVariable`, `evaluateExpression`, `evaluateArithmetic`). As outras 3 embutem essa lógica no runtime ou nos handlers. A separação respeita SRP, facilita testes unitários, e isola o componente mais error-prone da feature. Porém o resto do dWvt6 (task-screen changes, schema simples, type casts) é inferior.

**Por que 6sD5N para PipelineTrace e superRefine?** — O `PipelineTrace` de 6sD5N é 71 LOC, reutilizável, com formatação de duração e color-coding. O de dWvt6 é similar (61 LOC) mas marginalmente menos completo. O `superRefine()` é contribuição única de 6sD5N — nenhuma outra branch valida `entryStepId` no schema level.

**Por que NÃO usar dWvt6's task-screen integration?** — Embora elegante (evita nova tela), modifica `task-screen.tsx` em 116 linhas, muda a assinatura de `handleTaskSubmit`, e cria acoplamento entre profile selection e task input. O approach de tela separada (wXTUC/tocNK) é mais seguro, mais reversível, e respeita melhor o princípio de `story-breaking.md` de isolar componentes independentes.

---

## 5. Plano de Integração Recomendado

### Estratégia: wXTUC como base + enriquecimento cirúrgico

#### Passo 1 — Merge wXTUC como base

Traz toda a arquitetura: schemas, state schema, runtime, handlers modulares, catalog com `Result<T>`, orchestrator (`executeWithProfile` + `executeDirectWorker`), profile-select screen, result-screen com trace, app.tsx state machine.

**Conflitos:** Nenhum (merge direto contra main).

#### Passo 2 — Adicionar `superRefine()` ao `WorkerProfileSchema`

Extrair de 6sD5N a validação de `entryStepId` (existe nos steps?) e `set_variable` (tem `value` ou `valueExpression`?). Aplicar como `.superRefine()` no `WorkerProfileSchema` da wXTUC.

**Conflitos:** Nenhum (adição pura ao schema existente). Requer adaptação manual — não é cherry-pick limpo.

#### Passo 3 — Adicionar `VariableNameSchema` e `validateProfileReferences()`

Extrair de tocNK o schema de validação de nome de variável (`refine` que exige reserved ou `custom_*`) e a função de integridade referencial. Integrar no builder como guarda de save e no catálogo como validação de write.

**Conflitos:** Renaming de tipo (`VarName` em 6sD5N vs `VariableNameSchema` em tocNK). Resolvível manualmente — adotar `VariableNameSchema` (mais descritivo).

#### Passo 4 — Extrair `variable-resolver.ts`

Mover a lógica de resolução de template, variável, expressão e aritmética do runtime da wXTUC para módulo separado (inspirado em dWvt6). Refactor do runtime para importar. **Não é cherry-pick — é reescrita de imports + remoção do código inline.**

**Conflitos:** O runtime da wXTUC embute essas funções. Requer refactor manual cuidadoso.

#### Passo 5 — Adicionar `PipelineTrace` component

Copiar de 6sD5N o componente `src/components/pipeline-trace.tsx` (71 LOC). Integrar no execution-screen e result-screen.

**Conflitos:** Nenhum (arquivo novo + imports).

### Partes que NÃO devem ser aproveitadas

| Branch | Artefato | Razão para descartar |
|--------|---------|---------------------|
| g7lZ0 | Inteira | Apenas docs, sem valor incremental sobre o roadmap existente |
| 6sD5N | `plan.md` na raiz | Artefato de planejamento que não pertence ao repo |
| 6sD5N | `resolveTemplate` throws | Crash em typo de variável — wXTUC acertou em deixar `$var` inalterado |
| 6sD5N | Profile como objeto no React state | Serializa demais no component tree |
| dWvt6 | `task-screen.tsx` | Mudança de assinatura + 116 linhas alteradas = alto risco de regressão |
| dWvt6 | Type cast no `ProfileSelector` | `items as Array<...>` — code smell que indica design problem |
| tocNK | Mutable state cast | `as Record<string, string>` dentro do runtime — viola imutabilidade |
| tocNK | Handlers monolíticos | Arquivo único de 273 LOC — inferior ao split de wXTUC |

---

## 6. Riscos e Lacunas

### Regressões possíveis

- **Fluxo no-profile não testado**: nenhuma branch incluiu testes para o path `!activeProfileId`. Se a branch condicional tiver bug, o modo atual do produto quebra silenciosamente.
- **Auto-commit pós-pipeline**: apenas tocNK faz auto-commit após pipeline execution. Nas outras, se o pipeline modifica arquivos mas não commita, o merge no DAG executor pode operar sobre working tree dirty — comportamento indefinido.
- **Dependência `ink-text-input`**: se o builder de 6sD5N for adotado, a dependência precisa ser adicionada ao `package.json`. Caso contrário, build falha.

### Testes faltantes (em todas as branches)

- Schema validation (Zod parse com dados válidos e inválidos, edge cases de `superRefine`)
- Runtime execution (happy path completo, fail step, loop protection trigger, `__end__` sentinel, step não encontrado)
- Variable resolution (templates com variáveis válidas/inválidas, expressões comparativas, aritmética)
- Handler unit tests (cada um dos 7 handlers isoladamente, com mocks de `runWorker` e `ChatOpenAI`)
- Catalog I/O (load global/local, save com precedência, merge com IDs duplicados, ENOENT handling)
- Integration (orchestrator com perfil ativo, sem perfil, perfil não encontrado)

### Dúvidas arquiteturais que exigem confirmação

1. **Auto-commit**: quem é responsável por `git add + commit` após a execução de pipeline? tocNK faz no orchestrator. As outras não. O DAG executor precisa de commit para merge — se ninguém commita no path de pipeline, o merge pode falhar. **Confirmar com o owner do código.**

2. **Retry no path de pipeline**: o path one-shot tem `retryWorker()`. O path de pipeline não tem retry em nenhuma branch. O roadmap não especifica retry no V1, mas a ausência pode surpreender. **Confirmar se é intencional.**

3. **Model fallback para langchain**: wXTUC usa `profile.langchainModel ?? config.workerModel`. Usar `workerModel` como fallback para uma invocação LangChain é questionável — são contextos diferentes (Pi Agent vs ChatOpenAI). **Confirmar com o owner do produto.**

4. **Builder visual scope V1**: nenhuma branch completou step-edit. **Confirmar se V1 pode lançar sem edição de campos de step** (apenas adição/remoção com defaults).

---

## 7. Recomendação Final

**Recomendação objetiva:** Usar `claude/implement-pi-dag-feature-wXTUC` como base, enriquecer com `superRefine()` de 6sD5N, `validateProfileReferences()` de tocNK, e `PipelineTrace` component de 6sD5N — depois completar builder visual e testes como work items separados.

**Alternativa conservadora:** Mergear wXTUC como está, sem cherry-picks. Aceitar as lacunas de validação (`entryStepId`, referências) como tech debt V1.1. Menor risco de integração, entrega mais rápida.

**Alternativa agressiva:** Fazer a combinação completa (incluindo variable-resolver de dWvt6), completar step-edit do builder, e adicionar testes unitários em uma sequência de PRs atômicos. Maior qualidade final, mas requer esforço significativo de reescrita e risco de introduzir bugs na integração manual.
