import { vi } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("../../../components/RichTextEditor/index", () => ({
  default: () => <div data-testid="rich-text-editor" />,
}));
vi.mock("../../Inputs/FileUpload/FileManagementDialog", () => ({
  default: () => <div data-testid="file-management-dialog" />,
}));
vi.mock("../../../components/Alert", () => ({
  default: () => null,
}));
vi.mock("../../../../application/tools/alertUtils", () => ({
  handleAlert: vi.fn(),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AuditorFeedback from "../ComplianceFeedback";

const defaultProps = {
  activeSection: "Evidence",
  feedback: "Test feedback",
  onChange: vi.fn(),
  files: [],
  onFilesChange: vi.fn(),
  deletedFilesIds: [],
  onDeletedFilesChange: vi.fn(),
  uploadFiles: [],
  onUploadFilesChange: vi.fn(),
};

describe("AuditorFeedback (ComplianceFeedback)", () => {
  it("renders without crashing", () => {
    renderWithProviders(<AuditorFeedback {...defaultProps} />);
    expect(document.body).toBeTruthy();
  });

  it("renders Evidence label when activeSection is Evidence", () => {
    renderWithProviders(<AuditorFeedback {...defaultProps} activeSection="Evidence" />);
    expect(screen.getByText("Evidence:")).toBeInTheDocument();
  });

  it("renders Feedback label when activeSection is Feedback", () => {
    renderWithProviders(<AuditorFeedback {...defaultProps} activeSection="Feedback" />);
    expect(screen.getByText("Feedback:")).toBeInTheDocument();
  });

  it("renders the add evidence button", () => {
    renderWithProviders(<AuditorFeedback {...defaultProps} />);
    expect(screen.getByText("Add, remove or download evidence")).toBeInTheDocument();
  });

  it("shows evidence file count", () => {
    renderWithProviders(<AuditorFeedback {...defaultProps} />);
    expect(screen.getByText("0 evidence files attached")).toBeInTheDocument();
  });

  it("shows pending upload count when uploadFiles present", () => {
    const uploadFiles = [{ id: "1", name: "test.pdf", type: "application/pdf", size: 100 }] as any;
    renderWithProviders(<AuditorFeedback {...defaultProps} uploadFiles={uploadFiles} />);
    expect(screen.getByText("1 file pending upload")).toBeInTheDocument();
  });

  it("disables button when readOnly", () => {
    renderWithProviders(<AuditorFeedback {...defaultProps} readOnly={true} />);
    expect(screen.getByText("Add, remove or download evidence")).toBeDisabled();
  });
});
