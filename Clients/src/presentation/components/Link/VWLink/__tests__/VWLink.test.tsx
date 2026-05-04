import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { VWLink } from "../index";

describe("VWLink Component", () => {
  it("renders children text", () => {
    renderWithProviders(<VWLink>Click me</VWLink>);

    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("renders as a link with the provided url", () => {
    renderWithProviders(
      <VWLink url="https://example.com" testId="vw-link">
        Example
      </VWLink>,
    );

    const link = screen.getByTestId("vw-link");
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("opens in new tab when openInNewTab is true", () => {
    renderWithProviders(
      <VWLink url="https://example.com" openInNewTab testId="vw-link">
        External
      </VWLink>,
    );

    const link = screen.getByTestId("vw-link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not set target when openInNewTab is false", () => {
    renderWithProviders(
      <VWLink url="https://example.com" testId="vw-link">
        Internal
      </VWLink>,
    );

    const link = screen.getByTestId("vw-link");
    expect(link).not.toHaveAttribute("target");
  });

  it("calls onClick handler when clicked", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <VWLink onClick={handleClick} testId="vw-link">
        Open Modal
      </VWLink>,
    );

    await user.click(screen.getByTestId("vw-link"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("applies aria-label for accessibility", () => {
    renderWithProviders(
      <VWLink url="/page" ariaLabel="Go to page" testId="vw-link">
        Page
      </VWLink>,
    );

    const link = screen.getByTestId("vw-link");
    expect(link).toHaveAttribute("aria-label", "Go to page");
  });
});
