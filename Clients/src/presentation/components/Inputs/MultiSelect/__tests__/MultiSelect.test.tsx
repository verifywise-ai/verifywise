import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import MultiSelect from "../index";

const items = [
  { _id: 1, name: "Alpha" },
  { _id: 2, name: "Beta", surname: "Last" },
  { _id: 3, name: "Gamma" },
];

describe("MultiSelect Component", () => {
  it("renders label", () => {
    renderWithProviders(
      <MultiSelect id="test" label="Options" value={[]} items={items} onChange={vi.fn()} />,
    );

    expect(screen.getByText("Options")).toBeInTheDocument();
  });

  it("shows required asterisk", () => {
    renderWithProviders(
      <MultiSelect
        id="test"
        label="Options"
        value={[]}
        items={items}
        isRequired
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("shows placeholder when no selection", () => {
    renderWithProviders(
      <MultiSelect
        id="test"
        label="Options"
        value={[]}
        items={items}
        placeholder="Pick options"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Pick options")).toBeInTheDocument();
  });

  it("renders chips for selected values", () => {
    renderWithProviders(
      <MultiSelect id="test" label="Options" value={[1, 3]} items={items} onChange={vi.fn()} />,
    );

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("renders error message", () => {
    renderWithProviders(
      <MultiSelect
        id="test"
        label="Options"
        value={[]}
        items={items}
        error="Select at least one"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Select at least one")).toBeInTheDocument();
  });

  it("opens dropdown and shows items", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MultiSelect id="test" label="Options" value={[]} items={items} onChange={vi.fn()} />,
    );

    await user.click(screen.getByRole("combobox"));

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("Alpha")).toBeInTheDocument();
    expect(within(listbox).getByText("Beta Last")).toBeInTheDocument();
  });
});
