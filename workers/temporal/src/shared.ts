/**
 * Wire contract between the TerraLens web app and this worker.
 *
 * Deliberately dependency-free: the web app validates the actually-typed
 * payloads (zod lives there), while the worker treats `context` / `fallback`
 * as opaque JSON that it forwards verbatim. Duplicating the full schema here
 * would create two sources of truth.
 */

export interface RecapWorkflowInput {
  userId: string;
  expeditionId: string;
  context: unknown;
  fallback: unknown;
}

export interface RecapWorkflowResult {
  processed: boolean;
  engine: string | null;
  stored: boolean;
  reason: string | null;
}

export interface HealthWorkflowResult {
  ok: boolean;
  httpStatus: number;
  detail: string | null;
}

export const RECAP_WORKFLOW_TYPE = "expeditionRecapWorkflow";
export const HEALTH_WORKFLOW_TYPE = "fieldAgentHealthWorkflow";
