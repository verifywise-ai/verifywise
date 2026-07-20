import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const updateMutate = vi.fn();
const archiveMutate = vi.fn();

const SYSTEM_TEMPLATE = {
  id: 1,
  name: "Daily Governance Pulse",
  description: "Seeded system template",
  category: "operational",
  recommended_frequency: "daily",
  is_system_template: true,
};

const CUSTOM_TEMPLATE = {
  id: 2,
  name: "Quarterly Board Pack",
  description: "Org-owned custom template",
  category: "governance",
  recommended_frequency: null,
  is_system_template: false,
};

vi.mock("../../../../application/hooks/useReporting", () => ({
  useTemplates: () => ({
    data: [SYSTEM_TEMPLATE, CUSTOM_TEMPLATE],
    isLoading: false,
  }),
  useUpdateTemplate: () => ({ mutate: updateMutate, isPending: false }),
  useArchiveTemplate: () => ({ mutate: archiveMutate, isPending: false }),
}));

vi.mock("../../../../infrastructure/api/customAxios", () => ({
  showAlert: vi.fn(),
}));

import TemplatesTab from "../TemplatesTab";

// Cards are not individually labelled, so find them by their heading text.
const cardFor = (name: string) => screen.getByText(name).closest(".MuiStack-root") as HTMLElement;

describe("TemplatesTab", () => {
  beforeEach(() => {
    updateMutate.mockReset();
    archiveMutate.mockReset();
  });

  it("renders template cards", () => {
    render(<TemplatesTab onUse={() => {}} />);
    expect(screen.getByText("Daily Governance Pulse")).toBeInTheDocument();
    expect(screen.getAllByText(/Use Template/i).length).toBe(2);
  });

  it("offers no edit or archive on a system template", () => {
    render(<TemplatesTab onUse={() => {}} />);
    const card = cardFor("Daily Governance Pulse");

    expect(within(card).queryByText("Edit")).not.toBeInTheDocument();
    expect(within(card).queryByText("Archive")).not.toBeInTheDocument();
    expect(within(card).getByText("System")).toBeInTheDocument();
  });

  it("offers edit and archive on a custom template", () => {
    render(<TemplatesTab onUse={() => {}} />);
    const card = cardFor("Quarterly Board Pack");

    expect(within(card).getByText("Edit")).toBeInTheDocument();
    expect(within(card).getByText("Archive")).toBeInTheDocument();
    expect(within(card).queryByText("System")).not.toBeInTheDocument();
  });

  it("confirms before archiving, and only then calls the mutation", () => {
    render(<TemplatesTab onUse={() => {}} />);

    fireEvent.click(within(cardFor("Quarterly Board Pack")).getByText("Archive"));

    // Confirmation dialog is up and names the template; nothing sent yet.
    const dialog = screen
      .getByText("Archive template")
      .closest('[role="presentation"]') as HTMLElement;
    expect(within(dialog).getByText(/Quarterly Board Pack/)).toBeInTheDocument();
    expect(archiveMutate).not.toHaveBeenCalled();

    // The dialog's own Archive button (the card's is still in the DOM).
    fireEvent.click(within(dialog).getByText("Archive"));

    expect(archiveMutate).toHaveBeenCalledTimes(1);
    expect(archiveMutate.mock.calls[0][0]).toBe(CUSTOM_TEMPLATE.id);
  });

  it("submits changed metadata through useUpdateTemplate with the right id", () => {
    render(<TemplatesTab onUse={() => {}} />);

    fireEvent.click(within(cardFor("Quarterly Board Pack")).getByText("Edit"));

    const nameInput = screen.getByDisplayValue("Quarterly Board Pack");
    fireEvent.change(nameInput, { target: { value: "Quarterly Board Pack v2" } });

    const descInput = screen.getByDisplayValue("Org-owned custom template");
    fireEvent.change(descInput, { target: { value: "Now with vendor risk" } });

    fireEvent.click(screen.getByText("Save changes"));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toEqual({
      id: CUSTOM_TEMPLATE.id,
      body: {
        name: "Quarterly Board Pack v2",
        description: "Now with vendor risk",
        category: "governance",
      },
    });
  });
});
