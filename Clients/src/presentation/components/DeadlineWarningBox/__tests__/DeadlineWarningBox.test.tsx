import { vi } from "vitest";

const mockWarnings = vi.fn();

vi.mock("../../../../application/hooks/useDeadlineWarnings", () => ({
  default: () => mockWarnings(),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));

import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import DeadlineWarningBox from "../index";

const baseWarnings = {
  overdue: 0,
  dueSoon: 0,
  dueSoonDays: 7,
  isLoading: false,
  error: null,
};

describe("DeadlineWarningBox", () => {
  beforeEach(() => {
    localStorage.clear();
    mockWarnings.mockReset();
  });

  it("renders nothing when there are no overdue or due-soon tasks", () => {
    mockWarnings.mockReturnValue({ ...baseWarnings });
    const { container } = renderWithProviders(<DeadlineWarningBox />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while loading", () => {
    mockWarnings.mockReturnValue({ ...baseWarnings, overdue: 3, isLoading: true });
    const { container } = renderWithProviders(<DeadlineWarningBox />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows overdue and due-soon counts with correct pluralization", () => {
    mockWarnings.mockReturnValue({ ...baseWarnings, overdue: 1, dueSoon: 3 });
    renderWithProviders(<DeadlineWarningBox />);
    expect(
      screen.getByText("You have 1 overdue task and 3 tasks due in the next 7 days."),
    ).toBeInTheDocument();
  });

  it("shows only the due-soon segment when there are no overdue tasks", () => {
    mockWarnings.mockReturnValue({ ...baseWarnings, dueSoon: 1 });
    renderWithProviders(<DeadlineWarningBox />);
    expect(screen.getByText("You have 1 task due in the next 7 days.")).toBeInTheDocument();
  });

  it("renders nothing when the banner is already snoozed", () => {
    localStorage.setItem(
      "verifywise_deadline_snooze_1",
      JSON.stringify({ snoozeUntil: Date.now() + 60 * 60 * 1000 }),
    );
    mockWarnings.mockReturnValue({ ...baseWarnings, overdue: 2 });
    const { container } = renderWithProviders(<DeadlineWarningBox />);
    expect(container).toBeEmptyDOMElement();
  });

  it("persists a snooze and hides the banner when a snooze option is chosen", () => {
    mockWarnings.mockReturnValue({ ...baseWarnings, overdue: 2 });
    renderWithProviders(<DeadlineWarningBox />);

    fireEvent.click(screen.getByRole("button", { name: /snooze/i }));
    fireEvent.click(screen.getByText("24 hours"));

    // Persisted to localStorage with a future expiry.
    const stored = JSON.parse(localStorage.getItem("verifywise_deadline_snooze_1") || "{}");
    expect(stored.snoozeUntil).toBeGreaterThan(Date.now());

    // Banner is gone.
    expect(screen.queryByText(/You have/)).not.toBeInTheDocument();
  });
});
