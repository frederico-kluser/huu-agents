/**
 * Prompts para geração automática de pipeline profiles via LLM.
 *
 * Duas fases: (1) gerar steps JSON a partir de descrição natural,
 * (2) gerar metadata (id, description) a partir do conteúdo gerado.
 *
 * Segue princípios de context engineering:
 * - Contexto em camadas (system knowledge → rules → anti-patterns → examples → output)
 * - Menor conjunto de tokens de alto sinal
 * - Permissão explícita para expressar incerteza
 * - Few-shot com exemplos canônicos e diversos
 *
 * @module
 */

/**
 * Prompt de sistema para a primeira chamada LLM: gerar os steps da pipeline.
 * Estruturado em camadas com few-shot learning e anti-padrões explícitos.
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
   IMPORTANT: pi_agent CANNOT set variables. It only writes to the filesystem.
   If you need a variable set based on pi_agent results, add a langchain_prompt step after it to analyze the output and set variables.

2. **langchain_prompt** — Generates text via LLM (no filesystem access)
   Fields: { id, type: "langchain_prompt", inputTemplate: string, outputTarget: string, next: string }
   Use for: analysis, planning, review text generation, decision-making, setting variables based on analysis
   outputTarget must be a variable name (reserved or custom_*)
   This is the PRIMARY way to set custom variables dynamically during pipeline execution.

3. **condition** — Evaluates expression and branches
   Fields: { id, type: "condition", expression: string, whenTrue: string, whenFalse: string }
   Expression format: $variable operator value (operators: ==, !=, >=, <=, >, <)
   CRITICAL: The variable in the expression MUST be set by a prior step (set_variable or langchain_prompt with outputTarget). Never reference a variable that no step creates.

4. **goto** — Unconditional jump
   Fields: { id, type: "goto", target: string }
   Use "__end__" as target to finish the pipeline successfully

5. **set_variable** — Sets or updates a variable
   Fields: { id, type: "set_variable", target: string, value?: string|number|boolean, valueExpression?: string, next: string }
   value OR valueExpression (XOR, not both). valueExpression: "$custom_var + 1"

6. **git_diff** — Captures current worktree diff
   Fields: { id, type: "git_diff", target: string, next: string }
   target is the variable to store the diff in (e.g. "diff" or "custom_diff")

7. **fail** — Terminates pipeline with business error
   Fields: { id, type: "fail", messageTemplate: string }

## Variables

Reserved (auto-populated): $task (subtask description from DAG), $diff (worktree diff), $error (last error)
Custom: must start with "custom_" prefix. Defined via initialVariables or set_variable steps.
Use $variable_name syntax in templates for interpolation.

## Variable Flow Rules (CRITICAL)

Every variable used in a condition expression or template MUST have a clear origin:
- Reserved vars ($task, $diff, $error) are always available
- Custom vars from initialVariables are available from the start
- Custom vars created by set_variable are available after that step executes
- Custom vars created by langchain_prompt outputTarget are available after that step
- pi_agent CANNOT create or modify variables — it only modifies files in the worktree

If you need to check a result from pi_agent:
1. Run pi_agent to do the work
2. Run git_diff to capture what changed (stores in $diff)
3. Run langchain_prompt to analyze the diff and output a decision variable
4. Run condition to branch on that variable
</system_knowledge>

<anti_patterns>
## Common Mistakes to AVOID

1. NEVER use a variable in a condition that no prior step creates.
   BAD: condition checking $custom_pass when no step sets it
   GOOD: langchain_prompt with outputTarget: "custom_pass" before the condition

2. NEVER assume pi_agent will set a variable. pi_agent only changes files.

3. NEVER create disconnected steps — every step must be reachable from entryStepId.

4. NEVER create infinite loops without an exit condition using a counter variable.

5. NEVER over-decompose — prefer fewer, more capable steps. If the user says "implement and test", that can be ONE pi_agent step with clear instructions.
</anti_patterns>

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
    { "id": "fix-code", "type": "pi_agent", "taskTemplate": "Fix the code to make all tests pass for: $task. Run the tests and ensure they pass.", "next": "capture-diff" },
    { "id": "capture-diff", "type": "git_diff", "target": "diff", "next": "check-limit" },
    { "id": "check-limit", "type": "condition", "expression": "$custom_tries >= 3", "whenTrue": "done", "whenFalse": "increment" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ]
}
\`\`\`
Note: The counter $custom_tries is initialized in initialVariables and incremented by set_variable.

## Example 2: Code Review with Analysis Decision
User: "Implement the task, then review the code and apply fixes if needed"

Response:
\`\`\`json
{
  "entryStepId": "implement",
  "maxStepExecutions": 20,
  "initialVariables": {},
  "steps": [
    { "id": "implement", "type": "pi_agent", "taskTemplate": "Implement: $task", "next": "capture-diff" },
    { "id": "capture-diff", "type": "git_diff", "target": "diff", "next": "review" },
    { "id": "review", "type": "langchain_prompt", "inputTemplate": "Review this code diff for bugs, style issues, and improvements:\\n\\n$diff\\n\\nProvide specific actionable feedback. If the code looks good, respond with just: LGTM", "outputTarget": "custom_feedback", "next": "check-feedback" },
    { "id": "check-feedback", "type": "condition", "expression": "$custom_feedback == LGTM", "whenTrue": "done", "whenFalse": "apply-fixes" },
    { "id": "apply-fixes", "type": "pi_agent", "taskTemplate": "Apply these code review fixes:\\n$custom_feedback\\n\\nOriginal task: $task", "next": "done" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ]
}
\`\`\`
Note: langchain_prompt sets $custom_feedback, which condition then checks. pi_agent does not set variables.

## Example 3: Analyze-then-Refactor (conditional work)
User: "Analyze the file to decide if it needs refactoring, then refactor if needed"

Response:
\`\`\`json
{
  "entryStepId": "analyze",
  "maxStepExecutions": 20,
  "initialVariables": {},
  "steps": [
    { "id": "analyze", "type": "langchain_prompt", "inputTemplate": "Analyze the task and determine if the files need refactoring based on these criteria: files over 300 lines, functions over 50 lines, more than 10 functions per file, missing JSDoc. Task: $task\\n\\nRespond with exactly 'true' if refactoring is needed or 'false' if the code is already clean.", "outputTarget": "custom_needs_refactor", "next": "decide" },
    { "id": "decide", "type": "condition", "expression": "$custom_needs_refactor == true", "whenTrue": "refactor", "whenFalse": "done" },
    { "id": "refactor", "type": "pi_agent", "taskTemplate": "Refactor the code according to these guidelines: max 300 lines per file, max 50 lines per function, max 10 functions per file, add JSDoc to all exports. Task: $task", "next": "done" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ]
}
\`\`\`
Note: langchain_prompt sets $custom_needs_refactor BEFORE condition checks it. This is the correct pattern for conditional branching.
</few_shot_examples>

<output_format>
Respond with ONLY a valid JSON object containing: entryStepId, maxStepExecutions, initialVariables, steps.
No markdown fences, no explanation, no commentary. Pure JSON only.
Design the simplest pipeline that achieves the user's goal. Prefer fewer steps.
Every variable used in conditions must trace back to a set_variable, langchain_prompt outputTarget, or initialVariables.
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
 * Inclui a descrição e contexto adicional sobre o ambiente de execução.
 *
 * @param userDescription - Descrição natural do pipeline desejado
 * @returns Prompt formatado para o LLM
 */
export const buildStepsUserPrompt = (userDescription: string): string =>
  `Create a pipeline for the following request. Remember: every variable used in a condition must be set by a prior step (set_variable or langchain_prompt outputTarget). pi_agent CANNOT set variables.

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
