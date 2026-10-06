/**
 * Workflows (spec §5, §40, §49). Deterministic by construction: the only
 * things that happen here are activity calls and logging.
 */
import { log, proxyActivities } from "@temporalio/workflow";
import type * as activities from "./activities";
import type { HealthWorkflowResult, RecapWorkflowInput, RecapWorkflowResult } from "./shared";

const { runRecapActivity, runHealthCheckActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "3 minutes",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

/**
 * Post-expedition processing: ask the web app to run the Mastra field agent
 * for this expedition (and store the recap). The route itself decides honestly
 * whether the agent could run; this workflow's job is durability — the request
 * survives app restarts and redeploys until it completes or exhausts retries.
 */
export async function expeditionRecapWorkflow(
  input: RecapWorkflowInput
): Promise<RecapWorkflowResult> {
  log.info("Field recap workflow started", { expeditionId: input.expeditionId });
  const result = await runRecapActivity(input);
  log.info("Field recap workflow finished", {
    expeditionId: input.expeditionId,
    engine: result.engine,
    stored: result.stored,
  });
  return result;
}

/** Health workflow used by /lab: really calls the field agent and reports. */
export async function fieldAgentHealthWorkflow(): Promise<HealthWorkflowResult> {
  return await runHealthCheckActivity();
}
