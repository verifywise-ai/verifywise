import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MODULE = path.resolve(__dirname, "..");
const SELF = path.resolve(__filename);
const SERVICES = path.resolve(MODULE, "..");
// The question set is this module's own data: the intake types and questions
// live beside the other LL 144 structure files, and the module cannot work
// without them, so an import resolving into this directory counts as inside.
const QUESTION_SET = path.resolve(MODULE, "../../structures/NYC-Local-Law-144");

// I/O-layer files, exempt by exact path from the "imports nothing from outside"
// and "performs no I/O" checks only. Each stays subject to every other check.
const IO_LAYER: Record<string, string> = {
  [path.join(MODULE, "profileService.ts")]:
    "persists profile versions through utils/biasAudit.utils and the db",
  [path.join(MODULE, "runService.ts")]:
    "reads the attested profile and stores the run through utils/biasAudit.utils and the db; hashes the upload with node:crypto",
  [path.join(MODULE, "stanceService.ts")]:
    "reads the run, its profile, answers and names through utils/biasAudit.utils to compose a stance; hashes the stored PDF with node:crypto",
  [path.join(MODULE, "serviceHelpers.ts")]:
    "reads a project through utils/biasAudit.utils for the services' shared project check",
  [path.join(MODULE, "projectAccess.ts")]:
    "asks utils/biasAudit.utils whether a user owns or belongs to a project",
  [path.join(MODULE, "generation", "gatewayClient.ts")]:
    "calls the Vercel AI Gateway with fetch and hashes each prompt with node:crypto",
  [path.join(MODULE, "generation", "generateCorpus.ts")]:
    "plans and runs a corpus: reads and appends records through utils/biasAudit.utils, calls the gateway client, hashes with node:crypto",
  [path.join(MODULE, "generation", "generationJob.ts")]:
    "runs corpus generation under BullMQ and marks a corpus failed through utils/biasAudit.utils after its last retry",
  [path.join(MODULE, "corpusService.ts")]:
    "reads and writes corpora through utils/biasAudit.utils, checks project access, and enqueues the generation job",
  [path.join(MODULE, "generation", "settings.ts")]:
    "reads the gateway's three deployment variables from process.env",
  [path.join(MODULE, "stance", "render.ts")]:
    "reads the ejs template from disk, renders on the shared browser from utils/pdfBrowser.utils, and writes the files and stance rows through utils and the db; hashes the PDF with node:crypto",
};

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

  it("imports no sibling service other than biasAudit", () => {
    // Amendment N: services/intakeFormLogic and its siblings are other modules.
    // Checked both by literal path and by where a relative import resolves.
    const sibling = /from\s+["'][^"']*services\/(?!biasAudit\b)\w/;
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      if (sibling.test(src)) offenders.push(`${path.relative(MODULE, f)}: services/ path`);
      for (const m of src.matchAll(/(?:from|import)\s+["'](\.[^"']*)["']/g)) {
        const target = path.resolve(path.dirname(f), m[1]);
        if (target.startsWith(SERVICES + path.sep) && !target.startsWith(MODULE + path.sep)) {
          offenders.push(`${path.relative(MODULE, f)}: ${m[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("imports nothing from outside this module, not even node builtins", () => {
    // Plan 1 is pure computation: every import is relative and resolves
    // inside this directory. A relative path that climbs out ("../../utils")
    // is as much an outside dependency as a package name.
    const offenders: string[] = [];
    for (const f of files.filter((x) => !(x in IO_LAYER))) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
        const spec = m[1];
        const target = spec.startsWith(".") ? path.resolve(path.dirname(f), spec) : "";
        const inside =
          target !== "" &&
          (target.startsWith(MODULE + path.sep) || target.startsWith(QUESTION_SET + path.sep));
        if (!inside) offenders.push(`${path.relative(MODULE, f)}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("performs no I/O", () => {
    const io = /\b(sequelize|fetch|axios|https?\.request|process\.env)\b|\bfs\.\w+/;
    const offenders = files.filter((f) => !(f in IO_LAYER) && io.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("never embeds forbidden vocabulary in source strings", () => {
    const forbidden = ["compliant", "certified", "passed", "bias-free", "audited"];
    // stance/vocabulary.ts is the one file that must spell the list out; it is
    // exempt by exact path and every other source file stays scanned.
    const VOCABULARY = path.join(MODULE, "stance", "vocabulary.ts");
    const offenders: string[] = [];
    for (const f of files.filter((x) => x !== VOCABULARY)) {
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
