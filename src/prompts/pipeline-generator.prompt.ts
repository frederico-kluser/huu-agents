/**
 * Prompt generator for AI-powered pipeline creation.
 * Two-phase approach: (1) generate pipeline steps, (2) generate metadata.
 * Uses few-shot learning with concrete examples and story-breaking structure
 * (setup → confrontation → resolution) resolved in a single prompt.
 *
 * Provider-aware formatting: XML for Anthropic, Markdown for others.
 * Designed for DeepSeek default but compatible with all LangChain-supported models.
 *
 * @module
 */

// ── Few-shot examples ─────────────────────────────────────────────────

const EXAMPLE_TDD_INPUT = 'Quero um pipeline que escreva testes, corrija o código até passar, e repita até 3 vezes';

const EXAMPLE_TDD_OUTPUT = JSON.stringify({
  entryStepId: 'init-tries',
  maxStepExecutions: 25,
  initialVariables: { custom_tries: 0 },
  steps: [
    { id: 'init-tries', type: 'set_variable', target: 'custom_tries', valueExpression: '$custom_tries + 1', next: 'write-tests' },
    { id: 'write-tests', type: 'pi_agent', taskTemplate: 'Write comprehensive tests for: $task', next: 'run-fix' },
    { id: 'run-fix', type: 'pi_agent', taskTemplate: 'Fix code to pass all tests for: $task', next: 'get-diff' },
    { id: 'get-diff', type: 'git_diff', target: 'diff', next: 'check-tries' },
    { id: 'check-tries', type: 'condition', expression: '$custom_tries >= 3', whenTrue: 'done', whenFalse: 'init-tries' },
    { id: 'done', type: 'goto', target: '__end__' },
  ],
});

const EXAMPLE_REVIEW_INPUT = 'Pipeline que gera código, faz review com LLM, e aplica correções';

const EXAMPLE_REVIEW_OUTPUT = JSON.stringify({
  entryStepId: 'generate',
  maxStepExecutions: 15,
  initialVariables: {},
  steps: [
    { id: 'generate', type: 'pi_agent', taskTemplate: 'Implement: $task', next: 'capture-diff' },
    { id: 'capture-diff', type: 'git_diff', target: 'diff', next: 'review' },
    { id: 'review', type: 'langchain_prompt', inputTemplate: 'Review this diff for bugs, security issues, and code quality.\nRespond with ONLY a list of issues or "LGTM" if no issues found.\n\nDiff:\n$diff', outputTarget: 'custom_review', next: 'check-review' },
    { id: 'check-review', type: 'condition', expression: '$custom_review == LGTM', whenTrue: 'finish', whenFalse: 'apply-fixes' },
    { id: 'apply-fixes', type: 'pi_agent', taskTemplate: 'Apply these review fixes to the code:\n$custom_review\n\nOriginal task: $task', next: 'finish' },
    { id: 'finish', type: 'goto', target: '__end__' },
  ],
});

const EXAMPLE_SIMPLE_INPUT = 'Pipeline simples que implementa e documenta';

const EXAMPLE_SIMPLE_OUTPUT = JSON.stringify({
  entryStepId: 'implement',
  maxStepExecutions: 10,
  initialVariables: {},
  steps: [
    { id: 'implement', type: 'pi_agent', taskTemplate: 'Implement: $task', next: 'document' },
    { id: 'document', type: 'pi_agent', taskTemplate: 'Add JSDoc documentation and update README for changes made in: $task', next: 'done' },
    { id: 'done', type: 'goto', target: '__end__' },
  ],
});

// ── Static content blocks ──────────────────────────────────────────────

const ROLE_CONTENT =
  'Você é um especialista em criação de Worker Pipeline Profiles. ' +
  'Sua ÚNICA função é converter uma descrição em linguagem natural em um pipeline JSON válido. ' +
  'Retorne APENAS JSON puro, sem markdown, sem explicações.';

const STEP_TYPES_CONTENT =
  '7 tipos de step (catálogo fechado — se não está aqui, não existe):\n\n' +
  '1. pi_agent — Executa agente IA no worktree (criar/editar arquivos, rodar comandos)\n' +
  '   Campos: { id, type: "pi_agent", taskTemplate: "string com $vars", next: "stepId|__end__" }\n\n' +
  '2. langchain_prompt — Gera texto via LLM (análise, review, decisão)\n' +
  '   Campos: { id, type: "langchain_prompt", inputTemplate: "prompt com $vars", outputTarget: "variável destino", next: "stepId|__end__" }\n' +
  '   outputTarget: "task"|"diff"|"error" (reservadas) ou "custom_*" (custom)\n\n' +
  '3. condition — Bifurca execução baseado em comparação\n' +
  '   Campos: { id, type: "condition", expression: "$var operador valor", whenTrue: "stepId|__end__", whenFalse: "stepId|__end__" }\n' +
  '   Operadores: ==, !=, >=, <=, >, <\n\n' +
  '4. goto — Salto incondicional\n' +
  '   Campos: { id, type: "goto", target: "stepId|__end__" }\n\n' +
  '5. set_variable — Define/atualiza variável\n' +
  '   Campos: { id, type: "set_variable", target: "variável", value: literal, next: "stepId|__end__" }\n' +
  '   OU: { id, type: "set_variable", target: "variável", valueExpression: "$var + 1", next: "stepId|__end__" }\n' +
  '   REGRA: value OU valueExpression, NUNCA ambos\n\n' +
  '6. git_diff — Captura diff do worktree em variável\n' +
  '   Campos: { id, type: "git_diff", target: "variável destino", next: "stepId|__end__" }\n\n' +
  '7. fail — Encerra pipeline com erro de negócio\n' +
  '   Campos: { id, type: "fail", messageTemplate: "mensagem com $vars" }';

const VARIABLES_CONTENT =
  'Reservadas (preenchidas pelo runtime):\n' +
  '  $task — descrição da subtask atribuída ao worker\n' +
  '  $diff — diff do worktree (preenchida por git_diff)\n' +
  '  $error — último erro de execução\n\n' +
  'Custom (definidas pelo perfil):\n' +
  '  DEVEM começar com "custom_" (ex: custom_tries, custom_review)\n' +
  '  Criadas via initialVariables, set_variable, ou langchain_prompt outputTarget\n\n' +
  '__end__ — target especial que encerra pipeline com sucesso';

const RULES_CONTENT =
  '1. Retorne APENAS JSON válido conforme o schema\n' +
  '2. entryStepId DEVE ser o ID do primeiro step a executar\n' +
  '3. Todos os targets (next, whenTrue, whenFalse, target) devem apontar para step IDs existentes ou "__end__"\n' +
  '4. IDs de step devem ser únicos, descritivos, em kebab-case\n' +
  '5. Loops DEVEM ter condição de saída (condition com whenTrue → __end__ ou goto → __end__)\n' +
  '6. maxStepExecutions deve ser suficiente para o número de iterações esperadas\n' +
  '7. Variáveis custom em initialVariables DEVEM começar com "custom_"\n' +
  '8. set_variable: use value OU valueExpression, NUNCA ambos\n' +
  '9. Use $task em templates pi_agent para contextualizar a tarefa do worker\n' +
  '10. Prefira pipelines simples — NÃO adicione steps desnecessários';

const SCHEMA_CONTENT =
  '{\n' +
  '  "entryStepId": "string (ID do primeiro step)",\n' +
  '  "maxStepExecutions": "number (1-100, loop guard)",\n' +
  '  "initialVariables": "{ custom_*: string|number } (seed de variáveis)",\n' +
  '  "steps": "WorkerStep[] (array de steps conforme tipos acima)"\n' +
  '}';

const REMINDER_CONTENT =
  'Retorne APENAS JSON puro. Sem markdown. Sem explicações. Sem ```json. ' +
  'Cada loop DEVE ter condição de saída. Use $task nos templates pi_agent. ' +
  'IDs kebab-case descritivos. Prefira simplicidade.';

// ── Prompt builders ────────────────────────────────────────────────────

/** Wraps content in XML or Markdown section depending on provider. */
function section(xmlTag: string, mdHeader: string, content: string, useXml: boolean): string {
  return useXml
    ? `<${xmlTag}>\n${content}\n</${xmlTag}>`
    : `## ${mdHeader}\n${content}`;
}

/** Builds the few-shot examples section content */
function buildExamplesContent(): string {
  return (
    `Entrada: "${EXAMPLE_TDD_INPUT}"\nSaída: ${EXAMPLE_TDD_OUTPUT}\n\n` +
    `Entrada: "${EXAMPLE_REVIEW_INPUT}"\nSaída: ${EXAMPLE_REVIEW_OUTPUT}\n\n` +
    `Entrada: "${EXAMPLE_SIMPLE_INPUT}"\nSaída: ${EXAMPLE_SIMPLE_OUTPUT}`
  );
}

/**
 * Generates the system prompt for pipeline step generation (Call 1).
 * Follows sandwich method: critical constraints at top and bottom.
 *
 * @param modelProvider - LLM provider identifier ('deepseek', 'anthropic', 'openai', etc.)
 * @returns Formatted system prompt string
 * @throws {Error} If modelProvider is empty
 *
 * @example
 * const prompt = generatePipelineStepsPrompt('deepseek');
 */
export function generatePipelineStepsPrompt(modelProvider: string): string {
  if (!modelProvider.trim()) throw new Error('modelProvider must not be empty');

  const xml = modelProvider.toLowerCase().includes('anthropic');
  const s = (tag: string, header: string, content: string) => section(tag, header, content, xml);

  return [
    s('role', 'PAPEL', ROLE_CONTENT),
    s('step_types', 'STEP TYPES DISPONÍVEIS', STEP_TYPES_CONTENT),
    s('variables', 'VARIÁVEIS', VARIABLES_CONTENT),
    s('rules', 'REGRAS INVIOLÁVEIS', RULES_CONTENT),
    s('examples', 'EXEMPLOS', buildExamplesContent()),
    s('schema', 'SCHEMA DE OUTPUT', SCHEMA_CONTENT),
    s('reminder', 'LEMBRETE', REMINDER_CONTENT),
  ].join('\n\n');
}

/**
 * Generates the system prompt for metadata generation (Call 2).
 * Given the generated pipeline JSON, produces id and description.
 *
 * @param modelProvider - LLM provider identifier
 * @returns Formatted system prompt string
 * @throws {Error} If modelProvider is empty
 *
 * @example
 * const prompt = generatePipelineMetadataPrompt('deepseek');
 */
export function generatePipelineMetadataPrompt(modelProvider: string): string {
  if (!modelProvider.trim()) throw new Error('modelProvider must not be empty');

  const xml = modelProvider.toLowerCase().includes('anthropic');
  const s = (tag: string, header: string, content: string) => section(tag, header, content, xml);

  return [
    s('role', 'PAPEL',
      'Você gera metadados para Worker Pipeline Profiles. ' +
      'Retorne APENAS JSON puro com os campos id e description.'),
    s('rules', 'REGRAS',
      '1. id: kebab-case, max 64 chars, descritivo (ex: "test-driven-fixer", "code-review-loop")\n' +
      '2. description: 1-2 frases em português descrevendo o que o pipeline faz\n' +
      '3. Retorne APENAS: { "id": "...", "description": "..." }\n' +
      '4. Sem markdown, sem explicações, sem ```json'),
    s('examples', 'EXEMPLOS',
      'Pipeline com testes + correção iterativa:\n' +
      '{ "id": "test-driven-fixer", "description": "Gera testes, corrige código iterativamente e valida até 3 tentativas." }\n\n' +
      'Pipeline com geração + review:\n' +
      '{ "id": "code-review-loop", "description": "Implementa, faz review via LLM e aplica correções automaticamente." }'),
  ].join('\n\n');
}
