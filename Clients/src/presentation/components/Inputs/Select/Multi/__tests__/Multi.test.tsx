import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import CustomizableMultiSelect from "../index";

const baseItems = [
  { _id: 1, name: "Alice", surname: "Smith", email: "alice@example.com" },
  { _id: 2, name: "Bob", email: "bob@example.com" },
  { _id: 3, name: "Carol" },
];

describe("CustomizableMultiSelect", () => {
  it("renders the label", () => {
    renderWithProviders(
      <CustomizableMultiSelect label="Reviewers" value={[]} items={baseItems} onChange={vi.fn()} />,
    );

    expect(screen.getByText("Reviewers")).toBeInTheDocument();
  });

  it("shows the required asterisk", () => {
    renderWithProviders(
      <CustomizableMultiSelect
        label="Reviewers"
        required
        value={[]}
        items={baseItems}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("renders selected items as chips", () => {
    renderWithProviders(
      <CustomizableMultiSelect
        label="Reviewers"
        value={[1, 2]}
        items={baseItems}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("calls onChange with the id removed when a chip's delete icon is clicked", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <CustomizableMultiSelect
        label="Reviewers"
        value={[1, 2]}
        items={baseItems}
        onChange={handleChange}
      />,
    );

    const chip = screen.getByText("Alice Smith").closest(".MuiChip-root") as HTMLElement;
    const deleteIcon = chip.querySelector(".MuiChip-deleteIcon") as SVGElement;
    await user.click(deleteIcon);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: [2] }) }),
      null,
    );
  });

  it("filters already-selected items out of the dropdown options", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CustomizableMultiSelect
        label="Reviewers"
        value={[1]}
        items={baseItems}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("combobox"));

    expect(screen.queryByRole("option", { name: /Alice/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Bob/ })).toBeInTheDocument();
  });

  it("calls onChange when selecting an item from the dropdown", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <CustomizableMultiSelect
        label="Reviewers"
        value={[]}
        items={baseItems}
        onChange={handleChange}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: /Carol/ }));

    expect(handleChange).toHaveBeenCalled();
  });

  it("renders the error message", () => {
    renderWithProviders(
      <CustomizableMultiSelect
        label="Reviewers"
        value={[]}
        items={baseItems}
        error="At least one reviewer is required"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("At least one reviewer is required")).toBeInTheDocument();
  });

  it("shows the placeholder menu item when provided", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CustomizableMultiSelect
        label="Reviewers"
        value={[]}
        items={baseItems}
        placeholder="No reviewers selected"
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByText("No reviewers selected")).toBeInTheDocument();
  });

  it("shows each option's email when present", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CustomizableMultiSelect label="Reviewers" value={[]} items={baseItems} onChange={vi.fn()} />,
    );

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("uses getOptionValue to resolve chip and option identity when provided", () => {
    renderWithProviders(
      <CustomizableMultiSelect
        label="Reviewers"
        value={["alice@example.com"]}
        items={baseItems}
        getOptionValue={(item) => item.email ?? String(item._id)}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  });
});
