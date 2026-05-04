import { vi } from "vitest";

vi.mock("../../Modals/StandardModal", () => ({
  default: ({ isOpen, children, title }: any) =>
    isOpen ? (
      <div data-testid="standard-modal">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));
vi.mock("../../../../application/repository/file.repository", () => ({
  getFilesWithMetadata: vi.fn().mockResolvedValue({ data: [] }),
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FilePickerModal } from "../index";

describe("FilePickerModal", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<FilePickerModal open={true} onClose={vi.fn()} onSelect={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });

  it("does not render content when closed", () => {
    const { container } = renderWithProviders(
      <FilePickerModal open={false} onClose={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(container.querySelector("[data-testid='standard-modal']")).toBeNull();
  });
});
