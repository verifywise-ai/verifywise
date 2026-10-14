import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MODULE = path.resolve(__dirname, "..");
const SELF = path.resolve(__filename);

/** Every .ts file in the module, tests and fixtures included. */
function allTsFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts")) out.push(p);
    }
  };
  walk(MODULE);
  return out;
}

/** Shipped source: no tests, no fixtures. */
function sourceFiles(): string[] {
  return allTsFiles().filter(
    (f) => !f.endsWith(".test.ts") && !f.split(path.sep).includes("__fixtures__"),
  );
}

describe("module independence", () => {
  const files = sourceFiles();

  it("has source files to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("imports nothing from another VerifyWise module", () => {
    const forbidden =
      /from\s+["'][^"']*(EvalServer|AIGateway|EvaluationModule|GRSModule|IngestService|EvidentlyService)/;
    const offenders = files.filter((f) => forbidden.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("imports nothing from outside this module except node builtins", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
        const spec = m[1];
        if (spec.startsWith(".")) continue;
        if (spec.startsWith("node:")) continue;
        offenders.push(`${path.relative(MODULE, f)}: ${spec}`);
      }
    }
    // Plan 1 is pure computation: no third-party runtime dependency at all.
    expect(offenders).toEqual([]);
  });

  it("performs no I/O", () => {
    const io = /\b(sequelize|fetch|axios|https?\.request|fs\.(read|write)|process\.env)\b/;
    const offenders = files.filter((f) => io.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("never embeds forbidden vocabulary in source strings", () => {
    const forbidden = ["compliant", "certified", "bias-free"];
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8").toLowerCase();
      for (const word of forbidden) {
        if (src.includes(word)) offenders.push(`${path.relative(MODULE, f)}: ${word}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never invokes Python or EvalServer, in source or tests", () => {
    // The fixtures are committed JSON; nothing spawns a process or imports
    // from EvalServer at test time. Comments naming the Python oracle are
    // documentation, so this checks for invocation rather than for words.
    // This file is excluded: it spawns jest below to count test files.
    const invocation =
      /child_process|\bspawn\s*\(|\bexecSync\s*\(|\bexecFile\s*\(|require\(\s*["'][^"']*(EvalServer|venv)|from\s+["'][^"']*(EvalServer|venv)/;
    const offenders = allTsFiles()
      .filter((f) => path.resolve(f) !== SELF)
      .filter((f) => invocation.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(MODULE, f));
    expect(offenders).toEqual([]);
  });
});

describe("test suite is not vacuous", () => {
  it("lists a non-zero number of test files across the module", () => {
    // A prior package reported success while verifying nothing, because its
    // test path pointed at an empty directory.
    const out = execFileSync(
      "npx",
      ["jest", "--listTests", "--testPathIgnorePatterns=/tests/integration/", "services/biasAudit"],
      { cwd: path.resolve(MODULE, "../.."), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const count = out.trim().split("\n").filter(Boolean).length;
    expect(count).toBeGreaterThanOrEqual(6);
  });
});
