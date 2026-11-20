import { vi, describe, it, expect, beforeAll } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";

// The use case list only shows approved use cases the user can see, and the
// framework list only ISO 42001, ISO 27001 and NIST AI RMF. Picking from
// either must not drop a model's links to entries it does not show, and those
// links must not count towards "all selected".

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
    approvedProjects: [
      { id: 1, project_title: "Visible use case", is_organizational: false },
      {
        id: 50,
        project_title: "Organization",
        is_organizational: true,
        framework: [{ framework_id: 2, name: "ISO 42001" }],
      },
    ],
  }),
}));
// Each picker: one click picks only its single listed entry, and its
// "no options" text is rendered to read.
const PICKS: Record<string, string[]> = {
  "projects-input": ["Visible use case"],
  "frameworks-input": ["ISO 42001"],
};
vi.mock("../../../Inputs/Autocomplete", () => ({
  default: (props: any) =>
    PICKS[props.id] ? (
      <div>
        <button
          data-testid={`pick-${props.id}`}
          onClick={(e) => props.onChange(e, PICKS[props.id])}
        />
        <span data-testid={`no-options-${props.id}`}>{props.noOptionsText}</span>
      </div>
    ) : null,
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import NewModelInventory from "../index";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const renderModal = (links: { projects: number[]; frameworks: number[] }) => {
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
          capabilities: [],
          ...links,
        } as any
      }
      evidenceData={[]}
      modelInventoryData={[]}
    />,
  );
  return onSuccess;
};
const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

describe("NewModelInventory use case links", () => {
  it("keeps a linked use case the list does not show when the user picks from the list", async () => {
    const onSuccess = renderModal({ projects: [99], frameworks: [] });

    fireEvent.click(screen.getByTestId("pick-projects-input"));
    fireEvent.click(screen.getByTestId("modal-submit"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(sorted(onSuccess.mock.calls[0][0].projects)).toEqual([1, 99]);
  });

  it("does not count a hidden use case towards all selected", () => {
    renderModal({ projects: [99], frameworks: [] });
    expect(screen.getByTestId("no-options-projects-input").textContent).toBe("No options");

    fireEvent.click(screen.getByTestId("pick-projects-input"));
    expect(screen.getByTestId("no-options-projects-input").textContent).toBe(
      "All projects selected",
    );
  });
});

describe("NewModelInventory framework links", () => {
  it("keeps linked frameworks the list does not show when the user picks from the list", async () => {
    // 1 = EU AI Act, 9 = a bundled framework: neither is in the picker.
    const onSuccess = renderModal({ projects: [], frameworks: [1, 9] });

    fireEvent.click(screen.getByTestId("pick-frameworks-input"));
    fireEvent.click(screen.getByTestId("modal-submit"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(sorted(onSuccess.mock.calls[0][0].frameworks)).toEqual([1, 2, 9]);
  });

  it("does not count hidden frameworks towards all selected", () => {
    renderModal({ projects: [], frameworks: [1, 9] });
    expect(screen.getByTestId("no-options-frameworks-input").textContent).toBe("No options");

    fireEvent.click(screen.getByTestId("pick-frameworks-input"));
    expect(screen.getByTestId("no-options-frameworks-input").textContent).toBe(
      "All frameworks selected",
    );
  });
});
