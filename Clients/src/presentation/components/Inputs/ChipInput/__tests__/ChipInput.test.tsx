import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ChipInput from "../index";

describe("ChipInput Component", () => {
  it("renders label", () => {
    renderWithProviders(<ChipInput id="test" label="Tags" value={[]} onChange={vi.fn()} />);

    expect(screen.getByText("Tags")).toBeInTheDocument();
  });

  it("shows required asterisk", () => {
    renderWithProviders(
      <ChipInput id="test" label="Tags" value={[]} onChange={vi.fn()} isRequired />,
    );

    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("renders chips for values", () => {
    renderWithProviders(
      <ChipInput id="test" label="Tags" value={["alpha", "beta"]} onChange={vi.fn()} />,
    );

    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("adds a chip on Enter key", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ChipInput id="test" label="Tags" value={[]} onChange={handleChange} />);

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("newtag{Enter}");

    expect(handleChange).toHaveBeenCalledWith(["newtag"]);
  });

  it("does not add duplicate chip", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <ChipInput id="test" label="Tags" value={["existing"]} onChange={handleChange} />,
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("existing{Enter}");

    expect(handleChange).not.toHaveBeenCalled();
  });

  it("renders error message", () => {
    renderWithProviders(
      <ChipInput id="test" label="Tags" value={[]} onChange={vi.fn()} error="Required" />,
    );

    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  it("renders placeholder", () => {
    renderWithProviders(
      <ChipInput id="test" label="Tags" value={[]} onChange={vi.fn()} placeholder="Type here" />,
    );

    expect(screen.getByPlaceholderText("Type here")).toBeInTheDocument();
  });
});
