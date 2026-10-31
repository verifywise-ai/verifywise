import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

jest.mock("../visibility.utils", () => ({
  buildVisibilityFilterForEvidence: jest.fn(() => ({ clause: "", replacements: {} })),
}));

jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import { sequelize } from "../../database/db";
import { getAdoptedEvidenceFrameworksQuery, getEvidenceGapsQuery } from "../evidenceAi.utils";
import { logStructured } from "../logger/fileLogger";

const mockQuery = sequelize.query as jest.MockedFunction<any>;

/** Gap queries carry a fwType; the link breakdown logged before them does not. */
function gapQueries() {
  return mockQuery.mock.calls.filter((c: any) => c[1]?.replacements?.fwType);
}

/** The SQL and replacements of the call made for one framework. */
function callFor(fwType: string): { sql: string; replacements: any } {
  const call = mockQuery.mock.calls.find((c: any) => c[1]?.replacements?.fwType === fwType);
  if (!call) throw new Error(`no query issued for ${fwType}`);
  return {
    sql: (call[0] as string).replace(/\s+/g, " "),
    replacements: (call[1] as any).replacements,
  };
}

describe("getEvidenceGapsQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([[], 0]);
  });

  it("queries both frameworks when none is given, and only the one asked for otherwise", async () => {
    await getEvidenceGapsQuery(1);
    expect(gapQueries()).toHaveLength(2);

    jest.clearAllMocks();
    mockQuery.mockResolvedValue([[], 0]);
    await getEvidenceGapsQuery(1, "iso_42001");
    expect(gapQueries()).toHaveLength(1);
    expect(callFor("iso_42001").sql).toContain("annexcategories_struct_iso");
  });

  // Review: the panel counted every EU AI Act and ISO 42001 control for an
  // org that uses only one of them, so coverage read near zero.
  it("queries only the frameworks it is limited to", async () => {
    await getEvidenceGapsQuery(1, undefined, undefined, undefined, ["iso_42001"]);
    expect(gapQueries()).toHaveLength(1);
    expect(callFor("iso_42001").sql).toContain("annexcategories_struct_iso");
  });

  it("returns no gaps when limited to no frameworks", async () => {
    const gaps = await getEvidenceGapsQuery(1, undefined, undefined, undefined, []);
    expect(gaps).toEqual([]);
    expect(gapQueries()).toHaveLength(0);
  });

  it("ignores an unknown framework rather than building SQL for it", async () => {
    const gaps = await getEvidenceGapsQuery(1, "nist_ai_rmf");
    expect(mockQuery).not.toHaveBeenCalled();
    expect(gaps).toEqual([]);
  });

  it("logs how the organization's links break down, marking the ones it cannot count", async () => {
    mockQuery.mockResolvedValue([
      [
        {
          framework_type: "eu_ai_act",
          entity_type: "subcontrol",
          link_type: "evidence",
          links: 2,
          files: 2,
        },
        {
          framework_type: "eu_ai_act",
          entity_type: "subcontrol",
          link_type: "feedback",
          links: 1,
          files: 1,
        },
      ],
      0,
    ]);

    await getEvidenceGapsQuery(1, "eu_ai_act");

    const logged: string[] = (logStructured as jest.MockedFunction<any>).mock.calls.map((c: any) =>
      String(c[1]),
    );
    expect(logged.some((line) => line.includes("eu_ai_act/subcontrol/evidence=2 file(s)"))).toBe(
      true,
    );
    expect(
      logged.some((line) => line.includes("eu_ai_act/subcontrol/feedback=1 file(s) NOT COUNTED")),
    ).toBe(true);
  });

  it("counts EU links by entity type, mapping subcontrols up to their control template", async () => {
    await getEvidenceGapsQuery(1);
    const { sql } = callFor("eu_ai_act");

    // Template-id links are counted as they are...
    expect(sql).toContain("fel.entity_type = 'control'");
    // ...and per-project subcontrol links are mapped up through controls_eu.
    expect(sql).toContain("fel.entity_type = 'subcontrol'");
    expect(sql).toContain("ce.control_meta_id AS requirement_id");
    expect(sql).toContain("JOIN subcontrols_eu sc ON sc.id = fel.entity_id");
    expect(sql).toContain("JOIN controls_eu ce ON ce.id = sc.control_id");
  });

  it("counts only evidence links, never feedback files", async () => {
    await getEvidenceGapsQuery(1);
    for (const fw of ["eu_ai_act", "iso_42001"]) {
      // one filter per link source, so a feedback file can enter through neither
      expect(callFor(fw).sql.match(/fel.link_type = 'evidence'/g)).toHaveLength(2);
    }
  });

  it("leaves assessment links out of the control counts — they are a separate axis", async () => {
    await getEvidenceGapsQuery(1);
    expect(callFor("eu_ai_act").sql).not.toContain("'assessment'");
  });

  it("maps ISO annex category links up to their struct id, and leaves subclauses out", async () => {
    await getEvidenceGapsQuery(1);
    const { sql } = callFor("iso_42001");

    expect(sql).toContain("fel.entity_type = 'annex_category'");
    expect(sql).toContain("ac.annexcategory_meta_id AS requirement_id");
    expect(sql).toContain("JOIN annexcategories_iso ac ON ac.id = fel.entity_id");
    expect(sql).not.toContain("'subclause'");
  });

  it("scopes every link source to the organization and the framework", async () => {
    await getEvidenceGapsQuery(7);
    for (const fw of ["eu_ai_act", "iso_42001"]) {
      const { sql, replacements } = callFor(fw);
      expect(replacements.organizationId).toBe(7);
      // one org + framework filter per link source, and both sources are unioned
      expect(sql.match(/fel.organization_id = :organizationId/g)).toHaveLength(2);
      expect(sql.match(/fel.framework_type = :fwType/g)).toHaveLength(2);
      expect(sql).toContain("UNION ALL");
    }
  });

  it("restricts counted files to the project when projectId is given", async () => {
    await getEvidenceGapsQuery(1, "eu_ai_act", ["D", "F"], 7);
    const { sql, replacements } = callFor("eu_ai_act");

    expect(sql).toContain("pf.project_id = :projectId");
    expect(replacements.projectId).toBe(7);
  });

  it("passes a null project filter when no project is given", async () => {
    await getEvidenceGapsQuery(1, "eu_ai_act");
    expect(callFor("eu_ai_act").replacements.projectId).toBeNull();
  });

  it("classifies each requirement from its evidence and adequate counts", async () => {
    mockQuery.mockResolvedValue([
      [
        { control_id: 1, evidence_count: 0, adequate_count: 0 },
        { control_id: 2, evidence_count: 3, adequate_count: 0 },
        { control_id: 3, evidence_count: 3, adequate_count: 1 },
      ],
      0,
    ]);

    const gaps = await getEvidenceGapsQuery(1, "eu_ai_act");

    expect(gaps.map((g: any) => g.gap_type)).toEqual(["no_evidence", "low_quality", "adequate"]);
  });

  it("passes the low grades through to the adequacy filter", async () => {
    await getEvidenceGapsQuery(1, "eu_ai_act", ["C", "D", "F"]);
    expect(callFor("eu_ai_act").replacements.lowGrades).toEqual(["C", "D", "F"]);
  });
});

describe("getAdoptedEvidenceFrameworksQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("maps the organization's adopted framework ids to evidence frameworks", async () => {
    mockQuery.mockResolvedValueOnce([[{ framework_id: 2 }, { framework_id: 3 }]]);
    const adopted = await getAdoptedEvidenceFrameworksQuery(9);
    expect(adopted).toEqual(["iso_42001"]);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("projects_frameworks");
    expect(options.replacements).toMatchObject({ organizationId: 9 });
  });

  it("returns both when both are adopted, in a stable order", async () => {
    mockQuery.mockResolvedValueOnce([[{ framework_id: 2 }, { framework_id: 1 }]]);
    expect(await getAdoptedEvidenceFrameworksQuery(9)).toEqual(["eu_ai_act", "iso_42001"]);
  });
});
