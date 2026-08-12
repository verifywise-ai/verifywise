import { fieldOverlapProvider } from "../providers/fieldOverlap";
import { RecomputeContext, RiskScoringRow } from "../types";

const risk = (id: number, overrides: Partial<RiskScoringRow> = {}): RiskScoringRow => ({
  id,
  risk_category: null,
  controls_mapping: null,
  assessment_mapping: null,
  ai_lifecycle_phase: null,
  projects: [],
  ...overrides,
});

const ctx = (subject: RiskScoringRow, candidates: RiskScoringRow[]): RecomputeContext => ({
  organizationId: 1,
  subject,
  candidates,
});

describe("fieldOverlapProvider", () => {
  it("returns nothing when no signal matches", async () => {
    const result = await fieldOverlapProvider.score(
      ctx(risk(1, { risk_category: ["Strategic risk"] }), [risk(2, { risk_category: ["Cyber risk"] })]),
    );
    expect(result).toEqual([]);
  });

  it("scores a shared category as 3", async () => {
    const [match] = await fieldOverlapProvider.score(
      ctx(risk(1, { risk_category: ["Strategic risk"] }), [risk(2, { risk_category: ["Strategic risk"] })]),
    );
    expect(match.score).toBe(3);
    expect(match.reasons).toEqual([
      { signal: "shared_category", weight: 3, detail: "Strategic risk" },
    ]);
  });

  it("matches categories case- and whitespace-insensitively", async () => {
    const [match] = await fieldOverlapProvider.score(
      ctx(risk(1, { risk_category: ["Strategic risk"] }), [risk(2, { risk_category: ["  STRATEGIC RISK "] })]),
    );
    expect(match.score).toBe(3);
  });

  it("scores a shared control as 2 and a shared assessment as 2", async () => {
    const [match] = await fieldOverlapProvider.score(
      ctx(
        risk(1, { controls_mapping: "AC-2", assessment_mapping: "Q7" }),
        [risk(2, { controls_mapping: "AC-2", assessment_mapping: "Q7" })],
      ),
    );
    expect(match.score).toBe(4);
    expect(match.reasons.map((r) => r.signal)).toEqual(["shared_control", "shared_assessment"]);
  });

  it('ignores the "0" sentinel in control and assessment mappings', async () => {
    const result = await fieldOverlapProvider.score(
      ctx(
        risk(1, { controls_mapping: "0", assessment_mapping: "0" }),
        [risk(2, { controls_mapping: "0", assessment_mapping: "0" })],
      ),
    );
    expect(result).toEqual([]);
  });

  it("ignores empty and whitespace-only text mappings", async () => {
    const result = await fieldOverlapProvider.score(
      ctx(risk(1, { controls_mapping: "  " }), [risk(2, { controls_mapping: "" })]),
    );
    expect(result).toEqual([]);
  });

  it("scores the same lifecycle phase as 2 and a shared project as 1", async () => {
    const [match] = await fieldOverlapProvider.score(
      ctx(
        risk(1, { ai_lifecycle_phase: "Deployment", projects: [4, 9] }),
        [risk(2, { ai_lifecycle_phase: "Deployment", projects: [9] })],
      ),
    );
    expect(match.score).toBe(3);
    expect(match.reasons).toEqual([
      { signal: "same_lifecycle_phase", weight: 2, detail: "Deployment" },
      { signal: "shared_project", weight: 1 },
    ]);
  });

  it("sums every matching signal", async () => {
    const [match] = await fieldOverlapProvider.score(
      ctx(
        risk(1, {
          risk_category: ["Strategic risk"],
          controls_mapping: "AC-2",
          assessment_mapping: "Q7",
          ai_lifecycle_phase: "Deployment",
          projects: [4],
        }),
        [
          risk(2, {
            risk_category: ["Strategic risk"],
            controls_mapping: "AC-2",
            assessment_mapping: "Q7",
            ai_lifecycle_phase: "Deployment",
            projects: [4],
          }),
        ],
      ),
    );
    expect(match.score).toBe(10);
  });

  it("returns every match, uncapped", async () => {
    const candidates = Array.from({ length: 30 }, (_, i) =>
      risk(i + 2, { risk_category: ["Strategic risk"] }),
    );
    const result = await fieldOverlapProvider.score(
      ctx(risk(1, { risk_category: ["Strategic risk"] }), candidates),
    );
    expect(result).toHaveLength(30);
  });

  it("never returns the subject itself, even if it appears in candidates", async () => {
    const subject = risk(1, { risk_category: ["Strategic risk"] });
    const result = await fieldOverlapProvider.score(ctx(subject, [subject, risk(2, { risk_category: ["Strategic risk"] })]));
    expect(result.map((c) => c.targetRiskId)).toEqual([2]);
  });
});
