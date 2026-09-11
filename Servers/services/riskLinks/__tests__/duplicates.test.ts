import {
  findDuplicateCandidates,
  DUPLICATE_SIMILARITY_THRESHOLD,
  MAX_DUPLICATE_RESULTS,
  MAX_DUPLICATE_SCAN,
} from "../duplicates";
import { getDuplicateScanRowsQuery, DuplicateScanRow } from "../../../utils/riskLink.utils";

jest.mock("../../../utils/riskLink.utils", () => ({
  getDuplicateScanRowsQuery: jest.fn(),
}));

const mockQuery = getDuplicateScanRowsQuery as jest.Mock;

const row = (overrides: Partial<DuplicateScanRow> & { id: number }): DuplicateScanRow => ({
  risk_name: "Risk",
  risk_description: null,
  risk_category: ["Operational risk"],
  ai_lifecycle_phase: "Monitoring & maintenance",
  risk_owner: 5,
  projects: [7],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("findDuplicateCandidates", () => {
  it("reports two near-identical risks in the same category", async () => {
    // 8 shared of 15 union = 0.53.
    mockQuery.mockResolvedValue([
      row({
        id: 1,
        risk_name: "Vendor assessment overdue",
        risk_description:
          "Vendor security assessments stay incomplete past the review deadline.",
      }),
      row({
        id: 2,
        risk_name: "Late vendor security review",
        risk_description:
          "Vendor reviews miss the assessment deadline and stay incomplete.",
      }),
    ]);

    const report = await findDuplicateCandidates(1);

    expect(report.scanned).toBe(2);
    expect(report.truncated).toBe(false);
    expect(report.candidates).toHaveLength(1);
    const [candidate] = report.candidates;
    expect(candidate.risk_a.id).toBe(1);
    expect(candidate.risk_b.id).toBe(2);
    expect(candidate.similarity).toBe(0.53);
    expect(candidate.similarity).toBeGreaterThanOrEqual(DUPLICATE_SIMILARITY_THRESHOLD);
    expect(candidate.shared_tokens).toContain("vendor");
    expect(candidate.also_shares).toEqual(
      expect.arrayContaining(["category: Operational risk", "project"]),
    );
  });

  it("ignores risks sharing a category and a project but no wording", async () => {
    mockQuery.mockResolvedValue([
      row({
        id: 1,
        risk_name: "On-call rota gaps",
        risk_description: "Night shifts lack coverage.",
      }),
      row({
        id: 2,
        risk_name: "Budget forecast variance",
        risk_description: "Quarterly spend exceeds planned limits.",
      }),
    ]);

    const report = await findDuplicateCandidates(1);

    expect(report.compared).toBe(1);
    expect(report.candidates).toHaveLength(0);
  });

  it("never compares risks in disjoint categories, even with identical text", async () => {
    const text = {
      risk_name: "Vendor assessment overdue",
      risk_description: "Vendor security assessments stay incomplete.",
    };
    mockQuery.mockResolvedValue([
      row({ id: 1, risk_category: ["Operational risk"], ...text }),
      row({ id: 2, risk_category: ["Data privacy risk"], ...text }),
    ]);

    const report = await findDuplicateCandidates(1);

    expect(report.compared).toBe(0);
    expect(report.candidates).toHaveLength(0);
  });

  it("skips a risk whose tokens all filter out without dividing by zero", async () => {
    mockQuery.mockResolvedValue([
      row({ id: 1, risk_name: "AI on", risk_description: null }),
      row({
        id: 2,
        risk_name: "Vendor assessment overdue",
        risk_description: "Vendor security assessments stay incomplete.",
      }),
    ]);

    const report = await findDuplicateCandidates(1);

    expect(report.candidates).toHaveLength(0);
  });

  it("keeps risk_a as the lower id and sorts by similarity descending", async () => {
    // (10,30): 8/15 = 0.53. (20,30): 4/11 = 0.36. (10,20): 4/12 = 0.33.
    // Rows arrive scrambled to prove the order is computed, not inherited.
    mockQuery.mockResolvedValue([
      row({
        id: 20,
        risk_name: "Vendor security assessment",
        risk_description: "Assessment vendor review.",
      }),
      row({
        id: 30,
        risk_name: "Vendor assessment overdue",
        risk_description:
          "Vendor security assessments stay incomplete past the review deadline.",
      }),
      row({
        id: 10,
        risk_name: "Late vendor security review",
        risk_description:
          "Vendor reviews miss the assessment deadline and stay incomplete.",
      }),
    ]);

    const report = await findDuplicateCandidates(1);

    expect(report.candidates).toHaveLength(3);
    for (const candidate of report.candidates) {
      expect(candidate.risk_a.id).toBeLessThan(candidate.risk_b.id);
    }
    expect(report.candidates.map((c) => c.similarity)).toEqual([0.53, 0.36, 0.33]);
    expect(report.candidates.map((c) => [c.risk_a.id, c.risk_b.id])).toEqual([
      [10, 30],
      [20, 30],
      [10, 20],
    ]);
  });

  it("caps the list and marks truncated, via both cap paths", async () => {
    const identical = (id: number) =>
      row({
        id,
        risk_name: "Vendor assessment overdue",
        risk_description: "Vendor security assessments stay incomplete.",
      });
    mockQuery.mockResolvedValue(Array.from({ length: 60 }, (_, i) => identical(i + 1)));

    const capped = await findDuplicateCandidates(1);

    expect(capped.candidates).toHaveLength(MAX_DUPLICATE_RESULTS);
    expect(capped.truncated).toBe(true);

    // Scan-cap path: exactly MAX_DUPLICATE_SCAN rows in, each in its own
    // category so nothing is even compared — still truncated, honestly.
    mockQuery.mockResolvedValue(
      Array.from({ length: MAX_DUPLICATE_SCAN }, (_, i) =>
        row({ id: i + 1, risk_category: [`Category ${i + 1}`] }),
      ),
    );

    const scanCapped = await findDuplicateCandidates(1);

    expect(scanCapped.scanned).toBe(MAX_DUPLICATE_SCAN);
    expect(scanCapped.compared).toBe(0);
    expect(scanCapped.candidates).toHaveLength(0);
    expect(scanCapped.truncated).toBe(true);
  });
});
