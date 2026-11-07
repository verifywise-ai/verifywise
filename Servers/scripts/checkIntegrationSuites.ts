/**
 * Integration suite CI guard
 *
 * Fails when a test file under tests/integration/ runs in no CI step, or in
 * more than one. A suite reaches CI only when some step's jest pattern selects
 * it, and nothing noticed when none did: in November 2026, 50 of the 112 files
 * ran in no CI job, and two of them had broken unnoticed.
 *
 * Every jest run in .github/workflows/backend-checks.yml is dry-run with
 * `--listTests` and the arguments CI gives it (the npm script's, then the
 * step's), so a file counts as run exactly when Jest would run it there.
 * `--listTests` returns before globalSetup, so no database is touched. A step
 * whose `if: matrix.<key> == '<value>'` matches no combination of its job's
 * matrix never runs, so it covers nothing.
 *
 * Run: cd Servers && npm run check:integration-suites
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import YAML from "yamljs";

const SERVERS_DIR = path.resolve(__dirname, "..");
const WORKFLOW_FILE = path.resolve(SERVERS_DIR, "..", ".github", "workflows", "backend-checks.yml");
const INTEGRATION_DIR = "tests/integration";

/** Jest's default test file names: `*.test.ts`, `*.spec.js` and so on. */
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

export interface ExclusionGroup {
  /** Why these files run in no CI step. */
  reason: string;
  /** Servers-relative paths, such as "tests/integration/foo.test.ts". */
  files: string[];
}

/**
 * Integration test files that run in no CI step on purpose, with the reason.
 * The guard fails when a listed file no longer exists or runs in a step after
 * all, so delete an entry as soon as its files are wired in.
 */
export const EXCLUDED: ExclusionGroup[] = [
  {
    reason:
      "The risk-links matrix entry that runs them is on branch fix/ci-risklinks-suites, which has " +
      "not merged yet. That branch also fixes the fixtures of riskLinks.recomputeEngine and " +
      "riskLinks.vendorRelated, which fail on develop. Delete this group when it merges.",
    files: [
      "tests/integration/riskLinks.agentLink.test.ts",
      "tests/integration/riskLinks.coverage.test.ts",
      "tests/integration/riskLinks.crossEntity.test.ts",
      "tests/integration/riskLinks.debugSweep.test.ts",
      "tests/integration/riskLinks.dismissReason.test.ts",
      "tests/integration/riskLinks.dismissals.test.ts",
      "tests/integration/riskLinks.duplicates.test.ts",
      "tests/integration/riskLinks.graph.test.ts",
      "tests/integration/riskLinks.hierarchy.test.ts",
      "tests/integration/riskLinks.modelCandidates.test.ts",
      "tests/integration/riskLinks.recomputeEngine.test.ts",
      "tests/integration/riskLinks.sharedProjects.test.ts",
      "tests/integration/riskLinks.staleInheritance.test.ts",
      "tests/integration/riskLinks.vendorCandidates.test.ts",
      "tests/integration/riskLinks.vendorInsights.test.ts",
      "tests/integration/riskLinks.vendorPanel.test.ts",
      "tests/integration/riskLinks.vendorRelated.test.ts",
    ],
  },
];

/** One jest command in a workflow step. */
export interface JestRun {
  /** "<job id> / <step name>", as the guard reports it. */
  label: string;
  /** What jest receives in CI: the npm script's arguments, then the step's. */
  args: string[];
}

export interface CoverageReport {
  /** Integration test files that no CI step runs and EXCLUDED does not list. */
  unrun: string[];
  /** Integration test files that more than one CI step runs, with those steps. */
  runTwice: { file: string; runs: string[] }[];
  /** EXCLUDED entries to fix or delete, each with what is wrong with it. */
  badExclusions: string[];
}

type YamlMap = Record<string, unknown>;

const isMap = (value: unknown): value is YamlMap =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asMap = (value: unknown): YamlMap => (isMap(value) ? value : {});

const toPosix = (file: string): string => file.split(path.sep).join("/");

const SHELL_SPECIAL = new Set([..."$`;&|<>()*?[{"]);

/**
 * Splits a command into words as bash would, for the plain forms that
 * package.json scripts and workflow steps use: bare words, '...', and "..."
 * without expansions. It throws on anything bash would expand or treat as an
 * operator (`$`, backticks, globs, `;`, `&&`, `|`, redirects) rather than
 * guess what the command does.
 */
export function shellWords(command: string): string[] {
  const words: string[] = [];
  let word: string | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (/\s/.test(c)) {
      if (word !== null) words.push(word);
      word = null;
    } else if (c === "'") {
      const end = command.indexOf("'", i + 1);
      if (end === -1) throw new Error(`Unterminated ' in: ${command}`);
      word = (word ?? "") + command.slice(i + 1, end);
      i = end;
    } else if (c === '"') {
      let text = "";
      for (i += 1; command[i] !== '"'; i += 1) {
        if (i >= command.length) throw new Error(`Unterminated " in: ${command}`);
        if (command[i] === "$" || command[i] === "`") {
          throw new Error(`Cannot read ${command[i]} in: ${command}`);
        }
        if (command[i] === "\\" && i + 1 < command.length && '"\\$`'.includes(command[i + 1])) {
          i += 1;
        }
        text += command[i];
      }
      word = (word ?? "") + text;
    } else if (c === "\\") {
      if (i + 1 >= command.length) throw new Error(`Trailing \\ in: ${command}`);
      i += 1;
      word = (word ?? "") + command[i];
    } else if (SHELL_SPECIAL.has(c) || (word === null && (c === "#" || c === "~"))) {
      throw new Error(`Cannot read ${c} in: ${command}`);
    } else {
      word = (word ?? "") + c;
    }
  }
  if (word !== null) words.push(word);
  return words;
}

/** A command word that runs jest: the jest bin, or node with jest's bin file. */
const JEST_COMMAND = /(^|[\s/;&|(])jest(\.js)?(?=$|[\s;&|)])/;

/**
 * The arguments a package.json script gives jest, or null when the script
 * runs no jest. Throws for a jest script it cannot read, such as one that
 * chains commands.
 */
export function jestArgsOf(script: string): string[] | null {
  if (!JEST_COMMAND.test(script)) return null;
  const words = shellWords(script);
  const bin = words.findIndex((w) => w === "jest" || /(^|\/)jest\/bin\/jest(\.js)?$/.test(w));
  const launcher = words.slice(0, Math.max(bin, 0));
  const plainLaunch =
    launcher.length === 0 ||
    (launcher[0] === "node" && launcher.slice(1).every((w) => w.startsWith("-")));
  if (bin === -1 || !plainLaunch) throw new Error(`Cannot tell how this runs jest: ${script}`);
  return words.slice(bin + 1);
}

const NPM_RUN = /^npm\s+(?:(?:run|run-script)\s+([^\s'"-][^\s'"]*)|(test|t))(?=\s|$)/;

/** The npm script a command runs, when it starts with `npm run <script>` or `npm test`. */
function npmScriptOf(command: string): string | null {
  const match = NPM_RUN.exec(command.trim());
  return match ? (match[1] ?? "test") : null;
}

/**
 * What `npm run <script> -- <args>` (or `npm test -- <args>`) passes to the
 * script, or null when the command has any other shape.
 */
function npmRunArgs(command: string): string[] | null {
  let words: string[];
  try {
    words = shellWords(command);
  } catch {
    return null;
  }
  const rest = words[1] === "run" || words[1] === "run-script" ? words.slice(3) : words.slice(2);
  if (rest.length === 0) return [];
  return rest[0] === "--" ? rest.slice(1) : null;
}

/**
 * The arguments the npm script `name` gives jest, following a script that
 * only runs another one (`"test": "npm run test:unit"`), or null when it runs
 * no jest.
 */
export function jestArgsOfScript(
  name: string,
  scripts: Record<string, string>,
  seen: string[] = [],
): string[] | null {
  const script = scripts[name];
  if (script === undefined) return null;
  if (seen.includes(name)) throw new Error(`npm scripts loop: ${[...seen, name].join(" -> ")}`);
  const inner = npmScriptOf(script);
  const innerArgs = inner === null ? null : npmRunArgs(script);
  if (inner !== null && innerArgs !== null) {
    const base = jestArgsOfScript(inner, scripts, [...seen, name]);
    return base === null ? null : [...base, ...innerArgs];
  }
  return jestArgsOf(script);
}

/** The commands in a step's `run:` text: `\` continuations joined, comments dropped. */
export function commandLines(run: string): string[] {
  return run
    .replace(/\\\r?\n/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/**
 * The combinations a job's `strategy.matrix` expands to: every axis crossed,
 * minus `exclude`, plus `include`. Null when an axis is an expression the
 * guard cannot expand.
 */
export function matrixCombinations(matrix: unknown): YamlMap[] | null {
  if (matrix === undefined) return [{}];
  if (!isMap(matrix)) return null;
  const { include, exclude, ...axes } = matrix;
  let combinations: YamlMap[] = [{}];
  for (const [key, values] of Object.entries(axes)) {
    if (!Array.isArray(values)) return null;
    combinations = combinations.flatMap((c) => values.map((value) => ({ ...c, [key]: value })));
  }
  const same = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();
  const excluded = Array.isArray(exclude) ? exclude.filter(isMap) : [];
  combinations = combinations.filter(
    (c) => !excluded.some((e) => Object.entries(e).every(([key, value]) => same(c[key], value))),
  );
  if (Array.isArray(include)) combinations.push(...include.filter(isMap));
  return combinations;
}

const MATRIX_CONDITION = /^\s*(?:\$\{\{)?\s*matrix\.([\w-]+)\s*==\s*'([^']*)'\s*(?:\}\})?\s*$/;

/**
 * False when a step's `if:` is `matrix.<key> == '<value>'` and no combination
 * of its job's matrix has that value, so the step never runs (a matrix entry
 * lost in a merge, say). Any other condition is taken to hold sometimes.
 */
export function canRun(condition: unknown, matrix: unknown): boolean {
  if (typeof condition !== "string") return true;
  const match = MATRIX_CONDITION.exec(condition);
  if (!match) return true;
  const [, key, value] = match;
  const combinations = matrixCombinations(matrix);
  if (combinations === null) return true;
  return combinations.some((c) => String(c[key] ?? "").toLowerCase() === value.toLowerCase());
}

const runsInServers = (dir: unknown): boolean =>
  typeof dir === "string" && path.posix.normalize(dir).replace(/\/$/, "") === "Servers";

/**
 * Every jest run in the workflow's steps that run in Servers/, plus the
 * problems that stop the guard from trusting a step: a jest command it cannot
 * read, or a step that never runs.
 */
export function findJestRuns(
  workflow: unknown,
  scripts: Record<string, string>,
): { runs: JestRun[]; problems: string[] } {
  const runs: JestRun[] = [];
  const problems: string[] = [];
  const labels = new Set<string>();
  const workingDirectory = (defaults: unknown) => asMap(asMap(defaults).run)["working-directory"];
  const isJestScript = (name: string) => {
    try {
      return jestArgsOfScript(name, scripts) !== null;
    } catch {
      return true;
    }
  };
  const mentionsJest = (line: string) =>
    JEST_COMMAND.test(line) ||
    (/\bnpm\s+t(est)?(?=$|[\s;&|)])/.test(line) && isJestScript("test")) ||
    [...line.matchAll(/\bnpm\s+(?:run|run-script)\s+(?:-\S+\s+)*([\w:.-]+)/g)].some((m) =>
      isJestScript(m[1]),
    );

  const workflowDir = workingDirectory(asMap(workflow).defaults);
  for (const [jobId, jobValue] of Object.entries(asMap(asMap(workflow).jobs))) {
    const job = asMap(jobValue);
    const jobDir = workingDirectory(job.defaults) ?? workflowDir;
    const steps = Array.isArray(job.steps) ? job.steps : [];
    steps.forEach((stepValue, index) => {
      const step = asMap(stepValue);
      if (typeof step.run !== "string") return;
      if (!runsInServers(step["working-directory"] ?? jobDir)) return;
      const name = typeof step.name === "string" ? step.name : `step ${index + 1}`;
      const label = `${jobId} / ${name}`;
      const stepArgs: string[][] = [];
      for (const line of commandLines(step.run)) {
        const script = npmScriptOf(line);
        let base: string[] | null = null;
        try {
          base = script === null ? null : jestArgsOfScript(script, scripts);
        } catch (error) {
          problems.push(`${label}: ${(error as Error).message}`);
          continue;
        }
        const args = base === null ? null : npmRunArgs(line);
        if (base !== null && args !== null) stepArgs.push([...base, ...args]);
        else if (base !== null || mentionsJest(line)) {
          problems.push(
            `${label}: cannot tell which tests \`${line}\` runs. Write a jest run as ` +
              "`npm run <script> -- <jest arguments>` on a line of its own.",
          );
        }
      }
      if (stepArgs.length === 0) return;
      if (!canRun(step.if, asMap(job.strategy).matrix)) {
        problems.push(
          `${label} never runs: no combination of the job's matrix satisfies \`if: ${step.if}\`.`,
        );
        return;
      }
      stepArgs.forEach((args, n) => {
        let unique = stepArgs.length > 1 ? `${label} (command ${n + 1})` : label;
        for (let copy = 2; labels.has(unique); copy += 1) unique = `${label} (${copy})`;
        labels.add(unique);
        runs.push({ label: unique, args });
      });
    });
  }
  return { runs, problems };
}

/** Every test file under tests/integration/, as sorted Servers-relative paths. */
export function listIntegrationTestFiles(serversDir: string = SERVERS_DIR): string[] {
  return fs
    .readdirSync(path.join(serversDir, INTEGRATION_DIR), { recursive: true, encoding: "utf8" })
    .filter((file) => TEST_FILE.test(file))
    .map((file) => `${INTEGRATION_DIR}/${toPosix(file)}`)
    .sort();
}

/**
 * The files a jest run started in `cwd` selects, as paths relative to `cwd`.
 * Jest lists them itself, so its own rules apply: testMatch, the ignore
 * patterns, and testPathPatterns as case-insensitive regexes tried on the
 * relative and the absolute path.
 */
export function listSelectedFiles(args: string[], cwd: string = SERVERS_DIR): string[] {
  if (args.some((arg) => /^--watch(All)?(=|$)/.test(arg))) {
    throw new Error(`A CI step must not watch: jest ${args.join(" ")}`);
  }
  const jestBin = require.resolve("jest/bin/jest", { paths: [SERVERS_DIR] });
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "integration-suites-"));
  try {
    const outFile = path.join(outDir, "tests.json");
    const result = spawnSync(
      process.execPath,
      [jestBin, ...args, "--listTests", "--json", `--outputFile=${outFile}`],
      { cwd, encoding: "utf8" },
    );
    if (result.status !== 0 || !fs.existsSync(outFile)) {
      throw new Error(
        `jest ${args.join(" ")} --listTests failed:\n${result.stderr || result.stdout}`,
      );
    }
    const root = fs.realpathSync(cwd);
    const listed = JSON.parse(fs.readFileSync(outFile, "utf8")) as string[];
    return listed.map((file) => toPosix(path.relative(root, fs.realpathSync(file))));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

/**
 * Matches the integration test files against what each jest run selects and
 * against the exclusion list. Files a run selects outside `files` (unit tests,
 * say) are ignored.
 */
export function analyzeCoverage(
  files: string[],
  selections: { label: string; files: string[] }[],
  excluded: ExclusionGroup[],
): CoverageReport {
  const runsOf = new Map<string, string[]>(files.map((file) => [file, []]));
  for (const selection of selections) {
    for (const file of new Set(selection.files)) runsOf.get(file)?.push(selection.label);
  }

  const badExclusions: string[] = [];
  const excludedFiles = new Set<string>();
  for (const group of excluded) {
    if (group.reason.trim() === "") {
      badExclusions.push(`A group gives no reason: ${group.files.join(", ")}`);
    }
    for (const file of group.files) {
      const runs = runsOf.get(file);
      if (excludedFiles.has(file)) badExclusions.push(`${file} is listed twice.`);
      else if (runs === undefined) {
        badExclusions.push(`${file} is not an integration test file (renamed or deleted?).`);
      } else if (runs.length > 0) badExclusions.push(`${file} runs in ${runs.join(" and ")}.`);
      excludedFiles.add(file);
    }
  }

  const unexcluded = files.filter((file) => !excludedFiles.has(file));
  return {
    unrun: unexcluded.filter((file) => runsOf.get(file)?.length === 0),
    runTwice: unexcluded
      .map((file) => ({ file, runs: runsOf.get(file) ?? [] }))
      .filter(({ runs }) => runs.length > 1),
    badExclusions,
  };
}

function main(): void {
  const packageJson = JSON.parse(fs.readFileSync(path.join(SERVERS_DIR, "package.json"), "utf8"));
  const { runs, problems } = findJestRuns(YAML.load(WORKFLOW_FILE), packageJson.scripts);
  const files = listIntegrationTestFiles();
  const integration = new Set(files);
  const selections = runs.map((run) => ({ label: run.label, files: listSelectedFiles(run.args) }));
  const report = analyzeCoverage(files, selections, EXCLUDED);
  const excludedCount = EXCLUDED.reduce((sum, group) => sum + group.files.length, 0);

  const width = Math.max(...selections.map((s) => s.label.length), "EXCLUDED".length);
  console.log(
    `Integration test files: ${files.length}. How many of them each CI jest run selects:`,
  );
  for (const selection of selections) {
    const count = selection.files.filter((file) => integration.has(file)).length;
    console.log(`  ${selection.label.padEnd(width)}  ${count}`);
  }
  console.log(`  ${"EXCLUDED".padEnd(width)}  ${excludedCount}`);

  const sections: [string, string[], string][] = [
    ["Workflow steps the guard cannot use", problems, ""],
    [
      "Integration test files that run in no CI step",
      report.unrun,
      "Add each one to a step's --testPathPatterns in .github/workflows/backend-checks.yml, or " +
        "to EXCLUDED in Servers/scripts/checkIntegrationSuites.ts with the reason it is left out.",
    ],
    [
      "Integration test files that run in more than one CI step",
      report.runTwice.map(({ file, runs: where }) => `${file}: ${where.join(", ")}`),
      "Narrow the patterns so that each file runs in one step.",
    ],
    [
      "EXCLUDED entries to fix or delete (Servers/scripts/checkIntegrationSuites.ts)",
      report.badExclusions,
      "",
    ],
  ];
  const failed = sections.filter(([, items]) => items.length > 0);
  for (const [title, items, advice] of failed) {
    console.error(`\n${title} (${items.length}):`);
    for (const item of items) console.error(`  ${item}`);
    if (advice) console.error(advice);
  }

  if (failed.length > 0) {
    const summary = failed.map(([title, items]) => `${title}: ${items.length}`).join("; ");
    console.error(process.env.GITHUB_ACTIONS === "true" ? `::error::${summary}` : `\n${summary}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    excludedCount > 0
      ? `\nOK: every integration test file runs in exactly one CI step, apart from the ${excludedCount} in EXCLUDED.`
      : "\nOK: every integration test file runs in exactly one CI step.",
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
