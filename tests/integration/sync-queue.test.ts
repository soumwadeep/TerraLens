/**
 * Integration boundary (spec §5, §40): the demo/live split at the sync queue.
 *
 * Demo-origin data must NEVER reach the sync engine — not as a queued
 * operation, not as a nudge. This suite pins that contract against the real
 * queueForSync implementation with the persistence layer mocked out.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  kickSync: vi.fn(),
}));

vi.mock("@/lib/db/repositories", () => ({
  syncQueueRepository: { enqueue: mocks.enqueue },
}));
vi.mock("@/lib/sync/engine", () => ({
  kickSync: mocks.kickSync,
}));

import { queueForSync } from "@/lib/sync/queue";

const ENTITY_ID = "00000000-0000-4000-8000-0000000000aa";

describe("queueForSync", () => {
  beforeEach(() => {
    mocks.enqueue.mockReset();
    mocks.enqueue.mockResolvedValue({ id: "op-1" });
    mocks.kickSync.mockReset();
  });

  it("refuses to enqueue demo-origin operations", async () => {
    const status = await queueForSync({
      entityType: "observation",
      entityId: ENTITY_ID,
      operation: "CREATE",
      origin: "demo",
      payload: { note: "demo seed" },
    });
    expect(status).toBe("local-only");
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.kickSync).not.toHaveBeenCalled();
  });

  it("enqueues live operations and nudges the engine", async () => {
    const status = await queueForSync({
      entityType: "mission",
      entityId: ENTITY_ID,
      operation: "UPDATE",
      origin: "live",
      payload: { status: "COMPLETED" },
    });
    expect(status).toBe("queued");
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue.mock.calls[0][0]).toMatchObject({
      entityType: "mission",
      entityId: ENTITY_ID,
      operation: "UPDATE",
      origin: "live",
      payload: { status: "COMPLETED" },
    });
    expect(mocks.kickSync).toHaveBeenCalledTimes(1);
  });

  it("degrades quietly to local-only when storage is unavailable", async () => {
    mocks.enqueue.mockRejectedValueOnce(new Error("IndexedDB unavailable"));
    const status = await queueForSync({
      entityType: "expedition",
      entityId: ENTITY_ID,
      operation: "CREATE",
    });
    expect(status).toBe("local-only");
    expect(mocks.kickSync).not.toHaveBeenCalled();
  });
});
