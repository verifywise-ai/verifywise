import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import GroupedSelect, { type GroupedSelectGroup } from "../index";

const baseGroups: GroupedSelectGroup[] = [
  {
    label: "My Datasets",
    items: [
      { value: "ds-1", label: "Dataset A", description: "10 items" },
      { value: "ds-2", label: "Dataset B" },
    ],
  },
  {
    label: "Templates",
    items: [{ value: "tpl-1", label: "Template A" }],
  },
];

describe("GroupedSelect", () => {
  it("renders the label", () => {
    renderWithProviders(
      <GroupedSelect id="test" label="Choose dataset" value="" groups={baseGroups} onChange={vi.fn()} />,
    );

    expect(screen.getByText("Choose dataset")).toBeInTheDocument();
  });

  it("shows required asterisk when isRequired", () => {
    renderWithProviders(
      <GroupedSelect
        id="test"
        label="Choose dataset"
        value=""
        groups={baseGroups}
        isRequired
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("shows the placeholder when no value is selected", () => {
    renderWithProviders(
      <GroupedSelect
        id="test"
        value=""
        groups={baseGroups}
        placeholder="Pick a dataset"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Pick a dataset")).toBeInTheDocument();
  });

  it("renders the matching item's label when value is set", () => {
    renderWithProviders(
      <GroupedSelect id="test" value="ds-2" groups={baseGroups} onChange={vi.fn()} />,
    );

    expect(screen.getByText("Dataset B")).toBeInTheDocument();
  });

  it("shows group headers and item descriptions when opened", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <GroupedSelect id="test" value="" groups={baseGroups} onChange={vi.fn()} />,
    );

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByText("My Datasets")).toBeInTheDocument();
    expect(screen.getByText("Templates")).toBeInTheDocument();
    expect(screen.getByText("10 items")).toBeInTheDocument();
  });

  it("calls onChange with the selected item's value", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <GroupedSelect id="test" value="" groups={baseGroups} onChange={handleChange} />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("Template A"));

    expect(handleChange).toHaveBeenCalledWith("tpl-1");
  });

  it("shows the loading text and disables the control while loading", () => {
    renderWithProviders(
      <GroupedSelect
        id="test"
        value=""
        groups={baseGroups}
        loading
        loadingText="Fetching datasets..."
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Fetching datasets...")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the empty-state message when there are no items", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GroupedSelect id="test" value="" groups={[]} onChange={vi.fn()} />);

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByText("No options available")).toBeInTheDocument();
  });

  it("shows a custom empty-state message", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <GroupedSelect id="test" value="" groups={[]} emptyText="Nothing here yet" onChange={vi.fn()} />,
    );

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
  });

  it("renders the error message", () => {
    renderWithProviders(
      <GroupedSelect
        id="test"
        value=""
        groups={baseGroups}
        error="Please choose a dataset"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Please choose a dataset")).toBeInTheDocument();
  });

  it("renders the disabled state", () => {
    renderWithProviders(
      <GroupedSelect id="test" value="" groups={baseGroups} disabled onChange={vi.fn()} />,
    );

    expect(screen.getByRole("combobox")).toHaveAttribute("aria-disabled", "true");
  });
});
