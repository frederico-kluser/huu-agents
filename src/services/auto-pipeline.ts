/**
 * Auto-pipeline generation via LangChain.
 *
 * Two-phase LLM pipeline:
 *   1. generatePipelineSteps — interprets user intent → produces steps + variables
 *   2. generatePipelineMetadata — given steps → produces id, description
 *
 * Default model: deepseek/deepseek-chat (overridable to any langchain-supported model).
 * Uses structured output via ChatOpenAI + OpenRouter.
 *
 * @module
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  WorkerProfileSchema,
  validateProfileReferences,
  type WorkerProfile,
  type WorkerStep,
  type ProfileScope,
} from '../schemas/worker-profile.schema.js';

// ── Constants ────────────────────────────────────────────────────────

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'deepseek/deepseek-chat';

// ── Types ────────────────────────────────────────────────────────────

/** Raw pipeline structure from LLM (before Zod validation) */
interface RawPipelineOutput {
  readonly steps: readonly WorkerStep[];
  readonly initialVariables: Readonly<Record<string, string | number>>;
  readonly entryStepId: string;
  readonly maxStepExecutions: number;
}

/** Raw metadata from LLM */
interface RawMetadataOutput {
  readonly id: string;
  readonly description: string;
}

/** Result of auto-pipeline generation */
export type AutoPipelineResult =
  | { readonly ok: true; readonly profile: WorkerProfile }
  | { readonly ok: false; readonly error: string };

/** Progress callback for UI updates */
export type AutoPipelineProgress = (phase: 'generating-steps' | 'generating-metadata' | 'validating' | 'done', detail?: string) => void;

/** Options for auto-pipeline generation */
export interface AutoPipelineOptions {
  readonly userDescription: string;
  readonly scope: ProfileScope;
  readonly seats: number;
  readonly apiKey: string;
  readonly model?: string;
  readonly onProgress?: AutoPipelineProgress;
}

// ── System prompts ───────────────────────────────────────────────────

/**
 * System prompt for step generation.
 * Designed using context engineering best practices:
 * - Clear role and constraints
 * - Few-shot examples as canonical references
 * - Explicit output format
 * - Permission to express limitations
 */
const STEPS_SYSTEM_PROMPT = `You are a pipeline architect that converts natural language descriptions into Worker Pipeline Profiles for the Pi DAG Task CLI system.

<constraints>
- Output ONLY valid JSON matching the exact schema below
- Use ONLY these 7 step types: pi_agent, langchain_prompt, condition, goto, set_variable, git_diff, fail
- Step IDs must be kebab-case (e.g., "write-code", "check-result")
- Variable names: reserved ($task, $diff, $error) or custom ($custom_*)
- All custom variables MUST start with "custom_" prefix
- Navigation targets must reference existing step IDs or "__end__"
- set_variable requires EITHER "value" OR "valueExpression", never both
- pi_agent steps modify the filesystem (code generation, editing, running commands)
- langchain_prompt steps generate/analyze text and store in variables (no filesystem access)
- Always include a loop exit condition when using goto to prevent infinite loops
- Keep pipelines minimal — prefer fewer steps that accomplish the goal
</constraints>

<step_types>
## pi_agent — Execute AI coding agent in worktree
Fields: id, type:"pi_agent", taskTemplate (string with $vars), next (step ID or "__end__")
Use for: writing code, editing files, running tests, any filesystem operation.
Does NOT create/modify pipeline variables — only changes files.

## langchain_prompt — Generate text via LLM
Fields: id, type:"langchain_prompt", inputTemplate (string with $vars), outputTarget (variable name), next
Use for: analyzing text, making decisions, reformulating tasks, reviewing diffs.
Stores LLM response in outputTarget variable.

## condition — Branch execution
Fields: id, type:"condition", expression (e.g., "$custom_pass == true"), whenTrue (step ID), whenFalse (step ID)
Operators: ==, !=, >=, <=, >, <

## goto — Unconditional jump
Fields: id, type:"goto", target (step ID or "__end__")

## set_variable — Set/update variable
Fields: id, type:"set_variable", target (variable name), next
Plus ONE of: value (literal) OR valueExpression (arithmetic like "$custom_tries + 1")

## git_diff — Capture worktree diff
Fields: id, type:"git_diff", target (variable name, usually "diff"), next

## fail — Terminate with error
Fields: id, type:"fail", messageTemplate (string with $vars)
</step_types>

<output_schema>
{
  "steps": [ ...array of step objects... ],
  "initialVariables": { "custom_key": value, ... },
  "entryStepId": "first-step-id",
  "maxStepExecutions": 20
}
</output_schema>

<examples>
## Example 1: "Write tests then fix code until tests pass"
User intent: TDD loop — write tests, fix code, repeat up to 3 times.

{
  "steps": [
    { "id": "init-counter", "type": "set_variable", "target": "custom_tries", "value": 0, "next": "write-tests" },
    { "id": "write-tests", "type": "pi_agent", "taskTemplate": "Write comprehensive unit tests for: $task", "next": "fix-code" },
    { "id": "fix-code", "type": "pi_agent", "taskTemplate": "Fix the code to make all tests pass for: $task", "next": "increment" },
    { "id": "increment", "type": "set_variable", "target": "custom_tries", "valueExpression": "$custom_tries + 1", "next": "check-limit" },
    { "id": "check-limit", "type": "condition", "expression": "$custom_tries >= 3", "whenTrue": "done", "whenFalse": "write-tests" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ],
  "initialVariables": { "custom_tries": 0 },
  "entryStepId": "init-counter",
  "maxStepExecutions": 25
}

## Example 2: "Implement feature then review the code"
User intent: implement, capture diff, LLM reviews, fix if needed.

{
  "steps": [
    { "id": "implement", "type": "pi_agent", "taskTemplate": "Implement: $task", "next": "capture-diff" },
    { "id": "capture-diff", "type": "git_diff", "target": "diff", "next": "review" },
    { "id": "review", "type": "langchain_prompt", "inputTemplate": "Review this code diff for quality, bugs, and best practices. If everything looks good respond with exactly 'approved'. If there are issues, describe what needs to be fixed.\\n\\nDiff:\\n$diff", "outputTarget": "custom_review", "next": "check-review" },
    { "id": "check-review", "type": "condition", "expression": "$custom_review == approved", "whenTrue": "finish", "whenFalse": "fix-issues" },
    { "id": "fix-issues", "type": "pi_agent", "taskTemplate": "Fix these code review issues: $custom_review\\n\\nOriginal task: $task", "next": "capture-diff" },
    { "id": "finish", "type": "goto", "target": "__end__" }
  ],
  "initialVariables": {},
  "entryStepId": "implement",
  "maxStepExecutions": 30
}

## Example 3: "Just implement the task" (simple, no loop)

{
  "steps": [
    { "id": "implement", "type": "pi_agent", "taskTemplate": "Implement: $task", "next": "done" },
    { "id": "done", "type": "goto", "target": "__end__" }
  ],
  "initialVariables": {},
  "entryStepId": "implement",
  "maxStepExecutions": 10
}
</examples>

Respond with ONLY the JSON object. No markdown fences, no explanation.`;

/**
 * System prompt for metadata generation.
 * Given the pipeline steps, generates a human-friendly id and description.
 */
const METADATA_SYSTEM_PROMPT = `You generate metadata for Worker Pipeline Profiles.

Given a pipeline description and its steps, produce:
- "id": a short kebab-case identifier (max 64 chars, only lowercase letters, numbers, hyphens). Must describe the pipeline purpose concisely.
- "description": a clear one-line description in the same language as the user input (max 120 chars).

Respond with ONLY a JSON object: { "id": "...", "description": "..." }
No markdown fences, no explanation.

Examples:
- User: "Write tests then fix code" → { "id": "tdd-fix-loop", "description": "Escreve testes, corrige código e repete até passar." }
- User: "Implement and review" → { "id": "implement-and-review", "description": "Implementa feature, revisa via LLM e corrige se necessário." }
- User: "Refactor with lint check" → { "id": "refactor-lint", "description": "Refatora código e valida com linter." }`;

// ── LLM helpers ──────────────────────────────────────────────────────

/**
 * Creates a ChatOpenAI instance configured for OpenRouter.
 *
 * @param apiKey - OpenRouter API key
 * @param model - Model ID (default: deepseek/deepseek-chat)
 * @returns Configured ChatOpenAI instance
 */
function createLLM(apiKey: string, model: string): ChatOpenAI {
  return new ChatOpenAI({
    model,
    temperature: 0.2,
    apiKey,
    configuration: { baseURL: OPENROUTER_BASE_URL },
  });
}

/**
 * Extracts JSON from LLM response, handling markdown fences.
 *
 * @param text - Raw LLM response
 * @returns Parsed JSON object
 * @throws {Error} If JSON parsing fails
 */
function extractJSON(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  return JSON.parse(cleaned);
}

// ── Phase 1: Generate steps ──────────────────────────────────────────

/**
 * Generates pipeline steps from a natural language description.
 *
 * @param description - User's natural language description of desired pipeline
 * @param llm - Configured ChatOpenAI instance
 * @returns Raw pipeline output (steps, variables, entryStepId, maxStepExecutions)
 * @throws {Error} If LLM response cannot be parsed
 *
 * @example
 * const raw = await generateSteps("Write tests and fix code", llm);
 * // raw.steps = [{ id: "write-tests", type: "pi_agent", ... }, ...]
 */
async function generateSteps(description: string, llm: ChatOpenAI): Promise<RawPipelineOutput> {
  const response = await llm.invoke([
    new SystemMessage(STEPS_SYSTEM_PROMPT),
    new HumanMessage(description),
  ]);

  const content = typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);

  return extractJSON(content) as RawPipelineOutput;
}

// ── Phase 2: Generate metadata ───────────────────────────────────────

/**
 * Generates id and description for a pipeline from its steps and user intent.
 *
 * @param userDescription - Original user description
 * @param steps - Generated pipeline steps
 * @param llm - Configured ChatOpenAI instance
 * @returns Raw metadata (id, description)
 * @throws {Error} If LLM response cannot be parsed
 *
 * @example
 * const meta = await generateMetadata("TDD loop", steps, llm);
 * // meta = { id: "tdd-loop", description: "..." }
 */
async function generateMetadata(
  userDescription: string,
  steps: readonly WorkerStep[],
  llm: ChatOpenAI,
): Promise<RawMetadataOutput> {
  const stepSummary = steps.map((s) => `${s.id} (${s.type})`).join(' → ');

  const response = await llm.invoke([
    new SystemMessage(METADATA_SYSTEM_PROMPT),
    new HumanMessage(`User request: "${userDescription}"\nPipeline steps: ${stepSummary}`),
  ]);

  const content = typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);

  return extractJSON(content) as RawMetadataOutput;
}

// ── Assembly ─────────────────────────────────────────────────────────

/** Assembles raw LLM outputs into a profile-shaped object for Zod validation */
function assembleProfileData(
  raw: RawPipelineOutput,
  metadata: RawMetadataOutput,
  scope: ProfileScope,
  seats: number,
): Record<string, unknown> {
  return {
    id: metadata.id,
    description: metadata.description ?? '',
    scope,
    seats,
    entryStepId: raw.entryStepId ?? raw.steps[0]?.id ?? '',
    maxStepExecutions: raw.maxStepExecutions ?? 20,
    initialVariables: raw.initialVariables ?? {},
    steps: raw.steps,
  };
}

/** Validates assembled profile data with Zod + reference integrity */
function validateProfile(data: Record<string, unknown>): AutoPipelineResult {
  const parsed = WorkerProfileSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return { ok: false, error: `Validacao Zod falhou: ${issues}` };
  }

  const refErrors = validateProfileReferences(parsed.data);
  if (refErrors.length > 0) {
    return { ok: false, error: `Integridade referencial: ${refErrors.join('; ')}` };
  }

  return { ok: true, profile: parsed.data };
}

// ── Main entry point ─────────────────────────────────────────────────

/**
 * Generates a complete WorkerProfile from a natural language description.
 * Two-phase process: (1) generate steps, (2) generate metadata.
 * Validates result with Zod + reference integrity checks.
 *
 * @param options - Generation options (description, scope, seats, apiKey, model)
 * @returns Result with validated WorkerProfile or error string
 *
 * @example
 * const result = await generateAutoPipeline({
 *   userDescription: "Write tests then fix until they pass",
 *   scope: 'project',
 *   seats: 2,
 *   apiKey: 'sk-...',
 *   onProgress: (phase) => console.log(phase),
 * });
 * if (result.ok) saveProfile(result.profile, 'project');
 */
export async function generateAutoPipeline(options: AutoPipelineOptions): Promise<AutoPipelineResult> {
  const { userDescription, scope, seats, apiKey, model = DEFAULT_MODEL, onProgress } = options;
  const llm = createLLM(apiKey, model);

  try {
    // Phase 1: Generate pipeline steps
    onProgress?.('generating-steps', 'Interpretando sua solicitacao...');
    const raw = await generateSteps(userDescription, llm);

    if (!raw.steps || !Array.isArray(raw.steps) || raw.steps.length === 0) {
      return { ok: false, error: 'LLM retornou pipeline sem steps validos.' };
    }

    // Phase 2: Generate metadata (id + description)
    onProgress?.('generating-metadata', 'Gerando identificador e descricao...');
    const metadata = await generateMetadata(userDescription, raw.steps, llm);

    if (!metadata.id || typeof metadata.id !== 'string') {
      return { ok: false, error: 'LLM retornou metadata sem ID valido.' };
    }

    // Phase 3: Assemble and validate
    onProgress?.('validating', 'Validando pipeline...');
    const profileData = assembleProfileData(raw, metadata, scope, seats);
    const result = validateProfile(profileData);

    if (result.ok) onProgress?.('done', 'Pipeline criada com sucesso!');
    return result;

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return { ok: false, error: `Falha na geracao: ${message}` };
  }
}
