# Review 3 — Avaliação comparativa das branches `claude/*`

## 1. Premissas

- **branch base assumida:** `main`
- **por quê:** é a única base plausível disponível localmente entre `main`, `master`, `dev` e a branch atual, e os `claude/*` inspecionados apareceram como branches essencialmente `ahead-only` sobre `main`.
- **branches avaliadas:**
  - `claude/implement-pi-dag-feature-g7lZ0`
  - `claude/implement-pi-dag-feature-tocNK`
  - `claude/implement-pi-dag-feature-wXTUC`
  - `claude/pi-dag-complex-feature-6sD5N`
  - `claude/pi-dag-complex-feature-dWvt6`
- **limitações encontradas:**
  - sem `fetch`, então a análise ficou restrita a branches locais;
  - nenhuma branch adiciona testes;
  - a validação read-only foi feita com `npm ci && npm run typecheck && npm run lint` em snapshots isolados, não no repositório vivo.

## 2. Scorecard das branches

| branch | cobertura do roadmap | nota total | principais forças | principais fraquezas | risco de integração |
| --- | --- | ---: | --- | --- | --- |
| `claude/implement-pi-dag-feature-g7lZ0` | nenhuma implementação real | **5** | só registra planejamento | não entrega schema, runtime, UI, seleção, catálogo ou testes | **baixo**, mas sem valor para a feature |
| `claude/implement-pi-dag-feature-tocNK` | schema, catálogo, runtime, handlers, orchestrator, seleção, builder | **57** | melhor validação estrutural de referências; `validateProfileReferences`; passa `typecheck`/`lint` | runtime e builder monolíticos/mutáveis; catálogo silenciosamente “zera” em erro; não expande `WorkerResult`/observabilidade | **médio** |
| `claude/implement-pi-dag-feature-wXTUC` | schema, catálogo, runtime, handlers, orchestrator, resultado, seleção, builder | **64** | melhor decomposição de arquivos; `WorkerResult` expandido com `failureReason`; catálogo com erro explícito; falha explicitamente se profile não existe; passa `typecheck`/`lint` | persiste `activeProfileId` em `Config`; `langchain_prompt` mexe errado no model id; builder de `step-edit` está incompleto | **médio** |
| `claude/pi-dag-complex-feature-6sD5N` | schema, catálogo, runtime, handlers, orchestrator, resultado, seleção, builder; observabilidade parcial | **67** | melhor núcleo arquitetural por run; `activeProfile` efêmero no fluxo; handlers respeitam `workerModel`/`langchainModel` do profile; passa `typecheck`/`lint` | ainda deixa `activeProfileId` no schema de config; usa semântica `partial`; observabilidade final não ficou integrada; `pi_agent` desvia do prompt canônico do worker | **médio** |
| `claude/pi-dag-complex-feature-dWvt6` | cobertura mais ampla: schema, catálogo, runtime, resultado, observabilidade, seleção, builder | **62** | melhor UI em Ink; melhor `PipelineTrace`; melhor modelagem de estado/variáveis | falha no lint com **6 erros**; fallback silencioso para worker legado se profile some; handlers ignoram override de modelo do profile; persiste `activeProfileId` | **alto** |

**Validação objetiva**

- `tocNK`, `wXTUC` e `6sD5N` passaram `typecheck` e `lint` com warnings, sem erros bloqueantes.
- `dWvt6` falhou no lint por erros novos em `control-handlers.ts` e `variable-resolver.ts`.
- Nenhuma branch trouxe testes.

## 3. Melhor branch individual

- **nome da branch:** `claude/pi-dag-complex-feature-6sD5N`
- **por que ela foi a melhor:** é a branch que mais acerta o contrato central da feature onde isso realmente importa: mantém o DAG como scheduler de alto nível, move a mudança para dentro da execução do worker, trata seleção de profile de forma mais próxima de “por run” no fluxo de app/orchestrator, e seus handlers usam os modelos do próprio profile em vez de ignorá-los.
- **o que ainda falta nela:**
  - corrigir a semântica de `partial`;
  - integrar observabilidade real no resultado final;
  - remover o resquício de `activeProfileId` da configuração persistida;
  - voltar o `pi_agent` ao prompt canônico do worker;
  - adicionar testes mínimos de runtime, schema e UI.

## 4. Melhor combinação entre branches

- **a combinação supera ou não a melhor branch isolada:** **sim, supera**, mas não por cherry-pick bruto de branches inteiras. Ela só supera `6sD5N` como **reaplicação manual por workstream**, porque os hot spots se sobrepõem demais e os contratos divergem.

| workstream | branch vencedora | justificativa técnica |
| --- | --- | --- |
| schema | `claude/implement-pi-dag-feature-tocNK` | melhor validação de referências de steps e edges; detecta inconsistências cedo |
| catálogo | `claude/implement-pi-dag-feature-wXTUC` | melhor tratamento explícito de erro e precedência local > global |
| runtime | `claude/pi-dag-complex-feature-6sD5N` | base mais segura para execução intra-worker, loop guard e seleção por run |
| handlers | `claude/pi-dag-complex-feature-6sD5N` | respeita `workerModel` e `langchainModel` do profile; `dWvt6` ignora isso |
| orchestrator | `claude/pi-dag-complex-feature-6sD5N` | melhor separação entre modo legado e modo com profile |
| resultado | `claude/implement-pi-dag-feature-wXTUC` | `WorkerResult` com `failureReason` está mais limpo que `pipelineFailureReason` |
| observabilidade | `claude/pi-dag-complex-feature-dWvt6` | `PipelineTrace` e exibição final são os melhores artefatos de visibilidade |
| seleção de perfil | `claude/pi-dag-complex-feature-6sD5N` | semanticamente vence por ficar mais próxima de seleção efêmera por execução |
| builder visual | `claude/pi-dag-complex-feature-dWvt6` | implementação mais Ink-native e observável, apesar de incompleta |
| testes | **nenhuma** | nenhuma branch entrega cobertura minimamente defensável |

**Leitura prática da combinação ideal**

- basear o core em `6sD5N`;
- puxar a validação de schema de `tocNK`;
- puxar contrato de catálogo e resultado de `wXTUC`;
- puxar apenas os componentes de UI/trace de `dWvt6`, sem trazer o fallback silencioso nem o uso errado de modelos.

## 5. Plano de integração recomendado

- **estratégia sugerida:** **não** fazer cherry-pick de commits inteiros. Criar uma branch de integração a partir de `claude/pi-dag-complex-feature-6sD5N` e reaplicar manualmente workstream por workstream.

- **ordem de integração:**
  1. usar `6sD5N` como base do core;
  2. portar para ela a validação de referências de `tocNK` em `worker-profile.schema.ts` e no save do catálogo;
  3. portar de `wXTUC` o contrato de catálogo com erro explícito e o formato de `WorkerResult` com `failureReason`;
  4. portar de `dWvt6` apenas `PipelineTrace` e a parte boa do builder/UI, adaptando ao fluxo efêmero de `6sD5N`;
  5. só então corrigir semântica de falha/sucesso e escrever testes.

- **conflitos prováveis:**
  - `src/app.tsx`
  - `src/schemas/config.schema.ts`
  - `src/pipeline/orchestrator.ts`
  - `src/pipeline/worker-pipeline-runtime.ts`
  - `src/schemas/worker-profile.schema.ts`
  - `src/schemas/worker-result.schema.ts`
  - `src/services/profile-catalog.ts`
  - `src/screens/profile-builder-screen.tsx`
  - `src/screens/result-screen.tsx`

- **partes a reaplicar manualmente:**
  - validação de referências de `tocNK`;
  - tratamento explícito de erro do catálogo em `wXTUC`;
  - `PipelineTrace` e padrões Ink de `dWvt6`.

- **partes que não devem ser aproveitadas:**
  - `activeProfileId` persistido em `Config`;
  - fallback silencioso de `dWvt6` para worker legado;
  - `pipelineFailureReason` de `dWvt6`;
  - semântica `partial` de `6sD5N`;
  - `langchain_prompt` de `wXTUC` que desmonta o model id;
  - implementações de `pi_agent` enquanto continuarem desviando do prompt canônico do worker.

## 6. Riscos e lacunas

- **regressões possíveis:**
  - profile “grudar” entre runs;
  - runtime entrar em estado inválido por `step target` quebrado;
  - worker usar modelo errado;
  - UI parecer boa mas não refletir o estado real do runtime.

- **testes faltantes:**
  - seleção “nenhum profile”;
  - profile inexistente;
  - loop guard por `maxStepExecutions`;
  - `fail` explícito versus erro técnico;
  - `git_diff` preenchendo `diff`;
  - override de `workerModel`/`langchainModel`;
  - catálogo inválido global/local.

- **dúvidas arquiteturais:**
  - se `WorkerResult` deve continuar suportando `partial`;
  - se o profile selecionado pode ser persistido ou deve ser estritamente efêmero;
  - se `pi_agent` deve sempre reutilizar o prompt builder existente do worker.

- **pontos que exigem confirmação humana:**
  - decisão final sobre persistência do último profile usado;
  - escolha de naming final entre `failureReason` e qualquer variante;
  - se o builder V1 precisa editar steps existentes já nesta entrega ou só criar/remover/reordenar.

## 7. Recomendação final

- **recomendação objetiva em uma frase:** usar `claude/pi-dag-complex-feature-6sD5N` como base real de implementação, mas **não** fazer merge cru; integrar manualmente nela a validação de `tocNK`, o contrato de catálogo/resultado de `wXTUC` e a UI/trace de `dWvt6`.

- **alternativa conservadora:** adotar só `6sD5N` como branch de referência e corrigir nela, antes de qualquer merge, `partial`, prompt do `pi_agent`, resquício de `activeProfileId` e falta de testes.

- **alternativa agressiva:** montar uma branch de integração manual `6sD5N + tocNK(schema) + wXTUC(catálogo/resultado) + dWvt6(builder/trace)` e só liberar depois de adicionar testes de runtime, catálogo e no-profile mode.
