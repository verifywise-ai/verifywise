import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import dayjs, { type Dayjs } from "dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import type { TrainingAssignment } from "../../../../../application/repository/trainingAssignment.repository";
import TrainingAssignmentsModal from "../index";

const SAVE_ERROR = "The change could not be saved. Please try again.";
const FUTURE_DATE = dayjs().add(10, "day").format("YYYY-MM-DD");

const PEOPLE = [
  { id: 7, name: "Grace", surname: "Hopper", email: "grace@example.com" },
  { id: 8, name: "Alan", surname: "Turing", email: "alan@example.com" },
  { id: 9, name: "Ada", surname: "Lovelace", email: "ada@example.com" },
];

const { repo, authMock, usersMock } = vi.hoisted(() => ({
  repo: {
    getTrainingAssignments: vi.fn(),
    createTrainingAssignments: vi.fn(),
    completeAllTrainingAssignments: vi.fn(),
    updateTrainingAssignmentDueDate: vi.fn(),
    completeTrainingAssignment: vi.fn(),
    reopenTrainingAssignment: vi.fn(),
    deleteTrainingAssignment: vi.fn(),
    getMyTrainingAssignments: vi.fn(),
    getTrainingAssignmentSummary: vi.fn(),
  },
  authMock: vi.fn(() => ({ userRoleName: "Admin" })),
  usersMock: vi.fn(),
}));

vi.mock("../../../../../application/repository/trainingAssignment.repository", () => repo);
vi.mock("../../../../../application/hooks/useAuth", () => ({ useAuth: authMock }));
vi.mock("../../../../../application/hooks/useUsers", () => ({ default: usersMock }));
vi.mock("../../../../../application/hooks/useFormattedDate", () => ({
  default: () => (date: string) => `formatted ${date}`,
}));

// The real picker and autocomplete are popup widgets with their own tests.
vi.mock("../../../Inputs/Datepicker", () => ({
  default: ({
    id,
    date,
    handleDateChange,
    onAccept,
    onBlur,
    minDate,
    error,
  }: {
    id: string;
    date: Dayjs | null;
    handleDateChange: (value: Dayjs | null) => void;
    onAccept?: (value: Dayjs | null) => void;
    onBlur?: () => void;
    minDate?: Dayjs;
    error?: string;
  }) => (
    <div>
      <input
        data-testid={id}
        data-min-date={minDate?.format("YYYY-MM-DD") ?? ""}
        value={date ? date.format("YYYY-MM-DD") : ""}
        onChange={(event) => handleDateChange(dayjs(event.target.value))}
        onBlur={onBlur}
      />
      <button
        type="button"
        data-testid={`${id}-pick`}
        onClick={() => onAccept?.(dayjs(FUTURE_DATE))}
      />
      {error && <span>{error}</span>}
    </div>
  ),
}));

vi.mock("../../../Inputs/Autocomplete", () => ({
  default: ({
    options,
    onChange,
    getOptionLabel,
  }: {
    options: typeof PEOPLE;
    onChange: (event: unknown, value: typeof PEOPLE) => void;
    getOptionLabel: (option: (typeof PEOPLE)[number]) => string;
  }) => (
    <div data-testid="people-picker">
      {options.map((option) => (
        <span key={option.id}>{getOptionLabel(option)}</span>
      ))}
      <button type="button" data-testid="pick-all-people" onClick={() => onChange(null, options)} />
    </div>
  ),
}));

const assignment = (overrides: Partial<TrainingAssignment> = {}): TrainingAssignment => ({
  id: 1,
  training_id: 5,
  user_id: 7,
  user_name: "Grace",
  user_surname: "Hopper",
  due_date: FUTURE_DATE,
  status: "pending",
  completed_at: null,
  completed_by: null,
  assigned_by: 1,
  created_at: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

const renderModal = () =>
  renderWithProviders(
    <TrainingAssignmentsModal
      isOpen
      onClose={vi.fn()}
      trainingId={5}
      trainingName="Responsible AI basics"
    />,
  );

const setDueDate = (value: string) =>
  fireEvent.change(screen.getByTestId("training-assignment-due-date"), {
    target: { value },
  });

describe("TrainingAssignmentsModal", () => {
  beforeEach(() => {
    Object.values(repo).forEach((mock) => mock.mockReset());
    repo.getTrainingAssignments.mockResolvedValue([]);
    authMock.mockReturnValue({ userRoleName: "Admin" });
    usersMock.mockReturnValue({ users: PEOPLE, loading: false, error: null });
  });

  it("names the training in the title", async () => {
    renderModal();

    expect(await screen.findByText("Responsible AI basics")).toBeInTheDocument();
  });

  describe.each(["Reviewer", "Auditor"])("as a %s", (userRoleName) => {
    it("is read only", async () => {
      authMock.mockReturnValue({ userRoleName });
      repo.getTrainingAssignments.mockResolvedValue([assignment()]);
      renderModal();

      await screen.findByTestId("training-assignment-row-1");
      expect(screen.getByText(`formatted ${FUTURE_DATE}`)).toBeInTheDocument();
      expect(screen.queryByTestId("people-picker")).not.toBeInTheDocument();
      expect(screen.queryByTestId("button-training-assignment-assign")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("button-training-assignment-complete-all"),
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId("button-training-assignment-toggle-1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("button-training-assignment-remove-1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("training-assignment-due-date-1")).not.toBeInTheDocument();
    });
  });

  describe.each(["Admin", "Editor"])("as an %s", (userRoleName) => {
    it("offers every edit control", async () => {
      authMock.mockReturnValue({ userRoleName });
      repo.getTrainingAssignments.mockResolvedValue([assignment()]);
      renderModal();

      await screen.findByTestId("training-assignment-row-1");
      expect(screen.getByTestId("people-picker")).toBeInTheDocument();
      expect(screen.getByTestId("button-training-assignment-assign")).toBeInTheDocument();
      expect(screen.getByTestId("button-training-assignment-complete-all")).toBeInTheDocument();
      expect(screen.getByTestId("button-training-assignment-toggle-1")).toBeInTheDocument();
      expect(screen.getByTestId("button-training-assignment-remove-1")).toBeInTheDocument();
      expect(screen.getByTestId("training-assignment-due-date-1")).toBeInTheDocument();
    });
  });

  it("does not offer people who are already assigned", async () => {
    repo.getTrainingAssignments.mockResolvedValue([assignment()]);
    renderModal();

    await screen.findByTestId("training-assignment-row-1");
    const picker = screen.getByTestId("people-picker");
    expect(within(picker).queryByText("Grace Hopper")).not.toBeInTheDocument();
    expect(within(picker).getByText("Alan Turing")).toBeInTheDocument();
  });

  it("requires both people and a due date before assigning", async () => {
    renderModal();
    await screen.findByText("Nobody is assigned to this training yet.");
    const assign = screen.getByTestId("button-training-assignment-assign");

    expect(assign).toBeDisabled();
    fireEvent.click(screen.getByTestId("pick-all-people"));
    expect(assign).toBeDisabled();
    setDueDate(FUTURE_DATE);
    expect(assign).toBeEnabled();
  });

  it("rejects a past due date and blocks past days in the picker", async () => {
    renderModal();
    await screen.findByText("Nobody is assigned to this training yet.");

    expect(screen.getByTestId("training-assignment-due-date")).toHaveAttribute(
      "data-min-date",
      dayjs().format("YYYY-MM-DD"),
    );
    fireEvent.click(screen.getByTestId("pick-all-people"));
    setDueDate("2020-01-01");

    expect(screen.getByText("Choose today or a later date.")).toBeInTheDocument();
    expect(screen.getByTestId("button-training-assignment-assign")).toBeDisabled();
  });

  it("sends the picked people and date, then names anyone skipped", async () => {
    repo.createTrainingAssignments.mockResolvedValue({ created: [], skipped_user_ids: [8] });
    renderModal();
    await screen.findByText("Nobody is assigned to this training yet.");

    fireEvent.click(screen.getByTestId("pick-all-people"));
    setDueDate(FUTURE_DATE);
    fireEvent.click(screen.getByTestId("button-training-assignment-assign"));

    await waitFor(() =>
      expect(repo.createTrainingAssignments.mock.calls[0][0]).toEqual({
        training_id: 5,
        user_ids: [7, 8, 9],
        due_date: FUTURE_DATE,
      }),
    );
    expect(
      await screen.findByText("Already assigned, so skipped: Alan Turing"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("training-assignment-due-date")).toHaveValue("");
  });

  it("shows a save error in the modal and keeps the selections", async () => {
    repo.createTrainingAssignments.mockRejectedValue(new Error("nope"));
    renderModal();
    await screen.findByText("Nobody is assigned to this training yet.");

    fireEvent.click(screen.getByTestId("pick-all-people"));
    setDueDate(FUTURE_DATE);
    fireEvent.click(screen.getByTestId("button-training-assignment-assign"));

    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
    expect(screen.getByTestId("training-assignment-due-date")).toHaveValue(FUTURE_DATE);
    await waitFor(() =>
      expect(screen.getByTestId("button-training-assignment-assign")).toBeEnabled(),
    );
  });

  it("marks a person complete and reopens a completed one", async () => {
    repo.getTrainingAssignments.mockResolvedValue([
      assignment(),
      assignment({
        id: 2,
        user_id: 8,
        status: "completed",
        completed_at: "2026-11-02T10:00:00.000Z",
      }),
    ]);
    repo.completeTrainingAssignment.mockResolvedValue(assignment());
    repo.reopenTrainingAssignment.mockResolvedValue(assignment());
    renderModal();

    fireEvent.click(await screen.findByTestId("button-training-assignment-toggle-1"));
    await waitFor(() => expect(repo.completeTrainingAssignment.mock.calls[0][0]).toBe(1));
    await waitFor(() =>
      expect(screen.getByTestId("button-training-assignment-toggle-2")).toBeEnabled(),
    );

    fireEvent.click(screen.getByTestId("button-training-assignment-toggle-2"));
    await waitFor(() => expect(repo.reopenTrainingAssignment.mock.calls[0][0]).toBe(2));
  });

  it("only removes a person after confirmation", async () => {
    repo.getTrainingAssignments.mockResolvedValue([assignment()]);
    repo.deleteTrainingAssignment.mockResolvedValue(undefined);
    renderModal();

    fireEvent.click(await screen.findByTestId("button-training-assignment-remove-1"));
    expect(repo.deleteTrainingAssignment).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog", { name: "Remove this assignment?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(repo.deleteTrainingAssignment.mock.calls[0][0]).toBe(1));
  });

  it("only marks all complete after confirmation", async () => {
    repo.getTrainingAssignments.mockResolvedValue([assignment()]);
    repo.completeAllTrainingAssignments.mockResolvedValue({ completed: 1 });
    renderModal();

    fireEvent.click(await screen.findByTestId("button-training-assignment-complete-all"));
    expect(repo.completeAllTrainingAssignments).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog", { name: "Mark all complete?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark all complete" }));

    await waitFor(() => expect(repo.completeAllTrainingAssignments.mock.calls[0][0]).toBe(5));
  });

  it("hides mark all complete when nothing is open", async () => {
    repo.getTrainingAssignments.mockResolvedValue([
      assignment({ status: "completed", completed_at: "2026-11-02T10:00:00.000Z" }),
    ]);
    renderModal();

    await screen.findByTestId("training-assignment-row-1");
    expect(screen.queryByTestId("button-training-assignment-complete-all")).not.toBeInTheDocument();
  });

  it("saves a due date picked from the calendar", async () => {
    repo.getTrainingAssignments.mockResolvedValue([
      assignment({ due_date: dayjs().add(3, "day").format("YYYY-MM-DD") }),
    ]);
    repo.updateTrainingAssignmentDueDate.mockResolvedValue(assignment());
    renderModal();

    fireEvent.click(await screen.findByTestId("training-assignment-due-date-1-pick"));

    await waitFor(() =>
      expect(repo.updateTrainingAssignmentDueDate.mock.calls[0][0]).toEqual({
        id: 1,
        dueDate: FUTURE_DATE,
      }),
    );
  });

  it("does not save when the same date is picked again", async () => {
    repo.getTrainingAssignments.mockResolvedValue([assignment({ due_date: FUTURE_DATE })]);
    renderModal();

    fireEvent.click(await screen.findByTestId("training-assignment-due-date-1-pick"));

    expect(repo.updateTrainingAssignmentDueDate).not.toHaveBeenCalled();
  });

  it("keeps the stored date and explains when saving it fails", async () => {
    const saved = dayjs().add(3, "day").format("YYYY-MM-DD");
    repo.getTrainingAssignments.mockResolvedValue([assignment({ due_date: saved })]);
    repo.updateTrainingAssignmentDueDate.mockRejectedValue(new Error("nope"));
    renderModal();

    fireEvent.click(await screen.findByTestId("training-assignment-due-date-1-pick"));

    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
    expect(screen.getByTestId("training-assignment-due-date-1")).toHaveValue(saved);
  });

  it("shows a dash, not a date, for someone who has not completed", async () => {
    repo.getTrainingAssignments.mockResolvedValue([assignment()]);
    renderModal();

    const row = await screen.findByTestId("training-assignment-row-1");
    expect(within(row).getByText("-")).toBeInTheDocument();
  });

  it("shows a load error instead of an empty list", async () => {
    repo.getTrainingAssignments.mockRejectedValue(new Error("nope"));
    renderModal();

    expect(
      await screen.findByText("Assignments could not be loaded. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nobody is assigned to this training yet.")).not.toBeInTheDocument();
  });
});
