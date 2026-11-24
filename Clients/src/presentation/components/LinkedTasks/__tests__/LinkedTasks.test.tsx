import { vi } from "vitest";

vi.mock("../../../../application/repository/task.repository", () => ({
  getAllTasks: vi.fn(),
}));
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [
      { id: 5, name: "Ada", surname: "Owner", email: "ada@example.com" },
      { id: 6, name: "Bo", surname: "Helper", email: "bo@example.com" },
    ],
    loading: false,
    error: null,
    refreshUsers: vi.fn(),
  }),
}));
const navigate = vi.fn();
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigate,
}));

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { getAllTasks } from "../../../../application/repository/task.repository";
import LinkedTasks from "../index";

const mockGetAllTasks = getAllTasks as unknown as ReturnType<typeof vi.fn>;

const renderList = () =>
  renderWithProviders(
    <LinkedTasks entityType="incident" entityId={12} emptyMessage="Nothing linked." />,
  );

describe("LinkedTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks only for tasks linked to the entity", async () => {
    mockGetAllTasks.mockResolvedValue({ data: { tasks: [] } });
    renderList();

    await screen.findByText("Nothing linked.");
    expect(mockGetAllTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        linked_entity: { entity_type: "incident", entity_id: 12 },
        suppressGlobalErrorToast: true,
      }),
    );
    expect(mockGetAllTasks.mock.calls[0][0].include_archived).toBeUndefined();
  });

  it("lists each task with its status, assignees and due date state", async () => {
    mockGetAllTasks.mockResolvedValue({
      data: {
        tasks: [
          {
            id: 700,
            title: "Respond to critical incident INC-12",
            status: "In Progress",
            assignees: [5, 6],
          },
          { id: 701, title: "Write the post-mortem", status: "Open", assignees: [] },
        ],
      },
    });
    renderList();

    expect(await screen.findByText("Respond to critical incident INC-12")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Ada Owner, Bo Helper")).toBeInTheDocument();
    expect(screen.getByText("Write the post-mortem")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getAllByText("No due date")).toHaveLength(2);
  });

  it("opens a task on the tasks page when clicked", async () => {
    mockGetAllTasks.mockResolvedValue({
      data: { tasks: [{ id: 700, title: "Contain the harm", status: "Open", assignees: [5] }] },
    });
    renderList();

    await userEvent.click(await screen.findByTestId("linked-task-700"));
    expect(navigate).toHaveBeenCalledWith("/tasks?taskId=700");
  });

  it("says so when the tasks cannot be loaded", async () => {
    mockGetAllTasks.mockRejectedValue(new Error("network"));
    renderList();

    expect(await screen.findByText("Could not load the linked tasks.")).toBeInTheDocument();
  });
});
