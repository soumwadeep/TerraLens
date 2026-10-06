import type { Metadata } from "next";
import { ModelsBoard } from "./models-board";

export const metadata: Metadata = {
  title: "Models",
  description:
    "The TerraLens AI ENGINE board: Gemma, the Tinker curiosity adapter, the Mastra field agent, TabPFN, memory, and the network — each with its exact, live-verified state.",
};

export default function LabModelsPage() {
  return <ModelsBoard />;
}
