import { buildIdsJql, buildImportJql, escapeJqlString, formatJqlDate, importCutoff } from "../jql";

describe("jql", () => {
  it("escapes quotes and backslashes in a label", () => {
    expect(escapeJqlString('ai "risk"\\x')).toBe('ai \\"risk\\"\\\\x');
  });
  it("formats the cut-off in the service account's time zone, rounded down", () => {
    const at = new Date("2026-10-14T10:05:59Z");
    expect(formatJqlDate(at, "UTC")).toBe("2026-10-14 10:05");
    expect(formatJqlDate(at, "Pacific/Kiritimati")).toBe("2026-10-15 00:05");
    expect(formatJqlDate(at, "America/Los_Angeles")).toBe("2026-10-14 03:05");
  });
  it("falls back to UTC for an unknown time zone", () => {
    expect(formatJqlDate(new Date("2026-10-14T10:05:00Z"), "Mars/Base")).toBe("2026-10-14 10:05");
  });
  it("cuts off at import_from or ten minutes before the last check, whichever is later", () => {
    const importFrom = new Date("2026-10-14T09:00:00Z");
    expect(importCutoff(importFrom, null)).toEqual(importFrom);
    expect(importCutoff(importFrom, new Date("2026-10-14T09:05:00Z"))).toEqual(importFrom);
    expect(importCutoff(importFrom, new Date("2026-10-14T12:00:00Z"))).toEqual(
      new Date("2026-10-14T11:50:00Z"),
    );
  });
  it("builds the import query from ids, with an optional quoted label", () => {
    expect(
      buildImportJql({
        projectId: "10000",
        issueTypeId: "10001",
        label: null,
        cutoff: "2026-10-14 10:05",
      }),
    ).toBe(
      'project = 10000 AND issuetype = 10001 AND created >= "2026-10-14 10:05" ORDER BY created ASC',
    );
    expect(
      buildImportJql({
        projectId: "10000",
        issueTypeId: "10001",
        label: 'ai "x"',
        cutoff: "2026-10-14 10:05",
      }),
    ).toBe(
      'project = 10000 AND issuetype = 10001 AND labels = "ai \\"x\\"" AND created >= "2026-10-14 10:05" ORDER BY created ASC',
    );
  });
  it("refuses non-numeric project or issue type ids", () => {
    expect(() =>
      buildImportJql({
        projectId: "1 OR 1=1",
        issueTypeId: "1",
        label: null,
        cutoff: "2026-10-14 10:05",
      }),
    ).toThrow(/project/);
  });
  it("builds an id list query and refuses non-numeric ids", () => {
    expect(buildIdsJql(["1", "22"])).toBe("id in (1,22)");
    expect(() => buildIdsJql(["1)"])).toThrow();
  });
});
