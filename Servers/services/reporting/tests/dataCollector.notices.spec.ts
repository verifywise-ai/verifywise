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

jest.mock("../../../utils/reporting.utils", () => ({
  getProjectRisksReportQuery: jest.fn().mockResolvedValue([]),
}));

import { createScopedDataCollector } from "../dataCollector";
import type { FrameworkTarget } from "../reportScope";

const isoTarget: FrameworkTarget = {
  projectId: 5,
  projectTitle: "AI Management System",
  isOrganizationalProject: true,
  frameworkId: 2,
  frameworkName: "ISO 42001",
  projectFrameworkId: 11,
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
