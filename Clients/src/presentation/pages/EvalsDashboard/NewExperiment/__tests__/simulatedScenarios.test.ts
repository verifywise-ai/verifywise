import { describe, it, expect } from "vitest";
import {
  DEFAULT_SIMULATED_MAX_TURNS,
  simulatedMaxTurns,
  toSimulatedScenarios,
} from "../simulatedScenarios";

describe("toSimulatedScenarios", () => {
  it("keeps the fields the runner reads", () => {
    expect(
      toSimulatedScenarios([
        {
          scenario: " Reset a password ",
          expected_outcome: "Steps are explained",
          user_description: "A non-technical customer",
          max_turns: 4,
          extra: "ignored",
        },
      ]),
    ).toEqual([
      {
        scenario: "Reset a password",
        expected_outcome: "Steps are explained",
        user_description: "A non-technical customer",
        max_turns: 4,
      },
    ]);
  });

  it("skips rows without a scenario and drops invalid optional fields", () => {
    expect(
      toSimulatedScenarios([
        null,
        "text",
        { prompt: "a single-turn row" },
        { scenario: "   " },
        { scenario: "Cancel an order", user_description: "", max_turns: "x" },
      ]),
    ).toEqual([{ scenario: "Cancel an order", expected_outcome: "" }]);
  });
});

describe("simulatedMaxTurns", () => {
  it("uses the largest per-scenario limit", () => {
    expect(
      simulatedMaxTurns([
        { scenario: "a", expected_outcome: "", max_turns: 3 },
        { scenario: "b", expected_outcome: "" },
        { scenario: "c", expected_outcome: "", max_turns: 8 },
      ]),
    ).toBe(8);
  });

  it("falls back to the default", () => {
    expect(simulatedMaxTurns([{ scenario: "a", expected_outcome: "" }])).toBe(
      DEFAULT_SIMULATED_MAX_TURNS,
    );
  });
});
