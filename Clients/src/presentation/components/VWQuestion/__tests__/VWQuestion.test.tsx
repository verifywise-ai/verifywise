import { vi } from "vitest";

vi.mock("../../RichTextEditor", () => ({
  default: () => <div data-testid="rich-text-editor" />,
}));
vi.mock("../../Inputs/FileUpload/FileManagementDialog", () => ({
  default: () => null,
}));
vi.mock("../../Alert", () => ({
  default: () => null,
}));
vi.mock("../../../../application/tools/alertUtils", () => ({
  handleAlert: vi.fn(),
}));
vi.mock("../../button", () => ({
  Button: ({ children }: any) => <button>{children}</button>,
}));
vi.mock("../../Inputs/Select", () => ({
  default: () => <div data-testid="select" />,
}));
vi.mock("../../../../application/constants/permissions", () => ({
  default: { canEdit: ["Admin", "Editor"] },
}));
vi.mock("../../LinkedRisks", () => ({
  LinkedRisksPopup: () => null,
}));
vi.mock("../../RiskPopup/AuditRiskPopup", () => ({
  default: () => null,
}));
vi.mock("../../../../application/repository/question.repository", () => ({
  updateEUAIActAnswerById: vi.fn(),
}));
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1, roleName: "Admin" }),
}));
vi.mock("../../../pages/Assessment/NewAssessment/priorities", () => ({
  priorities: [
    { level: "high", label: "High", color: "#ff0000" },
    { level: "medium", label: "Medium", color: "#ffaa00" },
    { level: "low", label: "Low", color: "#00aa00" },
  ],
  PriorityLevel: { HIGH: "high", MEDIUM: "medium", LOW: "low" },
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import VWQuestion from "../index";

describe("VWQuestion", () => {
  it("renders without crashing", () => {
    renderWithProviders(
      <VWQuestion
        question={
          {
            id: 1,
            question: "What is the purpose of the AI system?",
            hint: "Describe the intended use.",
            answer: "",
            priorityLevel: "high",
            evidenceFiles: [],
            subtopicId: 1,
            assessmentId: 1,
          } as any
        }
        setRefreshKey={vi.fn()}
        currentProjectId={1}
      />,
    );
    expect(document.body).toBeTruthy();
  });
});
