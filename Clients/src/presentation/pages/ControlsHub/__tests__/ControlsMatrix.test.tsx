/**
 * Tests for the Controls Hub matrix — the master × frameworks grid.
 * Focus: rendering, sorting, pagination, row click, and selection wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { ControlsMatrix } from "../1.0ControlsHub/ControlsMatrix";
import { MasterControlModel } from "../../../../domain/models/Common/masterControl/masterControl.model";

function makeMaster(
  id: number,
  overrides: Partial<MasterControlModel> = {}
): MasterControlModel {
  return new MasterControlModel({
    id,
    title: `Control ${id}`,
    status: "Waiting",
    owner: 42,
    due_date: null,
    mappings: [],
    ...overrides,
  });
}

describe("ControlsMatrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a row per master control with title, owner, and status chip", () => {
    const rows = [
      makeMaster(1, { title: "Access control", status: "In progress" }),
      makeMaster(2, { title: "Data retention", status: "Done" }),
    ];
    renderWithProviders(<ControlsMatrix masterControls={rows} />);

    expect(screen.getByText("Access control")).toBeInTheDocument();
    expect(screen.getByText("Data retention")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    // "#42" renders for each row via the owner column
    expect(screen.getAllByText("#42")).toHaveLength(2);
  });

  it("renders framework chip clusters with mapped requirement codes", () => {
    const row = makeMaster(1, {
      mappings: [
        {
          master_control_id: 1,
          framework: "eu_ai_act",
          framework_entity_type: "control_eu",
          framework_entity_id: 10,
          framework_entity_code: "EU-7.1",
        },
      ],
    });
    renderWithProviders(<ControlsMatrix masterControls={[row]} />);

    expect(screen.getByText("EU-7.1")).toBeInTheDocument();
  });

  it("fires onRowClick with the clicked master control", () => {
    const rows = [makeMaster(42, { title: "Clickable" })];
    const onRowClick = vi.fn();
    renderWithProviders(
      <ControlsMatrix masterControls={rows} onRowClick={onRowClick} />
    );

    fireEvent.click(screen.getByText("Clickable"));

    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0][0].id).toBe(42);
  });

  it("shows an overdue marker for past due dates when status is not Done", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const rows = [
      makeMaster(1, {
        title: "Lagging",
        status: "In progress",
        due_date: yesterday,
      }),
    ];
    renderWithProviders(<ControlsMatrix masterControls={rows} />);

    expect(screen.getByText(/Overdue/)).toBeInTheDocument();
  });

  it("renders selection checkboxes when selection handlers are provided", () => {
    const onSelectionChange = vi.fn();
    const rows = [makeMaster(1), makeMaster(2)];
    renderWithProviders(
      <ControlsMatrix
        masterControls={rows}
        selectedIds={new Set()}
        onSelectionChange={onSelectionChange}
      />
    );

    // 1 header select-all + 2 per-row checkboxes
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(3);
  });

  it("toggles a single row's selection via its checkbox", () => {
    const onSelectionChange = vi.fn();
    const rows = [makeMaster(1, { title: "Toggle me" })];
    renderWithProviders(
      <ControlsMatrix
        masterControls={rows}
        selectedIds={new Set()}
        onSelectionChange={onSelectionChange}
      />
    );

    const rowCheckbox = screen.getByLabelText("Select Toggle me");
    fireEvent.click(rowCheckbox);

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    const nextSet = onSelectionChange.mock.calls[0][0] as Set<number>;
    expect(Array.from(nextSet)).toEqual([1]);
  });

  it("selects all rows on the current page via the header checkbox", () => {
    const onSelectionChange = vi.fn();
    const rows = [makeMaster(1), makeMaster(2), makeMaster(3)];
    renderWithProviders(
      <ControlsMatrix
        masterControls={rows}
        selectedIds={new Set()}
        onSelectionChange={onSelectionChange}
      />
    );

    fireEvent.click(
      screen.getByLabelText("Select all master controls on this page")
    );

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    const nextSet = onSelectionChange.mock.calls[0][0] as Set<number>;
    expect(Array.from(nextSet).sort()).toEqual([1, 2, 3]);
  });

  it("does not open the drawer when the checkbox is clicked", () => {
    const onRowClick = vi.fn();
    const onSelectionChange = vi.fn();
    const rows = [makeMaster(1, { title: "Row" })];
    renderWithProviders(
      <ControlsMatrix
        masterControls={rows}
        onRowClick={onRowClick}
        selectedIds={new Set()}
        onSelectionChange={onSelectionChange}
      />
    );

    fireEvent.click(screen.getByLabelText("Select Row"));

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
