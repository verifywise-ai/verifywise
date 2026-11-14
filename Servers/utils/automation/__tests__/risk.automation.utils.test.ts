import { describe, it, expect } from "@jest/globals";
import {
  buildBulkRiskReplacements,
  buildRiskReplacements,
  buildRiskUpdateReplacements,
} from "../risk.automation.utils";

const risk = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  risk_name: `Risk ${id}`,
  risk_owner: 3,
  owner_name: "Ann Old",
  risk_approval: 8,
  approver_name: "Pat Approver",
  risk_category: ["Strategic risk"],
  severity: "Minor",
  ...extra,
});

/** The date is built per call; compare everything else. */
const withoutDate = (r: Record<string, any>) => {
  const { date_and_time: _date, ...rest } = r;
  return rest;
};

describe("buildBulkRiskReplacements", () => {
  it("uses the single-risk replacements for one risk", () => {
    const before = risk(1);
    const after = risk(1, { risk_owner: 7, owner_name: "Bo New" });

    expect(withoutDate(buildBulkRiskReplacements("risk_updated", [{ before, after }]))).toEqual(
      withoutDate(buildRiskUpdateReplacements(before, after)),
    );
    expect(
      withoutDate(buildBulkRiskReplacements("risk_deleted", [{ before, after: before }])),
    ).toEqual(withoutDate(buildRiskReplacements(before)));
  });

  it("summarises a bulk owner change: names, shared owner, one line per risk", () => {
    const changes = [1, 2, 3].map((id) => ({
      before: risk(
        id,
        id === 2 ? { risk_owner: 4, owner_name: "Cy Other", severity: "Major" } : {},
      ),
      after: risk(id, {
        risk_owner: 7,
        owner_name: "Bo New",
        ...(id === 2 ? { severity: "Major" } : {}),
      }),
    }));

    const r = buildBulkRiskReplacements("risk_updated", changes);

    expect(r["risk.name"]).toBe("3 risks: Risk 1, Risk 2, Risk 3");
    expect(r["old_risk.name"]).toBe("3 risks: Risk 1, Risk 2, Risk 3");
    expect(r["risk.id"]).toBe("");
    expect(r["old_risk.id"]).toBe("");
    // Shared by every risk after the edit.
    expect(r["risk.owner"]).toBe("Bo New");
    expect(r["risk.category"]).toBe("Strategic risk");
    expect(r["risk.approver"]).toBe("Pat Approver");
    // Differs between risks.
    expect(r["risk.severity"]).toBe("");
    expect(r["old_risk.owner"]).toBe("");
    expect(r.changes_summary).toBe(
      [
        "• Risk 1: Owner: Ann Old → Bo New",
        "• Risk 2: Owner: Cy Other → Bo New",
        "• Risk 3: Owner: Ann Old → Bo New",
      ].join("\n"),
    );
    expect(typeof r.date_and_time).toBe("string");
    expect(r.date_and_time).not.toBe("");
  });

  it("decides an owner change on ids, not names, and falls back to the id", () => {
    const changes = [
      // Two different users who share a full name.
      {
        before: risk(1, { risk_owner: 3, owner_name: "Sam Lee" }),
        after: risk(1, { risk_owner: 9, owner_name: "Sam Lee" }),
      },
      // The new owner's name lookup missed.
      { before: risk(2), after: risk(2, { risk_owner: 11, owner_name: "" }) },
    ];

    const r = buildBulkRiskReplacements("risk_updated", changes);

    expect(r.changes_summary).toBe(
      ["• Risk 1: Owner: Sam Lee → Sam Lee", "• Risk 2: Owner: Ann Old → 11"].join("\n"),
    );
  });

  it("writes a category line for a bulk category change", () => {
    const changes = [1, 2].map((id) => ({
      before: risk(id, { risk_category: id === 1 ? [] : ["Operational risk"] }),
      after: risk(id, { risk_category: ["Strategic risk", "Compliance risk"] }),
    }));

    const r = buildBulkRiskReplacements("risk_updated", changes);

    expect(r["risk.category"]).toBe("Strategic risk, Compliance risk");
    expect(r.changes_summary).toBe(
      [
        "• Risk 1: Category: (empty) → Strategic risk, Compliance risk",
        "• Risk 2: Category: Operational risk → Strategic risk, Compliance risk",
      ].join("\n"),
    );
  });

  it("lists at most 10 names and 50 change lines", () => {
    const changes = Array.from({ length: 55 }, (_, i) => ({
      before: risk(i + 1),
      after: risk(i + 1, { risk_owner: 7, owner_name: "Bo New" }),
    }));

    const r = buildBulkRiskReplacements("risk_updated", changes);

    expect(r["risk.name"]).toBe(
      `55 risks: ${Array.from({ length: 10 }, (_, i) => `Risk ${i + 1}`).join(", ")} and 45 more`,
    );
    const lines = r.changes_summary.split("\n");
    expect(lines).toHaveLength(51);
    expect(lines[49]).toBe("• Risk 50: Owner: Ann Old → Bo New");
    expect(lines[50]).toBe("• and 5 more");
  });

  it("summarises a bulk archive without update-only variables", () => {
    const changes = [risk(1), risk(2, { owner_name: "Cy Other", risk_owner: 4 })].map((r) => ({
      before: r,
      after: r,
    }));

    const r = buildBulkRiskReplacements("risk_deleted", changes);

    expect(r["risk.name"]).toBe("2 risks: Risk 1, Risk 2");
    expect(r["risk.id"]).toBe("");
    expect(r["risk.owner"]).toBe("");
    expect(r["risk.category"]).toBe("Strategic risk");
    expect(r).not.toHaveProperty("changes_summary");
    expect(r).not.toHaveProperty("old_risk.name");
  });
});
