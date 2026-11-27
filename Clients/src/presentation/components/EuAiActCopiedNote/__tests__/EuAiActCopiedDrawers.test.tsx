import { screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { renderWithProviders } from "../../../../test/renderWithProviders";

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Admin", userId: 1 }),
}));
const NO_USERS: never[] = [];
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: NO_USERS }),
}));
vi.mock("../../../../application/repository/entity.repository", () => ({
  getEntityById: vi.fn().mockResolvedValue({ data: null }),
}));
vi.mock("../../../../application/repository/file.repository", () => ({
  getFileById: vi.fn(),
  attachFilesToEntity: vi.fn(),
  getEntityFiles: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../../../application/repository/question.repository", () => ({
  updateEUAIActAnswerById: vi.fn(),
}));
vi.mock("../../../../application/repository/assesment.repository", () => ({
  getAssessmentTopicById: vi.fn(),
}));
vi.mock("../../../../application/repository/control_eu_act.repository", () => ({
  updateControl: vi.fn(),
}));
vi.mock("../../RichTextEditor", () => ({
  default: () => <div data-testid="rich-text-editor" />,
}));
vi.mock("../../Notes/NotesTab", () => ({ default: () => null }));
vi.mock("../../Common/HistorySidebar", () => ({ HistorySidebar: () => null }));

import EUAIActQuestionDrawerDialog from "../../Drawer/EUAIActQuestionDrawerDialog";
import NewControlPane from "../../Modals/Controlpane/NewControlPane";
import { EuAiActCopiedNote, EuAiActReviewBadge } from "../index";

const COPIED_LINE =
  "Copied from Credit scoring (UC-12) when this moved to the organization. Review it, then save.";
const UNNAMED_LINE =
  "Copied from a use case when this moved to the organization. Review it, then save.";

const question = {
  answer_id: 1,
  question_id: 1,
  question: "Do you prohibit social scoring?",
  answer: "",
  status: "Not started",
  hint: "",
  priority_level: "high priority",
  is_required: true,
  evidence_files: [],
  risks: [],
};

const subtopic = { id: 1, topic_id: 1, title: "Prohibited practices" };

const control = {
  id: 5,
  title: "AI literacy",
  description: "",
  order_no: 1,
  control_category_id: 1,
  subControls: [
    {
      id: 51,
      order_no: 1,
      title: "Train staff",
      description: "",
      status: "Waiting",
      evidence_files: [],
      feedback_files: [],
      risks: [],
    },
  ],
};

describe("EuAiActCopiedNote", () => {
  it("names the use case when the server returns its label", () => {
    renderWithProviders(
      <EuAiActCopiedNote
        item={{ copied_from_project_id: 12, copied_from_use_case: "Credit scoring (UC-12)" }}
      />,
    );
    expect(screen.getByText(COPIED_LINE)).toBeInTheDocument();
  });

  it("names no use case when the label is withheld, and renders nothing unmarked", () => {
    const { rerender } = renderWithProviders(
      <EuAiActCopiedNote item={{ copied_from_project_id: 12, copied_from_use_case: null }} />,
    );
    expect(screen.getByText(UNNAMED_LINE)).toBeInTheDocument();
    rerender(<EuAiActCopiedNote item={{ copied_from_project_id: null }} />);
    expect(screen.queryByText(/Copied from/)).not.toBeInTheDocument();
  });

  it("shows the Review badge only on marked items", () => {
    const { rerender } = renderWithProviders(
      <EuAiActReviewBadge item={{ copied_from_project_id: 12, copied_from_use_case: "X" }} />,
    );
    expect(screen.getByText("Review")).toBeInTheDocument();
    rerender(<EuAiActReviewBadge item={{ copied_from_project_id: null }} />);
    expect(screen.queryByText("Review")).not.toBeInTheDocument();
  });
});

describe("EU AI Act question drawer", () => {
  const renderDrawer = (extra: Record<string, unknown>) =>
    renderWithProviders(
      <EUAIActQuestionDrawerDialog
        open
        onClose={vi.fn()}
        onSaveSuccess={vi.fn()}
        question={{ ...question, ...extra } as any}
        subtopic={subtopic as any}
        currentProjectId={1}
      />,
    );

  it("shows the copied line when the answer was copied from a use case", async () => {
    renderDrawer({ copied_from_project_id: 12, copied_from_use_case: "Credit scoring (UC-12)" });
    expect(await screen.findByText(COPIED_LINE)).toBeInTheDocument();
  });

  it("names no use case when the server leaves its label out", async () => {
    renderDrawer({ copied_from_project_id: 12, copied_from_use_case: null });
    expect(await screen.findByText(UNNAMED_LINE)).toBeInTheDocument();
    expect(screen.queryByText(COPIED_LINE)).not.toBeInTheDocument();
  });

  it("shows no copied line otherwise", async () => {
    renderDrawer({ copied_from_project_id: null, copied_from_use_case: null });
    await waitFor(() => expect(screen.getByText("Do you prohibit social scoring?")).toBeTruthy());
    expect(screen.queryByText(/Copied from/)).not.toBeInTheDocument();
  });
});

describe("EU AI Act control drawer", () => {
  const renderPane = (data: any) =>
    renderWithProviders(
      <NewControlPane
        data={data}
        isOpen
        handleClose={vi.fn()}
        controlCategoryId="4"
        projectId={1}
      />,
    );

  it("shows the copied line once, in the header, when the control was copied", async () => {
    renderPane({
      ...control,
      copied_from_project_id: 12,
      copied_from_use_case: "Credit scoring (UC-12)",
      subControls: control.subControls.map((sc) => ({
        ...sc,
        copied_from_project_id: 12,
        copied_from_use_case: "Credit scoring (UC-12)",
      })),
    });
    expect(await screen.findAllByText(COPIED_LINE)).toHaveLength(1);
  });

  it("shows the line in the subcontrol section when only the subcontrol was copied", async () => {
    renderPane({
      ...control,
      subControls: control.subControls.map((sc) => ({
        ...sc,
        copied_from_project_id: 12,
        copied_from_use_case: "Credit scoring (UC-12)",
      })),
    });
    expect(await screen.findAllByText(COPIED_LINE)).toHaveLength(1);
  });

  it("shows the unnamed line when the control's use case is hidden from the viewer", async () => {
    renderPane({ ...control, copied_from_project_id: 12, copied_from_use_case: null });
    expect(await screen.findAllByText(UNNAMED_LINE)).toHaveLength(1);
  });

  it("shows no copied line when nothing was copied", async () => {
    renderPane(control);
    await waitFor(() => expect(screen.getByText("4.1 AI literacy")).toBeTruthy());
    expect(screen.queryByText(/Copied from/)).not.toBeInTheDocument();
  });
});
