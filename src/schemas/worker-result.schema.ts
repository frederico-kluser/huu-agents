import { z } from 'zod';

/**
 * Enumeration of worker execution status outcomes.
 * - success: Task completed successfully
 * - failure: Task failed with error
 * - partial: Task partially completed with some success and some failure
 * - blocked: Task skipped because a dependency failed
 */
const WorkerStatus = z.enum(['success', 'failure', 'partial', 'blocked']);
export type WorkerStatus = z.infer<typeof WorkerStatus>;

/**
 * Result of a worker agent's execution on a single DAG node.
 * Captures the outcome, files modified, git commit hash, and any errors.
 *
 * @example
 * const result = {
 *   nodeId: "task-001",
 *   status: "success",
 *   filesModified: ["src/index.ts", "src/types.ts"],
 *   commitHash: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
 *   error: null
 * }
 *
 * @example
 * const failedResult = {
 *   nodeId: "task-002",
 *   status: "failure",
 *   filesModified: [],
 *   commitHash: null,
 *   error: "TypeScript compilation failed: Type 'unknown' is not assignable to type 'string'"
 * }
 */
export const WorkerResultSchema = z.object({
  nodeId: z
    .string()
    .min(1)
    .describe('The ID of the DAG node this result corresponds to'),
  status: WorkerStatus.describe('The outcome status of the worker execution'),
  filesModified: z
    .array(z.string())
    .describe('Paths to files created or modified during execution'),
  commitHash: z
    .string()
    .nullable()
    .describe('Git commit hash if changes were committed, null otherwise'),
  error: z
    .string()
    .nullable()
    .describe('Error message if execution failed, null if successful'),
});

export type WorkerResult = z.infer<typeof WorkerResultSchema>;
