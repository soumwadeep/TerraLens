/**
 * TerraLens Temporal worker entrypoint (spec §5, §40, §49).
 *
 * Connects to the deployment's Temporal cluster (self-hosted or Temporal
 * Cloud over TLS + API key) and polls the TerraLens task queue. Only two
 * workflow types live here; all real work happens in the web app's routes.
 */
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities";

async function run(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS?.trim();
  if (!address) {
    console.error(
      "[terralens-worker] TEMPORAL_ADDRESS is not set. Point it at your Temporal cluster (e.g. localhost:7233 or your Temporal Cloud endpoint)."
    );
    process.exit(1);
  }
  const namespace = process.env.TEMPORAL_NAMESPACE?.trim() || "default";
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE?.trim() || "terralens-expeditions";
  const apiKey = process.env.TEMPORAL_API_KEY?.trim() || undefined;
  const tls = process.env.TEMPORAL_TLS === "1";
  const secure = tls || Boolean(apiKey);

  const connection = await NativeConnection.connect({
    address,
    ...(apiKey ? { apiKey } : {}),
    ...(tls ? { tls: true } : {}),
  });

  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue,
    workflowsPath: require.resolve("./workflows"),
    activities,
  });

  console.log(
    `[terralens-worker] polling task queue "${taskQueue}" on ${address} (namespace: ${namespace}, tls: ${secure ? "on" : "off"})`
  );

  const shutdown = () => {
    console.log("[terralens-worker] shutdown requested — finishing in-flight activities…");
    worker.shutdown();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  await worker.run();
  console.log("[terralens-worker] stopped.");
}

run().catch((error: unknown) => {
  console.error("[terralens-worker] fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
