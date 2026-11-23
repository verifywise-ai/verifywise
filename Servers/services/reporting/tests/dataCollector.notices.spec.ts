/**
 * @fileoverview Tests for section notices and framework-driven project
 * narrowing.
 *
 * A framework-filtered report must not report other frameworks' project risks,
 * and a section that ends up with nothing must say so rather than vanish.
 *
 * @module tests/dataCollector.notices
 */

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));

// Every named import dataCollector takes from this module is stubbed, not just
// the one the first tests happened to reach: `collectAllData(["all"])` walks
// sections the narrower specs never request, and a missing export there is an
// unhelpful "x is not a function" rather than a real failure.
jest.mock("../../../utils/reporting.utils", () => ({
  getProjectRisksReportQuery: jest.fn().mockResolvedValue([]),
  getAssessmentReportQuery: jest.fn().mockResolvedValue([]),
  getComplianceReportQuery: jest.fn().mockResolvedValue([]),
  getClausesReportQuery: jest.fn().mockResolvedValue([]),
  getAnnexesReportQuery: jest.fn().mockResolvedValue([]),
  getClausesReportQueryISO27001: jest.fn().mockResolvedValue([]),
  getAnnexesReportQueryISO27001: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import * as frameworkRequirements from "../collectors/frameworkRequirements";
import logger from "../../../utils/logger/fileLogger";
import { createScopedDataCollector } from "../dataCollector";
import type { FrameworkTarget } from "../reportScope";
import {
  getClausesReportQuery,
  getAnnexesReportQuery,
  getClausesReportQueryISO27001,
  getAnnexesReportQueryISO27001,
} from "../../../utils/reporting.utils";

const isoTarget: FrameworkTarget = {
  projectId: 5,
  projectTitle: "AI Management System",
  isOrganizationalProject: true,
  frameworkId: 2,
  frameworkName: "ISO 42001",
  projectFrameworkId: 11,
};

const iso27001Target: FrameworkTarget = {
  projectId: 6,
  projectTitle: "Information Security Management System",
  isOrganizationalProject: true,
  frameworkId: 3,
  frameworkName: "ISO 27001",
  projectFrameworkId: 12,
};

/** The report-level entry a dropped plugin:/custom: selection always raises. */
const DROPPED_SELECTION = {
  sectionKey: "Framework selection",
  reason: "unresolved_framework",
};

describe("section notices", () => {
  it("records no_framework_target for a gated section no selected framework serves", async () => {
    // nistSubcategories needs framework 4; only an ISO 42001 pairing resolved.
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget], null, [
      "native:2",
    ]);

    const data = await collector.collectAllData(["nistSubcategories"]);

    expect(data.sections.nistSubcategories).toBeUndefined();
    expect(data.sectionNotices).toContainEqual({
      sectionKey: "nistSubcategories",
      reason: "no_framework_target",
    });
  });

  it("records unresolved_framework when only a plugin framework was selected", async () => {
    const collector = createScopedDataCollector(10, 1, "organization", [], null, ["plugin:soc2"]);

    const data = await collector.collectAllData(["compliance"]);

    expect(data.sectionNotices).toContainEqual({
      sectionKey: "compliance",
      reason: "unresolved_framework",
    });
  });

  it("emits no notices when nothing was filtered", async () => {
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget], null, []);

    const data = await collector.collectAllData(["clausesAndAnnexes"]);

    expect(data.sectionNotices).toEqual([]);
  });

  it("does not call an unfiltered gap unresolved_framework", async () => {
    // No selection was made at all, so nothing is pending the custom-framework
    // data path — the section is simply on no pairing in scope. Every caller
    // reaches the collector this way until the controllers thread a selection
    // in, so mislabelling here would be the common case, not the rare one.
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget], null, []);

    const data = await collector.collectAllData(["nistSubcategories"]);

    expect(data.sectionNotices).toContainEqual({
      sectionKey: "nistSubcategories",
      reason: "no_framework_target",
    });
  });

  it('emits no PER-SECTION notices for an "all" request that is filtered to nothing', async () => {
    // "all" is the legacy manual-report request meaning "whatever this estate
    // has". A notice per unserved section would turn every report into a wall
    // of them, so the rule is that SECTION notices fire only for a NAMED
    // section — and a filtered-to-nothing selection is the case most likely to
    // break it.
    //
    // The one report-level entry is not part of that wall and is deliberately
    // exempt: it says the SELECTION was dropped, not that some section was
    // empty, and an "all" report whose selection was dropped is precisely the
    // report that most needs to say so.
    const collector = createScopedDataCollector(10, 1, "organization", [], null, ["plugin:soc2"]);

    const data = await collector.collectAllData(["all"]);

    expect(data.sectionNotices).toEqual([DROPPED_SELECTION]);
    expect(data.sections.projectRisks).toBeUndefined();
  });

  it("records unresolved_framework for the non-native half of a mixed selection", async () => {
    // The bug this pins: ["native:2", "plugin:soc2"] narrowed to native [2],
    // resolved real ISO 42001 pairings, served clausesAndAnnexes in full — and
    // dropped soc2 without a word. Nothing was empty, so no per-section notice
    // could carry it, and the reader saw a complete-looking report covering
    // one of the two frameworks they picked.
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget], null, [
      "native:2",
      "plugin:soc2",
    ]);

    const data = await collector.collectAllData(["clausesAndAnnexes"]);

    // Served — the native half must not be collateral damage.
    expect(data.sections.clausesAndAnnexes).toBeDefined();
    expect(data.sectionNotices).toEqual([DROPPED_SELECTION]);
  });

  it("records unresolved_framework for a dropped custom: entry too", async () => {
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget], null, [
      "native:2",
      "custom:9",
    ]);

    const data = await collector.collectAllData(["clausesAndAnnexes"]);

    expect(data.sectionNotices).toEqual([DROPPED_SELECTION]);
  });

  it("raises no report-level notice for a purely native selection", async () => {
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget], null, [
      "native:2",
    ]);

    const data = await collector.collectAllData(["clausesAndAnnexes"]);

    expect(data.sectionNotices).toEqual([]);
  });

  it("does not blame plugin support for an unparseable entry alongside a native one", async () => {
    // "abc" is a typo, not a framework awaiting support. The renderer prints
    // "The selected framework is a plugin framework, which reports do not yet
    // cover" — false for a typo.
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget], null, [
      "native:2",
      "abc",
    ]);

    const data = await collector.collectAllData(["clausesAndAnnexes"]);

    expect(data.sectionNotices).toEqual([]);
  });
});

/**
 * ISO 42001 and ISO 27001 share the clausesAndAnnexes SECTION and no tables at
 * all. Both ids opened the same gate while the gate ran the ISO 42001 queries,
 * so an ISO 27001 pairing id matched zero rows in subclauses_iso /
 * annexcategories_iso: the report printed the ISO 42001 clause skeleton with
 * no statuses under an ISO 27001 heading, and raised NO notice — isoTargets
 * was non-empty, so the no_framework_target branch never ran.
 */
const e23Target: FrameworkTarget = {
  projectId: 7,
  projectTitle: "Model risk",
  isOrganizationalProject: false,
  frameworkId: 26,
  frameworkName: "OSFI E-23",
  projectFrameworkId: 13,
};

describe("frameworkRequirements section", () => {
  it("includes frameworkRequirements for native:26 alongside ISO", async () => {
    const collector = createScopedDataCollector(
      10,
      1,
      "organization",
      [isoTarget, e23Target],
      null,
      ["native:2", "native:26"],
    );

    const data = await collector.collectAllData(["frameworkRequirements", "clausesAndAnnexes"]);

    expect(data.sections.frameworkRequirements?.frameworks.map((f) => f.frameworkId)).toEqual([26]);
    expect(data.sections.clausesAndAnnexes).toBeDefined();
    expect(data.sectionNotices).not.toContainEqual(
      expect.objectContaining({ sectionKey: "frameworkRequirements" }),
    );
  });

  it("emits no_framework_target when only core frameworks are in scope and the section is requested", async () => {
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget], null, [
      "native:2",
    ]);

    const data = await collector.collectAllData(["frameworkRequirements"]);

    expect(data.sections.frameworkRequirements).toBeUndefined();
    expect(data.sectionNotices).toContainEqual({
      sectionKey: "frameworkRequirements",
      reason: "no_framework_target",
    });
  });

  it('collects the section for sections:["all"] when a bundled target is in scope', async () => {
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget, e23Target]);

    const data = await collector.collectAllData(["all"]);

    expect(data.sections.frameworkRequirements?.frameworks.map((f) => f.frameworkId)).toContain(26);
    expect(data.sectionNotices).not.toContainEqual(
      expect.objectContaining({ sectionKey: "frameworkRequirements" }),
    );
  });

  it('does not emit a notice for sections:["all"] with only core frameworks', async () => {
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget]);

    const data = await collector.collectAllData(["all"]);

    expect(data.sections.frameworkRequirements).toBeUndefined();
    expect(data.sectionNotices).not.toContainEqual(
      expect.objectContaining({ sectionKey: "frameworkRequirements" }),
    );
  });
});

describe("frameworkRequirements collection failures", () => {
  const soc2Target: FrameworkTarget = {
    projectId: 8,
    projectTitle: "Chatbot",
    isOrganizationalProject: false,
    frameworkId: 5,
    frameworkName: "SOC 2",
    projectFrameworkId: 14,
  };
  const orgE23Target: FrameworkTarget = {
    ...e23Target,
    projectTitle: "Organization",
    isOrganizationalProject: true,
  };
  const groupsFor = (t: FrameworkTarget) => ({
    frameworks: [
      {
        frameworkId: t.frameworkId,
        frameworkName: t.frameworkName,
        groups: [],
        rollup: {
          total: 0,
          done: 0,
          unassigned: 0,
          noEvidence: 0,
          overdue: 0,
          statusBreakdown: {},
        },
      },
    ],
  });

  afterEach(() => jest.restoreAllMocks());

  it("skips the pairing that throws, keeps the rest, and records a notice", async () => {
    jest
      .spyOn(frameworkRequirements, "collectFrameworkRequirements")
      .mockImplementation(async (t) => {
        if (t.frameworkId === 5) throw new Error("relation missing");
        return groupsFor(t) as never;
      });
    const collector = createScopedDataCollector(10, 1, "organization", [soc2Target, e23Target]);

    const data = await collector.collectAllData(["frameworkRequirements"]);

    expect(data.sections.frameworkRequirements?.frameworks.map((f) => f.frameworkId)).toEqual([26]);
    expect(data.sectionNotices).toContainEqual({
      sectionKey: "frameworkRequirements",
      reason: "collection_failed",
      detail: "SOC 2 for Chatbot",
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it("names just the framework for an organizational project", async () => {
    jest
      .spyOn(frameworkRequirements, "collectFrameworkRequirements")
      .mockRejectedValue(new Error("x"));
    const collector = createScopedDataCollector(10, 1, "organization", [orgE23Target]);

    const data = await collector.collectAllData(["frameworkRequirements"]);

    expect(data.sectionNotices).toContainEqual({
      sectionKey: "frameworkRequirements",
      reason: "collection_failed",
      detail: "OSFI E-23 (organization)",
    });
  });

  it("tells two same-named use cases apart by project id", async () => {
    jest
      .spyOn(frameworkRequirements, "collectFrameworkRequirements")
      .mockRejectedValue(new Error("x"));
    const twin = { ...soc2Target, projectId: 9, projectFrameworkId: 15 };
    const collector = createScopedDataCollector(10, 1, "organization", [soc2Target, twin]);

    const data = await collector.collectAllData(["frameworkRequirements"]);

    expect(data.sectionNotices.map((n) => n.detail)).toEqual([
      "SOC 2 for Chatbot (use case #8)",
      "SOC 2 for Chatbot (use case #9)",
    ]);
  });

  it("logs the error stack", async () => {
    jest
      .spyOn(frameworkRequirements, "collectFrameworkRequirements")
      .mockRejectedValue(new Error("boom"));
    const collector = createScopedDataCollector(10, 1, "organization", [soc2Target]);

    await collector.collectAllData(["frameworkRequirements"]);

    expect((logger.error as jest.Mock).mock.calls.at(-1)?.[0]).toContain("Error: boom");
  });

  it("leaves the section undefined and keeps one notice per pairing when all fail", async () => {
    jest
      .spyOn(frameworkRequirements, "collectFrameworkRequirements")
      .mockRejectedValue(new Error("x"));
    const collector = createScopedDataCollector(10, 1, "organization", [soc2Target, e23Target]);

    const data = await collector.collectAllData(["frameworkRequirements"]);

    expect(data.sections.frameworkRequirements).toBeUndefined();
    expect(data.sectionNotices.filter((n) => n.reason === "collection_failed")).toHaveLength(2);
  });
});

describe("clausesAndAnnexes framework routing", () => {
  beforeEach(() => jest.clearAllMocks());

  it("reads the ISO 27001 tables for an ISO 27001 pairing", async () => {
    const collector = createScopedDataCollector(10, 1, "organization", [iso27001Target]);

    await collector.collectAllData(["clausesAndAnnexes"]);

    expect(getClausesReportQueryISO27001).toHaveBeenCalledWith(12, 10);
    expect(getAnnexesReportQueryISO27001).toHaveBeenCalledWith(12, 10);
    expect(getClausesReportQuery).not.toHaveBeenCalled();
    expect(getAnnexesReportQuery).not.toHaveBeenCalled();
  });

  it("leaves the ISO 42001 pairing on the ISO 42001 queries", async () => {
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget]);

    await collector.collectAllData(["clausesAndAnnexes"]);

    expect(getClausesReportQuery).toHaveBeenCalledWith(11, 10);
    expect(getAnnexesReportQuery).toHaveBeenCalledWith(11, 10);
    expect(getClausesReportQueryISO27001).not.toHaveBeenCalled();
    expect(getAnnexesReportQueryISO27001).not.toHaveBeenCalled();
  });

  it("routes each pairing of a mixed ISO report to its own tables", async () => {
    // Template "ISO 42001 + 27001 Coverage" is exactly this: one report, both
    // pairings. It used to print the ISO 42001 skeleton twice.
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget, iso27001Target]);

    await collector.collectAllData(["clausesAndAnnexes"]);

    expect(getClausesReportQuery).toHaveBeenCalledWith(11, 10);
    expect(getClausesReportQueryISO27001).toHaveBeenCalledWith(12, 10);
    expect(getClausesReportQuery).toHaveBeenCalledTimes(1);
    expect(getClausesReportQueryISO27001).toHaveBeenCalledTimes(1);
  });
});

/**
 * The collector and resolveFrameworkTargets must agree on what "filtered"
 * means for every class of input, because they read the same selection from
 * opposite ends: reportScope decides which pairings exist, the collector
 * decides whether to narrow. When they disagree the report WIDENS — targets
 * resolve to nothing while project risks fall through to the whole
 * organization, so every framework section is empty beside every project's
 * risks.
 *
 * Rows 4 and 5 are the ones reportScope.ts:72 turns into zero targets: a
 * selection that was supplied but parsed to nothing resolvable.
 */
describe("what counts as a filtered report", () => {
  const rows: Array<{
    label: string;
    frameworkIds: string[] | null;
    /** What resolveFrameworkTargets hands back for this selection. */
    targets: FrameworkTarget[];
    outcome: "unfiltered" | "narrowed" | "nothing";
    reason?: "no_framework_target" | "unresolved_framework";
  }> = [
    {
      label: "null (no column value)",
      frameworkIds: null,
      targets: [isoTarget],
      outcome: "unfiltered",
    },
    { label: "empty array", frameworkIds: [], targets: [isoTarget], outcome: "unfiltered" },
    { label: "native:2", frameworkIds: ["native:2"], targets: [isoTarget], outcome: "narrowed" },
    {
      label: "plugin:soc2 (unsupported path)",
      frameworkIds: ["plugin:soc2"],
      targets: [],
      outcome: "nothing",
      reason: "unresolved_framework",
    },
    {
      label: "abc (invalid)",
      frameworkIds: ["abc"],
      targets: [],
      outcome: "nothing",
      reason: "no_framework_target",
    },
  ];

  it.each(rows)("$label -> $outcome", async ({ frameworkIds, targets, outcome, reason }) => {
    const { sequelize } = require("../../../database/db");
    (sequelize.query as jest.Mock).mockClear();

    const collector = createScopedDataCollector(10, 1, "organization", targets, null, frameworkIds);
    const data = await collector.collectAllData(["projectRisks"]);

    const scopedCall = (sequelize.query as jest.Mock).mock.calls.find(([sql]: [string]) =>
      sql.includes("scopedProjectIds"),
    );

    if (outcome === "nothing") {
      // The else branch assigns unconditionally, so an absent key is proof the
      // section was skipped rather than collected organization-wide.
      expect(data.sections.projectRisks).toBeUndefined();
      expect(scopedCall).toBeUndefined();
      // A plugin:/custom: selection also raises the report-level entry; an
      // unparseable one does not (it is a typo, not a pending framework).
      expect(data.sectionNotices).toEqual(
        reason === "unresolved_framework"
          ? [DROPPED_SELECTION, { sectionKey: "projectRisks", reason }]
          : [{ sectionKey: "projectRisks", reason }],
      );
    } else {
      expect(data.sections.projectRisks).toBeDefined();
      expect(data.sectionNotices).toEqual([]);
      if (outcome === "narrowed") {
        expect(scopedCall).toBeDefined();
        expect(scopedCall[1].replacements.scopedProjectIds).toEqual([5]);
      } else {
        expect(scopedCall).toBeUndefined();
      }
    }
  });

  it("does not blame plugin support for a garbage selection", async () => {
    // "unresolved_framework" makes the renderer print "The selected framework
    // is a plugin framework, which reports do not yet cover." That sentence is
    // false for "abc" — nothing about it is pending the custom-framework data
    // path — so the reason must stay no_framework_target.
    const collector = createScopedDataCollector(10, 1, "organization", [], null, ["abc"]);

    const data = await collector.collectAllData(["projectRisks", "clausesAndAnnexes"]);

    expect(data.sectionNotices).not.toContainEqual(
      expect.objectContaining({ reason: "unresolved_framework" }),
    );
    expect(data.sectionNotices).toContainEqual({
      sectionKey: "clausesAndAnnexes",
      reason: "no_framework_target",
    });
  });

  it("does not read the whole organization's risks for an invalid-only selection", async () => {
    // The bug this pins: isFiltered() keyed off the PARSED selection called
    // ["native:0"] unfiltered, scopedProjectIds() returned null, and
    // collectProjectRisks fell through to fetchOrganizationRisks() — every
    // project's risks in the tenant, in a report that named one framework.
    const { sequelize } = require("../../../database/db");
    (sequelize.query as jest.Mock).mockClear();

    const collector = createScopedDataCollector(10, 1, "organization", [], null, ["native:0"]);
    const data = await collector.collectAllData(["projectRisks"]);

    expect(data.sections.projectRisks).toBeUndefined();
    const riskQuery = (sequelize.query as jest.Mock).mock.calls.find(([sql]: [string]) =>
      sql.includes("projects_risks"),
    );
    expect(riskQuery).toBeUndefined();
  });
});

describe("project narrowing", () => {
  it("limits project risks to the projects carrying a selected framework", async () => {
    const { sequelize } = require("../../../database/db");
    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget], null, [
      "native:2",
    ]);

    await collector.collectAllData(["projectRisks"]);

    const scoped = (sequelize.query as jest.Mock).mock.calls.find(([sql]: [string]) =>
      sql.includes("pr.project_id = ANY(ARRAY[:scopedProjectIds]::INTEGER[])"),
    );
    expect(scoped).toBeDefined();
    expect(scoped[1].replacements.scopedProjectIds).toEqual([5]);
  });

  it("skips the section instead of building an empty ANY() predicate", async () => {
    // `= ANY('{}')` runs into Postgres empty-array type inference. This is a
    // live path: a native:1 template run against an ISO project resolves zero
    // targets.
    const { sequelize } = require("../../../database/db");
    (sequelize.query as jest.Mock).mockClear();

    const collector = createScopedDataCollector(10, 1, "organization", [], null, ["native:1"]);
    const data = await collector.collectAllData(["projectRisks"]);

    expect(data.sections.projectRisks).toBeUndefined();
    expect(data.sectionNotices).toContainEqual({
      sectionKey: "projectRisks",
      reason: "no_framework_target",
    });
    const anyCall = (sequelize.query as jest.Mock).mock.calls.find(([sql]: [string]) =>
      sql.includes("scopedProjectIds"),
    );
    expect(anyCall).toBeUndefined();
  });

  it("does not narrow entity-scoped sections", async () => {
    // A vendor is not "an ISO 42001 vendor". These entities carry no framework,
    // and dropping rows because their project happens to hold another one would
    // be invisible to the reader.
    const { sequelize } = require("../../../database/db");
    (sequelize.query as jest.Mock).mockClear();

    const collector = createScopedDataCollector(10, 1, "organization", [isoTarget], null, [
      "native:2",
    ]);
    await collector.collectAllData(["vendors"]);

    const narrowed = (sequelize.query as jest.Mock).mock.calls.find(([sql]: [string]) =>
      sql.includes("scopedProjectIds"),
    );
    expect(narrowed).toBeUndefined();
  });
});
