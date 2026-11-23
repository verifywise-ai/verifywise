import fs from "fs";
import path from "path";
import {
  PARAMETER_MESSAGES,
  parameterErrorMessages,
  parametersConfigErrors,
  reportKindErrors,
  validateReportParameters,
  validateRunInput,
} from "../reportParameters";
import { E23_PARAMETER_FIELDS } from "../e23/e23Parameters";

const config = { kind: "osfi_e23", fields: E23_PARAMETER_FIELDS };

// Malformed parameters_config values a template write must refuse.
const BAD_PARAMETER_CONFIGS: unknown[] = [
  "x",
  [],
  { fields: "x" },
  { fields: [null] },
  { fields: [{ key: "", label: "A", type: "text" }] },
  { fields: [{ key: "a", type: "text" }] },
  { fields: [{ key: "a", label: "A", type: "number" }] },
  { fields: [{ key: "a", label: "A", type: "select" }] },
  { fields: [{ key: "a", label: "A", type: "select", options: ["x"] }] },
  {
    fields: [
      { key: "a", label: "A", type: "text" },
      { key: "a", label: "B", type: "date" },
    ],
  },
  { kind: "made_up" },
];

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

describe("PARAMETER_MESSAGES", () => {
  // parameterErrorMessages only translates messages in this list; anything
  // else is sent in English. Every message the module can emit must be listed.
  it("lists every message literal the module emits", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "reportParameters.ts"), "utf8");
    const emitted = [...src.matchAll(/message:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(emitted.length).toBeGreaterThan(10);
    for (const m of emitted) expect(PARAMETER_MESSAGES).toContain(m);
  });

  it("lists every message produced by a broad set of bad inputs", () => {
    const bad = [
      undefined,
      [],
      "x",
      {},
      { unknown: 1 },
      { periodStart: "2026-13-40", periodEnd: "2099-01-01", isFinal: "yes" },
      { periodStart: "2026-05-01", periodEnd: "2026-04-01", institutionName: 5 },
      { institutionName: "x".repeat(300), audience: "press" },
    ];
    const messages = new Set<string>();
    for (const raw of bad) {
      for (const requirePeriod of [true, false]) {
        for (const e of validateRunInput(config, ["mrmFleet"], raw, {
          now,
          requirePeriod,
          scope: "project",
        }).errors)
          messages.add(e.message);
        for (const e of validateRunInput({}, ["mrmFleet"], raw, { now, requirePeriod }).errors)
          messages.add(e.message);
      }
    }
    for (const e of reportKindErrors({ kind: "made_up" })) messages.add(e.message);
    for (const cfg of BAD_PARAMETER_CONFIGS) {
      for (const e of parametersConfigErrors(cfg)) messages.add(e.message);
    }
    expect(messages.size).toBeGreaterThan(10);
    for (const m of messages) expect(PARAMETER_MESSAGES).toContain(m);
  });
});

describe("report kind and scope rules", () => {
  it("refuses an E-23 run that is not organization scope", () => {
    const { errors } = validateRunInput(config, [], valid, {
      now,
      requirePeriod: true,
      scope: "project",
    });
    expect(errors.map((e) => e.message)).toEqual([
      "an OSFI E-23 report covers the whole organization; choose organization scope",
    ]);
  });

  it("accepts an absent or known kind and refuses an unknown one", () => {
    expect(reportKindErrors(undefined)).toEqual([]);
    expect(reportKindErrors({})).toEqual([]);
    expect(reportKindErrors({ kind: "osfi_e23" })).toEqual([]);
    expect(reportKindErrors({ kind: "made_up" })).toEqual([
      { key: "kind", message: "unknown report kind: {kind}", params: { kind: "made_up" } },
    ]);
  });
});

describe("parametersConfigErrors", () => {
  const messages = (cfg: unknown) => parameterErrorMessages(parametersConfigErrors(cfg));

  it("accepts no config, an empty one, and the E-23 config", () => {
    expect(parametersConfigErrors(undefined)).toEqual([]);
    expect(parametersConfigErrors(null)).toEqual([]);
    expect(parametersConfigErrors({})).toEqual([]);
    expect(parametersConfigErrors({ kind: "osfi_e23", fields: [] })).toEqual([]);
    expect(parametersConfigErrors(config)).toEqual([]);
  });

  it("refuses a config that is not an object", () => {
    expect(messages("x")).toEqual(["parameters config must be an object"]);
    expect(messages([])).toEqual(["parameters config must be an object"]);
  });

  it("refuses fields that are not a list", () => {
    expect(messages({ fields: "x" })).toEqual(["parameters config fields must be a list"]);
    expect(messages({ fields: { key: "a" } })).toEqual(["parameters config fields must be a list"]);
  });

  it("names the field and the problem", () => {
    expect(messages({ fields: [null] })).toEqual(["parameter field 1 must be an object"]);
    expect(messages({ fields: [{ key: " ", label: "A", type: "text" }] })).toEqual([
      "parameter field 1 needs a key",
    ]);
    expect(messages({ fields: [{ key: "a", label: "", type: "text" }] })).toEqual([
      "parameter field a needs a label",
    ]);
    expect(messages({ fields: [{ key: "a", label: "A", type: "number" }] })).toEqual([
      "parameter field a has an unknown type: number",
    ]);
    expect(messages({ fields: [{ key: "a", label: "A" }] })).toEqual([
      "parameter field a has an unknown type: undefined",
    ]);
  });

  it("needs a list of value and label options on a select", () => {
    const select = (options: unknown) => ({
      fields: [{ key: "a", label: "A", type: "select", options }],
    });
    expect(messages(select(undefined))).toEqual(["parameter field a needs a list of options"]);
    expect(messages(select("x"))).toEqual(["parameter field a needs a list of options"]);
    expect(messages(select(["x"]))).toEqual([
      "parameter field a has an option without a text value and label",
    ]);
    expect(messages(select([{ value: "x" }]))).toEqual([
      "parameter field a has an option without a text value and label",
    ]);
    expect(messages(select([{ value: "x", label: "X" }]))).toEqual([]);
  });

  it("refuses a key used twice", () => {
    expect(
      messages({
        fields: [
          { key: "a", label: "A", type: "text" },
          { key: "a", label: "B", type: "date" },
        ],
      }),
    ).toEqual(["parameter field key a is used more than once"]);
  });

  it("still refuses an unknown kind", () => {
    expect(messages({ kind: "made_up", fields: [] })).toEqual(["unknown report kind: made_up"]);
  });

  it("reports every malformed config with at least one error", () => {
    for (const cfg of BAD_PARAMETER_CONFIGS) {
      expect(parametersConfigErrors(cfg).length).toBeGreaterThan(0);
    }
  });
});
