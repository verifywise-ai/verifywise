import { vi } from "vitest";

const mockWarnings = vi.fn();

vi.mock("../../../../application/hooks/useDeadlineWarnings", () => ({
  default: () => mockWarnings(),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));

import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import DeadlineWarningBox from "../index";

const baseWarnings = {
  overdue: 0,
  dueSoon: 0,
  dueSoonDays: 14,
  isLoading: false,
  error: null,
};

describe("DeadlineWarningBox", () => {
  beforeEach(() => {
    localStorage.clear();
    mockWarnings.mockReset();
  });

  it("renders nothing visible when there are no overdue or due-soon tasks", () => {
    mockWarnings.mockReturnValue({ ...baseWarnings });
    renderWithProviders(<DeadlineWarningBox />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders nothing visible while loading", () => {
    mockWarnings.mockReturnValue({ ...baseWarnings, overdue: 3, isLoading: true });
    renderWithProviders(<DeadlineWarningBox />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the spec header and overdue/due-soon counts", () => {
    mockWarnings.mockReturnValue({ ...baseWarnings, overdue: 3, dueSoon: 5 });
    renderWithProviders(<DeadlineWarningBox />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Task deadlines")).toBeInTheDocument();
    expect(screen.getByText("3 overdue")).toBeInTheDocument();
    expect(screen.getByText("5 due")).toBeInTheDocument();
  });

  it("shows only the due-soon count when there are no overdue tasks", () => {
    mockWarnings.mockReturnValue({ ...baseWarnings, dueSoon: 1 });
    renderWithProviders(<DeadlineWarningBox />);

    expect(screen.getByText("1 due")).toBeInTheDocument();
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
  });

  it("renders nothing visible when the banner is already snoozed", () => {
    localStorage.setItem(
      "verifywise_deadline_snooze_1",
      JSON.stringify({ snoozeUntil: Date.now() + 60 * 60 * 1000 }),
    );
    mockWarnings.mockReturnValue({ ...baseWarnings, overdue: 2 });
    renderWithProviders(<DeadlineWarningBox />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("persists a snooze and hides the banner when a snooze option is chosen", async () => {
    mockWarnings.mockReturnValue({ ...baseWarnings, overdue: 2 });
    renderWithProviders(<DeadlineWarningBox />);

    fireEvent.click(screen.getByRole("button", { name: /snooze options/i }));
    fireEvent.click(screen.getByText("Snooze for 24 hours"));

    const stored = JSON.parse(localStorage.getItem("verifywise_deadline_snooze_1") || "{}");
    expect(stored.snoozeUntil).toBeGreaterThan(Date.now());

    await waitFor(
      () => {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      },
      { timeout: 1000 },
    );
  });
});
