import { main, parseArgs, USAGE } from "../cli";
import { EVAL_CASES } from "../cases";
import type { EvalCase } from "../types";

function io() {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    out: (text: string) => lines.push(text),
    err: (text: string) => errors.push(text),
  };
}

describe("parseArgs", () => {
  it("runs every case by default", () => {
    expect(parseArgs([])).toEqual({
      ok: true,
      options: { cases: null, json: false, live: null, record: null, trace: null, help: false },
    });
  });

  it("takes a list of case ids", () => {
    expect(parseArgs(["--cases", "clean-record,broken-url"])).toMatchObject({
      ok: true,
      options: { cases: ["clean-record", "broken-url"] },
    });
  });

  it("takes --json and --help", () => {
    expect(parseArgs(["--json"])).toMatchObject({ ok: true, options: { json: true } });
    expect(parseArgs(["--help"])).toMatchObject({ ok: true, options: { help: true } });
  });

  it("takes a live run with its vendor", () => {
    expect(
      parseArgs([
        "--live",
        "--org",
        "3",
        "--vendor",
        "Acme",
        "--website",
        "acme.com",
        "--provides",
        "Payroll software",
        "--record",
        "out.json",
        "--trace",
        "trace.json",
      ]),
    ).toEqual({
      ok: true,
      options: {
        cases: null,
        json: false,
        help: false,
        record: "out.json",
        trace: "trace.json",
        live: { orgId: 3, vendor: "Acme", website: "acme.com", provides: "Payroll software" },
      },
    });
  });

  describe("the answers of the vendor's scorecard", () => {
    const LIVE_ARGS = ["--live", "--org", "3", "--vendor", "Acme"];

    it("takes the three answers for a live run", () => {
      expect(
        parseArgs([
          ...LIVE_ARGS,
          "--data-sensitivity",
          "Financial data",
          "--business-criticality",
          "High (critical to core services or products)",
          "--regulatory-exposure",
          "GDPR (EU)",
        ]),
      ).toMatchObject({
        ok: true,
        options: {
          live: {
            orgId: 3,
            vendor: "Acme",
            scorecard: {
              data_sensitivity: "Financial data",
              business_criticality: "High (critical to core services or products)",
              regulatory_exposure: "GDPR (EU)",
            },
          },
        },
      });
    });

    it("takes only the answers that are given", () => {
      const parsed = parseArgs([...LIVE_ARGS, "--regulatory-exposure", "None"]);

      expect(parsed.ok && parsed.options.live?.scorecard).toEqual({ regulatory_exposure: "None" });
    });

    it("has no scorecard when none of the three is given", () => {
      const parsed = parseArgs(LIVE_ARGS);

      expect(parsed.ok && parsed.options.live).not.toHaveProperty("scorecard");
    });

    it.each([
      [["--data-sensitivity", "Financial data"], /--data-sensitivity needs --live/],
      [["--business-criticality", "Low (vendor supports non-core functions)"], /needs --live/],
      [["--regulatory-exposure", "None"], /--regulatory-exposure needs --live/],
      [
        [...LIVE_ARGS, "--data-sensitivity", "Secret"],
        /--data-sensitivity must be one of: None, Internal only, /,
      ],
      [[...LIVE_ARGS, "--business-criticality", "high"], /--business-criticality must be one of/],
      [[...LIVE_ARGS, "--regulatory-exposure", "GDPR"], /--regulatory-exposure must be one of/],
    ])("refuses %j", (argv, message) => {
      const parsed = parseArgs(argv);

      expect(parsed.ok).toBe(false);
      expect(!parsed.ok && parsed.message).toMatch(message);
    });

    it("tells in the usage what the options are for", () => {
      expect(USAGE).toContain("--data-sensitivity");
      expect(USAGE).toContain("--business-criticality");
      expect(USAGE).toContain("--regulatory-exposure");
    });
  });

  it.each([
    [["--nope"], /unknown option/i],
    [["--cases"], /needs a value/i],
    [["--live"], /--org/],
    [["--live", "--org", "x", "--vendor", "A"], /--org must be a whole number/i],
    [["--live", "--org", "1"], /--vendor/],
    [["--record", "out.json"], /--record needs --live/i],
    [["--trace", "trace.json"], /--trace needs --live/i],
    [
      ["--live", "--org", "1", "--vendor", "A", "--cases", "x"],
      /--live runs a vendor, not --cases/,
    ],
  ])("refuses %j", (argv, message) => {
    const parsed = parseArgs(argv);

    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.message).toMatch(message);
  });
});

describe("main", () => {
  it("prints the report of the cases and exits 0 when nothing needs a person", async () => {
    const output = io();

    const code = await main([], { ...output });

    expect(code).toBe(0);
    expect(output.lines.join("\n")).toMatch(/38 cases, 0 regressions, 0 fixed gaps/);
    expect(output.lines.join("\n")).toContain("breach-two-publishers");
  });

  it("runs only the cases that are named", async () => {
    const output = io();

    const code = await main(["--cases", "clean-record"], { ...output });

    expect(code).toBe(0);
    const text = output.lines.join("\n");
    expect(text).toContain("clean-record");
    expect(text).not.toContain("breach-two-publishers");
    expect(text).toMatch(/1 case, 0 regressions/);
  });

  it("refuses a case that does not exist, and says which ones do", async () => {
    const output = io();

    const code = await main(["--cases", "nope"], { ...output });

    expect(code).toBe(2);
    expect(output.errors.join("\n")).toContain('Unknown case "nope"');
    expect(output.errors.join("\n")).toContain("clean-record");
  });

  it("exits 1 when a target is missed that is not a declared gap", async () => {
    const broken: EvalCase = {
      ...EVAL_CASES[0],
      targets: { ...EVAL_CASES[0].targets, maxKept: 0 },
    };
    const output = io();

    const code = await main([], { ...output, cases: [broken] });

    expect(code).toBe(1);
    expect(output.lines.join("\n")).toContain("REGRESSION maxKept");
  });

  it("exits 1 when a declared gap is met, so that it gets removed", async () => {
    const stale: EvalCase = { ...EVAL_CASES[0], gaps: { maxKept: 24 } };
    const output = io();

    const code = await main([], { ...output, cases: [stale] });

    expect(code).toBe(1);
    expect(output.lines.join("\n")).toContain("FIXED maxKept");
  });

  it("prints the reports as JSON for a tool to read", async () => {
    const output = io();

    await main(["--json", "--cases", "clean-record"], { ...output });

    const parsed = JSON.parse(output.lines.join("\n"));
    expect(parsed).toEqual([
      expect.objectContaining({
        id: "clean-record",
        missed: [],
        score: expect.objectContaining({ kept: 0 }),
      }),
    ]);
  });

  it("prints the usage", async () => {
    const output = io();

    expect(await main(["--help"], { ...output })).toBe(0);
    expect(output.lines.join("\n")).toBe(USAGE);
  });

  it("prints the mistake and the usage for arguments it does not understand", async () => {
    const output = io();

    expect(await main(["--nope"], { ...output })).toBe(2);
    expect(output.errors.join("\n")).toMatch(/unknown option/i);
    expect(output.errors.join("\n")).toContain(USAGE);
  });

  describe("a live run", () => {
    const LIVE = [
      "--live",
      "--org",
      "3",
      "--vendor",
      "Acme",
      "--website",
      "acme.com",
      "--provides",
      "Payroll",
    ];

    it("runs the vendor through the live runner and prints what came of it", async () => {
      const output = io();
      const runLive = jest.fn(async () => ({
        run: await import("../runCase").then(({ runEvalCase }) => runEvalCase(EVAL_CASES[8])),
        recording: null,
      }));

      const code = await main(LIVE, { ...output, runLive });

      expect(runLive).toHaveBeenCalledWith(
        { orgId: 3, vendor: "Acme", website: "acme.com", provides: "Payroll" },
        false,
      );
      expect(code).toBe(0);
      expect(output.lines.join("\n")).toContain("clean-record");
    });

    it("prints the confidence and the credibility of each finding that stayed", async () => {
      const output = io();
      const { runEvalCase } = await import("../runCase");
      const run = await runEvalCase(EVAL_CASES[0]);
      const runLive = jest.fn(async () => ({ run, recording: null }));

      await main(LIVE, { ...output, runLive });

      expect(output.lines.join("\n")).toMatch(
        /^1\. \[security_incidents\] .+, confidence high, credibility high: /m,
      );
    });

    it("writes the recording to the file that was asked for", async () => {
      const output = io();
      const written: Array<[string, string]> = [];
      const recording = EVAL_CASES[8].recording;
      const runLive = jest.fn(async () => ({
        run: await import("../runCase").then(({ runEvalCase }) => runEvalCase(EVAL_CASES[8])),
        recording,
      }));

      const code = await main([...LIVE, "--record", "recorded.json"], {
        ...output,
        runLive,
        writeFile: (path, text) => written.push([path, text]),
      });

      expect(code).toBe(0);
      expect(runLive).toHaveBeenCalledWith(expect.anything(), true);
      expect(written).toHaveLength(1);
      expect(written[0][0]).toBe("recorded.json");
      expect(JSON.parse(written[0][1])).toMatchObject({
        vendor: { name: "Acme", website: "acme.com", provides: "Payroll" },
        recording: { steps: recording.steps },
      });
    });

    it("writes into the recording that the routine work was done, when the live run did it", async () => {
      const output = io();
      const written: Array<[string, string]> = [];
      const { runEvalCase } = await import("../runCase");
      const run = await runEvalCase(EVAL_CASES[8]);
      const runLive = jest.fn(async () => ({
        run: { ...run, evalCase: { ...run.evalCase, gather: true } },
        recording: EVAL_CASES[8].recording,
      }));

      await main([...LIVE, "--record", "recorded.json"], {
        ...output,
        runLive,
        writeFile: (path, text) => written.push([path, text]),
      });

      expect(JSON.parse(written[0][1])).toMatchObject({ gather: true });
    });

    it("writes into the recording that the categories were researched by one loop each, when the live run did it", async () => {
      const output = io();
      const written: Array<[string, string]> = [];
      const { runEvalCase } = await import("../runCase");
      const run = await runEvalCase(EVAL_CASES[8]);
      const runLive = jest.fn(async () => ({
        run: { ...run, evalCase: { ...run.evalCase, gather: true, perCategory: true } },
        recording: EVAL_CASES[8].recording,
      }));

      await main([...LIVE, "--record", "recorded.json"], {
        ...output,
        runLive,
        writeFile: (path, text) => written.push([path, text]),
      });

      expect(JSON.parse(written[0][1])).toMatchObject({ gather: true, perCategory: true });
    });

    it("writes into the recording that the findings were checked by the verifier, when the live run did it", async () => {
      const output = io();
      const written: Array<[string, string]> = [];
      const { runEvalCase } = await import("../runCase");
      const run = await runEvalCase(EVAL_CASES[8]);
      const runLive = jest.fn(async () => ({
        run: { ...run, evalCase: { ...run.evalCase, verifier: true } },
        recording: EVAL_CASES[8].recording,
      }));

      await main([...LIVE, "--record", "recorded.json"], {
        ...output,
        runLive,
        writeFile: (path, text) => written.push([path, text]),
      });

      expect(JSON.parse(written[0][1])).toMatchObject({ verifier: true });
    });

    it("leaves the flag out of a recording of a run that did not do it", async () => {
      const output = io();
      const written: Array<[string, string]> = [];
      const { runEvalCase } = await import("../runCase");
      const runLive = jest.fn(async () => ({
        run: await runEvalCase(EVAL_CASES[8]),
        recording: EVAL_CASES[8].recording,
      }));

      await main([...LIVE, "--record", "recorded.json"], {
        ...output,
        runLive,
        writeFile: (path, text) => written.push([path, text]),
      });

      expect(JSON.parse(written[0][1])).not.toHaveProperty("gather");
      expect(JSON.parse(written[0][1])).not.toHaveProperty("perCategory");
      expect(JSON.parse(written[0][1])).not.toHaveProperty("verifier");
    });

    it("passes the scorecard to the live runner, and writes it into the recording", async () => {
      const output = io();
      const written: Array<[string, string]> = [];
      const runLive = jest.fn(async () => ({
        run: await import("../runCase").then(({ runEvalCase }) => runEvalCase(EVAL_CASES[8])),
        recording: EVAL_CASES[8].recording,
      }));

      const code = await main(
        [...LIVE, "--data-sensitivity", "Financial data", "--record", "recorded.json"],
        { ...output, runLive, writeFile: (path, text) => written.push([path, text]) },
      );

      expect(code).toBe(0);
      expect(runLive).toHaveBeenCalledWith(
        expect.objectContaining({ scorecard: { data_sensitivity: "Financial data" } }),
        true,
      );
      expect(JSON.parse(written[0][1]).vendor).toEqual({
        name: "Acme",
        website: "acme.com",
        provides: "Payroll",
        scorecard: { data_sensitivity: "Financial data" },
      });
    });

    it("writes the trace of the run to the file that was asked for", async () => {
      const output = io();
      const written: Array<[string, string]> = [];
      const run = await import("../runCase").then(({ runEvalCase }) => runEvalCase(EVAL_CASES[8]));
      const runLive = jest.fn(async () => ({ run, recording: null }));

      const code = await main([...LIVE, "--trace", "trace.json"], {
        ...output,
        runLive,
        writeFile: (path, text) => written.push([path, text]),
      });

      expect(code).toBe(0);
      expect(runLive).toHaveBeenCalledWith(expect.anything(), false);
      expect(written).toHaveLength(1);
      expect(written[0][0]).toBe("trace.json");
      expect(JSON.parse(written[0][1])).toEqual(JSON.parse(JSON.stringify(run.trace)));
      expect(output.lines.join("\n")).toContain("Trace written to trace.json");
    });

    it("says what went wrong when the live run fails, and exits 1", async () => {
      const output = io();

      const code = await main(LIVE, {
        ...output,
        runLive: async () => {
          throw new Error("The organization has no LLM key");
        },
      });

      expect(code).toBe(1);
      expect(output.errors.join("\n")).toContain("The organization has no LLM key");
    });
  });
});
