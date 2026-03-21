/**
 * System prompt generator for the Planner (Architect) agent.
 * Produces DAG decomposition prompts adapted per LLM provider.
 * Follows sandwich method: critical instructions at top and bottom.
 * All content is static for maximum prompt caching hit rate.
 *
 * @module
 */

/**
 * Quality gates embedded in every node.task to guide Worker agents.
 * Extracted as constant for reuse across prompts and tests.
 */
export const QUALITY_GATES =
  'Max 500 LOC/arquivo, 50 LOC/função, JSDoc @throws/@example em exports, ' +
  'complexidade ciclomática < 10, TypeScript strict, proibido any. ' +
  'Documente o PORQUÊ, nunca o QUÊ.';

// --- Few-shot examples (one per PlannerAction) ---

const DECOMPOSE_EXAMPLE = {
  action: 'decompose',
  nodes: [
    {
      id: '1',
      task: `Criar schema UserInput em src/schemas/user.schema.ts. ${QUALITY_GATES}`,
      dependencies: [],
      status: 'pending',
      files: ['src/schemas/user.schema.ts'],
    },
    {
      id: '2',
      task: `Integrar validação no handler POST /users em src/routes/users.ts. ${QUALITY_GATES}`,
      dependencies: ['1'],
      status: 'pending',
      files: ['src/routes/users.ts'],
    },
  ],
  metadata: {
    macroTask: 'Adicionar validação Zod no endpoint /users',
    totalNodes: 2,
    parallelizable: 0,
  },
};

const EXPLORE_EXAMPLE = {
  action: 'request_exploration',
  nodes: [],
  metadata: {
    macroTask: 'Refatorar módulo de autenticação',
    totalNodes: 0,
    parallelizable: 0,
  },
};

const CLARIFY_EXAMPLE = {
  action: 'clarify',
  nodes: [],
  metadata: {
    macroTask: 'Melhorar performance',
    totalNodes: 0,
    parallelizable: 0,
  },
};

/**
 * Wraps content in a labeled section using XML tags or Markdown headers.
 *
 * @param xmlTag - Tag name for XML format (lowercase, semantic)
 * @param mdHeader - Header text for Markdown format (uppercase Portuguese)
 * @param content - Section body text
 * @param useXml - true for Anthropic (XML), false for OpenAI/others (Markdown)
 * @returns Formatted section string
 */
function section(
  xmlTag: string,
  mdHeader: string,
  content: string,
  useXml: boolean,
): string {
  return useXml
    ? `<${xmlTag}>\n${content}\n</${xmlTag}>`
    : `## ${mdHeader}\n${content}`;
}

/**
 * Generates the system prompt for the Planner (Architect) agent.
 * Adapts formatting per provider: XML tags for Anthropic, Markdown headers for others.
 * Output stays under 300 words of instruction to avoid context rot.
 *
 * @param modelProvider - LLM provider identifier ('anthropic', 'openai', 'deepseek', etc.)
 * @returns Formatted system prompt string
 * @throws {Error} If modelProvider is empty
 * @example
 * const prompt = generatePlannerPrompt('anthropic');
 * // Returns XML-tagged prompt: <role>...</role> <actions>...</actions> ...
 *
 * const promptMd = generatePlannerPrompt('openai');
 * // Returns Markdown prompt: ## PAPEL ... ## CATÁLOGO DE AÇÕES ...
 */
export function generatePlannerPrompt(modelProvider: string): string {
  if (!modelProvider.trim()) {
    throw new Error('modelProvider must not be empty');
  }

  const xml = modelProvider.toLowerCase().includes('anthropic');

  // Sandwich: critical constraint in role (top) and reminder (bottom)
  const role = section(
    'role',
    'PAPEL',
    'Você é o Arquiteto de Decomposição. Sua ÚNICA função é converter uma macro-task ' +
      'em um DAG de subtasks atômicas, retornando JSON estruturado.',
    xml,
  );

  const actions = section(
    'actions',
    'CATÁLOGO DE AÇÕES',
    'Catálogo fechado — se não está aqui, não existe:\n' +
      '- decompose: quebrar macro-task em nodes executáveis por agentes isolados\n' +
      '- request_exploration: contexto insuficiente para determinar arquivos — solicitar Explorer\n' +
      '- clarify: requisito ambíguo — pedir esclarecimento ao usuário',
    xml,
  );

  const rules = section(
    'rules',
    'REGRAS INVIOLÁVEIS',
    '1. Cada node: 1 agente, 1 worktree isolado\n' +
      '2. Dependências formam DAG acíclico — NUNCA ciclos\n' +
      '3. Nodes sem dependência mútua contam em metadata.parallelizable\n' +
      '4. node.files lista APENAS paths conhecidos do contexto fornecido\n' +
      '5. NUNCA inventar caminhos — se desconhecidos: action = "request_exploration"\n' +
      '6. Se ambíguo: action = "clarify"\n' +
      '7. node.status sempre "pending"\n' +
      `8. Cada node.task INCLUI quality gates: "${QUALITY_GATES}"`,
    xml,
  );

  const schema = section(
    'schema',
    'SCHEMA DE OUTPUT',
    '{ action: "decompose"|"request_exploration"|"clarify", ' +
      'nodes: [{ id, task, dependencies: string[], status: "pending", files: string[] }], ' +
      'metadata: { macroTask, totalNodes, parallelizable } }',
    xml,
  );

  const examples = section(
    'examples',
    'EXEMPLOS',
    `Input: "Adicionar validação Zod no endpoint /users"\n` +
      `Output: ${JSON.stringify(DECOMPOSE_EXAMPLE)}\n\n` +
      `Input: "Refatorar módulo de autenticação"\n` +
      `Output: ${JSON.stringify(EXPLORE_EXAMPLE)}\n\n` +
      `Input: "Melhorar performance"\n` +
      `Output: ${JSON.stringify(CLARIFY_EXAMPLE)}`,
    xml,
  );

  // Sandwich bottom: repeat critical constraints
  const reminder = section(
    'reminder',
    'LEMBRETE',
    'Retorne APENAS JSON válido conforme o schema. Cada node = 1 agente, 1 worktree. ' +
      'NUNCA invente arquivos. Se incerto sobre arquivos: request_exploration. ' +
      'Se incerto sobre requisito: clarify.',
    xml,
  );

  return [role, actions, rules, schema, examples, reminder].join('\n\n');
}
