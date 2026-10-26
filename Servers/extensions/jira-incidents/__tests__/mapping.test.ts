import {
  defaultSeverityFor,
  defaultSeverityMap,
  defaultStatusMapIn,
  defaultStatusMapOut,
  severityForPriority,
  unmappedStatuses,
  validateMaps,
} from "../mapping";

const statuses = [
  { id: "1", name: "To Do", categoryKey: "new" },
  { id: "2", name: "Backlog", categoryKey: "new" },
  { id: "3", name: "In Progress", categoryKey: "indeterminate" },
  { id: "4", name: "Done", categoryKey: "done" },
  { id: "5", name: "Weird", categoryKey: "undefined" },
];

describe("default mappings", () => {
  it("maps Jira statuses in by category", () => {
    expect(defaultStatusMapIn(statuses)).toEqual({
      "1": "Open",
      "2": "Open",
      "3": "Investigating",
      "4": "Closed",
      "5": "Open",
    });
  });
  it("maps VerifyWise statuses out to the first status of each category", () => {
    expect(defaultStatusMapOut(statuses)).toEqual({
      Open: "1",
      Investigating: "3",
      Closed: "4",
      Mitigated: null,
      Suspended: null,
      "Emergency action": null,
    });
  });
  it("leaves an out mapping empty when the workflow lacks the category", () => {
    expect(defaultStatusMapOut([{ id: "1", name: "To Do", categoryKey: "new" }]).Closed).toBeNull();
  });
  it("maps priorities by name", () => {
    expect(["Highest", "High", "Medium", "Low", "Lowest", "P1"].map(defaultSeverityFor)).toEqual([
      "Very serious",
      "Very serious",
      "Serious",
      "Minor",
      "Minor",
      "Serious",
    ]);
    expect(defaultSeverityMap([{ id: "9", name: "High" }])).toEqual({ "9": "Very serious" });
  });
  it("gives Serious for no priority or an unmapped one", () => {
    expect(severityForPriority({ "9": "Minor" }, null)).toBe("Serious");
    expect(severityForPriority({ "9": "Minor" }, "7")).toBe("Serious");
    expect(severityForPriority({ "9": "Minor" }, "9")).toBe("Minor");
  });
  it("lists statuses with no in mapping", () => {
    expect(unmappedStatuses(statuses, { "1": "Open" }).map((s) => s.id)).toEqual([
      "2",
      "3",
      "4",
      "5",
    ]);
  });
  it("validates map shapes and values", () => {
    expect(
      validateMaps({
        statusMapIn: { "1": "Open" },
        statusMapOut: { Open: "1", Closed: null },
        severityMap: { "9": "Minor" },
      }),
    ).toBeNull();
    expect(
      validateMaps({ statusMapIn: { "1": "Done" }, statusMapOut: {}, severityMap: {} }),
    ).toMatch(/status/i);
    expect(validateMaps({ statusMapIn: {}, statusMapOut: { Nope: "1" }, severityMap: {} })).toMatch(
      /status/i,
    );
    expect(
      validateMaps({ statusMapIn: {}, statusMapOut: {}, severityMap: { "9": "Huge" } }),
    ).toMatch(/severity/i);
    expect(validateMaps({ statusMapIn: [], statusMapOut: {}, severityMap: {} })).not.toBeNull();
  });
  it("rejects non-numeric Jira ids as map keys", () => {
    const proto = JSON.parse('{"__proto__":"Open"}');
    expect(validateMaps({ statusMapIn: proto, statusMapOut: {}, severityMap: {} })).toBe(
      "Invalid Jira status id '__proto__'",
    );
    expect(
      validateMaps({ statusMapIn: { constructor: "Open" }, statusMapOut: {}, severityMap: {} }),
    ).toBe("Invalid Jira status id 'constructor'");
    expect(
      validateMaps({ statusMapIn: {}, statusMapOut: {}, severityMap: { constructor: "Minor" } }),
    ).toBe("Invalid Jira priority id 'constructor'");
  });
  it("rejects a non-string severity value", () => {
    expect(validateMaps({ statusMapIn: {}, statusMapOut: {}, severityMap: { "9": 5 } })).toMatch(
      /severity/i,
    );
  });
  it("rejects null or array for statusMapOut and severityMap", () => {
    expect(validateMaps({ statusMapIn: {}, statusMapOut: null, severityMap: {} })).toBe(
      "Mappings must be objects",
    );
    expect(validateMaps({ statusMapIn: {}, statusMapOut: [], severityMap: {} })).toBe(
      "Mappings must be objects",
    );
    expect(validateMaps({ statusMapIn: {}, statusMapOut: {}, severityMap: null })).toBe(
      "Mappings must be objects",
    );
    expect(validateMaps({ statusMapIn: {}, statusMapOut: {}, severityMap: [] })).toBe(
      "Mappings must be objects",
    );
  });
});
