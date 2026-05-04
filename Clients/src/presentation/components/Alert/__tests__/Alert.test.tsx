import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import Alert from "../index";

describe("Alert Component", () => {
  it("renders with success variant", () => {
    renderWithProviders(<Alert variant="success" title="Done!" body="Operation completed." />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Done!")).toBeInTheDocument();
    expect(screen.getByText("Operation completed.")).toBeInTheDocument();
  });

  it("renders with error variant", () => {
    renderWithProviders(<Alert variant="error" body="Something went wrong." />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
  });

  it("renders with warning variant", () => {
    renderWithProviders(<Alert variant="warning" body="Please review." />);

    expect(screen.getByText("Please review.")).toBeInTheDocument();
  });

  it("renders with info variant", () => {
    renderWithProviders(<Alert variant="info" body="FYI: System update tonight." />);

    expect(screen.getByText("FYI: System update tonight.")).toBeInTheDocument();
  });

  it("shows close button when isToast is true", () => {
    renderWithProviders(<Alert variant="info" body="Closable" isToast onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: /close notification/i })).toBeInTheDocument();
  });

  it("does not show close button when isToast is false", () => {
    renderWithProviders(<Alert variant="info" body="Not closable" />);

    expect(screen.queryByRole("button", { name: /close notification/i })).not.toBeInTheDocument();
  });

  it("calls onClick when close button is clicked", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<Alert variant="error" body="Dismiss me" isToast onClick={handleClick} />);

    await user.click(screen.getByRole("button", { name: /close notification/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("hides icon when hasIcon is false", () => {
    renderWithProviders(<Alert variant="success" body="No icon" hasIcon={false} />);

    // The icon container has aria-hidden="true" - should not be present
    expect(screen.queryByLabelText("aria-hidden")).not.toBeInTheDocument();
    expect(screen.getByText("No icon")).toBeInTheDocument();
  });

  it("renders title and body together", () => {
    renderWithProviders(<Alert variant="info" title="Notice" body="Check this out." />);

    expect(screen.getByText("Notice")).toBeInTheDocument();
    expect(screen.getByText("Check this out.")).toBeInTheDocument();
  });
});
