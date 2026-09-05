import { describe, it, expect } from "@jest/globals";
import {
  buildToolsRoadmap,
  ROADMAP_API_VERSION,
  ADVISOR_ROADMAP_READ_ROLES,
  PLAN_CLAIMED_TOOL_TOTAL,
  RENAMED_TOOLS,
} from "../roadmapService";
import { ROADMAP_MANIFEST } from "../manifest";

describe("roadmap manifest integrity", () => {
  it("contains 265 sequentially numbered, uniquely named entries", () => {
    expect(ROADMAP_MANIFEST).toHaveLength(265);
    ROADMAP_MANIFEST.forEach((entry, index) => {
      expect(entry.id).toBe(index + 1);
    });
    expect(new Set(ROADMAP_MANIFEST.map((e) => e.name)).size).toBe(ROADMAP_MANIFEST.length);
  });

  it("splits into 47 baseline (phase 0) and 218 new (phase 1) tools", () => {
    expect(ROADMAP_MANIFEST.filter((e) => e.phase === 0)).toHaveLength(47);
    expect(ROADMAP_MANIFEST.filter((e) => e.phase === 1)).toHaveLength(218);
  });

  it("marks exactly the agent_-prefixed tools as write tools", () => {
    for (const entry of ROADMAP_MANIFEST) {
      expect(entry.kind).toBe(entry.name.startsWith("agent_") ? "write" : "read");
    }
  });

  it("records the plan's claimed total of 263 separately from the 265 catalogue rows", () => {
    expect(PLAN_CLAIMED_TOOL_TOTAL).toBe(263);
  });
});

describe("buildToolsRoadmap", () => {
  it("marks every tool as planned when nothing is implemented", () => {
    const roadmap = buildToolsRoadmap(new Set());
    expect(roadmap.version).toBe(ROADMAP_API_VERSION);
    expect(roadmap.summary).toEqual({
      planned: 265,
      implemented: 0,
      renamed: 0,
      missing: 265,
      extraImplemented: 0,
      percentComplete: 0,
    });
    expect(roadmap.tools.every((t) => t.status === "planned")).toBe(true);
    expect(roadmap.extraTools).toEqual([]);
  });

  it("marks implemented tools and computes summary/domain/phase rollups", () => {
    const roadmap = buildToolsRoadmap(new Set(["fetch_risks", "agent_create_risk"]));

    expect(roadmap.summary.implemented).toBe(2);
    expect(roadmap.summary.missing).toBe(263);
    expect(roadmap.summary.percentComplete).toBe(1);

    const riskDomain = roadmap.domains.find((d) => d.label === "Risk");
    expect(riskDomain).toBeDefined();
    expect(riskDomain!.implemented).toBe(2);
    expect(riskDomain!.total).toBeGreaterThan(2);

    const baseline = roadmap.phases.find((p) => p.id === 0);
    const phaseOne = roadmap.phases.find((p) => p.id === 1);
    expect(baseline!.total).toBe(47);
    expect(baseline!.implemented).toBe(1);
    expect(phaseOne!.total).toBe(218);
    expect(phaseOne!.implemented).toBe(1);
  });

  it("exposes plan capability phases (2-7) without tool counts", () => {
    const roadmap = buildToolsRoadmap(new Set());
    expect(roadmap.phases).toHaveLength(8);
    for (const phase of roadmap.phases.filter((p) => p.id >= 2)) {
      expect(phase.total).toBe(0);
      expect(phase.implemented).toBe(0);
      expect(phase.percentComplete).toBeNull();
      expect(phase.title.length).toBeGreaterThan(0);
    }
  });

  it("surfaces plan/code renames as status 'renamed' instead of editing the manifest", () => {
    const [planName, shippedName] = Object.entries(RENAMED_TOOLS)[0];

    const notShipped = buildToolsRoadmap(new Set());
    expect(notShipped.tools.find((t) => t.name === planName)!.status).toBe("planned");

    const shipped = buildToolsRoadmap(new Set([shippedName]));
    const entry = shipped.tools.find((t) => t.name === planName)!;
    expect(entry.status).toBe("renamed");
    expect(entry.implementedAs).toBe(shippedName);
    expect(shipped.summary.renamed).toBe(1);
    // The shipped rename target must not double-count as an unplanned extra.
    expect(shipped.extraTools.find((t) => t.name === shippedName)).toBeUndefined();
  });

  it("lists implemented-but-unplanned tools as names-only extras", () => {
    const roadmap = buildToolsRoadmap(new Set(["totally_unplanned_tool"]));
    expect(roadmap.extraTools).toEqual([
      { name: "totally_unplanned_tool", status: "unplanned_implemented" },
    ]);
    expect(roadmap.summary.extraImplemented).toBe(1);
  });

  it("never includes write-action implementation details in any entry", () => {
    const forbiddenKeys = [
      "schema",
      "parameters",
      "toolDefinition",
      "handler",
      "execute",
      "file",
      "input_params",
      "inputParams",
    ];
    const roadmap = buildToolsRoadmap(new Set(ROADMAP_MANIFEST.map((e) => e.name)));
    const serialized = JSON.stringify(roadmap);
    for (const key of forbiddenKeys) {
      expect(serialized).not.toContain(`"${key}"`);
    }
  });
});

describe("ADVISOR_ROADMAP_READ_ROLES", () => {
  it("grants read access to Admin, Editor, Reviewer and Auditor", () => {
    expect(ADVISOR_ROADMAP_READ_ROLES).toEqual(["Admin", "Editor", "Reviewer", "Auditor"]);
  });
});
