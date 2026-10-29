import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AedtPredicate } from "../../../../infrastructure/api/aedtBiasAuditService";
import { evaluatePredicate, type DraftAnswers } from "../intakeLayout";

/**
 * The server's evaluator (Servers/services/biasAudit/applicability.ts) is
 * tested against the same file, so the wizard shows a question exactly when
 * the server would apply it.
 */
const file = path.resolve(__dirname, "../../../../../../shared/bias-audit/predicateCases.json");
const { cases } = JSON.parse(readFileSync(file, "utf8")) as {
  cases: Array<{
    name: string;
    predicate: AedtPredicate | null;
    answers: DraftAnswers;
    expected: boolean;
  }>;
};

describe("evaluatePredicate against the cases shared with the server", () => {
  it("has cases to run", () => {
    expect(cases.length).toBeGreaterThan(10);
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(evaluatePredicate(c.predicate ?? undefined, c.answers)).toBe(c.expected);
  });
});
