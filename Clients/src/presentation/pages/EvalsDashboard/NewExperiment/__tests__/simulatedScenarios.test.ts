import { describe, it, expect } from "vitest";
import { toSimulatedScenarios } from "../simulatedScenarios";

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

  it("skips rows without a scenario and leaves out blank or invalid fields", () => {
    expect(
      toSimulatedScenarios([
        null,
        "text",
        { prompt: "a single-turn row" },
        { scenario: "   " },
        {
          scenario: "Cancel an order",
          expected_outcome: " ",
          user_description: "",
          max_turns: "x",
        },
      ]),
    ).toEqual([{ scenario: "Cancel an order" }]);
  });

  it("skips rows that also have a prompt or turns, as the runner does", () => {
    expect(
      toSimulatedScenarios([
        { scenario: "With a prompt", prompt: "Cancel my order" },
        { scenario: "With turns", turns: [{ role: "user", content: "Hi" }] },
        { scenario: "Empty prompt and turns", prompt: "", turns: [] },
      ]),
    ).toEqual([{ scenario: "Empty prompt and turns" }]);
  });
});
