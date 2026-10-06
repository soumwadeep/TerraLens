import type { Metadata } from "next";
import {
  ArrowRight,
  CircleCheck,
  CircleX,
  FileJson,
  FolderOpen,
  Hourglass,
  Microscope,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTinkerStatus } from "@/lib/ai/tinker";
import type { EvaluationMetrics } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Evaluation",
  description:
    "The Tinker curiosity-adapter evaluation: real metrics from a recorded run, or an honest 'not run'. TerraLens never invents X/Y evaluation values.",
};

const METRIC_META: Array<{
  key: keyof EvaluationMetrics;
  label: string;
  hint: string;
  format: "percent" | "chars";
}> = [
  {
    key: "outdoorActionRate",
    label: "Outdoor-action rate",
    hint: "Share of adapter replies that propose a real-world action.",
    format: "percent",
  },
  {
    key: "screenDependencyRate",
    label: "Screen-dependency rate",
    hint: "Share of replies that keep the user on the screen. Lower is better.",
    format: "percent",
  },
  {
    key: "avgResponseLength",
    label: "Avg response length",
    hint: "Mean characters per reply from the adapter.",
    format: "chars",
  },
  {
    key: "safetyCompliance",
    label: "Safety compliance",
    hint: "Share of replies passing the deterministic safety gate.",
    format: "percent",
  },
  {
    key: "missionRelevance",
    label: "Mission relevance",
    hint: "Share of replies that stay on the mission's category.",
    format: "percent",
  },
  {
    key: "actionDiversity",
    label: "Action diversity",
    hint: "Share of replies using a distinct action category.",
    format: "percent",
  },
];

function formatMetric(
  metric: EvaluationMetrics[keyof EvaluationMetrics],
  format: "percent" | "chars"
): string {
  return format === "percent" ? `${(metric * 100).toFixed(1)}%` : `${Math.round(metric)} chars`;
}

function formatRunAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default async function LabEvaluationPage() {
  const status = await getTinkerStatus();
  const { evaluation, dataset, workspacePresent } = status;
  const metrics = evaluation.status === "completed" ? evaluation.metrics : null;

  const statusBadge =
    evaluation.status === "completed" ? (
      <Badge variant="success" className="gap-1 text-[11px] tracking-wide">
        <CircleCheck className="h-3.5 w-3.5" aria-hidden />
        EVALUATION RECORDED
      </Badge>
    ) : evaluation.status === "failed" ? (
      <Badge variant="destructive" className="gap-1 text-[11px] tracking-wide">
        <CircleX className="h-3.5 w-3.5" aria-hidden />
        FAILED
      </Badge>
    ) : (
      <Badge variant="sky" className="gap-1 text-[11px] tracking-wide">
        <Hourglass className="h-3.5 w-3.5" aria-hidden />
        NOT RUN YET
      </Badge>
    );

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">Curiosity adapter</h2>
        {statusBadge}
      </section>

      {!workspacePresent ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3.5 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-pretty">
            The <code className="font-mono text-xs">ai/tinker</code> workspace is missing from this
            checkout — there is nothing to evaluate here.
          </p>
        </div>
      ) : null}

      {/* Metrics — only when a real run is recorded. */}
      {metrics ? (
        <section aria-label="Evaluation metrics" className="space-y-3">
          <p className="text-pretty text-sm text-muted-foreground">
            Measured on{" "}
            <span className="font-medium text-foreground">{evaluation.datasetSize}</span> held-out
            examples with deterministic scorers — this run is the proof behind the{" "}
            <span className="font-medium text-foreground">READY</span> state on the registry.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {METRIC_META.map(({ key, label, hint, format }) => (
              <li key={key} className="rounded-2xl border bg-card p-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold">
                  {formatMetric(metrics[key], format)}
                </p>
                <p className="mt-1 text-pretty text-[11px] text-muted-foreground">{hint}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section
          aria-label="No metrics available"
          className="rounded-2xl border border-dashed bg-muted/30 p-5"
        >
          <div className="flex items-start gap-3">
            <Microscope className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="space-y-1.5">
              <p className="text-sm font-medium">No metrics to show — and that is deliberate.</p>
              <p className="text-pretty text-sm text-muted-foreground">{evaluation.notes}</p>
            </div>
          </div>
        </section>
      )}

      {/* The recorded evaluation record */}
      <section aria-label="Evaluation record" className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileJson className="size-4 text-forest" aria-hidden />
              Evaluation record
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {[
                ["Record", evaluation.id],
                ["Adapter", evaluation.adapterName],
                ["Model", evaluation.model],
                ["Version", evaluation.version ?? "—"],
                ["Dataset", evaluation.dataset],
                ["Dataset size", String(evaluation.datasetSize)],
                ["Run at", formatRunAt(evaluation.runAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="truncate font-mono text-xs" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="size-4 text-forest" aria-hidden />
              Dataset on disk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {[
                ["Seed rows", dataset.seedRows === null ? "missing" : String(dataset.seedRows)],
                [
                  "Training rows",
                  dataset.trainRows === null ? "missing" : String(dataset.trainRows),
                ],
                ["Observations export", dataset.exportPresent ? "present" : "not exported yet"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-mono text-xs">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-pretty text-xs text-muted-foreground">
              Counted by reading <code className="font-mono">ai/tinker/data/*.jsonl</code> in this
              checkout, right now — not a cached number.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* How a real number gets here */}
      <section aria-label="How to produce a real evaluation" className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          How a real number gets here
        </h2>
        <ol className="space-y-2">
          {[
            {
              step: "Prepare the dataset",
              body: "Seed rows about the curiosity mission style are merged with your exported observations into a training file.",
              command: "pnpm tinker:prepare",
            },
            {
              step: "Fine-tune on Tinker",
              body: "Run the LoRA recipe in ai/tinker on Tinker's platform. The recipe and config live in the workspace README.",
              command: "ai/tinker/README.md",
            },
            {
              step: "Evaluate the served checkpoint",
              body: "The script queries the real model, scores replies with deterministic scorers, and writes results.json — the only thing this page reads.",
              command: "pnpm tinker:evaluate",
            },
          ].map((item, index) => (
            <li
              key={item.step}
              className="flex items-start gap-3 rounded-2xl border bg-card px-4 py-3.5"
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-forest/10 font-mono text-xs font-semibold text-forest">
                {index + 1}
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">{item.step}</p>
                <p className="text-pretty text-xs text-muted-foreground">{item.body}</p>
                <p>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                    {item.command}
                  </code>
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p
          className={cn(
            "flex items-start gap-2 rounded-xl bg-muted/40 px-4 py-3 text-xs text-muted-foreground",
            "text-pretty"
          )}
        >
          <ArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          No value on this page is an estimate, a target, or an example. If results.json is missing,
          malformed, or from a failed run, this page says exactly that — never a made-up X/Y.
        </p>
      </section>
    </div>
  );
}
