/**
 * Temporal client (spec §5, §40, §49) — server-only.
 *
 * The web app never claims durability it cannot back up: when Temporal is not
 * configured, callers get a typed `unavailable` and fall back to running the
 * field agent directly. Workflow ids are deterministic per expedition, so a
 * replayed start attaches to the running workflow instead of duplicating it.
 */
import { Client, Connection, WorkflowNotFoundError } from "@temporalio/client";
import { getServerConfig } from "@/lib/config";
import type { FieldRecap, RecapContext } from "@/lib/ai/recap";

export const RECAP_WORKFLOW_TYPE = "expeditionRecapWorkflow";
export const HEALTH_WORKFLOW_TYPE = "fieldAgentHealthWorkflow";

export class TemporalUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemporalUnavailableError";
  }
}

export function temporalConfigured(): boolean {
  const cfg = getServerConfig();
  return cfg.flags.temporal && Boolean(cfg.temporal.address);
}

interface TemporalGlobal {
  clientPromise?: Promise<Client>;
}

const globalForTemporal = globalThis as unknown as { __terralensTemporal?: TemporalGlobal };
const state: TemporalGlobal = (globalForTemporal.__terralensTemporal ??= {});

async function getClient(): Promise<Client> {
  const cfg = getServerConfig();
  if (!temporalConfigured() || !cfg.temporal.address) {
    throw new TemporalUnavailableError("Temporal is not configured for this deployment.");
  }

  if (!state.clientPromise) {
    state.clientPromise = (async () => {
      const connection = await Connection.connect({
        address: cfg.temporal.address as string,
        ...(cfg.temporal.apiKey ? { apiKey: cfg.temporal.apiKey } : {}),
        ...(cfg.temporal.tls ? { tls: true } : {}),
        connectTimeout: 5_000,
      });
      return new Client({ connection, namespace: cfg.temporal.namespace });
    })().catch((error: unknown) => {
      state.clientPromise = undefined;
      throw new TemporalUnavailableError(
        error instanceof Error
          ? `Temporal did not answer: ${error.message}`
          : "Temporal did not answer."
      );
    });
  }
  return state.clientPromise;
}

export interface StartedWorkflow {
  workflowId: string;
  runId: string | null;
}

export interface ExpeditionRecapWorkflowInput {
  userId: string;
  expeditionId: string;
  context: RecapContext;
  /** Client-computed recap, stored only if the agent cannot run in the workflow. */
  fallback: FieldRecap | null;
}

/**
 * Start (or attach to) the durable post-expedition processing workflow for
 * one expedition. Deterministic id: one live workflow per expedition.
 */
export async function startExpeditionRecapWorkflow(
  input: ExpeditionRecapWorkflowInput
): Promise<StartedWorkflow> {
  const cfg = getServerConfig();
  const client = await getClient();
  const workflowId = `terralens-recap-${input.expeditionId}`;
  const handle = await client.workflow.start(RECAP_WORKFLOW_TYPE, {
    taskQueue: cfg.temporal.taskQueue,
    workflowId,
    workflowIdConflictPolicy: "USE_EXISTING",
    workflowIdReusePolicy: "ALLOW_DUPLICATE",
    args: [input],
  });
  return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId ?? null };
}

/** Start a health workflow that really calls the field agent — for /lab. */
export async function startFieldAgentHealthWorkflow(): Promise<StartedWorkflow> {
  const cfg = getServerConfig();
  const client = await getClient();
  const workflowId = `terralens-field-agent-health-${Date.now()}`;
  const handle = await client.workflow.start(HEALTH_WORKFLOW_TYPE, {
    taskQueue: cfg.temporal.taskQueue,
    workflowId,
    workflowExecutionTimeout: "2 minutes",
  });
  return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId ?? null };
}

export interface WorkflowStatus {
  workflowId: string;
  status: string;
  startTime: string | null;
  closeTime: string | null;
}

/** Describe a workflow run; null when no such workflow exists. */
export async function describeWorkflow(workflowId: string): Promise<WorkflowStatus | null> {
  const client = await getClient();
  try {
    const description = await client.workflow.getHandle(workflowId).describe();
    return {
      workflowId,
      status: description.status.name,
      startTime: description.startTime?.toISOString() ?? null,
      closeTime: description.closeTime?.toISOString() ?? null,
    };
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) return null;
    throw error;
  }
}

export interface TaskQueueHealth {
  reachable: boolean;
  pollers: number;
  detail: string;
}

/**
 * Live check of the task queue: how many worker pollers are connected right
 * now. `pollers === 0` with `reachable === true` honestly means "the cluster
 * answered but no worker is running".
 */
export async function probeTaskQueue(): Promise<TaskQueueHealth> {
  const cfg = getServerConfig();
  const client = await getClient();
  const res = await client.workflowService.describeTaskQueue({
    namespace: cfg.temporal.namespace,
    taskQueue: { name: cfg.temporal.taskQueue },
  });
  const pollers = res.pollers?.length ?? 0;
  return {
    reachable: true,
    pollers,
    detail:
      pollers > 0
        ? `${pollers} worker poller(s) are connected.`
        : "The cluster answered, but no worker is polling this task queue.",
  };
}
