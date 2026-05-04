import { vi } from "vitest";

vi.mock("../../Dialogs/ConfirmationModal", () => ({
  default: () => <div data-testid="confirmation-modal" />,
}));
vi.mock("../../Modals/ModelRiskConfirmation", () => ({
  default: () => <div data-testid="model-risk-confirmation" />,
}));
vi.mock("../../../themes/v1SingleTheme", () => ({
  default: {
    textStyles: { bodyLarge: {} },
    dropDownStyles: { primary: { borderRadius: 4 } },
  },
}));
vi.mock("../../Alert", () => ({
  default: () => <div data-testid="alert" />,
}));
vi.mock("../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => true,
}));

import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import IconButton from "../index";

describe("IconButton", () => {
  const defaultProps = {
    id: 1,
    onDelete: vi.fn(),
    onEdit: vi.fn(),
    warningTitle: "Delete Item",
    warningMessage: "Are you sure?",
    type: "vendor" as const,
  };

  it("renders the settings icon button", () => {
    renderWithProviders(<IconButton {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("opens menu on click", () => {
    renderWithProviders(<IconButton {...defaultProps} />);
    const button = screen.getAllByRole("button")[0];
    fireEvent.click(button);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
