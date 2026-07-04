import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { UpcomingDeadlinesCard } from "../index";
import type { UpcomingTask } from "../../../../pages/Tasks/types";

vi.mock("../../../EmptyStateMessage", () => ({
  EmptyStateMessage: ({ message }: { message: string }) => (
    <div data-testid="empty-state">{message}</div>
  ),
}));

vi.mock("../../../Chip", () => ({
  default: ({ label }: { label: string }) => <span data-testid="chip">{label}</span>,
}));

vi.mock("../../../VWTooltip", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../../../pages/Tasks/utils", () => ({
  getDaysUntilDue: vi.fn(),
  getCountdownInfo: vi.fn(),
}));

import { getDaysUntilDue, getCountdownInfo } from "../../../../pages/Tasks/utils";

const mockGetDaysUntilDue = vi.mocked(getDaysUntilDue);
const mockGetCountdownInfo = vi.mocked(getCountdownInfo);

const makeTask = (overrides?: Partial<UpcomingTask>): UpcomingTask => ({
  id: 1,
  title: "Test Task",
  status: "open",
  priority: "high",
  due_date: "2026-06-15",
  ...overrides,
});

describe("UpcomingDeadlinesCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when no tasks", () => {
    renderWithProviders(<UpcomingDeadlinesCard tasks={[]} />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText("No upcoming deadlines")).toBeInTheDocument();
  });

  it("renders task list", () => {
    mockGetDaysUntilDue.mockReturnValue(5);
    mockGetCountdownInfo.mockReturnValue({ label: "5d left", variant: "info" });

    renderWithProviders(<UpcomingDeadlinesCard tasks={[makeTask({ title: "My Task" })]} />);
    expect(screen.getByText("My Task")).toBeInTheDocument();
  });

  it("shows overdue alert when tasks are overdue", () => {
    mockGetDaysUntilDue.mockReturnValue(-1);
    mockGetCountdownInfo.mockReturnValue({ label: "1d overdue", variant: "error" });

    renderWithProviders(
      <UpcomingDeadlinesCard
        tasks={[
          makeTask({ id: 1, title: "Overdue Task" }),
          makeTask({ id: 2, title: "Also Overdue" }),
        ]}
      />,
    );
    expect(screen.getByText("2 tasks overdue")).toBeInTheDocument();
  });

  it("shows singular overdue text for one task", () => {
    mockGetDaysUntilDue.mockReturnValue(-1);
    mockGetCountdownInfo.mockReturnValue({ label: "1d overdue", variant: "error" });

    renderWithProviders(<UpcomingDeadlinesCard tasks={[makeTask({ title: "Late Task" })]} />);
    expect(screen.getByText("1 task overdue")).toBeInTheDocument();
  });

  it("does not show overdue alert when no tasks are overdue", () => {
    mockGetDaysUntilDue.mockReturnValue(5);
    mockGetCountdownInfo.mockReturnValue({ label: "5d left", variant: "info" });

    renderWithProviders(<UpcomingDeadlinesCard tasks={[makeTask()]} />);
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
  });

  it("renders priority chip for each task", () => {
    mockGetDaysUntilDue.mockReturnValue(5);
    mockGetCountdownInfo.mockReturnValue({ label: "5d left", variant: "info" });

    renderWithProviders(
      <UpcomingDeadlinesCard
        tasks={[makeTask({ priority: "high" }), makeTask({ id: 2, priority: "low" })]}
      />,
    );
    const chips = screen.getAllByTestId("chip");
    expect(chips).toHaveLength(4);
  });

  it("navigates on task click", async () => {
    mockGetDaysUntilDue.mockReturnValue(5);
    mockGetCountdownInfo.mockReturnValue({ label: "5d left", variant: "info" });
    const user = userEvent.setup();

    renderWithProviders(
      <UpcomingDeadlinesCard tasks={[makeTask({ id: 42, title: "Clickable Task" })]} />,
    );
    await user.click(screen.getByText("Clickable Task"));
  });
});
