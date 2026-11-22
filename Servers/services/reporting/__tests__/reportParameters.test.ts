import { validateReportParameters } from "../reportParameters";
import { E23_PARAMETER_FIELDS } from "../e23/e23Parameters";

const config = { kind: "osfi_e23", fields: E23_PARAMETER_FIELDS };
const now = new Date("2026-11-22T12:00:00Z");

const valid = {
  periodStart: "2026-01-01",
  periodEnd: "2026-09-30",
  institutionName: "Example Bank",
  accountableExecutiveName: "A Person",
  accountableExecutiveTitle: "Chief Risk Officer",
  preparedByName: "B Person",
  preparedByTitle: "Analyst",
  audience: "osfi",
};

const run = (raw: unknown, requirePeriod = true) =>
  validateReportParameters(config, raw, { now, requirePeriod });
const keys = (raw: unknown, requirePeriod = true) =>
  run(raw, requirePeriod).errors.map((e) => e.key);

describe("validateReportParameters", () => {
  it("accepts a valid set and trims strings", () => {
    const r = run({ ...valid, institutionName: "  Example Bank  ", isFinal: true });
    expect(r.errors).toEqual([]);
    expect(r.value.institutionName).toBe("Example Bank");
    expect(r.value.isFinal).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(run(null).errors.length).toBeGreaterThan(0);
    expect(run([]).errors.length).toBeGreaterThan(0);
    expect(run("x").errors.length).toBeGreaterThan(0);
  });

  it("rejects unknown keys", () => {
    const r = run({ ...valid, bogus: "x" });
    expect(r.errors).toEqual([
      { key: "bogus", message: "unknown report parameter: {key}", params: { key: "bogus" } },
    ]);
  });

  it.each(E23_PARAMETER_FIELDS.filter((f) => f.required).map((f) => f.key))(
    "requires %s",
    (key) => {
      const missing: any = { ...valid };
      delete missing[key];
      expect(keys(missing)).toEqual([key]);
      expect(keys({ ...valid, [key]: "   " })).toEqual([key]);
    },
  );

  it("uses the {label} is required message", () => {
    const e = run({ ...valid, institutionName: "" }).errors[0];
    expect(e.message).toBe("{label} is required");
    expect(e.params).toEqual({ label: "Institution name" });
  });

  it("allows optional fields to be blank", () => {
    expect(run({ ...valid, scopeNote: "" }).errors).toEqual([]);
  });

  it("rejects a 201-character name", () => {
    const e = run({ ...valid, institutionName: "a".repeat(201) }).errors[0];
    expect(e.key).toBe("institutionName");
    expect(e.message).toBe("{label} must be at most {max} characters");
    expect(e.params).toEqual({ label: "Institution name", max: 200 });
  });

  it("rejects a 1001-character note", () => {
    expect(keys({ ...valid, scopeNote: "a".repeat(1001) })).toEqual(["scopeNote"]);
  });

  it("rejects an impossible date", () => {
    expect(keys({ ...valid, periodStart: "2026-02-30" })).toContain("periodStart");
    expect(keys({ ...valid, periodStart: "2026-2-3" })).toContain("periodStart");
  });

  it("rejects a period end in the future", () => {
    expect(keys({ ...valid, periodEnd: "2026-11-23" })).toEqual(["periodEnd"]);
  });

  it("accepts a period end of today (UTC)", () => {
    expect(run({ ...valid, periodEnd: "2026-11-22" }).errors).toEqual([]);
  });

  it("rejects an end before the start", () => {
    expect(keys({ ...valid, periodStart: "2026-06-01", periodEnd: "2026-05-31" })).toEqual([
      "periodEnd",
    ]);
  });

  it("rejects a select value outside the options", () => {
    expect(keys({ ...valid, audience: "regulator" })).toEqual(["audience"]);
  });

  it("rejects a non-boolean boolean", () => {
    expect(keys({ ...valid, isFinal: "yes" })).toEqual(["isFinal"]);
  });

  it("rejects a non-string text value", () => {
    expect(keys({ ...valid, institutionName: 5 })).toEqual(["institutionName"]);
  });

  describe("schedules (requirePeriod false)", () => {
    const { periodStart, periodEnd, ...noPeriod } = valid;
    void periodStart;
    void periodEnd;

    it("accepts parameters without a period", () => {
      expect(run(noPeriod, false).errors).toEqual([]);
    });

    it("rejects a period if sent", () => {
      const r = run({ ...noPeriod, periodStart: "2026-01-01" }, false);
      expect(r.errors).toEqual([
        {
          key: "periodStart",
          message: "the reporting period is set at run time for schedules",
        },
      ]);
    });
  });
});
