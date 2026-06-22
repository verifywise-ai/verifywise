import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { ColumnSelector } from "../index";
import type { ColumnConfig } from "../../../../../application/hooks/useColumnVisibility";

const columns: ColumnConfig[] = [
  { key: "name", label: "Name", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

describe("ColumnSelector", () => {
  it("renders the columns button", () => {
    renderWithProviders(
      <ColumnSelector
        columns={columns}
        visibleColumns={new Set(["name", "status", "actions"])}
        onToggleColumn={vi.fn()}
        onResetToDefaults={vi.fn()}
      />,
    );

    expect(screen.getByText("Columns")).toBeInTheDocument();
  });

  it("renders custom button text", () => {
    renderWithProviders(
      <ColumnSelector
        columns={columns}
        visibleColumns={new Set()}
        onToggleColumn={vi.fn()}
        onResetToDefaults={vi.fn()}
        buttonText="Show/Hide"
      />,
    );

    expect(screen.getByText("Show/Hide")).toBeInTheDocument();
  });

  it("opens popover on button click", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ColumnSelector
        columns={columns}
        visibleColumns={new Set(["name", "status", "actions"])}
        onToggleColumn={vi.fn()}
        onResetToDefaults={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Columns"));

    expect(screen.getByText("Show columns")).toBeInTheDocument();
    expect(screen.getByText("Select which columns to display")).toBeInTheDocument();
  });

  it("renders all column labels in the popover", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ColumnSelector
        columns={columns}
        visibleColumns={new Set(["name", "status", "actions"])}
        onToggleColumn={vi.fn()}
        onResetToDefaults={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Columns"));

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("checks visible columns", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ColumnSelector
        columns={columns}
        visibleColumns={new Set(["name"])}
        onToggleColumn={vi.fn()}
        onResetToDefaults={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Columns"));

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("calls onToggleColumn when a column is clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ColumnSelector
        columns={columns}
        visibleColumns={new Set(["name", "status", "actions"])}
        onToggleColumn={onToggle}
        onResetToDefaults={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Columns"));
    await user.click(screen.getByText("Status"));

    expect(onToggle).toHaveBeenCalledWith("status");
  });

  it("calls onToggleColumn when a checkbox is clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ColumnSelector
        columns={columns}
        visibleColumns={new Set(["name", "status", "actions"])}
        onToggleColumn={onToggle}
        onResetToDefaults={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Columns"));

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    expect(onToggle).toHaveBeenCalledWith("name");
  });

  it("shows Required badge for alwaysVisible columns", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ColumnSelector
        columns={columns}
        visibleColumns={new Set(["name", "status", "actions"])}
        onToggleColumn={vi.fn()}
        onResetToDefaults={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Columns"));

    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  it("disables checkbox for alwaysVisible columns", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ColumnSelector
        columns={columns}
        visibleColumns={new Set(["name", "status", "actions"])}
        onToggleColumn={vi.fn()}
        onResetToDefaults={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Columns"));

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[2]).toBeDisabled();
  });

  it("calls onResetToDefaults when reset button is clicked", async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ColumnSelector
        columns={columns}
        visibleColumns={new Set(["name", "status", "actions"])}
        onToggleColumn={vi.fn()}
        onResetToDefaults={onReset}
      />,
    );

    await user.click(screen.getByText("Columns"));
    await user.click(screen.getByText("Reset to defaults"));

    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
