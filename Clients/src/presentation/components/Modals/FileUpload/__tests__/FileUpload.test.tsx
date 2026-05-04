import { vi } from "vitest";

vi.mock("../../../Inputs/FileUpload", () => ({
  default: () => <div data-testid="file-upload-component" />,
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import FileUploadModal from "../index";

describe("FileUploadModal", () => {
  it("renders without crashing", () => {
    renderWithProviders(
      <FileUploadModal
        uploadProps={
          {
            onUpload: vi.fn(),
            allowedTypes: [],
            maxSize: 10000000,
          } as any
        }
      />,
    );
    expect(document.body).toBeTruthy();
  });
});
