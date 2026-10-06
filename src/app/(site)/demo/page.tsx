import type { Metadata } from "next";
import { DemoRunner } from "./demo-runner";

export const metadata: Metadata = {
  title: "Guided demo",
  description:
    "Walk the full TerraLens expedition loop in one sitting — real mission, curiosity, AI and scoring engines running on clearly marked DEMO DATA. Nothing is saved.",
};

export default function DemoPage() {
  return (
    <main className="container-page py-12 sm:py-16">
      <DemoRunner />
    </main>
  );
}
