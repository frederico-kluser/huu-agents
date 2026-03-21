import { z } from 'zod';

/**
 * Enumeration of possible node statuses in a DAG execution.
 * - pending: Node waiting to be executed
 * - running: Node currently executing
 * - done: Node execution completed successfully
 * - failed: Node execution failed
 */
const NodeStatus = z.enum(['pending', 'running', 'done', 'failed']);
export type NodeStatus = z.infer<typeof NodeStatus>;

/**
 * Enumeration of planner actions for DAG decomposition.
 * - decompose: Break down the macro task into smaller nodes
 * - request_exploration: Request additional exploration of a subtask
 * - clarify: Request clarification on ambiguous requirements
 */
const PlannerAction = z.enum(['decompose', 'request_exploration', 'clarify']);
export type PlannerAction = z.infer<typeof PlannerAction>;

/**
 * Represents a single node in a DAG execution plan.
 *
 * @example
 * const node = {
 *   id: "task-001",
 *   task: "Process payment transaction",
 *   dependencies: ["task-000"],
 *   status: "pending",
 *   files: []
 * }
 */
export const DAGNodeSchema = z.object({
  id: z.string().min(1).describe('Unique identifier for the node'),
  task: z.string().min(1).describe('Description of the task to be executed'),
  dependencies: z.array(z.string()).describe('Array of node IDs this node depends on'),
  status: NodeStatus.describe('Current execution status of the node'),
  files: z.array(z.string()).describe('Paths to files created or modified by this node'),
});
export type DAGNode = z.infer<typeof DAGNodeSchema>;

/**
 * Metadata about the DAG execution plan.
 *
 * @example
 * const metadata = {
 *   macroTask: "Build a payment processing system",
 *   totalNodes: 8,
 *   parallelizable: 3
 * }
 */
export const DAGMetadataSchema = z.object({
  macroTask: z.string().min(1).describe('The high-level macro task being decomposed'),
  totalNodes: z.number().int().positive().describe('Total number of nodes in the DAG'),
  parallelizable: z.number().int().nonnegative().describe('Number of nodes that can run in parallel'),
});
export type DAGMetadata = z.infer<typeof DAGMetadataSchema>;

/**
 * Complete DAG execution plan with planner action and decomposed nodes.
 *
 * @example
 * const dagPlan = {
 *   action: "decompose",
 *   nodes: [
 *     { id: "task-001", task: "Setup database", dependencies: [], status: "pending", files: [] },
 *     { id: "task-002", task: "Create API endpoints", dependencies: ["task-001"], status: "pending", files: [] }
 *   ],
 *   metadata: {
 *     macroTask: "Build backend infrastructure",
 *     totalNodes: 2,
 *     parallelizable: 0
 *   }
 * }
 */
export const DAGSchema = z.object({
  action: PlannerAction.describe('The action the planner is taking'),
  nodes: z.array(DAGNodeSchema).describe('Array of decomposed task nodes'),
  metadata: DAGMetadataSchema.describe('Metadata about the DAG execution plan'),
});
export type DAG = z.infer<typeof DAGSchema>;
