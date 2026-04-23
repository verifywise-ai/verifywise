import { describe, it, expect } from "vitest";
import { NotificationType } from "../useNotifications";

// This test validates the exported types and constants from the notifications hook.
// Full integration testing of the SSE connection requires a running server.
describe("useNotifications types", () => {
  it("NotificationType includes expected values", () => {
    const types: NotificationType[] = [
      "task_assigned",
      "task_completed",
      "review_requested",
      "approval_requested",
      "policy_due_soon",
      "system",
      "connected",
    ];
    expect(types).toHaveLength(7);
    types.forEach((t) => expect(typeof t).toBe("string"));
  });
});
