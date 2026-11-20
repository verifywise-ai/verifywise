import { describe, expect, it } from "@jest/globals";
import { AgentCreateModelRiskSchema } from "../schema";

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
});
