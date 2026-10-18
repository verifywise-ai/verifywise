import { readFileSync } from "node:fs";
import * as path from "node:path";
import { LL144_QUESTIONS } from "../../structures/NYC-Local-Law-144/intake.questions";
import type { IntakeQuestion, Predicate } from "../../structures/NYC-Local-Law-144/intake.types";
import { applicableQuestions, evaluatePredicate, type AnswerMap } from "./applicability";

const ans = (m: Record<string, string>): AnswerMap =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { value: v, dontKnow: false }]));

describe("evaluatePredicate", () => {
  it("treats an undefined predicate as applicable", () => {
    expect(evaluatePredicate(undefined, {})).toBe(true);
  });

  it("evaluates equals", () => {
    expect(evaluatePredicate({ equals: { key: "a", value: "x" } }, ans({ a: "x" }))).toBe(true);
    expect(evaluatePredicate({ equals: { key: "a", value: "x" } }, ans({ a: "y" }))).toBe(false);
    expect(evaluatePredicate({ equals: { key: "a", value: "x" } }, {})).toBe(false);
  });

  it("evaluates not, all and any", () => {
    expect(evaluatePredicate({ not: { equals: { key: "a", value: "x" } } }, ans({ a: "y" }))).toBe(
      true,
    );
    expect(
      evaluatePredicate({ all: [{ answered: "a" }, { answered: "b" }] }, ans({ a: "1", b: "2" })),
    ).toBe(true);
    expect(
      evaluatePredicate({ all: [{ answered: "a" }, { answered: "b" }] }, ans({ a: "1" })),
    ).toBe(false);
    expect(
      evaluatePredicate({ any: [{ answered: "a" }, { answered: "b" }] }, ans({ b: "2" })),
    ).toBe(true);
  });

  it("does not count a don't-know as answered", () => {
    expect(evaluatePredicate({ answered: "a" }, { a: { value: null, dontKnow: true } })).toBe(
      false,
    );
  });
});

describe("applicableQuestions", () => {
  it("returns the vetoes when nothing is answered", () => {
    const qs = applicableQuestions({});
    expect(qs.map((q) => q.key)).toEqual(
      expect.arrayContaining([
        "role.party",
        "scope.weighting",
        "independence.auditor",
        "data.held",
      ]),
    );
  });

  it("drops every non-veto question once scope is out", () => {
    const qs = applicableQuestions(ans({ "scope.weighting": "one_of_several" }));
    expect(qs.every((q) => q.weight === "veto")).toBe(true);
  });

  it("keeps non-veto questions when the tool is in scope", () => {
    const qs = applicableQuestions(ans({ "scope.weighting": "biggest" }));
    expect(qs.some((q) => q.key === "pipeline.input_form")).toBe(true);
  });

  it("asks the planned-automation question only when a person applies the cutoff", () => {
    const inScope = { "scope.weighting": "biggest" };
    expect(
      applicableQuestions(ans({ ...inScope, "cutoff.applied_by": "platform" })).some(
        (q) => q.key === "cutoff.planned",
      ),
    ).toBe(false);
    expect(
      applicableQuestions(ans({ ...inScope, "cutoff.applied_by": "person" })).some(
        (q) => q.key === "cutoff.planned",
      ),
    ).toBe(true);
  });

  it("asks the operational threshold only for a human cutoff", () => {
    const inScope = { "scope.weighting": "biggest" };
    expect(
      applicableQuestions(ans({ ...inScope, "cutoff.applied_by": "person" })).some(
        (q) => q.key === "threshold.operational",
      ),
    ).toBe(true);
    expect(
      applicableQuestions(ans({ ...inScope, "cutoff.applied_by": "platform" })).some(
        (q) => q.key === "threshold.operational",
      ),
    ).toBe(false);
  });

  it("filters by scope when asked", () => {
    const all = ans({ "scope.weighting": "biggest", "cutoff.applied_by": "person" });
    expect(applicableQuestions(all, "run").every((q) => q.scope === "run")).toBe(true);
    expect(applicableQuestions(all, "profile").every((q) => q.scope === "profile")).toBe(true);
  });
});

/**
 * Builds one answer set that satisfies a predicate. Only the forms the
 * question set uses are handled; an unknown form throws so the test cannot
 * silently pass on a predicate it did not understand.
 */
function satisfying(p: NonNullable<IntakeQuestion["appliesWhen"]>): AnswerMap {
  if (p.equals) return ans({ [p.equals.key]: p.equals.value });
  if (p.answered) return ans({ [p.answered]: "answered" });
  if (p.all) return Object.assign({}, ...p.all.map(satisfying));
  if (p.not?.equals) {
    const { key, value } = p.not.equals;
    return ans({ [key]: value === "biggest" ? "one_of_several" : "biggest" });
  }
  throw new Error(`no satisfying answer for predicate ${JSON.stringify(p)}`);
}

describe("question reachability", () => {
  const vetoes = LL144_QUESTIONS.filter((q) => q.weight === "veto");
  const conditional = LL144_QUESTIONS.filter((q) => q.appliesWhen !== undefined);

  it("has 13 questions: 4 vetoes, none conditional, and 9 conditional", () => {
    expect(LL144_QUESTIONS).toHaveLength(13);
    expect(vetoes).toHaveLength(4);
    expect(vetoes.every((q) => q.appliesWhen === undefined)).toBe(true);
    expect(conditional).toHaveLength(9);
  });

  it("returns every one of the 13 questions under some answer set", () => {
    const reachable = new Set<string>(applicableQuestions({}).map((q) => q.key));
    for (const q of conditional) {
      for (const x of applicableQuestions(satisfying(q.appliesWhen!))) reachable.add(x.key);
    }
    expect([...reachable].sort()).toEqual(LL144_QUESTIONS.map((q) => q.key).sort());
  });

  it("reaches each conditional question under an answer set that satisfies its predicate", () => {
    for (const q of conditional) {
      const reached = applicableQuestions(satisfying(q.appliesWhen!)).map((x) => x.key);
      expect({ key: q.key, reached: reached.includes(q.key) }).toEqual({
        key: q.key,
        reached: true,
      });
    }
  });
});

/**
 * The wizard applies its own copy of this predicate to the answers on
 * screen (Clients/.../BiasAudit/intakeLayout.ts). Both are tested against the
 * same cases, so a question appears on the page exactly when the server
 * would apply it.
 */
describe("evaluatePredicate against the cases shared with the client", () => {
  const file = path.resolve(__dirname, "../../../shared/bias-audit/predicateCases.json");
  const { cases } = JSON.parse(readFileSync(file, "utf8")) as {
    cases: Array<{
      name: string;
      predicate: Predicate | null;
      answers: AnswerMap;
      expected: boolean;
    }>;
  };

  it("has cases to run", () => {
    expect(cases.length).toBeGreaterThan(10);
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(evaluatePredicate(c.predicate ?? undefined, c.answers)).toBe(c.expected);
  });
});
