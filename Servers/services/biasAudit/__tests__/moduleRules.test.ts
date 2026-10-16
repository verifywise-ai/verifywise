import fs from "node:fs";
import path from "node:path";
import { findForbidden, FORBIDDEN_WORDS } from "../stance/vocabulary";
import { LL144_QUESTIONS } from "../../../structures/NYC-Local-Law-144/intake.questions";

const MODULE = path.resolve(__dirname, "..");
const QUESTION_SET = path.resolve(__dirname, "../../../structures/NYC-Local-Law-144");
const TEMPLATES = path.resolve(__dirname, "../../../templates/biasAudit");
const ROOTS = [MODULE, QUESTION_SET, TEMPLATES];

// The one file that must spell the forbidden list out.
const VOCABULARY = path.join(MODULE, "stance", "vocabulary.ts");
// Question text is checked as data below, so the "audited" exemption for the
// prior-audit question is applied by key rather than by skipping the word.
const QUESTIONS_FILE = path.join(QUESTION_SET, "intake.questions.ts");

// Amendment V: question prompt and option label may say "audited" only where
// they ask about a prior audit.
const PRIOR_AUDIT_KEY = "history.prior_audit";

function files(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== "__fixtures__") walk(p);
      } else if (/\.(ts|ejs)$/.test(e.name) && !e.name.endsWith(".test.ts")) out.push(p);
    }
  };
  ROOTS.filter(fs.existsSync).forEach(walk);
  return out;
}

describe("module rules", () => {
  const all = files();

  it("scans every root, the stance template included", () => {
    expect(all.some((f) => f.startsWith(MODULE + path.sep))).toBe(true);
    expect(all.some((f) => f.startsWith(QUESTION_SET + path.sep))).toBe(true);
    expect(all).toContain(path.join(TEMPLATES, "stance.ejs"));
  });

  it("imports nothing from another VerifyWise module", () => {
    const bad =
      /from\s+["'][^"']*(EvalServer|AIGateway|EvaluationModule|GRSModule|services\/reporting|controllers\/)/;
    expect(all.filter((f) => bad.test(fs.readFileSync(f, "utf8")))).toEqual([]);
  });

  it("never uses forbidden vocabulary in source or templates", () => {
    const offenders: string[] = [];
    for (const f of all.filter((x) => x !== VOCABULARY && x !== QUESTIONS_FILE)) {
      for (const w of findForbidden(fs.readFileSync(f, "utf8"))) {
        offenders.push(`${path.relative(MODULE, f)}: ${w}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never uses forbidden vocabulary in question text, except a prior audit's prompt and labels", () => {
    const offenders: string[] = [];
    for (const q of LL144_QUESTIONS) {
      const exempt = q.key === PRIOR_AUDIT_KEY ? ["audited"] : [];
      const check = (where: string, text: string | undefined) => {
        for (const w of findForbidden(text ?? "")) {
          if (!exempt.includes(w)) offenders.push(`${q.key} ${where}: ${w}`);
        }
      };
      check("prompt", q.prompt);
      for (const o of q.options) check(`option ${o.value} label`, o.label);
      // Consequences and emitted text are our words, never exempt.
      for (const o of q.options) {
        const ours = [o.consequence ?? "", ...(o.emits ?? []).map((e) => e.text)].join("\n");
        for (const w of findForbidden(ours)) {
          offenders.push(`${q.key} option ${o.value} consequence: ${w}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the matcher catches what the lint relies on", () => {
    expect(FORBIDDEN_WORDS.length).toBeGreaterThan(0);
    for (const w of FORBIDDEN_WORDS) expect(findForbidden(`The tool is ${w}.`)).toEqual([w]);
  });

  it("names no client anywhere", () => {
    // Whole words, so "accurately" is not read as a client name.
    const names = ["puck", "spotted zebra", "curately"];
    const named = (src: string) =>
      names.filter((n) => new RegExp(`(?<![a-z0-9])${n}(?![a-z0-9])`).test(src.toLowerCase()));
    expect(named("We ran it for Curately.")).toEqual(["curately"]);
    expect(named("Scored accurately.")).toEqual([]);

    const offenders: string[] = [];
    for (const f of all) {
      for (const n of named(fs.readFileSync(f, "utf8"))) {
        offenders.push(`${path.basename(f)}: ${n}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("filters every raw query on organization_id", () => {
    const utilsFile = path.resolve(__dirname, "../../../utils/biasAudit.utils.ts");
    const src = fs.readFileSync(utilsFile, "utf8");
    const statements = src.match(/sequelize\.query\(\s*`[^`]+`/g) ?? [];
    expect(statements.length).toBeGreaterThan(4);
    // Every call is a template-literal statement, so none escapes the check.
    expect(statements.length).toBe((src.match(/sequelize\.query\(/g) ?? []).length);
    const missing = statements.filter((s) => !/organization_id/.test(s));
    expect(missing).toEqual([]);
  });
});
