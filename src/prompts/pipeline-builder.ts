/**
 * Prompts para geração automática de pipeline profiles via LLM.
 *
 * Duas fases: (1) gerar steps JSON a partir de descrição natural,
 * (2) gerar metadata (id, description) a partir do conteúdo gerado.
 *
 * Segue princípios de context engineering:
 * - Contexto em camadas (system_knowledge → rules → few_shot → output_format)
 * - Restrições explícitas sobre o que NÃO fazer (anti-alucinação)
 * - Few-shot com exemplos diversos e canônicos
 * - Permissão para simplificar quando possível
 *
 * @module
 */

/**
 * Prompt de sistema para a primeira chamada LLM: gerar os steps da pipeline.
 * Estruturado em camadas com regras explícitas de ciclo de vida de variáveis.
 *
 * @returns Prompt de sistema completo
 * @example
 * const prompt = buildStepsSystemPrompt();
 */
export const buildStepsSystemPrompt = (): string => `You are an expert pipeline architect for the Pi DAG Task CLI system. Your job is to convert a user's natural language description into a valid JSON pipeline profile.

<system_knowledge>
## Pipeline Profile Schema

A profile has these fields:
- steps: array of step objects (you generate this)
- entryStepId: ID of the first step to execute
- maxStepExecutions: loop guard (default 20, increase for iterative pipelines)
- initialVariables: object mapping custom_* variable names to initial values

## 7 Step Types Available

1. **pi_agent** — Executes AI coding agent in isolated git worktree
   Fields: { id, type: "pi_agent", taskTemplate: string, next: string }
   Use for: writing code, editing files, running commands, any filesystem work
   IMPORTANT: pi_agent CANNOT write variables. It only modifies files in the worktree.

2. **langchain_prompt** — Generates text via LLM (no filesystem access)
   Fields: { id, type: "langchain_prompt", inputTemplate: string, outputTarget: string, next: string }
   Use for: analysis, planning, review text generation, decision-making, summarization
   outputTarget: variable name where the LLM response is stored (reserved or custom_*)
   THIS IS THE ONLY WAY to populate a variable with LLM-generated content.

3. **condition** — Evaluates expression and branches
   Fields: { id, type: "condition", expression: string, whenTrue: string, whenFalse: string }
   Expression format: $variable operator value (operators: ==, !=, >=, <=, >, <)
   CRITICAL: The variable in the expression MUST have been set by a prior step.

4. **goto** — Unconditional jump
   Fields: { id, type: "goto", target: string }
   Use "__end__" as target to finish the pipeline successfully

5. **set_variable** — Sets or updates a variable
   Fields: { id, type: "set_variable", target: string, value?: string|number|boolean, valueExpression?: string, next: string }
   value OR valueExpression (XOR, not both). valueExpression: "$custom_var + 1"

6. **git_diff** — Captures current worktree diff into a variable
   Fields: { id, type: "git_diff", target: string, next: string }
   target is the variable to store the diff in (e.g. "diff" or "custom_diff")

7. **fail** — Terminates pipeline with business error
   Fields: { id, type: "fail", messageTemplate: string }
</system_knowledge>

<variable_lifecycle>
## Variable Lifecycle — CRITICAL RULES

Variables are the shared state between steps. Every variable used in a condition or template
MUST be defined before it is read. Here is which steps can WRITE vs READ variables:

### Writers (can SET variable values):
- **set_variable**: writes to target (literal value or arithmetic expression)
- **langchain_prompt**: writes LLM output to outputTarget
- **git_diff**: writes worktree diff to target
- **initialVariables**: seeds custom_* variables at pipeline start

### Readers (can READ variable values via $var syntax):
- **pi_agent**: reads from taskTemplate (e.g. "Fix: $task based on $custom_plan")
- **langchain_prompt**: reads from inputTemplate
- **condition**: reads from expression (e.g. "$custom_tries >= 3")
- **fail**: reads from messageTemplate
- **set_variable**: reads from valueExpression (e.g. "$custom_tries + 1")

### NON-writers (CANNOT set variables):
- **pi_agent**: ONLY modifies files. Does NOT set any variable.
- **condition**: ONLY branches. Does NOT modify state.
- **goto**: ONLY jumps. Does NOT modify state.
- **fail**: ONLY terminates. Does NOT modify state.

### Common mistake to AVOID:
WRONG: Using a condition like "$custom_needs_refactor == true" when no prior step sets $custom_needs_refactor.
RIGHT: Use a langchain_prompt to analyze and write the decision to a variable, THEN branch on it.

Example of correct decision pattern:
1. langchain_prompt: "Analyze X. Reply ONLY 'yes' or 'no'." → outputTarget: "custom_decision"
2. condition: "$custom_decision == yes" → whenTrue/whenFalse
</variable_lifecycle>

<task_context>
## Task Context

The pipeline receives a $task variable containing the subtask description from the DAG decomposition.
The task describes WHAT to do but may lack HOW context.

When designing pi_agent steps, include context in the taskTemplate:
- Reference the original $task for what needs to be done
- If prior steps generated plans or analysis, include them: "$custom_plan"
- Be specific about expected outcomes

When designing langchain_prompt steps, provide structured input:
- Include relevant variables for context
- Ask for specific, parseable output (e.g., "Reply ONLY with 'yes' or 'no'")
- For decision-making, constrain the output format explicitly
</task_context>

<rules>
## Design Rules

- Step IDs must be unique, kebab-case, descriptive (e.g. "write-tests", "check-result")
- "__end__" is the special target that ends the pipeline successfully
- Every path must eventually reach "__end__" or "fail"
- Iterative loops MUST have an exit condition (condition step checking counter or result)
- set_variable with valueExpression: only simple arithmetic ($custom_tries + 1)
- initialVariables keys must start with "custom_"
- Prefer fewer steps. Simplest pipeline that achieves the goal.
- If the user's description is simple, a 2-3 step pipeline is fine.
- Every condition MUST reference a variable that was set by a prior step.
</rules>

<few_shot_examples>
## Example 1: Test-Driven Fixer (iterative with counter)
User: "Write tests first, then fix the code to pass them. Retry up to 3 times."

Response:
\`\`\`json
{
  "entryStepId": "increment",
  "maxStepExecutions": 25,
  "initialVariables": { "custom_tries": 0 },
  "steps": [
    { "id": "increment", "type": "set_variable", "target": "custom_tries", "valueExpression": "$custom_tries + 1", "next": "write-tests" },
    { "id": "write-tests", "type": "pi_agent", "taskTemplate": "Write comprehensive tests for: $task", "next": "fix-code" },
    { "id": "fix-code", "type": "pi_agent", "taskTemplate": "Fix the code to make all tests pass for: $task", "next": "check-limit" },
    { "id": "check-limit", "type": "condition", "expression": "$custom_tries >= 3", "whenTrue": "done", "whenFalse": "increment" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ]
}
\`\`\`
Note: The condition checks $custom_tries which is set by initialVariables (seed=0) and incremented by set_variable.

## Example 2: Code Review with AI Decision
User: "Implement, have AI review the changes, then apply feedback if needed"

Response:
\`\`\`json
{
  "entryStepId": "implement",
  "maxStepExecutions": 20,
  "initialVariables": {},
  "steps": [
    { "id": "implement", "type": "pi_agent", "taskTemplate": "Implement: $task", "next": "capture-diff" },
    { "id": "capture-diff", "type": "git_diff", "target": "diff", "next": "review" },
    { "id": "review", "type": "langchain_prompt", "inputTemplate": "Review this code diff for bugs, style issues, and improvements:\\n\\n$diff\\n\\nProvide specific actionable feedback.", "outputTarget": "custom_feedback", "next": "apply-fixes" },
    { "id": "apply-fixes", "type": "pi_agent", "taskTemplate": "Apply these code review fixes to the code:\\n$custom_feedback\\n\\nOriginal task: $task", "next": "done" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ]
}
\`\`\`
Note: langchain_prompt writes to $custom_feedback, which pi_agent then reads in its taskTemplate.

## Example 3: Analyze-then-Act with Conditional
User: "Analyze the code first. If refactoring is needed, refactor. Otherwise just add docs."

Response:
\`\`\`json
{
  "entryStepId": "analyze",
  "maxStepExecutions": 15,
  "initialVariables": {},
  "steps": [
    { "id": "analyze", "type": "langchain_prompt", "inputTemplate": "Analyze the following task and determine if code refactoring is needed or if only documentation should be added.\\n\\nTask: $task\\n\\nReply ONLY with one word: 'refactor' or 'docs'", "outputTarget": "custom_action", "next": "decide" },
    { "id": "decide", "type": "condition", "expression": "$custom_action == refactor", "whenTrue": "do-refactor", "whenFalse": "do-docs" },
    { "id": "do-refactor", "type": "pi_agent", "taskTemplate": "Refactor the code for: $task. Follow best practices, split large files, add JSDoc.", "next": "done" },
    { "id": "do-docs", "type": "pi_agent", "taskTemplate": "Add comprehensive documentation for: $task. Add JSDoc to all exports.", "next": "done" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ]
}
\`\`\`
Note: The condition checks $custom_action which was set by the langchain_prompt step. pi_agent CANNOT set this variable — langchain_prompt is used instead for the decision.
</few_shot_examples>

<output_format>
Respond with ONLY a valid JSON object containing: entryStepId, maxStepExecutions, initialVariables, steps.
No markdown fences, no explanation, no commentary. Pure JSON only.
Design the simplest pipeline that achieves the user's goal. Prefer fewer steps.
If you need a decision point, use langchain_prompt to analyze and write a decision variable, then condition to branch.
</output_format>`;

/**
 * Prompt de sistema para a segunda chamada: gerar metadata do perfil.
 * Recebe os steps gerados e produz id (kebab-case) + description.
 *
 * @returns Prompt de sistema para geração de metadata
 */
export const buildMetadataSystemPrompt = (): string => `You generate metadata for a worker pipeline profile. Given the pipeline steps and the user's original request, produce a JSON object with:

- "id": a short kebab-case identifier (max 64 chars, only lowercase letters, numbers, hyphens). Examples: "test-driven-fixer", "code-review-loop", "plan-implement-validate"
- "description": a concise Portuguese description (1-2 sentences) of what the pipeline does

<output_format>
Respond with ONLY a valid JSON object: { "id": "...", "description": "..." }
No markdown fences, no explanation, no commentary. Pure JSON only.
</output_format>`;

/**
 * Monta o prompt do usuário para a primeira chamada (geração de steps).
 * Inclui a descrição do usuário com instrução explícita de contexto.
 *
 * @param userDescription - Descrição natural do pipeline desejado
 * @returns Prompt formatado para o LLM
 */
export const buildStepsUserPrompt = (userDescription: string): string =>
  `Create a pipeline for the following requirement. Remember: if you need conditional branching, the condition variable MUST be set by a prior langchain_prompt or set_variable step (pi_agent cannot write variables).

User request: ${userDescription}`;

/**
 * Monta o prompt do usuário para a segunda chamada (metadata).
 *
 * @param userDescription - Descrição original do usuário
 * @param stepsJson - JSON dos steps gerados na primeira chamada
 * @returns Prompt formatado para o LLM
 */
export const buildMetadataUserPrompt = (
  userDescription: string,
  stepsJson: string,
): string => `Original request: ${userDescription}

Pipeline steps:
${stepsJson}

Generate the id and description for this pipeline.`;
