import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import Select from "../index";

const baseItems = [
  { _id: 1, name: "Option A" },
  { _id: 2, name: "Option B", surname: "Last" },
  { _id: 3, name: "Option C" },
];

describe("Select Component", () => {
  it("renders label", () => {
    renderWithProviders(
      <Select id="test" label="Choose" value="" items={baseItems} onChange={vi.fn()} />,
    );

    expect(screen.getByText("Choose")).toBeInTheDocument();
  });

  it("shows required asterisk", () => {
    renderWithProviders(
      <Select
        id="test"
        label="Required"
        value=""
        items={baseItems}
        isRequired
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("shows optional label", () => {
    renderWithProviders(
      <Select id="test" label="Field" value="" items={baseItems} isOptional onChange={vi.fn()} />,
    );

    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("shows custom optional label", () => {
    renderWithProviders(
      <Select
        id="test"
        label="Field"
        value=""
        items={baseItems}
        isOptional
        optionalLabel="not required"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("not required")).toBeInTheDocument();
  });

  it("shows placeholder when no item matches value", () => {
    renderWithProviders(
      <Select
        id="test"
        label="Pick"
        value={99}
        items={baseItems}
        placeholder="Select something"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Select something")).toBeInTheDocument();
  });

  it("renders selected item name when value matches", () => {
    renderWithProviders(
      <Select id="test" label="Pick" value={2} items={baseItems} onChange={vi.fn()} />,
    );

    expect(screen.getByText("Option B Last")).toBeInTheDocument();
  });

  it("renders error message", () => {
    renderWithProviders(
      <Select
        id="test"
        label="Pick"
        value=""
        items={baseItems}
        error="This field is required"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("This field is required")).toBeInTheDocument();
  });

  it("opens dropdown on combobox click", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <Select id="test" label="Pick" value={1} items={baseItems} onChange={handleChange} />,
    );

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("shows divider after specified index", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <Select
        id="test"
        label="Pick"
        value={1}
        items={baseItems}
        dividerAfterIndex={1}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("combobox"));

    const options = screen.getAllByRole("option");
    const hrElements = options.filter((o) => o.tagName === "HR");
    expect(hrElements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders disabled state", () => {
    renderWithProviders(
      <Select id="test" label="Disabled" value="" items={baseItems} disabled onChange={vi.fn()} />,
    );

    const combobox = screen.getByRole("combobox");
    expect(combobox.className).toContain("Mui-disabled");
  });

  it("renders custom renderValue", () => {
    renderWithProviders(
      <Select
        id="test"
        label="Pick"
        value={1}
        items={baseItems}
        customRenderValue={(_value, item) => <span>Custom: {item.name}</span>}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Custom: Option A")).toBeInTheDocument();
  });
});
