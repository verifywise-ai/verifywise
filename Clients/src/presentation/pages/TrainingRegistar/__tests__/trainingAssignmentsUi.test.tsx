import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { TrainingStatus } from "../../../../domain/enums/status.enum";
import type { TrainingRegistarModel } from "../../../../domain/models/Common/trainingRegistar/trainingRegistar.model";
import type {
  MyTrainingAssignment,
  TrainingAssignmentSummary,
} from "../../../../application/repository/trainingAssignment.repository";
import MyTrainingTable from "../MyTrainingTable";
import TrainingTable from "../trainingTable";

const { repo, authMock } = vi.hoisted(() => ({
  repo: {
    getMyTrainingAssignments: vi.fn(),
    completeTrainingAssignment: vi.fn(),
    reopenTrainingAssignment: vi.fn(),
  },
  authMock: vi.fn(() => ({ userRoleName: "Admin" })),
}));

vi.mock("../../../../application/repository/trainingAssignment.repository", () => repo);
vi.mock("../../../../application/hooks/useAuth", () => ({ useAuth: authMock }));
vi.mock("../../../../application/hooks/useFormattedDate", () => ({
  default: () => (date: string) => `formatted ${date}`,
}));

const training = {
  id: 3,
  training_name: "Bias awareness",
  duration: "2 hours",
  provider: "Acme",
  department: "Legal",
  status: TrainingStatus.Planned,
  numberOfPeople: 12,
} as unknown as TrainingRegistarModel;

const summaryOf = (values: Partial<TrainingAssignmentSummary>) =>
  new Map([[3, { training_id: 3, total: 5, completed: 2, overdue: 0, ...values }]]);

const renderTable = (
  assignmentSummaries: Map<number, TrainingAssignmentSummary>,
  handlers: { onEdit?: (id: string) => void; onOpenAssignments?: () => void } = {},
) =>
  renderWithProviders(
    <TrainingTable
      data={[training]}
      assignmentSummaries={assignmentSummaries}
      onEdit={handlers.onEdit ?? vi.fn()}
      onOpenAssignments={handlers.onOpenAssignments ?? vi.fn()}
    />,
  );

describe("TrainingTable assignments column", () => {
  beforeEach(() => authMock.mockReturnValue({ userRoleName: "Admin" }));

  it("shows progress without an overdue count when nothing is overdue", () => {
    renderTable(summaryOf({}));

    expect(screen.getByTestId("button-training-assignments-3")).toHaveTextContent(
      "2 of 5 complete",
    );
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
  });

  it("adds the overdue count when some are overdue", () => {
    renderTable(summaryOf({ overdue: 2 }));

    expect(screen.getByText("2 overdue")).toBeInTheDocument();
  });

  it("offers Assign to an editor when the training has no assignments", () => {
    renderTable(new Map());

    expect(screen.getByTestId("button-training-assignments-3")).toHaveTextContent("Assign");
  });

  it.each(["Reviewer", "Auditor"])("shows a dash to a %s with no assignments", (userRoleName) => {
    authMock.mockReturnValue({ userRoleName });
    renderTable(new Map());

    expect(screen.queryByTestId("button-training-assignments-3")).not.toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("lets a read-only role open existing assignments", () => {
    authMock.mockReturnValue({ userRoleName: "Auditor" });
    const onOpenAssignments = vi.fn();
    renderTable(summaryOf({}), { onOpenAssignments });

    fireEvent.click(screen.getByTestId("button-training-assignments-3"));

    expect(onOpenAssignments).toHaveBeenCalledWith(training);
  });

  it("opens assignments without triggering the row's edit modal", () => {
    const onEdit = vi.fn();
    const onOpenAssignments = vi.fn();
    renderTable(summaryOf({}), { onEdit, onOpenAssignments });

    fireEvent.click(screen.getByTestId("button-training-assignments-3"));

    expect(onOpenAssignments).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("uses a native button, so it is reachable by keyboard", () => {
    renderTable(summaryOf({}));

    expect(screen.getByTestId("button-training-assignments-3").tagName).toBe("BUTTON");
  });

  it("does not change the People headcount", () => {
    renderTable(summaryOf({ total: 99 }));

    expect(screen.getByText("12")).toBeInTheDocument();
  });
});

describe("MyTrainingTable", () => {
  const mine = (overrides: Partial<MyTrainingAssignment> = {}): MyTrainingAssignment => ({
    id: 1,
    training_id: 3,
    user_id: 7,
    user_name: "Grace",
    user_surname: "Hopper",
    due_date: "2030-01-15",
    status: "pending",
    completed_at: null,
    completed_by: null,
    assigned_by: 1,
    created_at: "2026-11-01T00:00:00.000Z",
    training_name: "Bias awareness",
    training_duration: "2 hours",
    training_provider: "Acme",
    training_description: "",
    ...overrides,
  });

  beforeEach(() => {
    Object.values(repo).forEach((mock) => mock.mockReset());
  });

  it("shows each assignment's details and status", async () => {
    repo.getMyTrainingAssignments.mockResolvedValue([mine({ status: "overdue" })]);
    renderWithProviders(<MyTrainingTable />);

    expect(await screen.findByText("Bias awareness")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("2 hours")).toBeInTheDocument();
    expect(screen.getByText("formatted 2030-01-15")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });

  it("marks an open assignment complete", async () => {
    repo.getMyTrainingAssignments.mockResolvedValue([mine()]);
    repo.completeTrainingAssignment.mockResolvedValue(mine());
    renderWithProviders(<MyTrainingTable />);

    const button = await screen.findByTestId("button-my-training-toggle-1");
    expect(button).toHaveTextContent("Mark complete");
    fireEvent.click(button);

    await waitFor(() => expect(repo.completeTrainingAssignment.mock.calls[0][0]).toBe(1));
  });

  it("reopens a completed assignment", async () => {
    repo.getMyTrainingAssignments.mockResolvedValue([
      mine({ status: "completed", completed_at: "2026-11-02T10:00:00.000Z" }),
    ]);
    repo.reopenTrainingAssignment.mockResolvedValue(mine());
    renderWithProviders(<MyTrainingTable />);

    const button = await screen.findByTestId("button-my-training-toggle-1");
    expect(button).toHaveTextContent("Reopen");
    fireEvent.click(button);

    await waitFor(() => expect(repo.reopenTrainingAssignment.mock.calls[0][0]).toBe(1));
  });

  it("shows an error when a change fails", async () => {
    repo.getMyTrainingAssignments.mockResolvedValue([mine()]);
    repo.completeTrainingAssignment.mockRejectedValue(new Error("nope"));
    renderWithProviders(<MyTrainingTable />);

    fireEvent.click(await screen.findByTestId("button-my-training-toggle-1"));

    expect(
      await screen.findByText("The change could not be saved. Please try again."),
    ).toBeInTheDocument();
  });

  it("shows the empty state when nothing is assigned", async () => {
    repo.getMyTrainingAssignments.mockResolvedValue([]);
    renderWithProviders(<MyTrainingTable />);

    expect(
      await screen.findByText("No training has been assigned to you yet."),
    ).toBeInTheDocument();
  });

  it("shows a load error instead of the empty state", async () => {
    repo.getMyTrainingAssignments.mockRejectedValue(new Error("nope"));
    renderWithProviders(<MyTrainingTable />);

    expect(
      await screen.findByText("Your training could not be loaded. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No training has been assigned to you yet.")).not.toBeInTheDocument();
  });
});
