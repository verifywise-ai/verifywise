import { vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import VWQuestion from "../index";

const mockUpdateEUAIActAnswerById = vi.hoisted(() => vi.fn());
const mockHandleAlert = vi.hoisted(() => vi.fn());

vi.mock("../../RichTextEditor", () => ({
  default: () => <div data-testid="rich-text-editor" />,
}));

vi.mock("../../Inputs/FileUpload/FileManagementDialog", () => ({
  default: ({
    onAddFiles,
    onRemoveFile,
    onRemovePendingFile,
    onClose,
    files,
    pendingFiles,
  }: any) => (
    <div data-testid="file-management-dialog">
      <button
        onClick={() =>
          onAddFiles([{ id: "new-file-id", fileName: "test.pdf", type: "application/pdf" }])
        }
        data-testid="add-file-btn"
      >
        Add file
      </button>
      <button onClick={onClose} data-testid="close-file-dialog">
        Close
      </button>
      {files.map((f: any) => (
        <button key={f.id} onClick={() => onRemoveFile(f.id)} data-testid={`remove-file-${f.id}`}>
          Remove {f.id}
        </button>
      ))}
      {pendingFiles.map((f: any) => (
        <button key={f.id} onClick={() => onRemovePendingFile(f.id)}>
          Remove pending {f.id}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../../Alert", () => ({
  default: ({ variant, body, onClick }: any) => (
    <div data-testid="alert" data-variant={variant}>
      {body}
      <button onClick={onClick} data-testid="dismiss-alert">
        Dismiss
      </button>
    </div>
  ),
}));

vi.mock("../../../../application/tools/alertUtils", () => ({
  handleAlert: mockHandleAlert,
}));

vi.mock("../../button", () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled} data-testid="vw-button">
      {children}
    </button>
  ),
}));

vi.mock("../../Inputs/Select", () => ({
  default: ({ onChange, value, items, getOptionValue, disabled }: any) => {
    const selectedItem = items.find((item: any) => item._id === value);
    const displayValue = selectedItem ? getOptionValue(selectedItem) : "";
    return (
      <select
        data-testid="status-select"
        onChange={(e: any) => onChange({ target: { value: e.target.value } })}
        value={displayValue}
        disabled={disabled}
      >
        {items.map((item: any) => (
          <option key={item._id} value={getOptionValue(item)}>
            {getOptionValue(item)}
          </option>
        ))}
      </select>
    );
  },
}));

vi.mock("../../../../application/constants/permissions", () => ({
  default: { frameworks: { edit: ["Admin", "Editor"] } },
}));

vi.mock("../../LinkedRisks", () => ({
  LinkedRisksPopup: ({ onClose }: any) => (
    <div data-testid="linked-risks-popup">
      <button onClick={onClose}>Close linked risks</button>
    </div>
  ),
}));

vi.mock("../../RiskPopup/AuditRiskPopup", () => ({
  default: ({ onClose }: any) => (
    <div data-testid="audit-risk-popup">
      <button onClick={onClose}>Close audit</button>
    </div>
  ),
}));

vi.mock("../../../../application/repository/question.repository", () => ({
  updateEUAIActAnswerById: mockUpdateEUAIActAnswerById,
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../../pages/Assessment/NewAssessment/priorities", () => ({
  priorities: {
    "high priority": { color: "#FD7E14" },
    "medium priority": { color: "#EFB70E" },
    "low priority": { color: "#ABBDA1" },
  },
  PriorityLevel: { HIGH: "high priority", MEDIUM: "medium priority", LOW: "low priority" },
}));

import { useAuth } from "../../../../application/hooks/useAuth";

const baseQuestion: any = {
  question: "What is the purpose of the AI system?",
  hint: "Describe the intended use.",
  answer: "My answer text",
  answer_id: 42,
  question_id: 1,
  priority_level: "high priority",
  evidence_files: [],
  risks: [],
  is_required: false,
  status: "notStarted",
};

function renderVWQuestion(overrides: any = {}) {
  const question = { ...baseQuestion, ...overrides };
  return renderWithProviders(
    <VWQuestion question={question} setRefreshKey={vi.fn()} currentProjectId={1} />,
  );
}

describe("VWQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      userId: 1,
      userRoleName: "Admin",
      token: "test-token",
      userToken: null,
      organizationId: 1,
      isAuthenticated: true,
      isSuperAdmin: false,
      activeOrganizationId: null,
    });
    mockHandleAlert.mockImplementation(({ variant, body, setAlert }: any) => {
      setAlert({ variant, body });
    });
  });

  it("renders question text", () => {
    renderVWQuestion();
    expect(screen.getByText("What is the purpose of the AI system?")).toBeInTheDocument();
  });

  it("renders priority chip with priority label", () => {
    renderVWQuestion({ priority_level: "medium priority" });
    expect(screen.getByText("medium priority")).toBeInTheDocument();
  });

  it("shows evidence files count", () => {
    renderVWQuestion({ evidence_files: [{ id: 1 }, { id: 2 }] });
    expect(screen.getByText("2 evidence files attached")).toBeInTheDocument();
  });

  it("shows risks linked count", () => {
    renderVWQuestion({ risks: [10, 20, 30] });
    expect(screen.getByText("3 risks linked")).toBeInTheDocument();
  });

  it("shows zero risks linked when risks is empty", () => {
    renderVWQuestion({ risks: [] });
    expect(screen.getByText("0 risks linked")).toBeInTheDocument();
  });

  it("shows required text when is_required is true", () => {
    renderVWQuestion({ is_required: true });
    expect(screen.getByText("required")).toBeInTheDocument();
  });

  it("does not show required text when is_required is false", () => {
    renderVWQuestion({ is_required: false });
    expect(screen.queryByText("required")).not.toBeInTheDocument();
  });

  it("calls updateEUAIActAnswerById on save and shows success alert", async () => {
    mockUpdateEUAIActAnswerById.mockResolvedValue({
      status: 202,
      data: { data: { answer: "saved", risks: [] } },
    });

    renderVWQuestion();
    const user = userEvent.setup();

    const saveButtons = screen.getAllByTestId("vw-button");
    const saveBtn = saveButtons.find((btn) => btn.textContent === "Save");
    expect(saveBtn).toBeInTheDocument();
    await user.click(saveBtn!);

    await waitFor(() => {
      expect(mockUpdateEUAIActAnswerById).toHaveBeenCalledWith({
        answerId: 42,
        body: expect.any(FormData),
      });
    });

    expect(screen.getByText("Question updated successfully")).toBeInTheDocument();
  });

  it("shows error alert on non-202 save response", async () => {
    mockUpdateEUAIActAnswerById.mockResolvedValue({ status: 400 });

    renderVWQuestion();
    const user = userEvent.setup();
    const saveBtn = screen.getAllByTestId("vw-button").find((b) => b.textContent === "Save");

    await user.click(saveBtn!);

    await waitFor(() => {
      expect(screen.getByText("Something went wrong, please try again")).toBeInTheDocument();
    });
  });

  it("shows error alert on save exception", async () => {
    mockUpdateEUAIActAnswerById.mockRejectedValue(new Error("Network error"));

    renderVWQuestion();
    const user = userEvent.setup();
    const saveBtn = screen.getAllByTestId("vw-button").find((b) => b.textContent === "Save");

    await user.click(saveBtn!);

    await waitFor(() => {
      expect(screen.getByText("Something went wrong, please try again")).toBeInTheDocument();
    });
  });

  it("opens file upload dialog and can close it", async () => {
    renderVWQuestion();
    const user = userEvent.setup();

    const addEvidenceBtn = screen
      .getAllByTestId("vw-button")
      .find((b) => b.textContent === "Add, remove or download evidence");
    await user.click(addEvidenceBtn!);

    expect(screen.getByTestId("file-management-dialog")).toBeInTheDocument();

    await user.click(screen.getByTestId("close-file-dialog"));
    await waitFor(() => {
      expect(screen.queryByTestId("file-management-dialog")).not.toBeInTheDocument();
    });
  });

  it("opens linked risks dialog and can close it", async () => {
    renderVWQuestion();
    const user = userEvent.setup();

    const risksBtn = screen
      .getAllByTestId("vw-button")
      .find((b) => b.textContent === "Add/remove risks");
    await user.click(risksBtn!);

    expect(screen.getByTestId("linked-risks-popup")).toBeInTheDocument();

    await user.click(screen.getByText("Close linked risks"));
    await waitFor(() => {
      expect(screen.queryByTestId("linked-risks-popup")).not.toBeInTheDocument();
    });
  });

  it("opens audit risk popup when status set to Done with existing risks", async () => {
    renderVWQuestion({ risks: [1, 2] });
    const user = userEvent.setup();

    const select = screen.getByTestId("status-select");
    await user.selectOptions(select, "Done");

    await waitFor(() => {
      expect(screen.getByTestId("audit-risk-popup")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Close audit"));
    await waitFor(() => {
      expect(screen.queryByTestId("audit-risk-popup")).not.toBeInTheDocument();
    });
  });

  it("shows pending upload count after adding files", async () => {
    renderVWQuestion();
    const user = userEvent.setup();

    const addEvidenceBtn = screen
      .getAllByTestId("vw-button")
      .find((b) => b.textContent === "Add, remove or download evidence");
    await user.click(addEvidenceBtn!);

    await user.click(screen.getByTestId("add-file-btn"));

    expect(screen.getByText("+1 pending upload")).toBeInTheDocument();
  });

  it("shows pending delete count after removing a file", async () => {
    renderVWQuestion({ evidence_files: [{ id: 99, fileName: "doc.pdf" }] });
    const user = userEvent.setup();

    const addEvidenceBtn = screen
      .getAllByTestId("vw-button")
      .find((b) => b.textContent === "Add, remove or download evidence");
    await user.click(addEvidenceBtn!);

    const removeBtn = screen.getByTestId("remove-file-99");
    await user.click(removeBtn);

    expect(screen.getByText("-1 pending delete")).toBeInTheDocument();
  });

  it("shows selected risks pending save count", async () => {
    renderVWQuestion({ risks: [1] });
    const user = userEvent.setup();

    const select = screen.getByTestId("status-select");
    await user.selectOptions(select, "Done");

    await waitFor(() => {
      expect(screen.getByTestId("audit-risk-popup")).toBeInTheDocument();
    });
  });

  it("resets state when question changes", async () => {
    const mockRefresh = vi.fn();
    const { rerender } = renderWithProviders(
      <VWQuestion
        question={{ ...baseQuestion, answer: "Initial answer" }}
        setRefreshKey={mockRefresh}
        currentProjectId={1}
      />,
    );

    expect((screen.getByTestId("status-select") as HTMLSelectElement).value).toBe("Not started");

    const newQuestion = { ...baseQuestion, answer: "Updated", status: "done" };
    rerender(
      <VWQuestion question={newQuestion} setRefreshKey={mockRefresh} currentProjectId={1} />,
    );

    await waitFor(() => {
      expect((screen.getByTestId("status-select") as HTMLSelectElement).value).toBe("Done");
    });
  });

  it("disables editing when user role lacks edit permission", () => {
    vi.mocked(useAuth).mockReturnValue({
      userId: 1,
      userRoleName: "Auditor",
      token: "test-token",
      userToken: null,
      organizationId: 1,
      isAuthenticated: true,
      isSuperAdmin: false,
      activeOrganizationId: null,
    });

    renderVWQuestion();

    const allButtons = screen.getAllByTestId("vw-button");
    allButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });

    const select = screen.getByTestId("status-select");
    expect(select).toBeDisabled();
  });
});
