import { vi, describe, it, expect, beforeAll } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";

// The use case list only shows approved use cases the user can see. Picking
// from it must not drop a model's links to use cases it does not show: the
// server keeps them, and sending them back keeps the save a no-op for them.

vi.mock("../../StandardModal", () => ({
  default: ({ isOpen, children, onSubmit }: any) =>
    isOpen ? (
      <div>
        {children}
        <button data-testid="modal-submit" onClick={onSubmit}>
          Save
        </button>
      </div>
    ) : null,
}));
vi.mock("../../../Inputs/Field", () => ({ default: () => <div /> }));
vi.mock("../../../Inputs/Datepicker", () => ({ default: () => <div /> }));
vi.mock("../../../Inputs/Select", () => ({ default: () => <div /> }));
vi.mock("../../../Inputs/Toggle", () => ({ default: () => <div /> }));
vi.mock("../../../TabBar", () => ({ default: () => <div /> }));
vi.mock("../../../HistorySidebar", () => ({ HistorySidebar: () => null, default: () => null }));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));
vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({
    approvedProjects: [{ id: 1, project_title: "Visible use case", is_organizational: false }],
  }),
}));
// The use case picker: one click picks only "Visible use case".
vi.mock("../../../Inputs/Autocomplete", () => ({
  default: (props: any) =>
    props.id === "projects-input" ? (
      <button data-testid="pick-visible" onClick={(e) => props.onChange(e, ["Visible use case"])} />
    ) : null,
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import NewModelInventory from "../index";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("NewModelInventory use case links", () => {
  it("keeps a linked use case the list does not show when the user picks from the list", async () => {
    const onSuccess = vi.fn().mockResolvedValue({ id: 5 });
    renderWithProviders(
      <NewModelInventory
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={onSuccess}
        initialData={
          {
            provider: "OpenAI",
            model: "GPT-4",
            version: "1",
            status: "Approved",
            status_date: "2026-09-01",
            projects: [99],
            frameworks: [],
            capabilities: [],
          } as any
        }
        evidenceData={[]}
        modelInventoryData={[]}
      />,
    );

    fireEvent.click(screen.getByTestId("pick-visible"));
    fireEvent.click(screen.getByTestId("modal-submit"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect([...onSuccess.mock.calls[0][0].projects].sort((a, b) => a - b)).toEqual([1, 99]);
  });
});
