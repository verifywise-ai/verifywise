import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  analyzeCoverage,
  canRun,
  findJestRuns,
  jestArgsOf,
  listIntegrationTestFiles,
  listSelectedFiles,
  shellWords,
} from "../checkIntegrationSuites";

const SCRIPTS: Record<string, string> = {
  test: "npm run test:unit",
  "test:unit": "jest --testPathIgnorePatterns=/tests/integration/",
  "test:integration":
    'node --max-old-space-size=8192 node_modules/jest/bin/jest.js --config jest.config.js --testMatch="**/tests/integration/**/*.test.ts" --runInBand',
  build: "tsc",
  lint: "eslint .",
};

const INTEGRATION_ARGS = [
  "--config",
  "jest.config.js",
  "--testMatch=**/tests/integration/**/*.test.ts",
  "--runInBand",
];

const inServers = (steps: unknown[], extra: Record<string, unknown> = {}) => ({
  defaults: { run: { "working-directory": "Servers" } },
  steps,
  ...extra,
});

const withTempDir = (files: string[], use: (dir: string) => void) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-integration-suites-"));
  try {
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(
        path.join(dir, file),
        file.endsWith("jest.config.js") ? "module.exports = {};\n" : "",
      );
    }
    use(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe("shellWords", () => {
  it("keeps quoted text as one word, backslashes and parentheses included", () => {
    expect(
      shellWords(
        "npm run test:integration -- --testPathPatterns='tests/integration/(a|b\\.c)\\.test\\.ts'",
      ),
    ).toEqual([
      "npm",
      "run",
      "test:integration",
      "--",
      "--testPathPatterns=tests/integration/(a|b\\.c)\\.test\\.ts",
    ]);
    expect(
      shellWords('jest --globalSetup="<rootDir>/setup.js" --testMatch="**/*.test.ts"'),
    ).toEqual(["jest", "--globalSetup=<rootDir>/setup.js", "--testMatch=**/*.test.ts"]);
  });

  it.each([
    ["a variable", "jest $PATTERN"],
    ["a variable in double quotes", 'jest "$PATTERN"'],
    ["a command list", "npm run build && jest"],
    ["a pipe", "jest | tee out.txt"],
    ["an unquoted glob", "jest tests/*.test.ts"],
    ["an unterminated quote", "jest 'tests/integration"],
  ])("refuses %s rather than guess", (_, command) => {
    expect(() => shellWords(command)).toThrow();
  });
});

describe("jestArgsOf", () => {
  it("returns what follows the jest bin, however jest is started", () => {
    expect(jestArgsOf("jest --runInBand --forceExit")).toEqual(["--runInBand", "--forceExit"]);
    expect(jestArgsOf(SCRIPTS["test:integration"])).toEqual(INTEGRATION_ARGS);
  });

  it("returns null for a script that runs no jest", () => {
    expect(jestArgsOf("tsc")).toBeNull();
    expect(jestArgsOf("ts-node scripts/x.ts --config jest.config.js")).toBeNull();
  });

  it("throws for a jest script it cannot read", () => {
    expect(() => jestArgsOf("npm run build && jest")).toThrow();
    expect(() => jestArgsOf("cross-env CI=1 jest --runInBand")).toThrow(/Cannot tell/);
  });
});

describe("canRun", () => {
  const matrix = {
    suite: ["isolation", "regression", "retired"],
    rls: ["off", "on"],
    exclude: [{ suite: "regression", rls: "on" }, { suite: "retired" }],
    include: [{ suite: "extra", rls: "off" }],
  };

  it("holds when some matrix combination has the value", () => {
    expect(canRun("matrix.suite == 'regression'", matrix)).toBe(true);
    expect(canRun("${{ matrix.suite == 'EXTRA' }}", matrix)).toBe(true);
  });

  it("fails when no combination has the value, or the job has no matrix", () => {
    expect(canRun("matrix.suite == 'retired'", matrix)).toBe(false);
    expect(canRun("matrix.suite == 'missing'", matrix)).toBe(false);
    expect(canRun("matrix.suite == 'regression'", undefined)).toBe(false);
  });

  it("assumes any other condition holds sometimes", () => {
    expect(canRun(undefined, matrix)).toBe(true);
    expect(canRun("github.event_name == 'pull_request'", matrix)).toBe(true);
    expect(canRun("matrix.suite == 'x'", "${{ fromJSON(needs.plan.outputs.matrix) }}")).toBe(true);
  });
});

describe("findJestRuns", () => {
  it("gives each jest run the npm script's arguments, then the step's", () => {
    const { runs, problems } = findJestRuns(
      {
        jobs: {
          checks: inServers([
            { name: "Install", run: "npm ci" },
            { name: "Build", run: "npm run build" },
            {
              name: "Suites",
              run: "npm run test:integration -- --testPathPatterns='tests/integration/(a|b)\\.test\\.ts'\n",
            },
            { name: "Unit", run: "npm test" },
          ]),
        },
      },
      SCRIPTS,
    );
    expect(problems).toEqual([]);
    expect(runs).toEqual([
      {
        label: "checks / Suites",
        args: [...INTEGRATION_ARGS, "--testPathPatterns=tests/integration/(a|b)\\.test\\.ts"],
      },
      { label: "checks / Unit", args: ["--testPathIgnorePatterns=/tests/integration/"] },
    ]);
  });

  it("skips steps that do not run in Servers/", () => {
    const { runs, problems } = findJestRuns(
      {
        jobs: {
          root: { steps: [{ run: "npm run test:integration" }] },
          frontend: inServers([
            { run: "npm run test:integration", "working-directory": "Clients" },
          ]),
        },
      },
      SCRIPTS,
    );
    expect(runs).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("reports a step that never runs and leaves its files out", () => {
    const { runs, problems } = findJestRuns(
      {
        jobs: {
          suites: inServers(
            [
              { name: "Live", if: "matrix.suite == 'live'", run: "npm run test:integration" },
              { name: "Dropped", if: "matrix.suite == 'dropped'", run: "npm run test:integration" },
            ],
            { strategy: { matrix: { suite: ["live"] } } },
          ),
        },
      },
      SCRIPTS,
    );
    expect(runs.map((run) => run.label)).toEqual(["suites / Live"]);
    expect(problems).toEqual([
      "suites / Dropped never runs: no combination of the job's matrix satisfies `if: matrix.suite == 'dropped'`.",
    ]);
  });

  it("reports a jest command it cannot read, and ignores other commands", () => {
    const { runs, problems } = findJestRuns(
      {
        jobs: {
          checks: inServers([
            { name: "Chained", run: "cd . && npm run test:integration" },
            { name: "Npx", run: "npx jest tests/integration/a.test.ts" },
            { name: "No dashes", run: "npm run test:integration tests/integration/a.test.ts" },
            { name: "Lint", run: "npm run lint && npm run build || echo 'run npm run lint'" },
          ]),
        },
      },
      SCRIPTS,
    );
    expect(runs).toEqual([]);
    expect(problems.map((problem) => problem.split(":")[0])).toEqual([
      "checks / Chained",
      "checks / Npx",
      "checks / No dashes",
    ]);
  });

  it("labels several jest runs of one step, and steps of one name, apart", () => {
    const { runs } = findJestRuns(
      {
        jobs: {
          checks: inServers([
            {
              name: "Suites",
              run: "npm run test:integration -- --testPathPatterns=a\nnpm run test:integration -- --testPathPatterns=b",
            },
            { name: "Unit", run: "npm test" },
            { name: "Unit", run: "npm run test:unit" },
          ]),
        },
      },
      SCRIPTS,
    );
    expect(runs.map((run) => run.label)).toEqual([
      "checks / Suites (command 1)",
      "checks / Suites (command 2)",
      "checks / Unit",
      "checks / Unit (2)",
    ]);
  });
});

describe("analyzeCoverage", () => {
  const A = "tests/integration/a.test.ts";
  const B = "tests/integration/b.test.ts";
  const C = "tests/integration/c.test.ts";

  it("reports a file no run selects, ignoring selected files outside the list", () => {
    expect(
      analyzeCoverage(
        [A, B, C],
        [{ label: "one", files: [A, B, "utils/__tests__/x.test.ts"] }],
        [],
      ),
    ).toEqual({ unrun: [C], runTwice: [], badExclusions: [] });
  });

  it("reports a file that two runs select, with both", () => {
    expect(
      analyzeCoverage(
        [A, B],
        [
          { label: "one", files: [A, B] },
          { label: "two", files: [B] },
        ],
        [],
      ),
    ).toEqual({ unrun: [], runTwice: [{ file: B, runs: ["one", "two"] }], badExclusions: [] });
  });

  it("accepts an excluded file that runs nowhere and reports exclusions to fix", () => {
    const report = analyzeCoverage(
      [A, B, C],
      [{ label: "one", files: [A, B] }],
      [
        { reason: "Pending", files: [C] },
        { reason: "Old", files: [B, "tests/integration/gone.test.ts"] },
        { reason: " ", files: [C] },
      ],
    );
    expect(report.unrun).toEqual([]);
    expect(report.runTwice).toEqual([]);
    expect(report.badExclusions).toEqual([
      `${B} runs in one.`,
      "tests/integration/gone.test.ts is not an integration test file (renamed or deleted?).",
      `A group gives no reason: ${C}`,
      `${C} is listed twice.`,
    ]);
  });
});

describe("listIntegrationTestFiles", () => {
  it("lists the test files under tests/integration/, subfolders included", () => {
    withTempDir(
      [
        "tests/integration/a.test.ts",
        "tests/integration/sub/b.isolation.test.ts",
        "tests/integration/c.spec.js",
        "tests/integration/helpers.ts",
        "tests/integration/__mocks__/jsdom.js",
        "tests/unit/d.test.ts",
      ],
      (dir) => {
        expect(listIntegrationTestFiles(dir)).toEqual([
          "tests/integration/a.test.ts",
          "tests/integration/c.spec.js",
          "tests/integration/sub/b.isolation.test.ts",
        ]);
      },
    );
  });
});

describe("listSelectedFiles", () => {
  it("lists what jest would run, matching patterns case-insensitively, without running it", () => {
    withTempDir(
      [
        "jest.config.js",
        "tests/integration/a.test.ts",
        "tests/integration/Sub/b.test.ts",
        "tests/unit/sub/c.test.ts",
      ],
      (dir) => {
        expect(
          listSelectedFiles(
            ["--config", "jest.config.js", "--testPathPatterns=integration/sub/"],
            dir,
          ),
        ).toEqual(["tests/integration/Sub/b.test.ts"]);
      },
    );
  });
});
