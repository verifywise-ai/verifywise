jest.mock("../../../../database/db", () => ({ sequelize: {} }));

import { collectFacts } from "../facts";
import { flattenFrameworkRequirements, prepareSectionData, requirementRank } from "../prompts";

const rollup = (done: number, total: number) => ({
  total,
  done,
  overdue: 0,
  unassigned: 0,
  noEvidence: 0,
  statusBreakdown: {},
});
const req = (title: string) => ({
  title,
  status: "Waiting",
  owner: "Alice",
  dueDate: "2026-06-01",
  isDone: false,
  isOverdue: true,
});
// One framework, two use case pairings, same group title.
const section = {
  frameworks: [
    {
      frameworkName: "HIPAA",
      rollup: rollup(0, 2),
      groups: [
        {
          title: "Administrative",
          useCase: "Claims triage",
          rollup: rollup(0, 1),
          requirements: [req("Risk analysis")],
        },
        {
          title: "Administrative",
          useCase: "Patient chatbot",
          rollup: rollup(0, 1),
          requirements: [req("Risk analysis")],
        },
      ],
    },
  ],
};

describe("framework requirements keep the use case label", () => {
  it("tags flattened rows with the use case (fails at base: _group is the bare title)", () => {
    const rows = flattenFrameworkRequirements(section);
    expect(rows.map((r) => r._group)).toEqual([
      "Claims triage · Administrative",
      "Patient chatbot · Administrative",
    ]);
  });

  it("prints the use case on each group line and not-done line (fails at base: identical lines)", () => {
    const text = prepareSectionData("frameworkRequirements", section);
    expect(text).toContain("  Claims triage · Administrative:");
    expect(text).toContain("  Patient chatbot · Administrative:");
    expect(text).toContain("- HIPAA (Claims triage): Risk analysis");
    expect(text).toContain("- HIPAA (Patient chatbot): Risk analysis");
  });

  it("differs the facts labels between pairings (fails at base: labels identical)", () => {
    const f: any = collectFacts({
      metadata: { generatedAt: new Date(2026, 6, 22) },
      sections: { frameworkRequirements: section },
    } as any).sections.frameworkRequirements;
    expect(f.top1).toContain("HIPAA (Claims triage)");
    expect(f.top2).toContain("HIPAA (Patient chatbot)");
  });

  it("leaves labels unchanged when a group has no use case", () => {
    const plain = {
      frameworks: [
        {
          ...section.frameworks[0],
          groups: [{ ...section.frameworks[0].groups[0], useCase: undefined }],
        },
      ],
    };
    const text = prepareSectionData("frameworkRequirements", plain);
    expect(text).toContain("  Administrative:");
    expect(text).toContain("- HIPAA: Risk analysis");
  });

  it("names an untitled group under a use case instead of a trailing separator", () => {
    const untitled = {
      frameworks: [
        {
          ...section.frameworks[0],
          groups: [{ ...section.frameworks[0].groups[0], title: "" }],
        },
      ],
    };
    expect(flattenFrameworkRequirements(untitled)[0]._group).toBe("Claims triage · Untitled group");
  });

  it("prints none when no requirement is open (fails at base: empty list under the header)", () => {
    const done = {
      frameworks: [
        {
          frameworkName: "HIPAA",
          rollup: rollup(1, 1),
          groups: [
            {
              title: "A",
              rollup: rollup(1, 1),
              requirements: [{ ...req("x"), isDone: true, isOverdue: false }],
            },
          ],
        },
      ],
    };
    expect(prepareSectionData("frameworkRequirements", done)).toMatch(
      /Requirements not done[^\n]*\nnone$/,
    );
  });

  it("ranks a requirement whose owner has left like an unassigned one", () => {
    const departed = { ...req("x"), owner: "Unknown user" } as any;
    const none = { ...req("x"), owner: null } as any;
    expect(requirementRank(departed)).toBe(requirementRank(none));
  });
});
