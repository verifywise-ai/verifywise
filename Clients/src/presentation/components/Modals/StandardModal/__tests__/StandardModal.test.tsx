import { vi } from "vitest";

vi.mock("../../../button/customizable-button", () => ({
  CustomizableButton: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import StandardModal from "../index";

describe("StandardModal", () => {
  it("renders title and children when open", () => {
    renderWithProviders(
      <StandardModal
        isOpen={true}
        onClose={vi.fn()}
        title="Test Modal"
        description="Test description"
      >
        <div>Modal content</div>
      </StandardModal>,
    );
    expect(screen.getByText("Test Modal")).toBeInTheDocument();
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    renderWithProviders(
      <StandardModal
        isOpen={false}
        onClose={vi.fn()}
        title="Test Modal"
        description="Test description"
      >
        <div>Modal content</div>
      </StandardModal>,
    );
    expect(screen.queryByText("Modal content")).not.toBeInTheDocument();
  });
});
