import { summarizeIsoStatus } from "../isoStatusSummary";

describe("summarizeIsoStatus", () => {
  it("is Implemented when every row is Implemented or Audited", () => {
    expect(summarizeIsoStatus([{ status: "Implemented" }, { status: "Audited" }])).toBe(
      "Implemented (2/2)",
    );
  });

  it("is Not started when no row has moved", () => {
    expect(summarizeIsoStatus([{ status: "Not started" }, { status: null }])).toBe(
      "Not started (0/2)",
    );
  });

  it("counts a row with no status (Unknown) as not started", () => {
    expect(summarizeIsoStatus([{ status: "Unknown" }, { status: "Not started" }])).toBe(
      "Not started (0/2)",
    );
  });

  it("is In progress with the done count otherwise", () => {
    expect(
      summarizeIsoStatus([
        { status: "Implemented" },
        { status: "Draft" },
        { status: "Not started" },
      ]),
    ).toBe("In progress (1/3)");
  });

  it("leaves out rows marked not applicable", () => {
    expect(
      summarizeIsoStatus([
        { status: "Implemented" },
        { status: "Not started", isApplicable: false },
      ]),
    ).toBe("Implemented (1/1)");
  });

  it("is a dash when nothing applies", () => {
    expect(summarizeIsoStatus([])).toBe("-");
    expect(summarizeIsoStatus([{ status: "Draft", isApplicable: false }])).toBe("-");
  });
});
