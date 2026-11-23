import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import InlineError from "../InlineError";

describe("InlineError", () => {
  it("says what could not be loaded as an alert, and tries again on Retry", async () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <InlineError message="Could not load research findings." onRetry={onRetry} />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not load research findings.");
    expect(onRetry).not.toHaveBeenCalled();

    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("gives Retry the house control height of 30px", () => {
    renderWithProviders(
      <InlineError message="Could not load the latest research run." onRetry={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Retry" })).toHaveStyle({ height: "30px" });
  });
});
