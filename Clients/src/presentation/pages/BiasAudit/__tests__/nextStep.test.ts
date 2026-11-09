import { describe, expect, it } from "vitest";
import type {
  AedtAttestedDecision,
  AedtProfileView,
  AedtReadiness,
} from "../../../../application/repository/aedtBiasAudit.repository";
import { nextStepFor } from "../nextStep";

const IN_SCOPE: AedtReadiness = {
  score: 100,
  blockedReason: null,
  missingVetoes: [],
  openItems: [],
  scope: "in_scope",
  earned: 10,
  possible: 10,
};

const DECISION: AedtAttestedDecision = {
  readiness: IN_SCOPE,
  metric: "selection_rate",
  mayGenerate: true,
  generationBlocked: [],
};

const ATTESTED = { id: 2, version: 1, attestedByUserId: 1, attestedAt: "2026-10-29" };

const view = (overrides: Partial<AedtProfileView>): AedtProfileView =>
  ({
    profile: { id: 2, version: 1, status: "attested" },
    attested: ATTESTED,
    readiness: IN_SCOPE,
    attestedDecision: DECISION,
    answers: [],
    scopeDeterminations: [],
    ...overrides,
  }) as AedtProfileView;

describe("nextStepFor", () => {
  it("asks for answers before anything is saved", () => {
    expect(nextStepFor(view({ profile: null, attested: null, attestedDecision: null }), 0)).toEqual(
      expect.objectContaining({ section: "profile", text: "Answer the profile questions." }),
    );
  });

  it("names the required questions while they are open, then the attestation", () => {
    const draft = { profile: { id: 2, version: 1, status: "draft" }, attested: null };
    const open = view({
      ...draft,
      attestedDecision: null,
      readiness: { ...IN_SCOPE, missingVetoes: ["role.party"] },
    });
    expect(nextStepFor(open, 0).text).toMatch(/required questions/);
    expect(nextStepFor(view({ ...draft, attestedDecision: null }), 0).text).toMatch(/^Attest/);
  });

  it("points back to the profile while a newer draft waits for attestation", () => {
    const step = nextStepFor(view({ profile: { id: 3, version: 2, status: "draft" } }), 4);
    expect(step.section).toBe("profile");
    expect(step.text).toMatch(/latest answers/);
  });

  it("sends an out-of-scope profile to the scope determination", () => {
    const outOfScope = { ...DECISION, readiness: { ...IN_SCOPE, scope: "out_of_scope" as const } };
    expect(nextStepFor(view({ attestedDecision: outOfScope }), 0).section).toBe("scope");
  });

  it("asks for the cutoff answer when no rate can be calculated", () => {
    const step = nextStepFor(view({ attestedDecision: { ...DECISION, metric: null } }), 0);
    expect(step.section).toBe("profile");
    expect(step.text).toMatch(/cutoff/);
  });

  it("offers test candidates first, or an upload when generation is blocked", () => {
    expect(nextStepFor(view({}), 0).section).toBe("generate");
    const blocked = { ...DECISION, mayGenerate: false, generationBlocked: ["audio input"] };
    expect(nextStepFor(view({ attestedDecision: blocked }), 0).section).toBe("runs");
  });

  it("asks for this month's run once runs exist", () => {
    expect(nextStepFor(view({}), 2).section).toBe("runs");
  });
});
