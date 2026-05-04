import { vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ErrorModal from "../index";

describe("ErrorModal", () => {
  it("renders error message when open", () => {
    renderWithProviders(
      <ErrorModal open={true} errorMessage="Something went wrong" handleClose={vi.fn()} />,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    renderWithProviders(<ErrorModal open={false} errorMessage={null} handleClose={vi.fn()} />);
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });
});
