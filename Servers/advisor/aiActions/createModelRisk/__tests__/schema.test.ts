import { describe, expect, it } from "@jest/globals";
import { AgentCreateModelRiskFileSchema, AgentCreateModelRiskSchema } from "../schema";

const base = { risk_name: "Drift risk", description: "Seen in March" };

describe("agent_create_model_risk stored input (decision 10)", () => {
  it("runs an approval filed with a free-text likelihood: the text moves to the description", () => {
    const parsed = AgentCreateModelRiskSchema.safeParse({
      ...base,
      likelihood: "High",
      risk_level: "High",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      risk_level: "High",
      description: "Seen in March\n\nPrevious likelihood: High",
    });
    expect(parsed.data).not.toHaveProperty("likelihood");
  });

  it("gives a label in another case its spelling", () => {
    const parsed = AgentCreateModelRiskSchema.safeParse({
      ...base,
      likelihood: "almost certain",
      severity: "major",
    });
    expect(parsed.data).toMatchObject({ likelihood: "Almost Certain", severity: "Major" });
  });

  it("keeps the level of an older approval that names one and has no pair", () => {
    expect(AgentCreateModelRiskSchema.safeParse({ ...base, risk_level: "Low" }).success).toBe(true);
  });

  it("refuses a stored approval with neither the pair nor a level", () => {
    const parsed = AgentCreateModelRiskSchema.safeParse({ ...base, likelihood: "Likely" });
    expect(parsed.success).toBe(false);
    expect(parsed.error!.issues[0].message).toMatch(/no likelihood and severity and no risk level/);
  });
});

describe("agent_create_model_risk new input (file time)", () => {
  it("requires both likelihood and severity, even with a level", () => {
    const parsed = AgentCreateModelRiskFileSchema.safeParse({ ...base, risk_level: "High" });
    expect(parsed.success).toBe(false);
    expect(parsed.error!.issues.map((i) => i.path.join("."))).toEqual(["likelihood", "severity"]);
  });

  it("accepts the pair", () => {
    expect(
      AgentCreateModelRiskFileSchema.safeParse({ ...base, likelihood: "Likely", severity: "Minor" })
        .success,
    ).toBe(true);
  });
});
