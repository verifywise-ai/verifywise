import { vi } from "vitest";

vi.mock("../../../../../application/repository/file.repository", () => ({
  uploadFileToManager: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../../../../application/repository/approvalWorkflow.repository", () => ({
  getApprovalWorkflowsByEntityType: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../../Inputs/Select", () => ({
  default: () => <div data-testid="select" />,
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import FileManagerUploadModal from "../index";

describe("FileManagerUploadModal", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<FileManagerUploadModal open={true} onClose={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});
