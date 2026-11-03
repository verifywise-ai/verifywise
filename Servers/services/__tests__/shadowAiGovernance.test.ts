import { describe, expect, it } from "@jest/globals";
import { buildGovernanceModelRisk } from "../shadowAiGovernance";

const ctx = {
  toolName: "ChatGPT",
  ownerId: 7,
  modelId: 3,
  startedAt: new Date("2026-11-02T12:00:00Z"),
};

describe("buildGovernanceModelRisk", () => {
  it("returns null when the assessment is missing or blank", () => {
    expect(buildGovernanceModelRisk(undefined, ctx)).toBeNull();
    expect(buildGovernanceModelRisk({}, ctx)).toBeNull();
    expect(buildGovernanceModelRisk({ description: "  " }, ctx)).toBeNull();
  });

  it("sets the level from data sensitivity and is due in 90 days", () => {
    const risk = buildGovernanceModelRisk({ data_sensitivity: "Low" }, ctx);
    expect(risk).toMatchObject({
      risk_name: "Use of ChatGPT",
      risk_category: "Security",
      risk_level: "Low",
      status: "Open",
      owner: "7",
      target_date: "2027-01-31",
      model_id: 3,
      description: "Recorded when governance started for ChatGPT.",
    });
  });

  it("keeps the risk name within the 255-character column", () => {
    const risk = buildGovernanceModelRisk(
      { data_sensitivity: "High" },
      { ...ctx, toolName: "x".repeat(255) },
    );
    expect(risk?.risk_name).toHaveLength(255);
  });

  it("rates a description without sensitivity as Medium and keeps the text", () => {
    const risk = buildGovernanceModelRisk({ description: " Pastes source code " }, ctx);
    expect(risk).toMatchObject({ risk_level: "Medium", description: "Pastes source code" });
  });
});
