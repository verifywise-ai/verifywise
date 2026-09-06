import {
  buildDirectionSystemPrompt,
  buildDirectionUserPrompt,
} from "../direction/prompts";
import { CrossEntityCandidate } from "../direction/candidates";

const risks = [
  {
    id: 3,
    risk_name: "Biased scoring",
    risk_description: null,
    risk_category: null,
    ai_lifecycle_phase: null,
  },
  {
    id: 4,
    risk_name: "Unexplained rejections",
    risk_description: null,
    risk_category: null,
    ai_lifecycle_phase: null,
  },
];

const candidate: CrossEntityCandidate = {
  parent: { id: 9, entityType: "vendor_risk" },
  name: "Third-party model drift",
  childRiskIds: new Set([3, 4]),
  projects: ["Acme Onboarding"],
};

describe("buildDirectionUserPrompt", () => {
  it("lists a candidate with its table, id, name, reachable risks and projects", () => {
    const prompt = buildDirectionUserPrompt(risks, [], [candidate]);

    expect(prompt).toContain("vendor_risk 9: Third-party model drift");
    expect(prompt).toContain("shares a project with risks: 3, 4");
    expect(prompt).toContain("projects: Acme Onboarding");
  });

  // A C2-only component must produce exactly the prompt it produces today, or
  // this change silently re-tunes grouping for every existing user.
  it("is byte-identical to the two-argument form when there are no candidates", () => {
    expect(buildDirectionUserPrompt(risks, [], [])).toBe(buildDirectionUserPrompt(risks, []));
    expect(buildDirectionUserPrompt(risks, [], [])).not.toContain("shares a project");
  });

  // vendorrisks(9) and risks(9) both exist. Naming only the id would tell the
  // model risk 3 sits under a project risk that is in this very component.
  it("names the parent's table on a confirmed cross-entity edge", () => {
    const prompt = buildDirectionUserPrompt(risks, [
      { childRiskId: 3, parentRiskId: 9, parentEntityType: "vendor_risk" },
    ]);

    expect(prompt).toContain("risk 3 is already under vendor_risk 9");
  });

  it("still says plain 'risk' for a risk parent", () => {
    const prompt = buildDirectionUserPrompt(risks, [{ childRiskId: 3, parentRiskId: 4 }]);

    expect(prompt).toContain("risk 3 is already under risk 4");
  });
});

describe("buildDirectionSystemPrompt", () => {
  it("tells the model candidates are parents only and bounded by their risk list", () => {
    const prompt = buildDirectionSystemPrompt();
    expect(prompt).toContain("never children");
    expect(prompt).toContain("only take the risks listed beside it");
  });
});
