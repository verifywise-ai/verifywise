import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SkipConfirmation from "../SkipConfirmation";

vi.mock("../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));

describe("SkipConfirmation", () => {
  it("renders when open is true", () => {
    renderWithProviders(<SkipConfirmation open={true} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Are you sure you want to skip?")).toBeInTheDocument();
    expect(
      screen.getByText("You can always revisit this onboarding from your profile menu."),
    ).toBeInTheDocument();
  });

  it("calls onConfirm when Skip button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(<SkipConfirmation open={true} onConfirm={onConfirm} onCancel={vi.fn()} />);
    await user.click(screen.getByText("Skip"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Continue onboarding button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWithProviders(<SkipConfirmation open={true} onConfirm={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByText("Continue onboarding"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
