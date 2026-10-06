/**
 * Next.js instrumentation hook. Runs once per server process before the app
 * handles requests. Config problems are logged as warnings and never throw —
 * every integration is optional by design (master spec §48).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateConfig } = await import("@/lib/config");
    for (const warning of validateConfig()) {
      console.warn(`[terralens:config] ${warning}`);
    }
    const { initTelemetry } = await import("@/lib/telemetry");
    await initTelemetry();
  }
}
