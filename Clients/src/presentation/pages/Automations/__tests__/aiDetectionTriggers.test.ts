import { describe, it, expect } from "vitest";
import { mockTriggerTemplates, mockActionTemplates } from "../data/mockData";

// Keys must match the triggers seeded by
// Servers/database/migrations/20261112143741-ai-detection-notifications-and-triggers.js:
// saving an automation looks the trigger up by this key.
const AI_DETECTION_TRIGGERS = [
  "ai_detection_scan_completed",
  "ai_detection_high_risk_finding",
  "ai_detection_scan_failed",
] as const;

describe("AI Detection automation triggers", () => {
  it.each(AI_DETECTION_TRIGGERS)("offers %s with no settings", (type) => {
    const template = mockTriggerTemplates.find((t) => t.type === type);
    expect(template).toBeDefined();
    expect(template!.category).toBe("aiDetection");
    expect(template!.configurationSchema).toEqual([]);
    // Not an added/updated/deleted trigger, so the key is sent to the backend as is.
    expect(type.endsWith("_updated")).toBe(false);
  });

  it("lets every AI Detection trigger send an email", () => {
    const sendEmail = mockActionTemplates.find((a) => a.type === "send_email");
    for (const type of AI_DETECTION_TRIGGERS) {
      expect(sendEmail!.compatibleTriggers).toContain(type);
    }
  });
});
