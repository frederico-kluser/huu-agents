/**
 * Gerador de pipeline profiles via LangChain.
 *
 * Duas chamadas LLM:
 * 1. Gera steps + initialVariables + maxStepExecutions a partir de descricao NL
 * 2. Gera metadados (id kebab-case, description) a partir do pipeline gerado
 *
 * Prompt construido com few-shot learning, story-breaking decomposition
 * e engenharia de contexto em camadas (XML-structured).
 *
 * @module
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import {
  WorkerProfileSchema,
  type WorkerProfile,
  type ProfileScope,
} from '../schemas/worker-profile.schema.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Resultado da geracao — discriminado para tratamento de erro */
export type GenerateResult =
  | { readonly ok: true; readonly profile: WorkerProfile }
  | { readonly ok: false; readonly error: string };

/** Opcoes controladas pelo usuario */
export interface GenerateOptions {
  readonly description: string;
  readonly scope: ProfileScope;
  readonly seats: number;
  readonly model: string;
  readonly apiKey: string;
  /** Callback de progresso para UI */
  readonly onProgress?: (phase: 'generating-steps' | 'generating-metadata' | 'validating', message: string) => void;
}

// ── Schemas de parse intermediarios ────────────────────────────────

const StepsResponseSchema = z.object({
  entryStepId: z.string().min(1),
  maxStepExecutions: z.number().int().min(1).max(100).default(20),
  initialVariables: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  steps: z.array(z.record(z.string(), z.unknown())).min(1),
});

const MetadataResponseSchema = z.object({
  id: z.string().min(1).max(64),
  description: z.string().min(1).max(200),
});

// ── Prompt do pipeline (Request 1) ─────────────────────────────────

/**
 * Prompt estruturado para geracao de steps.
 * Usa principios de story-breaking (3 atos: setup -> execucao -> validacao),
 * few-shot learning com exemplos canonicos, e restricoes claras do schema.
 */
const buildStepsPrompt = (description: string): string => `<role>
You are an expert pipeline architect for the Pi DAG Task CLI.
You design worker pipeline profiles that transform one-shot AI workers
into multi-step declarative pipelines with variables, conditions, and loops.
</role>

<schema_reference>
## Available Step Types (V1)

1. **pi_agent** — Executes Pi Coding Agent in the worktree.
   Fields: { id, type: "pi_agent", taskTemplate: string, next: string }
   - taskTemplate supports $variables: $task, $diff, $error, $custom_*
   - The agent can create/edit files, run commands, make commits.
   - It CANNOT modify pipeline variables — only filesystem.

2. **langchain_prompt** — Generates text via LLM and stores in a variable.
   Fields: { id, type: "langchain_prompt", inputTemplate: string, outputTarget: string, next: string }
   - inputTemplate supports $variables
   - outputTarget: variable name to store result (e.g. "custom_summary" or "task")
   - Use to reformulate tasks, generate plans, analyze diffs, make decisions.

3. **condition** — Evaluates expression and branches execution.
   Fields: { id, type: "condition", expression: string, whenTrue: string, whenFalse: string }
   - Expression format: $variable operator value
   - Operators: ==, !=, >=, <=, >, <
   - Example: $custom_tries >= 3

4. **goto** — Unconditional jump to another step or __end__.
   Fields: { id, type: "goto", target: string }
   - Use "__end__" to finish pipeline successfully.

5. **set_variable** — Sets or updates a variable.
   Fields: { id, type: "set_variable", target: string, next: string }
   + ONE of: { value: string|number|boolean } OR { valueExpression: string }
   - valueExpression supports simple arithmetic: $custom_tries + 1
   - target must be a variable name (reserved: task, diff, error; or custom_*)

6. **git_diff** — Captures worktree diff into a variable.
   Fields: { id, type: "git_diff", target: string, next: string }
   - Typically stores in "diff" (reserved) or "custom_diff"

7. **fail** — Terminates pipeline with explicit business error.
   Fields: { id, type: "fail", messageTemplate: string }
   - messageTemplate supports $variables
   - No "next" field — pipeline ends here.

## Variable System
- Reserved: $task (subtask description), $diff (worktree diff), $error (last error)
- Custom: $custom_* prefix required (e.g. $custom_tries, $custom_plan)
- Variables persist across steps within a single pipeline execution.
- initialVariables seeds custom variables before first step (keys must start with "custom_").

## Navigation
- "next", "whenTrue", "whenFalse", "target" fields point to step IDs or "__end__".
- "__end__" means pipeline completes successfully.
- Steps execute sequentially following navigation pointers.
- Loops are created by pointing back to earlier steps (use condition + maxStepExecutions as guard).

## Key Constraints
- Step IDs must be unique, kebab-case recommended (e.g. "write-tests", "check-result")
- entryStepId must match an existing step ID
- set_variable: value XOR valueExpression (exactly one, never both)
- Every pipeline MUST have a path to __end__ (no infinite loops without exit condition)
- maxStepExecutions (1-100, default 20) is the loop guard — prevents infinite execution
</schema_reference>

<methodology>
Design the pipeline following a 3-act structure:
- ACT 1 (Setup ~25%): Initialize variables, prepare context, reformulate task if needed
- ACT 2 (Execution ~50%): Core work — AI agents, code generation, transformations
- ACT 3 (Resolution ~25%): Validation, review, error handling, clean exit

Every step must produce a measurable state change. Remove steps that don't advance the goal.
Front-load simple steps, escalate complexity. Always include an exit condition for loops.
</methodology>

<few_shot_examples>
## Example 1: Simple code-and-review pipeline
User request: "I want the AI to write code, then review its own work and fix issues"

Response:
{
  "entryStepId": "write-code",
  "maxStepExecutions": 10,
  "initialVariables": {},
  "steps": [
    { "id": "write-code", "type": "pi_agent", "taskTemplate": "Implement the following task:\\n$task", "next": "capture-diff" },
    { "id": "capture-diff", "type": "git_diff", "target": "diff", "next": "review" },
    { "id": "review", "type": "langchain_prompt", "inputTemplate": "Review this code diff for bugs, missing edge cases, and code quality issues. Be specific about what needs fixing. If everything looks good, respond with exactly 'LGTM'.\\n\\nTask: $task\\n\\nDiff:\\n$diff", "outputTarget": "custom_review", "next": "check-review" },
    { "id": "check-review", "type": "condition", "expression": "$custom_review == LGTM", "whenTrue": "__end__", "whenFalse": "apply-fixes" },
    { "id": "apply-fixes", "type": "pi_agent", "taskTemplate": "Apply these review fixes to the code:\\n$custom_review\\n\\nOriginal task: $task", "next": "__end__" }
  ]
}

## Example 2: Test-driven development with retry loop
User request: "Write tests first, then implement code to pass them, retry up to 3 times"

Response:
{
  "entryStepId": "init",
  "maxStepExecutions": 30,
  "initialVariables": { "custom_tries": 0 },
  "steps": [
    { "id": "init", "type": "set_variable", "target": "custom_tries", "valueExpression": "$custom_tries + 1", "next": "write-tests" },
    { "id": "write-tests", "type": "pi_agent", "taskTemplate": "Write comprehensive tests for: $task\\nDo NOT implement the feature yet, only tests.", "next": "implement" },
    { "id": "implement", "type": "pi_agent", "taskTemplate": "Implement the code to make all tests pass for: $task\\nRun the tests and fix any failures.", "next": "check-tries" },
    { "id": "check-tries", "type": "condition", "expression": "$custom_tries >= 3", "whenTrue": "__end__", "whenFalse": "increment" },
    { "id": "increment", "type": "set_variable", "target": "custom_tries", "valueExpression": "$custom_tries + 1", "next": "capture-diff" },
    { "id": "capture-diff", "type": "git_diff", "target": "diff", "next": "evaluate" },
    { "id": "evaluate", "type": "langchain_prompt", "inputTemplate": "Evaluate if this implementation is complete and tests pass. Respond 'DONE' if satisfied, or describe remaining issues.\\n\\nDiff: $diff", "outputTarget": "custom_eval", "next": "check-done" },
    { "id": "check-done", "type": "condition", "expression": "$custom_eval == DONE", "whenTrue": "__end__", "whenFalse": "init" }
  ]
}

## Example 3: Plan-then-execute pipeline
User request: "First analyze the task and create a plan, then execute it step by step"

Response:
{
  "entryStepId": "plan",
  "maxStepExecutions": 15,
  "initialVariables": {},
  "steps": [
    { "id": "plan", "type": "langchain_prompt", "inputTemplate": "Analyze this task and create a detailed implementation plan with specific steps. Be concrete about what files to create/modify and what changes to make.\\n\\nTask: $task", "outputTarget": "custom_plan", "next": "execute" },
    { "id": "execute", "type": "pi_agent", "taskTemplate": "Execute this implementation plan:\\n$custom_plan\\n\\nOriginal task: $task", "next": "verify" },
    { "id": "verify", "type": "git_diff", "target": "diff", "next": "review" },
    { "id": "review", "type": "langchain_prompt", "inputTemplate": "Review the implementation against the plan. Is everything complete?\\n\\nPlan: $custom_plan\\nChanges: $diff\\n\\nRespond 'COMPLETE' if done, or describe what's missing.", "outputTarget": "custom_status", "next": "check" },
    { "id": "check", "type": "condition", "expression": "$custom_status == COMPLETE", "whenTrue": "__end__", "whenFalse": "fix" },
    { "id": "fix", "type": "pi_agent", "taskTemplate": "Complete the remaining work:\\n$custom_status\\n\\nPlan: $custom_plan", "next": "__end__" }
  ]
}
</few_shot_examples>

<task>
Generate a worker pipeline profile for the following user request:

"${description}"

Respond with ONLY a valid JSON object containing:
- entryStepId: ID of the first step
- maxStepExecutions: appropriate loop guard (default 20, increase for retry-heavy pipelines)
- initialVariables: object with custom_* keys and initial values (empty {} if none needed)
- steps: array of step objects following the schema above

Use meaningful kebab-case step IDs. Keep the pipeline focused and minimal — every step must advance toward the goal. Do not over-engineer.
</task>`;

// ── Prompt de metadados (Request 2) ─────────────────────────────────

const buildMetadataPrompt = (description: string, stepsJson: string): string => `<role>
You are a naming expert for pipeline profiles. Generate concise, descriptive metadata.
</role>

<task>
Given this pipeline and the user's original request, generate:
1. id: a short kebab-case identifier (max 64 chars, e.g. "code-review-loop", "tdd-fixer", "plan-and-execute")
2. description: a one-line description in the same language as the user's request (max 200 chars)

User request: "${description}"

Pipeline steps:
${stepsJson}

Respond with ONLY a valid JSON object: { "id": "...", "description": "..." }
</task>`;

// ── LLM client factory ──────────────────────────────────────────────

const createLlm = (model: string, apiKey: string, temperature = 0.3): ChatOpenAI =>
  new ChatOpenAI({
    model,
    temperature,
    apiKey,
    configuration: { baseURL: OPENROUTER_BASE_URL },
  });

// ── JSON extraction helper ──────────────────────────────────────────

/**
 * Extrai JSON de resposta LLM que pode conter markdown fences.
 *
 * @param raw - Texto bruto da resposta
 * @returns JSON string limpo
 */
function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch?.[0]) return braceMatch[0];
  return raw.trim();
}

// ── Geracao principal ──────────────────────────────────────────────

/**
 * Gera um WorkerProfile completo a partir de descricao em linguagem natural.
 * Executa duas chamadas LLM sequenciais: steps + metadata.
 *
 * @param options - Descricao, scope, seats, modelo e API key
 * @returns Profile validado ou erro descritivo
 *
 * @throws Nunca — erros retornados via Result pattern
 *
 * @example
 * const result = await generatePipeline({
 *   description: "Write tests then fix code, retry 3 times",
 *   scope: 'project', seats: 2,
 *   model: 'deepseek/deepseek-chat-v3-0324',
 *   apiKey: 'sk-or-...',
 * });
 * if (result.ok) saveProfile(result.profile, result.profile.scope);
 */
export async function generatePipeline(options: GenerateOptions): Promise<GenerateResult> {
  const { description, scope, seats, model, apiKey, onProgress } = options;
  const llm = createLlm(model, apiKey, 0.4);

  // ── Request 1: Generate steps ──────────────────────────────────
  onProgress?.('generating-steps', 'Generating pipeline steps...');

  let stepsRaw: string;
  try {
    const stepsResponse = await llm.invoke([
      new SystemMessage('You are a pipeline architect. Respond with valid JSON only.'),
      new HumanMessage(buildStepsPrompt(description)),
    ]);
    stepsRaw = typeof stepsResponse.content === 'string'
      ? stepsResponse.content
      : JSON.stringify(stepsResponse.content);
  } catch (e) {
    return { ok: false, error: `LLM request failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  let stepsJson: string;
  let stepsParsed: z.infer<typeof StepsResponseSchema>;
  try {
    stepsJson = extractJson(stepsRaw);
    const parsed = JSON.parse(stepsJson) as unknown;
    const validated = StepsResponseSchema.safeParse(parsed);
    if (!validated.success) {
      return { ok: false, error: `Invalid steps structure: ${validated.error.issues.map((issue: z.ZodIssue) => issue.message).join('; ')}` };
    }
    stepsParsed = validated.data;
  } catch {
    return { ok: false, error: `Failed to parse steps JSON from LLM response` };
  }

  // ── Request 2: Generate metadata ───────────────────────────────
  onProgress?.('generating-metadata', 'Generating profile metadata...');

  let metaRaw: string;
  try {
    const metaResponse = await llm.invoke([
      new SystemMessage('You are a naming expert. Respond with valid JSON only.'),
      new HumanMessage(buildMetadataPrompt(description, stepsJson)),
    ]);
    metaRaw = typeof metaResponse.content === 'string'
      ? metaResponse.content
      : JSON.stringify(metaResponse.content);
  } catch (e) {
    return { ok: false, error: `Metadata LLM request failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  let metadata: z.infer<typeof MetadataResponseSchema>;
  try {
    const metaJson = extractJson(metaRaw);
    const parsed = JSON.parse(metaJson) as unknown;
    const validated = MetadataResponseSchema.safeParse(parsed);
    if (!validated.success) {
      return { ok: false, error: `Invalid metadata: ${validated.error.issues.map((issue: z.ZodIssue) => issue.message).join('; ')}` };
    }
    metadata = validated.data;
  } catch {
    return { ok: false, error: `Failed to parse metadata JSON from LLM response` };
  }

  // ── Assemble and validate full profile ─────────────────────────
  onProgress?.('validating', 'Validating pipeline...');

  const rawProfile = {
    id: sanitizeKebabCase(metadata.id),
    description: metadata.description,
    scope,
    seats,
    entryStepId: stepsParsed.entryStepId,
    maxStepExecutions: stepsParsed.maxStepExecutions,
    initialVariables: stepsParsed.initialVariables,
    steps: stepsParsed.steps,
  };

  const profileResult = WorkerProfileSchema.safeParse(rawProfile);
  if (!profileResult.success) {
    const issues = profileResult.error.issues.map((issue: z.ZodIssue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return { ok: false, error: `Profile validation failed: ${issues}` };
  }

  return { ok: true, profile: profileResult.data };
}

/**
 * Normaliza string para kebab-case valido.
 * Remove caracteres invalidos e colapsa hifens.
 */
function sanitizeKebabCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'generated-pipeline';
}
