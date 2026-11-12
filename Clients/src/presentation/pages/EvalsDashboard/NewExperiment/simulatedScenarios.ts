/**
 * @fileoverview Turns the rows of a simulated dataset into the scenario list the
 * evaluation runner expects (EvalServer/src/utils/run_evaluation.py reads
 * dataset.simulatedMode, dataset.scenarios and dataset.maxTurns).
 *
 * @module pages/EvalsDashboard/NewExperiment/simulatedScenarios
 */

export const DEFAULT_SIMULATED_MAX_TURNS = 6;

export interface SimulatedScenario {
  scenario: string;
  expected_outcome: string;
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
    const maxTurns = Number(obj.max_turns);
    return [
      {
        scenario,
        expected_outcome: text(obj.expected_outcome) ?? "",
        ...(text(obj.user_description) ? { user_description: text(obj.user_description) } : {}),
        ...(Number.isInteger(maxTurns) && maxTurns > 0 ? { max_turns: maxTurns } : {}),
      },
    ];
  });
}

/**
 * The runner applies one turn limit to the whole run, so use the largest
 * per-scenario `max_turns`, or the default when none is set.
 */
export function simulatedMaxTurns(scenarios: SimulatedScenario[]): number {
  const limits = scenarios.map((s) => s.max_turns).filter((n): n is number => n !== undefined);
  return limits.length > 0 ? Math.max(...limits) : DEFAULT_SIMULATED_MAX_TURNS;
}
