/**
 * @fileoverview Turns the rows of a simulated dataset into the scenario list the
 * evaluation runner reads (EvalServer/src/utils/run_evaluation.py:
 * dataset.simulatedMode and dataset.scenarios). The runner applies each
 * scenario's max_turns itself and fills in defaults for blank fields.
 *
 * @module pages/EvalsDashboard/NewExperiment/simulatedScenarios
 */

export interface SimulatedScenario {
  scenario: string;
  expected_outcome?: string;
  user_description?: string;
  max_turns?: number;
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** Scenario rows with a non-empty `scenario`; other rows are skipped. */
export function toSimulatedScenarios(rows: unknown[]): SimulatedScenario[] {
  return rows.flatMap((row) => {
    if (typeof row !== "object" || row === null) return [];
    const obj = row as Record<string, unknown>;
    const scenario = text(obj.scenario);
    if (!scenario) return [];
    const expectedOutcome = text(obj.expected_outcome);
    const userDescription = text(obj.user_description);
    const maxTurns = Number(obj.max_turns);
    return [
      {
        scenario,
        ...(expectedOutcome ? { expected_outcome: expectedOutcome } : {}),
        ...(userDescription ? { user_description: userDescription } : {}),
        ...(Number.isInteger(maxTurns) && maxTurns > 0 ? { max_turns: maxTurns } : {}),
      },
    ];
  });
}
