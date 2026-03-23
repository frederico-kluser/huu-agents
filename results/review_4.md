# Review 4 — Avaliação das branches `claude/*` (worker pipeline profiles)

## 1. Premissas

- **Branch base assumida:** `main` (equivalente à `branch-4`; mesmo `merge-base`/`HEAD`: `876761f...`).
- **Branches avaliadas:**  
  `claude/implement-pi-dag-feature-g7lZ0`  
  `claude/implement-pi-dag-feature-tocNK`  
  `claude/implement-pi-dag-feature-wXTUC`  
  `claude/pi-dag-complex-feature-6sD5N`  
  `claude/pi-dag-complex-feature-dWvt6`
- **Limitações:** sem script de testes (`npm test` ausente); validação ficou em `typecheck`/`lint`; análise runtime em modo read-only.

## 2. Scorecard das branches

| Branch | Cobertura roadmap | Nota total | Principais forças | Principais fraquezas | Risco de integração |
|---|---|---:|---|---|---|
| `claude/implement-pi-dag-feature-g7lZ0` | ~0/10 (docs only) | **8/100** | Sem risco técnico imediato | Não implementa feature | Baixo |
| `claude/implement-pi-dag-feature-tocNK` | ~7/10 | **67/100** | Schema forte (refs/vars), DAG preservado | Resultado sem trace expandido, acoplamento frágil em AI handler | Médio |
| `claude/implement-pi-dag-feature-wXTUC` | ~8/10 | **66/100** | Boa separação em handlers + estado runtime | `filesModified/commitHash` inconsistentes no caminho de profile; contratos frouxos | Médio-alto |
| `claude/pi-dag-complex-feature-6sD5N` | ~8.5/10 | **77/100** | Melhor equilíbrio arquitetura + mergeabilidade; perfil por run mais correto | fallback hardcoded de modelo; pontos frágeis no contrato `runWorker` | Médio |
| `claude/pi-dag-complex-feature-dWvt6` | ~9/10 | **73/100** | Melhor runtime/observabilidade/result trace | Lint com erros; gaps de contrato de schema/handlers | Alto |

## 3. Melhor branch individual

- **Melhor branch:** `claude/pi-dag-complex-feature-6sD5N`
- **Por que venceu:** melhor balanço entre aderência ao roadmap V1, correção arquitetural (DAG como scheduler) e risco de integração.
- **O que ainda falta:** corrigir routing de modelo (sem fallback hardcoded), reforçar contrato `pi_agent`↔`runWorker`, e adicionar testes do runtime.

## 4. Melhor combinação entre branches

- **A combinação supera a melhor branch isolada?** Sim, via composição por workstream.

| Workstream | Branch vencedora |
|---|---|
| schema | `6sD5N` |
| catálogo | `dWvt6` |
| runtime | `dWvt6` |
| handlers | `dWvt6` (controle) + ajustes manuais no AI wiring |
| orchestrator | `6sD5N` |
| resultado | `dWvt6` |
| observabilidade | `dWvt6` |
| seleção de perfil | `6sD5N` |
| builder visual | `dWvt6` |
| testes | nenhuma branch está suficiente |

## 5. Plano de integração recomendado

- **Estratégia:** usar `6sD5N` como base e reaplicar manualmente partes de `dWvt6`.
- **Ordem sugerida:**
  1. Base: `6sD5N` (`73c6a99`).
  2. Reaplicar de `dWvt6`: runtime + resolver + result trace + UI de observabilidade.
  3. Corrigir AI handlers/model routing.
  4. Validar com `typecheck` + `lint` + smoke no-profile/profile.
- **Conflitos prováveis:** `src/app.tsx`, `src/pipeline/orchestrator.ts`, `src/schemas/worker-profile.schema.ts`, `src/services/profile-catalog.ts`, telas de perfil/resultado.
- **Não aproveitar:** docs-only de `g7lZ0`; fallback hardcoded de modelos; trechos de `wXTUC` que zeram `filesModified/commitHash`.

## 6. Riscos e lacunas

- Regressão do modo sem perfil.
- Drift da semântica de sucesso/falha (`__end__`, `fail`, `nextStepId`).
- Inconsistência entre validação de variável (`custom_*`) e aplicação no runtime.
- Falta de testes unitários/integrados para handlers/runtime/orchestrator.

## 7. Recomendação final

- **Recomendação objetiva:** usar `6sD5N` como tronco e incorporar seletivamente runtime/observabilidade de `dWvt6` com hardening obrigatório antes do merge.
- **Alternativa conservadora:** mergear só `6sD5N` e postergar observabilidade para PR seguinte.
- **Alternativa agressiva:** partir de `dWvt6` e corrigir lint/contratos/perfil-por-run em uma única rodada de estabilização.
