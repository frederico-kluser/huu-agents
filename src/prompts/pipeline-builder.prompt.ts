/**
 * Prompts para geração automática de Worker Pipeline Profiles via LLM.
 * Duas requests: (1) gerar steps da pipeline, (2) gerar metadata (id, description).
 *
 * Segue princípios de context engineering (camadas focadas, few-shot diverso)
 * e story breaking (setup → execução → resolução no mesmo prompt).
 *
 * @module
 */

/**
 * Prompt que gera o corpo da pipeline: steps, initialVariables, entryStepId, maxStepExecutions.
 * Usa few-shot com 3 exemplos diversos para guiar a LLM.
 *
 * @param userDescription - Descrição livre do que o pipeline deve fazer
 * @returns Prompt completo para a LLM
 *
 * @example
 * const prompt = buildPipelineStepsPrompt('Gere testes e corrija até passar');
 */
export function buildPipelineStepsPrompt(userDescription: string): string {
  return `<role>
You are a pipeline architect for the Pi DAG Task CLI system. You design multi-step worker pipelines that execute inside Git worktrees. You output ONLY valid JSON — no explanations, no markdown fences.
</role>

<system_knowledge>
## Available Step Types (7 total)

1. **pi_agent** — Executes an AI coding agent in the worktree. Can create/edit files, run commands.
   Fields: { id, type: "pi_agent", taskTemplate: string, next: string }

2. **langchain_prompt** — Sends prompt to LLM, stores text response in a variable.
   Fields: { id, type: "langchain_prompt", inputTemplate: string, outputTarget: string, next: string }

3. **condition** — Evaluates simple expression, branches execution.
   Fields: { id, type: "condition", expression: string, whenTrue: string, whenFalse: string }
   Expression format: "$variable operator value" (operators: ==, !=, >=, <=, >, <)

4. **goto** — Unconditional jump to another step or "__end__".
   Fields: { id, type: "goto", target: string }

5. **set_variable** — Sets a variable. Use EITHER "value" (literal) OR "valueExpression" (arithmetic), never both.
   Fields: { id, type: "set_variable", target: string, value?: string|number|boolean, valueExpression?: string, next: string }
   valueExpression format: "$variable + number" or "$variable - number"

6. **git_diff** — Captures current worktree diff into a variable.
   Fields: { id, type: "git_diff", target: string, next: string }

7. **fail** — Terminates pipeline with business error.
   Fields: { id, type: "fail", messageTemplate: string }

## Variables
- Reserved: $task (subtask description from DAG), $diff (worktree diff), $error (last error)
- Custom: must start with "custom_" prefix (e.g., $custom_tries, $custom_plan)
- Use $variable_name in any template string for interpolation

## Constraints
- Step IDs: kebab-case, unique within pipeline
- All "next", "whenTrue", "whenFalse", "target" must reference existing step IDs or "__end__"
- Pipeline must have a reachable termination path (via "__end__" or "fail")
- maxStepExecutions: loop guard (1-100), set proportional to expected iterations
- initialVariables: only custom_* keys, values are string or number
</system_knowledge>

<examples>
## Example 1: "Generate tests and fix code until tests pass, max 3 attempts"

{
  "entryStepId": "increment",
  "maxStepExecutions": 30,
  "initialVariables": { "custom_tries": 0 },
  "steps": [
    { "id": "increment", "type": "set_variable", "target": "custom_tries", "valueExpression": "$custom_tries + 1", "next": "write-tests" },
    { "id": "write-tests", "type": "pi_agent", "taskTemplate": "Write comprehensive tests for: $task", "next": "fix-code" },
    { "id": "fix-code", "type": "pi_agent", "taskTemplate": "Fix the code so all tests pass for: $task", "next": "check-limit" },
    { "id": "check-limit", "type": "condition", "expression": "$custom_tries >= 3", "whenTrue": "done", "whenFalse": "increment" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ]
}

## Example 2: "Review code, generate a plan, then implement improvements"

{
  "entryStepId": "capture-diff",
  "maxStepExecutions": 10,
  "initialVariables": {},
  "steps": [
    { "id": "capture-diff", "type": "git_diff", "target": "custom_current_state", "next": "analyze" },
    { "id": "analyze", "type": "langchain_prompt", "inputTemplate": "Analyze this code and list specific improvements for: $task\\n\\nCurrent state:\\n$custom_current_state", "outputTarget": "custom_plan", "next": "implement" },
    { "id": "implement", "type": "pi_agent", "taskTemplate": "Implement these improvements for $task:\\n$custom_plan", "next": "done" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ]
}

## Example 3: "Implement feature with documentation, then self-review and fix issues"

{
  "entryStepId": "implement",
  "maxStepExecutions": 15,
  "initialVariables": { "custom_review_round": 0 },
  "steps": [
    { "id": "implement", "type": "pi_agent", "taskTemplate": "Implement the feature with inline documentation: $task", "next": "get-diff" },
    { "id": "get-diff", "type": "git_diff", "target": "diff", "next": "review" },
    { "id": "review", "type": "langchain_prompt", "inputTemplate": "Review this diff for bugs, missing edge cases, and code quality issues. List ONLY concrete problems found, or respond with 'LGTM' if no issues.\\n\\nTask: $task\\nDiff:\\n$diff", "outputTarget": "custom_review", "next": "check-review" },
    { "id": "check-review", "type": "condition", "expression": "$custom_review == LGTM", "whenTrue": "done", "whenFalse": "inc-round" },
    { "id": "inc-round", "type": "set_variable", "target": "custom_review_round", "valueExpression": "$custom_review_round + 1", "next": "check-limit" },
    { "id": "check-limit", "type": "condition", "expression": "$custom_review_round >= 2", "whenTrue": "done", "whenFalse": "fix-issues" },
    { "id": "fix-issues", "type": "pi_agent", "taskTemplate": "Fix these issues found in review:\\n$custom_review\\n\\nOriginal task: $task", "next": "get-diff" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ]
}
</examples>

<task>
Generate a worker pipeline for the following user request:

"${userDescription}"

Output ONLY the JSON object with these fields: entryStepId, maxStepExecutions, initialVariables, steps.
Design the simplest pipeline that fulfills the request. Prefer fewer steps. Every pipeline MUST have a reachable "__end__" path.
</task>`;
}

/**
 * Prompt que gera metadata (id e description) a partir da pipeline gerada.
 *
 * @param pipelineJson - JSON stringificado da pipeline gerada
 * @returns Prompt para gerar metadata
 *
 * @example
 * const prompt = buildPipelineMetadataPrompt(JSON.stringify(pipeline));
 */
export function buildPipelineMetadataPrompt(pipelineJson: string): string {
  return `<role>
You are a naming specialist. You generate concise, descriptive identifiers for worker pipelines.
Output ONLY valid JSON — no explanations, no markdown fences.
</role>

<task>
Given this pipeline, generate:
1. "id": a kebab-case identifier (1-64 chars, lowercase alphanumeric + hyphens, e.g. "test-driven-fixer")
2. "description": a concise one-line description in the same language as the step templates (max 120 chars)

Pipeline:
${pipelineJson}

Output ONLY: { "id": "...", "description": "..." }
</task>`;
}
