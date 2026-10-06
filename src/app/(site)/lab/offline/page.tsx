import type { Metadata } from "next";
import { OfflineBoard } from "./offline-board";

export const metadata: Metadata = {
  title: "Offline",
  description:
    "What TerraLens keeps on-device, what the service worker has cached, and what the sync queue is holding — observed live, never faked.",
};

export default function LabOfflinePage() {
  return <OfflineBoard />;
}
