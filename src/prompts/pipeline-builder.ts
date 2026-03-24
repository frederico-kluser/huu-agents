/**
 * Prompts para geração automática de pipeline profiles via LLM.
 *
 * Duas fases: (1) gerar steps JSON a partir de descrição natural,
 * (2) gerar metadata (id, description) a partir dos steps gerados.
 * Usa few-shot com exemplos reais do sistema para guiar a LLM.
 * Segue princípios de context engineering: camadas de contexto,
 * tokens de alto sinal, e anti-alucinação via restrições explícitas.
 *
 * @module
 */

/**
 * Prompt de sistema para a primeira chamada LLM: gerar os steps da pipeline.
 * Estruturado em camadas (context engineering) com few-shot learning.
 * Resolve tudo em uma única chamada eficiente.
 *
 * @returns Prompt de sistema completo
 * @example
 * const prompt = buildStepsSystemPrompt();
 * const llm = new ChatOpenAI({ model: 'deepseek/deepseek-chat' });
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
   IMPORTANT: pi_agent CANNOT set or return variables. It only modifies files in the worktree.
   If you need to analyze code and store a decision/result, use langchain_prompt instead.

2. **langchain_prompt** — Generates text via LLM (no filesystem access)
   Fields: { id, type: "langchain_prompt", inputTemplate: string, outputTarget: string, next: string }
   Use for: analysis, planning, review, decision-making, text generation, summarization
   outputTarget must be a variable name (reserved or custom_*)
   THIS IS THE ONLY STEP TYPE THAT CAN PRODUCE TEXT OUTPUT INTO VARIABLES (besides set_variable).
   Use it to analyze files, make decisions, generate plans, or evaluate conditions that require LLM reasoning.

3. **condition** — Evaluates expression and branches
   Fields: { id, type: "condition", expression: string, whenTrue: string, whenFalse: string }
   Expression format: $variable operator value (operators: ==, !=, >=, <=, >, <)
   ONLY compares variable values — cannot call functions or evaluate complex logic.
   The variable must already be set by a previous step (langchain_prompt, set_variable, or git_diff).

4. **goto** — Unconditional jump
   Fields: { id, type: "goto", target: string }
   Use "__end__" as target to finish the pipeline successfully

5. **set_variable** — Sets or updates a variable
   Fields: { id, type: "set_variable", target: string, value?: string|number|boolean, valueExpression?: string, next: string }
   value OR valueExpression (XOR, not both). valueExpression: "$custom_var + 1"
   Use for: counters, flags, literal values. For complex decisions, use langchain_prompt instead.

6. **git_diff** — Captures current worktree diff
   Fields: { id, type: "git_diff", target: string, next: string }
   target is the variable to store the diff in (e.g. "diff" or "custom_diff")

7. **fail** — Terminates pipeline with business error
   Fields: { id, type: "fail", messageTemplate: string }

## Variables

Reserved (auto-populated):
- $task: subtask description from DAG (always available)
- $diff: worktree diff (populated by git_diff step)
- $error: last error (populated by runtime on failures)
- $context: context files selected by the user (newline-separated paths, always available)
Custom: must start with "custom_" prefix. Defined via initialVariables or set_variable steps.
Use $variable_name syntax in templates for interpolation.

## Critical Rules
- Step IDs must be unique, kebab-case, descriptive (e.g. "write-tests", "check-result")
- "__end__" is the special target that ends the pipeline successfully
- Every path must eventually reach "__end__" or "fail"
- Iterative loops MUST have an exit condition (condition step checking counter or result)
- set_variable with valueExpression: only simple arithmetic ($custom_tries + 1)
- initialVariables keys must start with "custom_"

## Variable Flow Rules — MOST COMMON MISTAKE
- pi_agent CANNOT set variables. It only writes files to the worktree.
- To make decisions based on code analysis, use this pattern:
  1. langchain_prompt (analyzes and writes result to a custom_* variable)
  2. condition (checks the variable set by langchain_prompt)
- To make decisions based on code changes, use this pattern:
  1. pi_agent (makes changes)
  2. git_diff (captures the diff into a variable)
  3. langchain_prompt (analyzes the diff, writes conclusion to variable)
  4. condition (branches based on the conclusion)
- NEVER reference a variable in a condition unless a previous step explicitly sets it.
- Every custom_* variable used in a condition MUST be set by: initialVariables, set_variable, langchain_prompt outputTarget, or git_diff target.

## Task Context
The $task variable contains the subtask description assigned to this worker by the DAG planner.
The $context variable contains the list of context files selected by the user (newline-separated paths).
Always include $task in pi_agent taskTemplate so the agent knows what to work on.
When using langchain_prompt for analysis, include $task and $context for full context.
Including $context in pi_agent steps helps the agent focus on the right files.
</system_knowledge>

<few_shot_examples>
## Example 1: Test-Driven Fixer (with retry loop)
User: "Write tests first, then fix the code to pass them. Retry up to 3 times."

Response:
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

## Example 2: Code Review Pipeline (langchain_prompt for analysis)
User: "Have AI review the code changes, then apply the feedback"

Response:
{
  "entryStepId": "implement",
  "maxStepExecutions": 20,
  "initialVariables": {},
  "steps": [
    { "id": "implement", "type": "pi_agent", "taskTemplate": "Implement: $task", "next": "capture-diff" },
    { "id": "capture-diff", "type": "git_diff", "target": "diff", "next": "review" },
    { "id": "review", "type": "langchain_prompt", "inputTemplate": "Review this code diff for bugs, style issues, and improvements:\\n\\n$diff\\n\\nOriginal task: $task\\n\\nProvide specific actionable feedback.", "outputTarget": "custom_feedback", "next": "apply-fixes" },
    { "id": "apply-fixes", "type": "pi_agent", "taskTemplate": "Apply these code review fixes to the code:\\n$custom_feedback\\n\\nOriginal task: $task", "next": "done" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ]
}

## Example 3: Analyze-Then-Act (decision via langchain_prompt, NOT pi_agent)
User: "Analyze the file to check if refactoring is needed, then refactor if necessary"

Response:
{
  "entryStepId": "analyze",
  "maxStepExecutions": 20,
  "initialVariables": {},
  "steps": [
    { "id": "analyze", "type": "langchain_prompt", "inputTemplate": "Analyze the following task and determine if code refactoring is needed. Consider: file size, function count, complexity, code duplication.\\n\\nTask: $task\\n\\nRespond with ONLY 'true' if refactoring is needed, or 'false' if the code is already well-structured.", "outputTarget": "custom_needs_refactor", "next": "decide" },
    { "id": "decide", "type": "condition", "expression": "$custom_needs_refactor == true", "whenTrue": "refactor", "whenFalse": "done" },
    { "id": "refactor", "type": "pi_agent", "taskTemplate": "Refactor the code according to best practices: split large files, extract functions, add documentation.\\n\\nTask: $task", "next": "done" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ]
}

## Example 4: Plan-and-Execute with Validation
User: "First plan the approach, then implement, then validate with lint and tests"

Response:
{
  "entryStepId": "plan",
  "maxStepExecutions": 20,
  "initialVariables": {},
  "steps": [
    { "id": "plan", "type": "langchain_prompt", "inputTemplate": "Create a step-by-step implementation plan for: $task\\n\\nBe specific about files to create/modify and the approach.", "outputTarget": "custom_plan", "next": "implement" },
    { "id": "implement", "type": "pi_agent", "taskTemplate": "Follow this plan to implement the task:\\n\\nPlan:\\n$custom_plan\\n\\nTask: $task", "next": "validate" },
    { "id": "validate", "type": "pi_agent", "taskTemplate": "Run lint and tests. Fix any issues found. Task context: $task", "next": "done" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ]
}
</few_shot_examples>

<output_format>
Respond with ONLY a valid JSON object containing: entryStepId, maxStepExecutions, initialVariables, steps.
No markdown fences, no explanation, no commentary. Pure JSON only.
Design the simplest pipeline that achieves the user's goal. Prefer fewer steps.
CRITICAL: Never use pi_agent to set variables. Use langchain_prompt for analysis and decision-making.
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
 *
 * @param userDescription - Descrição natural do pipeline desejado
 * @returns Prompt formatado para o LLM
 */
export const buildStepsUserPrompt = (userDescription: string): string =>
  `Create a pipeline for: ${userDescription}`;

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
