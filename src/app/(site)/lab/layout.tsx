import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LabNav } from "./lab-nav";

export const metadata: Metadata = {
  title: { default: "Model Lab", template: "%s — TerraLens Model Lab" },
  description:
    "TerraLens Model Lab: which AI runs where, what actually answered, and what was never claimed. The honesty contract, rendered from live runtime facts.",
};

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-3">
        <Badge variant="muted" className="gap-1.5 uppercase tracking-widest">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden />
          Model lab
        </Badge>
        <h1 className="text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          A lens you can take apart.
        </h1>
        <p className="max-w-2xl text-pretty text-muted-foreground">
          Every AI engine and service in TerraLens, what it does here, and its exact state.{" "}
          <span className="font-medium text-foreground">Configured is not the same as working</span>{" "}
          — a green READY only appears after that integration&apos;s own live check answered.
          Nothing on these pages is a fixture: it is read from the running app.
        </p>
      </header>
      <div className="mt-6">
        <LabNav />
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
