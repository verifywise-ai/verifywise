import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { GatewayPurgeWarning, needsGatewayPurgeConfirmation } from "../index";

const state = (guardrailDays: number, spendDays: number, autoPurge: boolean) => ({
  guardrailDays,
  spendDays,
  autoPurge,
});

describe("needsGatewayPurgeConfirmation", () => {
  it.each([
    ["turning automatic deletion on", state(90, 90, false), state(90, 90, true), true],
    ["shortening guardrail logs while it is on", state(90, 90, true), state(30, 90, true), true],
    ["shortening spend logs while it is on", state(90, 90, true), state(90, 7, true), true],
    ["lengthening a period while it is on", state(90, 90, true), state(180, 90, true), false],
    ["keeping the same periods while it is on", state(90, 90, true), state(90, 90, true), false],
    ["shortening while it stays off", state(90, 90, false), state(7, 7, false), false],
    ["turning it off", state(90, 90, true), state(7, 7, false), false],
  ])("%s -> %s", (_case, current, next, expected) => {
    expect(needsGatewayPurgeConfirmation(current, next)).toBe(expected);
  });
});

describe("GatewayPurgeWarning", () => {
  it("names both periods", () => {
    renderWithProviders(<GatewayPurgeWarning guardrailDays={30} spendDays={60} />);
    expect(
      screen.getByText(
        "Guardrail logs older than 30 days and spend logs older than 60 days will be deleted permanently every day. Deleted logs cannot be restored.",
      ),
    ).toBeInTheDocument();
  });
});
