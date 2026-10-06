import type { Metadata } from "next";
import { ObservabilityBoard } from "./observability-board";

export const metadata: Metadata = {
  title: "Observability",
  description:
    "Live telemetry from this server process — agent traces, latency, and error events. No fabricated traces, no PII.",
};

export default function LabObservabilityPage() {
  return <ObservabilityBoard />;
}
