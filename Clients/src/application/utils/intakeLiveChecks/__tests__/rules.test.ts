/**
 * Runs the shared rule-check cases. The server copy of the rules runs the
 * same fixture files, so both sides fire the same hints with the same copy.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RULE_COPY, runRuleChecks } from "..";
import type { LogicSchema } from "../../intakeFormLogic";
import type { HintKind } from "../../../../domain/types/intakeLiveChecks";

interface RuleCase {
  name: string;
  schema: LogicSchema;
  data: Record<string, unknown>;
  expected: Array<{ ruleId: string; questionId: string; kind: HintKind }>;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, "../../../../../../Servers/services/intakeLiveChecks/__fixtures__");
const readFixture = <T>(file: string): T =>
  JSON.parse(readFileSync(resolve(FIXTURES, file), "utf8"));

const cases = readFixture<RuleCase[]>("ruleCases.json");

describe("intake live checks: rules", () => {
  it.each(cases)("$name", ({ schema, data, expected }) => {
    const hints = runRuleChecks(schema, data);
    expect(hints.map(({ ruleId, questionId, kind }) => ({ ruleId, questionId, kind }))).toEqual(
      expected,
    );
  });

  it("builds every hint from its rule copy", () => {
    const hints = cases.flatMap((c) => runRuleChecks(c.schema, c.data));
    expect(hints.length).toBeGreaterThan(0);
    for (const hint of hints) {
      const copy = RULE_COPY[hint.ruleId!];
      expect(hint).toMatchObject({
        id: `${hint.ruleId}:${hint.questionId}`,
        source: "rule",
        title: copy.title,
        text: copy.text,
      });
      expect(hint.ref).toBe(copy.ref);
    }
  });

  it("quotes the matched words in the excerpt, never in the copy", () => {
    const [hint] = runRuleChecks(
      { fields: [{ id: "q", type: "textarea", label: "Q", order: 1 }] },
      { q: "Scrape faces from public websites" },
    );
    expect(hint.ruleId).toBe("art5_facial_scraping");
    expect(hint.excerpt).toBe("Scrape, faces");
  });

  it("ignores the tail of a word cut by the negation lookback", () => {
    // The 80-character lookback starts inside "piano"; its "no" is not a negation.
    const answer = `piano ${"x".repeat(76)} subliminal cues`;
    const hints = runRuleChecks(
      { fields: [{ id: "q", type: "textarea", label: "Q", order: 1 }] },
      { q: answer },
    );
    expect(hints.some((h) => h.ruleId === "art5_manipulation")).toBe(true);
  });

  it("stays fast on a very long answer full of negated matches", () => {
    // Every "subliminal" is negated, so each match is checked; the lookback must not rescan the answer.
    const answer = "not subliminal ".repeat(30_000);
    const started = Date.now();
    const hints = runRuleChecks(
      { fields: [{ id: "q", type: "textarea", label: "Q", order: 1 }] },
      { q: answer },
    );
    expect(Date.now() - started).toBeLessThan(5000);
    expect(hints.some((h) => h.ruleId === "art5_manipulation")).toBe(false);
  });

  it("matches the shared copy fixture", () => {
    expect(RULE_COPY).toEqual(readFixture("ruleCopy.json"));
  });
});
