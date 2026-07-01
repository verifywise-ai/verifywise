import { vi } from "vitest";

vi.mock("../../../button/customizable-button", () => ({
  CustomizableButton: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <StandardModal
        isOpen={true}
        onClose={onClose}
        title="Test Modal"
        description="Test description"
      >
        <div>Modal content</div>
      </StandardModal>,
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
