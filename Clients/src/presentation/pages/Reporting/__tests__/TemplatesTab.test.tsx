import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
// The cards and the edit modal read colours off the app theme.
import { renderWithProviders as render } from "../../../../test/renderWithProviders";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const updateMutate = vi.fn();
const archiveMutate = vi.fn();
const duplicateMutate = vi.fn();

// As the list endpoint returns it: `SELECT * FROM report_templates`.
const SYSTEM_TEMPLATE = {
  id: 2,
  name: "EU AI Act pack",
  description: "Seeded system template",
  category: "compliance",
  default_scope: "organization",
  supported_scopes: ["project", "organization"],
  recommended_frequency: "quarterly",
  is_system_template: true,
};

const CUSTOM_TEMPLATE = {
  id: 1,
  name: "My quarterly review",
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
  useDuplicateTemplate: () => ({ mutate: duplicateMutate, isPending: false }),
}));

// The copy is built server-side; the tab must not fetch the template itself.
const repositoryCalls = vi.fn();
vi.mock("../../../../application/repository/reporting.repository", () => ({
  getTemplate: (...args: unknown[]) => repositoryCalls("getTemplate", ...args),
  createTemplate: (...args: unknown[]) => repositoryCalls("createTemplate", ...args),
}));

vi.mock("../../../../infrastructure/api/customAxios", () => ({
  showAlert: vi.fn(),
}));

import TemplatesTab from "../TemplatesTab";
import { showAlert } from "../../../../infrastructure/api/customAxios";

// Cards are not individually labelled, so find them by their heading text.
const cardFor = (name: string) => screen.getByText(name).closest(".MuiStack-root") as HTMLElement;

describe("TemplatesTab", () => {
  beforeEach(() => {
    updateMutate.mockReset();
    archiveMutate.mockReset();
    duplicateMutate.mockReset();
    repositoryCalls.mockReset();
    vi.mocked(showAlert).mockClear();
  });

  it("renders template cards", () => {
    render(<TemplatesTab onUse={() => {}} />);
    expect(screen.getByText("EU AI Act pack")).toBeInTheDocument();
    expect(screen.getAllByText(/Use Template/i).length).toBe(2);
  });

  it("offers no edit or delete on a system template", () => {
    render(<TemplatesTab onUse={() => {}} />);
    const card = cardFor("EU AI Act pack");

    expect(within(card).queryByText("Edit")).not.toBeInTheDocument();
    expect(within(card).queryByText("Delete")).not.toBeInTheDocument();
    expect(within(card).getByText("System")).toBeInTheDocument();
  });

  it("offers edit and delete on a custom template", () => {
    render(<TemplatesTab onUse={() => {}} />);
    const card = cardFor("My quarterly review");

    expect(within(card).getByText("Edit")).toBeInTheDocument();
    expect(within(card).getByText("Delete")).toBeInTheDocument();
    expect(within(card).queryByText("System")).not.toBeInTheDocument();
  });

  it("confirms before deleting, and only then calls the mutation", () => {
    render(<TemplatesTab onUse={() => {}} />);

    fireEvent.click(within(cardFor("My quarterly review")).getByText("Delete"));

    // Confirmation dialog is up and names the template; nothing sent yet.
    const dialog = screen
      .getByText("Delete template")
      .closest('[role="presentation"]') as HTMLElement;
    expect(within(dialog).getByText(/My quarterly review/)).toBeInTheDocument();
    expect(archiveMutate).not.toHaveBeenCalled();

    // The dialog's own Delete button (the card's is still in the DOM).
    fireEvent.click(within(dialog).getByText("Delete"));

    expect(archiveMutate).toHaveBeenCalledTimes(1);
    expect(archiveMutate.mock.calls[0][0]).toBe(CUSTOM_TEMPLATE.id);
  });

  it("submits changed metadata through useUpdateTemplate with the right id", () => {
    render(<TemplatesTab onUse={() => {}} />);

    fireEvent.click(within(cardFor("My quarterly review")).getByText("Edit"));

    const nameInput = screen.getByDisplayValue("My quarterly review");
    fireEvent.change(nameInput, { target: { value: "My quarterly review v2" } });

    const descInput = screen.getByDisplayValue("Org-owned custom template");
    fireEvent.change(descInput, { target: { value: "Now with vendor risk" } });

    fireEvent.click(screen.getByText("Save changes"));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toEqual({
      id: CUSTOM_TEMPLATE.id,
      body: {
        name: "My quarterly review v2",
        description: "Now with vendor risk",
        category: "governance",
      },
    });
  });

  it("splits templates into my templates and system templates", () => {
    renderWithProviders(<TemplatesTab onUse={vi.fn()} />);

    const mine = screen.getByRole("region", { name: /my templates/i });
    expect(within(mine).getByText("My quarterly review")).toBeInTheDocument();

    const system = screen.getByRole("region", { name: /system templates/i });
    expect(within(system).getByText("EU AI Act pack")).toBeInTheDocument();
  });

  it("offers no edit or delete on a system template", () => {
    renderWithProviders(<TemplatesTab onUse={vi.fn()} />);

    const system = screen.getByRole("region", { name: /system templates/i });
    expect(within(system).queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(within(system).queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    expect(within(system).getByRole("button", { name: /duplicate/i })).toBeInTheDocument();
  });

  it("starts the schedule flow from Use template", async () => {
    const onUse = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab onUse={onUse} />);

    const mine = screen.getByRole("region", { name: /my templates/i });
    await user.click(within(mine).getByRole("button", { name: /use template/i }));

    expect(onUse).toHaveBeenCalledWith(1, "schedule");
  });

  it("starts the run-now flow from Run now", async () => {
    const onUse = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab onUse={onUse} />);

    const mine = screen.getByRole("region", { name: /my templates/i });
    await user.click(within(mine).getByRole("button", { name: /run now/i }));

    expect(onUse).toHaveBeenCalledWith(1, "run-now");
  });

  // The server copies the latest version's sections, AI blocks, framework
  // selection and report kind (POST /v1/report-templates/:id/duplicate), so
  // the tab sends only the id and builds no body of its own.
  it("duplicates a system template through the server-side copy", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab onUse={vi.fn()} />);

    const system = screen.getByRole("region", { name: /system templates/i });
    await user.click(within(system).getByRole("button", { name: /duplicate/i }));

    expect(duplicateMutate).toHaveBeenCalledTimes(1);
    expect(duplicateMutate).toHaveBeenCalledWith(2, expect.anything());
    expect(repositoryCalls).not.toHaveBeenCalled();
  });

  it("says when the copy fails", async () => {
    duplicateMutate.mockImplementation((_id, opts) => opts.onError(new Error("network")));
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab onUse={vi.fn()} />);

    const system = screen.getByRole("region", { name: /system templates/i });
    await user.click(within(system).getByRole("button", { name: /duplicate/i }));

    await waitFor(() =>
      expect(showAlert).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "error", body: "Failed to duplicate template" }),
      ),
    );
  });

  // The copy is named "<name> (copy)"; a second copy collides with the first.
  it("says the name is taken when a copy already exists", async () => {
    duplicateMutate.mockImplementation((_id, opts) => opts.onError({ response: { status: 409 } }));
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab onUse={vi.fn()} />);

    const system = screen.getByRole("region", { name: /system templates/i });
    await user.click(within(system).getByRole("button", { name: /duplicate/i }));

    await waitFor(() =>
      expect(showAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "A template with this name already exists. Choose a different name.",
        }),
      ),
    );
  });
});
