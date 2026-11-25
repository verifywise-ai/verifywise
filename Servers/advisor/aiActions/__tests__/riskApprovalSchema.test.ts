import { AgentCreateRiskSchema } from "../createRisk/schema";
import { AgentUpdateRiskSchema } from "../updateRisk/schema";
import { createRiskToolDefinition } from "../createRisk/definition";
import { renderCreateRiskPreview } from "../createRisk/preview";
import { updateRiskToolDefinition } from "../updateRisk/definition";
import { RISK_APPROVAL_STATUSES } from "../../../domain.layer/enums/risk-approval-status.enum";

const baseCreate = {
  risk_name: "Bias in ranking",
  risk_description: "d",
  ai_lifecycle_phase: "Deployment & integration",
  risk_category: ["Data privacy risk"],
  impact: "i",
  mitigation_status: "In Progress",
  mitigation_plan: "p",
  current_risk_level: "Low risk",
  implementation_strategy: "s",
  deadline: "2027-01-01",
};

describe("advisor risk mitigation fields", () => {
  const mitigationFields = [
    "mitigation_status",
    "mitigation_plan",
    "current_risk_level",
    "implementation_strategy",
    "deadline",
  ];

  it("creates a risk with only the risk fields, no mitigation", () => {
    const withoutMitigation = Object.fromEntries(
      Object.entries(baseCreate).filter(([key]) => !mitigationFields.includes(key)),
    );
    expect(AgentCreateRiskSchema.safeParse(withoutMitigation).success).toBe(true);
  });

  it("still checks a mitigation value that is sent", () => {
    expect(
      AgentCreateRiskSchema.safeParse({ ...baseCreate, mitigation_status: "Soon" }).success,
    ).toBe(false);
    expect(AgentCreateRiskSchema.safeParse({ ...baseCreate, deadline: "later" }).success).toBe(
      false,
    );
    expect(
      AgentCreateRiskSchema.safeParse({ ...baseCreate, mitigation_plan: "x".repeat(1025) }).success,
    ).toBe(false);
  });

  it("previews a risk without mitigation fields without 'undefined'", () => {
    const preview = renderCreateRiskPreview({ risk_name: "R" } as never);
    expect(preview).toBe('Create a risk "R"');
    expect(renderCreateRiskPreview({ ...baseCreate } as never)).toContain("deadline 2027-01-01");
  });

  it("does not offer the mitigation fields to the LLM as required", () => {
    const required: string[] = (createRiskToolDefinition as any).function.parameters.required;
    for (const field of mitigationFields) expect(required).not.toContain(field);
  });
});

describe("advisor risk approval fields", () => {
  it("creates a risk with no approver, approval status or assessment date", () => {
    expect(AgentCreateRiskSchema.safeParse(baseCreate).success).toBe(true);
  });

  it.each(RISK_APPROVAL_STATUSES)("accepts %s as an approval status", (status) => {
    expect(
      AgentCreateRiskSchema.safeParse({ ...baseCreate, approval_status: status }).success,
    ).toBe(true);
    expect(AgentUpdateRiskSchema.safeParse({ risk_id: 1, approval_status: status }).success).toBe(
      true,
    );
  });

  it("rejects a mitigation value as an approval status", () => {
    expect(
      AgentCreateRiskSchema.safeParse({ ...baseCreate, approval_status: "In Progress" }).success,
    ).toBe(false);
    expect(
      AgentUpdateRiskSchema.safeParse({ risk_id: 1, approval_status: "In Progress" }).success,
    ).toBe(false);
  });

  it("offers the LLM the four values and does not require the approval fields", () => {
    for (const def of [createRiskToolDefinition, updateRiskToolDefinition]) {
      const params = (def as any).function.parameters;
      expect(params.properties.approval_status.enum).toEqual([...RISK_APPROVAL_STATUSES]);
      for (const field of ["approver", "approval_status", "date_of_assessment"]) {
        expect(params.required).not.toContain(field);
      }
    }
  });
});
