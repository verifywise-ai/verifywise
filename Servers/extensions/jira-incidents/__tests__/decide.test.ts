import { decideStatusAction, pickTransition } from "../decide";

const maps = {
  statusMapIn: { "1": "Open", "3": "Investigating", "4": "Closed" },
  statusMapOut: {
    Open: "1",
    Investigating: "3",
    Closed: "4",
    Mitigated: null,
    Suspended: null,
    "Emergency action": null,
  },
};
const base = {
  lastJiraStatusId: "1",
  lastVwStatus: "Open",
  jiraStatusId: "1",
  vwStatus: "Open",
  jiraChangedAt: null,
  vwChangedAt: null,
  linkedAt: null,
  ...maps,
};
const t = (iso: string) => new Date(iso);

describe("decideStatusAction", () => {
  it("does nothing when neither side changed", () => {
    expect(decideStatusAction(base)).toEqual({ action: "none" });
  });
  it("applies a Jira change to VerifyWise", () => {
    expect(decideStatusAction({ ...base, jiraStatusId: "3" })).toEqual({
      action: "to_vw",
      vwStatus: "Investigating",
      conflict: false,
    });
  });
  it("reports an unmapped Jira status", () => {
    expect(decideStatusAction({ ...base, jiraStatusId: "77" })).toEqual({
      action: "unmapped",
      jiraStatusId: "77",
    });
  });
  it("does nothing when the Jira change maps to the status VerifyWise already has", () => {
    expect(decideStatusAction({ ...base, lastJiraStatusId: "3", jiraStatusId: "1" })).toEqual({
      action: "none",
    });
  });
  it("applies a VerifyWise change to Jira", () => {
    expect(decideStatusAction({ ...base, vwStatus: "Closed" })).toEqual({
      action: "to_jira",
      jiraStatusId: "4",
      conflict: false,
    });
  });
  it("records Don't change Jira as a to_jira with no target", () => {
    expect(decideStatusAction({ ...base, vwStatus: "Mitigated" })).toEqual({
      action: "to_jira",
      jiraStatusId: null,
      conflict: false,
    });
  });
  it("lets the later change win when both changed", () => {
    const both = { ...base, jiraStatusId: "3", vwStatus: "Closed" };
    expect(
      decideStatusAction({
        ...both,
        jiraChangedAt: t("2026-10-14T10:00Z"),
        vwChangedAt: t("2026-10-14T11:00Z"),
      }),
    ).toEqual({ action: "to_jira", jiraStatusId: "4", conflict: true });
    expect(
      decideStatusAction({
        ...both,
        jiraChangedAt: t("2026-10-14T12:00Z"),
        vwChangedAt: t("2026-10-14T11:00Z"),
      }),
    ).toEqual({ action: "to_vw", vwStatus: "Investigating", conflict: true });
  });
  it("treats a missing time as oldest and gives a tie to Jira", () => {
    const both = { ...base, jiraStatusId: "3", vwStatus: "Closed" };
    expect(
      decideStatusAction({ ...both, jiraChangedAt: null, vwChangedAt: t("2026-10-14T11:00Z") })
        .action,
    ).toBe("to_jira");
    expect(
      decideStatusAction({
        ...both,
        jiraChangedAt: t("2026-10-14T11:00Z"),
        vwChangedAt: t("2026-10-14T11:00Z"),
      }).action,
    ).toBe("to_vw");
  });
  it("treats both sides changing to matching statuses as agreement, not a conflict", () => {
    expect(
      decideStatusAction({
        ...base,
        jiraStatusId: "4",
        vwStatus: "Closed",
        jiraChangedAt: t("2026-10-14T12:00Z"),
        vwChangedAt: t("2026-10-14T11:00Z"),
      }),
    ).toEqual({ action: "none" });
  });
  it("reports unmapped when Jira wins a conflict with an unmapped status", () => {
    expect(
      decideStatusAction({
        ...base,
        jiraStatusId: "77",
        vwStatus: "Closed",
        jiraChangedAt: t("2026-10-14T12:00Z"),
        vwChangedAt: t("2026-10-14T11:00Z"),
      }),
    ).toEqual({ action: "unmapped", jiraStatusId: "77" });
  });
  it("treats a link with no snapshot as unchanged on both sides", () => {
    expect(
      decideStatusAction({
        ...base,
        lastJiraStatusId: null,
        lastVwStatus: null,
        jiraStatusId: "3",
        vwStatus: "Closed",
      }),
    ).toEqual({ action: "none" });
  });
  it("does nothing when VerifyWise wins a conflict but Jira already holds its target", () => {
    expect(
      decideStatusAction({
        ...base,
        jiraStatusId: "3",
        vwStatus: "Closed",
        statusMapOut: { ...maps.statusMapOut, Closed: "3" },
        jiraChangedAt: t("2026-10-14T10:00Z"),
        vwChangedAt: t("2026-10-14T11:00Z"),
      }),
    ).toEqual({ action: "none" });
  });
  it("sends a null target to Jira when VerifyWise wins a conflict", () => {
    expect(
      decideStatusAction({
        ...base,
        jiraStatusId: "3",
        vwStatus: "Mitigated",
        jiraChangedAt: t("2026-10-14T10:00Z"),
        vwChangedAt: t("2026-10-14T11:00Z"),
      }),
    ).toEqual({ action: "to_jira", jiraStatusId: null, conflict: true });
  });
  it("gives a conflict with both change times null to VerifyWise", () => {
    expect(decideStatusAction({ ...base, jiraStatusId: "3", vwStatus: "Closed" })).toEqual({
      action: "to_vw",
      vwStatus: "Investigating",
      conflict: true,
    });
  });

  describe("an issue imported in an unmapped status (empty Jira snapshot)", () => {
    const unmapped = { ...base, lastJiraStatusId: "", jiraStatusId: "8" };
    it("applies a VerifyWise change to Jira without a conflict when Jira never moved", () => {
      expect(decideStatusAction({ ...unmapped, vwStatus: "Investigating" })).toEqual({
        action: "to_jira",
        jiraStatusId: "3",
        conflict: false,
      });
    });
    it("ignores a Jira status change made before the import", () => {
      expect(
        decideStatusAction({
          ...unmapped,
          vwStatus: "Investigating",
          jiraChangedAt: t("2026-10-14T09:00:00Z"),
          vwChangedAt: t("2026-10-14T11:00:00Z"),
          linkedAt: t("2026-10-14T10:00:00Z"),
        }),
      ).toEqual({ action: "to_jira", jiraStatusId: "3", conflict: false });
    });
    it("counts a Jira move just before the link was written as a move", () => {
      expect(
        decideStatusAction({
          ...unmapped,
          jiraStatusId: "4",
          vwStatus: "Investigating",
          jiraChangedAt: t("2026-10-14T09:59:30Z"),
          vwChangedAt: t("2026-10-14T11:00:00Z"),
          linkedAt: t("2026-10-14T10:00:00Z"),
        }),
      ).toEqual({ action: "to_jira", jiraStatusId: "3", conflict: true });
    });
    it("is a conflict when Jira moved too", () => {
      expect(
        decideStatusAction({
          ...unmapped,
          jiraStatusId: "4",
          vwStatus: "Investigating",
          jiraChangedAt: t("2026-10-14T10:00:00Z"),
          vwChangedAt: t("2026-10-14T11:00:00Z"),
          linkedAt: t("2026-10-14T09:00:00Z"),
        }),
      ).toEqual({ action: "to_jira", jiraStatusId: "3", conflict: true });
    });
    it("still re-checks the Jira status when VerifyWise did not change", () => {
      expect(decideStatusAction(unmapped)).toEqual({ action: "unmapped", jiraStatusId: "8" });
      expect(
        decideStatusAction({ ...unmapped, statusMapIn: { ...maps.statusMapIn, "8": "Mitigated" } }),
      ).toEqual({ action: "to_vw", vwStatus: "Mitigated", conflict: false });
    });
  });
});

describe("pickTransition", () => {
  const names = { from: "Done", to: "In Progress" };
  it("picks the transition whose target is the mapped status", () => {
    expect(
      pickTransition(
        [{ id: "11", name: "Start", toStatusId: "3", requiredFields: [] }],
        "3",
        names,
      ),
    ).toEqual({ ok: true, transitionId: "11" });
  });
  it("explains when no transition reaches the status", () => {
    expect(pickTransition([], "3", names)).toEqual({
      ok: false,
      reason: "No move from 'Done' to 'In Progress' in this workflow",
    });
  });
  it("explains when the transition needs fields", () => {
    expect(
      pickTransition(
        [{ id: "11", name: "Resolve", toStatusId: "3", requiredFields: ["Resolution"] }],
        "3",
        names,
      ),
    ).toEqual({
      ok: false,
      reason: "Moving to 'In Progress' needs a value for Resolution. Change the status in Jira.",
    });
  });
  it("prefers a clean transition to the same status over one that needs fields", () => {
    expect(
      pickTransition(
        [
          { id: "11", name: "Resolve", toStatusId: "3", requiredFields: ["Resolution"] },
          { id: "12", name: "Start", toStatusId: "3", requiredFields: [] },
        ],
        "3",
        names,
      ),
    ).toEqual({ ok: true, transitionId: "12" });
  });
});
