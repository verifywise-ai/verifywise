import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import SearchBox from "../index";

describe("SearchBox", () => {
  it("renders with default placeholder", () => {
    renderWithProviders(<SearchBox value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("renders with custom placeholder", () => {
    renderWithProviders(<SearchBox value="" onChange={vi.fn()} placeholder="Find items..." />);
    expect(screen.getByPlaceholderText("Find items...")).toBeInTheDocument();
  });

  it("displays the current value", () => {
    renderWithProviders(<SearchBox value="test query" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("test query")).toBeInTheDocument();
  });

  it("calls onChange with new value when user types", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<SearchBox value="" onChange={onChange} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("disables the input when disabled is true", () => {
    renderWithProviders(<SearchBox value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("applies custom sx styles", () => {
    const { container } = renderWithProviders(
      <SearchBox value="" onChange={vi.fn()} sx={{ width: 300 }} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("sets width to 160 when fullWidth is false", () => {
    const { container } = renderWithProviders(
      <SearchBox value="" onChange={vi.fn()} fullWidth={false} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("merges custom inputProps", () => {
    renderWithProviders(
      <SearchBox value="" onChange={vi.fn()} inputProps={{ "data-testid": "custom-input" }} />,
    );
    expect(screen.getByTestId("custom-input")).toBeInTheDocument();
  });

  it("renders with aria-label on input", () => {
    renderWithProviders(<SearchBox value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
  });

  it("renders search icon", () => {
    const { container } = renderWithProviders(<SearchBox value="" onChange={vi.fn()} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
