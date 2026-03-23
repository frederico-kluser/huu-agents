# Avaliação Comparativa — Branches `claude/*` (Worker Pipeline Profiles)

**Data:** 2026-03-23
**Feature:** Worker Pipeline Profiles (V1)
**Fonte de verdade:** `docs/general/worker-pipeline-profiles-roadmap.md`
**Modo:** Read-only — nenhuma edição, merge ou cherry-pick realizado.

---

## 1. Premissas

| Item | Valor |
|---|---|
| **Branch base** | `main` (SHA `876761f`) — confirmada: todas as 5 branches compartilham o mesmo merge-base |
| **Branches avaliadas** | 5 branches locais (todas também em remotes) |
| **Limitações** | Nenhuma — todas as branches puderam ser lidas, comparadas e typecheckadas contra a base |

| Branch | Tipo | Arquivos | Inserções | Typecheck |
|---|---|---|---|---|
| `claude/implement-pi-dag-feature-g7lZ0` | **Apenas plan.md** | 1 | +172 | N/A |
| `claude/implement-pi-dag-feature-tocNK` | Implementação | 11 | +1587 | ✅ Passa |
| `claude/implement-pi-dag-feature-wXTUC` | Implementação | 17 | +1834 | ✅ Passa |
| `claude/pi-dag-complex-feature-6sD5N` | Implementação | 17 | +1986 | ✅ Passa |
| `claude/pi-dag-complex-feature-dWvt6` | Implementação | 20 | +1894 | ✅ Passa |

**g7lZ0 é desqualificada** — contém apenas um plano textual, zero código. Avaliação prossegue com as 4 branches restantes.

---

## 2. Scorecard das Branches

### Pesos dos critérios

| Critério | Peso |
|---|---|
| Aderência ao roadmap V1 | 25 |
| Correção arquitetural / DAG intacto | 20 |
| Design de schema e contratos | 15 |
| Runtime do worker / segurança | 15 |
| UI e aderência a Ink | 10 |
| Testes e validação | 10 |
| Mergeabilidade / risco | 5 |

### Notas por branch (escala 0–10 por critério)

| Critério (peso) | tocNK | wXTUC | 6sD5N | dWvt6 |
|---|---|---|---|---|
| Aderência V1 (25) | 8 | 8.5 | 9 | 9 |
| Arquitetura/DAG (20) | 8 | 8 | 9.5 | 8.5 |
| Schema/contratos (15) | 8.5 | 8.5 | 9 | 8.5 |
| Runtime/segurança (15) | 7.5 | 8 | 9 | 9 |
| UI/Ink (10) | 7 | 6 | 7.5 | 8.5 |
| Testes (10) | 0 | 0 | 0 | 0 |
| Mergeabilidade (5) | 7 | 7 | 8.5 | 7.5 |
| **Nota ponderada** | **6.4** | **6.4** | **7.4** | **7.2** |

### Resumo comparativo

| Branch | Cobertura roadmap | Nota | Principais forças | Principais fraquezas | Risco integração |
|---|---|---|---|---|---|
| **tocNK** | R1, R3, R4, R5A/B, R6A/B, R7 parcial | **6.4** | Schema completo, catalog robusto, builder funcional | Handlers em arquivo único (273 LOC), state mutado com cast de `readonly`, sem pipeline state separado, orchestrator tem dead-branch bug | Médio |
| **wXTUC** | R1, R3, R4, R5A/B, R6A parcial, R6B parcial, R7, R8A | **6.4** | Handlers modulares, types file, Result pattern no catalog, result-screen expandido | Builder step-edit é stub, builder inalcançável do app.tsx, model overrides do perfil ignorados | Médio |
| **6sD5N** | R1, R3, R4, R5A/B, R6A/B, R7, R8A, R8B parcial | **7.4** | Orchestrator cirúrgico (+33 LOC!), schema com superRefine, runtime imutável, pipeline-trace component, git-diff-handler separado | Builder sequencial (sem edição real de fields), UI de trace básica | Baixo |
| **dWvt6** | R1, R3, R4, R5A/B, R6A/B, R7, R8A, R8B parcial | **7.2** | Variable-resolver dedicado, runtime com onStep callback, profile selection integrada no task-screen, builder mais rico, pipeline-trace e profile-selector como components | Maior footprint (20 files), set_variable sem validação XOR no Zod, task-screen com mais mudanças | Médio |

---

## 3. Melhor Branch Individual

### 🏆 `claude/pi-dag-complex-feature-6sD5N`

**Por que vence:**

1. **Orchestrator com menor impacto** — apenas +33 linhas adicionadas ao orchestrator existente. Nenhuma outra branch se aproxima. Este é o fator decisivo porque o orchestrator é o ponto de maior risco arquitetural do projeto. A branch preserva o fluxo original integralmente com um guard clause mínimo.

2. **Schema com superRefine** — valida que `entryStepId` referencia um step real e que `set_variable` tem `value` ou `valueExpression`. Nenhuma outra branch faz validação de integridade referencial no nível do Zod schema.

3. **Runtime genuinamente imutável** — todos os state transitions usam spread operators. Não há `as` cast para burlar `readonly`. Contraste com tocNK que faz `(state.trace as StepExecutionRecord[]).push(...)`.

4. **git_diff em arquivo próprio** — `git-diff-handler.ts` (50 LOC), isolado e testável. Chama `execGit(['diff', 'HEAD'], worktreePath)` com fallback limpo.

5. **`buildResult()` usa git real** — verifica `git status --porcelain` para determinar se houve mudanças e classifica como `success`/`partial`/`failure` com base no estado real do worktree.

6. **TSDoc completo em todas as exportações** — com `@param`, `@returns`, `@throws`, `@example`.

7. **Zero `any`, zero `console.log`, zero mutação** confirmados por análise manual do diff completo.

### O que ainda falta na 6sD5N

- **Nenhum teste** (R9 inteiro ausente) — zero unitários, zero integração.
- **Builder sequencial** — adiciona steps com defaults mas não permite editar campos individualmente in-place. O builder de dWvt6 é significativamente mais completo.
- **Sem variable-resolver dedicado** — a lógica de `resolveTemplate` vive dentro do schema file. dWvt6 tem módulo separado e testável (131 LOC de funções puras).
- **pipeline-trace.tsx é básico** (71 LOC) — funcional mas sem UI de expandir/colapsar detalhes.
- **Dead branch no orchestrator** — `success ? 'success' : 'success'` (ternário em que ambos os ramos retornam o mesmo valor). Bug cosmético, trivial de corrigir.

---

## 4. Melhor Combinação entre Branches

**A combinação supera a melhor branch isolada? Sim, marginalmente.**

A base ideal é **6sD5N inteira** com 5 componentes cirúrgicos vindos de **dWvt6**:

### Matriz por workstream

| Workstream | Vencedora | Justificativa técnica |
|---|---|---|
| **Schema (R1)** | **6sD5N** | `superRefine` para integridade referencial de entryStepId e set_variable. 351 LOC é denso mas completo. Nenhuma outra branch valida referências cruzadas no schema. |
| **Catálogo (R2/R4)** | **6sD5N** | Empate técnico com dWvt6. Ambas: global + project, Zod on read, parallel loading, CRUD completo, imutabilidade. 6sD5N por menor acoplamento e consistência com o resto da base. |
| **Runtime (R3)** | **dWvt6** | Runtime 100% imutável (spread em tudo), `onStep` callback para UI em tempo real, END_SENTINEL limpo, `applyStepResult`/`applyFailure` como funções puras. 6sD5N é quase igual mas dWvt6 tem o `onStep` hook que torna a UI de execução observável em tempo real. |
| **Handlers (R5A/R5B)** | **6sD5N** | git-diff-handler.ts isolado (50 LOC). `ai-handlers.ts` chama `runWorker()` real. Todos os 7 handlers presentes e implementados. dWvt6 é equivalente mas 6sD5N tem o handler de git isolado. |
| **Orchestrator (R7)** | **6sD5N** | +33 linhas. A integração mais cirúrgica entre todas as branches. Nenhuma outra branch chega perto. tocNK e wXTUC reescrevem 100–190 linhas. |
| **Resultado expandido (R8A)** | **6sD5N ≈ wXTUC** | Ambas expandem `worker-result.schema.ts` com `pipelineTrace` e `failureReason`. Empate técnico. |
| **Observabilidade (R8B)** | **dWvt6** | `pipeline-trace.tsx` + `onStep` callback no runtime = trace em tempo real. 6sD5N tem trace component mas sem callback de progresso. |
| **Seleção de perfil (R6A)** | **dWvt6** | Profile selection integrada no `task-screen.tsx` (fluxo natural: task → perfil → executar), não como tela separada. Mais coerente com o fluxo existente da app. |
| **Builder visual (R6B)** | **dWvt6** | `TextInput` para campos, `SelectInput` para tipos, wizard multi-fase com edição real de campos. 6sD5N e tocNK só adicionam steps com defaults e não permitem edição. |
| **Variable resolver** | **dWvt6** | `variable-resolver.ts` (131 LOC) — módulo puro, isolado, facilmente testável com funções sem side-effects. 6sD5N embutiu resolveTemplate no schema file. |
| **Testes (R9)** | **Nenhuma** | Zero testes em todas as branches. |

### Composição recomendada

**Base: 6sD5N inteira** (schema, catálogo, handlers, orchestrator, resultado expandido) + componentes de dWvt6:

1. `src/pipeline/variable-resolver.ts` (131 LOC) — substituir resolveTemplate inline do schema
2. `src/pipeline/worker-pipeline-runtime.ts` — usar a versão dWvt6 pelo `onStep` callback
3. `src/screens/profile-builder-screen.tsx` — usar dWvt6 (wizard com edição real de campos)
4. `src/components/profile-selector.tsx` — integrar no task-screen como dWvt6 faz
5. `src/components/pipeline-trace.tsx` — usar dWvt6 para observabilidade em tempo real

---

## 5. Plano de Integração Recomendado

### Estratégia: Cherry-pick seletivo de 6sD5N como base, seguido de port manual de módulos de dWvt6

### Ordem de integração

| Passo | Ação | Origem | Risco |
|---|---|---|---|
| 1 | Criar branch de integração a partir de `main` e aplicar diff completo de 6sD5N | 6sD5N | Baixo — typecheck limpo |
| 2 | Corrigir dead-branch bug no orchestrator (`'success' : 'success'` → lógica correta) | Manual | Trivial |
| 3 | Remover `plan.md` do commit (artefato de planejamento) | Manual | Trivial |
| 4 | Substituir `resolveTemplate` inline por `variable-resolver.ts` de dWvt6 | dWvt6 | Baixo — adaptar imports |
| 5 | Substituir runtime por versão dWvt6 (com `onStep` callback) | dWvt6 | Médio — interface do handler pode divergir |
| 6 | Substituir profile-builder-screen por versão dWvt6 | dWvt6 | Baixo — componente isolado |
| 7 | Integrar `profile-selector.tsx` no task-screen como dWvt6 faz | dWvt6 | Médio — precisa adaptar app.tsx flow |
| 8 | Escrever testes unitários (schema, runtime, variable-resolver, handlers) | Manual | Necessário — R9 ausente em 100% das branches |
| 9 | Validar fluxo completo: com perfil e sem perfil | Manual | Obrigatório antes de merge |

### Conflitos prováveis

- **Runtime ↔ Handlers**: Se trocar runtime de 6sD5N por dWvt6, a interface `StepHandler` pode divergir. 6sD5N usa `StepHandlerResult` com `action: 'next'|'fail'`; dWvt6 usa `nextStepId`/`failureMessage`. Requer adaptação dos handlers para a interface dWvt6 ou vice-versa.
- **App.tsx flow**: 6sD5N usa `profile-select` como tela separada; dWvt6 integra no task-screen. Não são compatíveis — escolher um modelo.
- **Schema de state**: 6sD5N define `WorkerPipelineState` dentro de `worker-profile.schema.ts`; dWvt6 usa `worker-pipeline-state.schema.ts` separado. Precisa decisão de layout de arquivo.

### Partes que NÃO devem ser aproveitadas

| Componente | Branch | Motivo |
|---|---|---|
| `step-handlers.ts` (arquivo único) | tocNK | Arquivo monolítico, 273 LOC. 6sD5N e dWvt6 já modularizaram em diretório. |
| State com `readonly` cast-away | tocNK | Muta estado via `as` casts contra anotações readonly. Viola imutabilidade declarada. |
| Builder stub (step-edit vazio) | wXTUC | Tela existe mas não permite editar campos de steps — promete UI que não entrega. |
| Builder route não conectada | wXTUC | `ProfileBuilderScreen` não é alcançável da app.tsx — código morto funcional. |
| `plan.md` no commit | g7lZ0, 6sD5N | Artefato de planejamento, não pertence ao repositório. |
| `package-lock.json` diffs | tocNK, 6sD5N, dWvt6 | Remoção de linhas no lock file — irrelevante e possivelmente destrutivo. |

---

## 6. Riscos e Lacunas

### Regressões possíveis

- **Nenhuma branch alterou `dag-executor.ts`** — ✅ consistente com o roadmap (DAG intacto como scheduler de alto nível).
- O orchestrator de tocNK e wXTUC tem diffs maiores (~130–190 LOC) — risco maior de regressão no fluxo sem perfil. O orchestrator de 6sD5N (+33 LOC) minimiza esse risco.
- **`rootPath: process.cwd()`** é injetado em todas as branches — correto para CLI, mas dificulta testes unitários por não ser injetável no nível da config.

### Testes faltantes (R9 ausente em 100% das branches)

| Área | Testes necessários |
|---|---|
| Schema | Validação Zod, superRefine, discriminated unions, referências cruzadas |
| Runtime | Cursor loop, maxSteps, __end__, fail semantics, error propagation |
| Variable resolver | Template interpolation, expression evaluation, arithmetic, edge cases |
| Step handlers | Cada um dos 7 handlers, incluindo git_diff com mock |
| Catalog service | CRUD, merge precedence local > global, Zod validation on read, ENOENT |
| Fluxo E2E | Run com perfil, run sem perfil, perfil não encontrado, maxSteps excedido |

### Dúvidas arquiteturais pendentes

1. **Model overrides do perfil**: `workerModel` e `langchainModel` são definidos no schema do perfil mas **nenhuma branch usa esses campos nos handlers** — todas usam `config.selectedAgents.*`. Precisa decisão: o perfil deve poder sobrescrever o modelo ou esses campos devem ser removidos do schema?

2. **Erro silencioso em `langchain_prompt`**: tocNK e 6sD5N continuam a pipeline após falha do LLM (escrevem em `$error` e prosseguem). Isso permite que um `condition` posterior verifique o erro — mas o comportamento default deveria ser documentado e explícito.

3. **Semântica de `diff`**: Todas as branches usam `git diff HEAD` — mas o roadmap diz "diff do worker atual no momento da coleta". Se o worker já fez `git add`, `diff HEAD` mostrará o staged + unstaged. Precisa confirmação se o contrato é diff contra HEAD ou apenas unstaged (`git diff` sem HEAD).

### Pontos que exigem confirmação humana

- [ ] Decisão sobre model overrides no perfil vs. config global
- [ ] Aprovação do fluxo UI: tela separada (6sD5N) vs. integrada no task-screen (dWvt6)
- [ ] Prioridade de testes antes de merge
- [ ] Aprovação da combinação 6sD5N + dWvt6 vs. usar 6sD5N pura
- [ ] Semântica de `git diff HEAD` vs. `git diff`

---

## 7. Recomendação Final

**Recomendação objetiva:** Usar **6sD5N como base** e portar `variable-resolver.ts`, o builder visual e o `onStep` callback de **dWvt6** — combinação que cobre mais workstreams com menor risco arquitetural.

**Alternativa conservadora:** Mergear **6sD5N pura** sem combinar branches. Aceitar builder limitado e resolver variable-resolver/observabilidade em PRs subsequentes. Menor risco, entrega mais rápida, lacunas resolvidas incrementalmente.

**Alternativa agressiva:** Usar **dWvt6 como base** (maior cobertura de UI e observabilidade) e portar o orchestrator de 6sD5N (+33 LOC) e o schema com superRefine. Maior poder imediato, mas maior risco de conflitos e maior footprint de revisão (20 arquivos).

---

## Anexo: Validação Técnica

Todas as 4 branches de código passam `npm run typecheck` (`tsc --noEmit`) contra a base `main` quando aplicadas de forma isolada. Nenhuma branch altera `dag-executor.ts`, `planner.pipeline.ts` ou `retry-handler.ts` — o scheduler do DAG permanece intocado em todas as implementações, conforme exigido pelo roadmap.
