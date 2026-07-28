import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const updateMutate = vi.fn();
const archiveMutate = vi.fn();
const mockCreate = vi.fn();
const mockGetTemplate = vi.fn();

// As the list endpoint returns it: `SELECT * FROM report_templates`, with no
// version attached. Only GET /templates/:id carries latestVersion.
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

const SECTIONS_CONFIG = {
  sections: [{ reportSectionKey: "projectRisks", defaultEnabled: true }],
};
const AI_BLOCKS_CONFIG = { executiveSummary: true };

const SYSTEM_TEMPLATE_FULL = {
  ...SYSTEM_TEMPLATE,
  latestVersion: {
    id: 9,
    sections_config: SECTIONS_CONFIG,
    ai_blocks_config: AI_BLOCKS_CONFIG,
  },
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
  useCreateTemplate: () => ({ mutate: mockCreate, isPending: false }),
}));

vi.mock("../../../../application/repository/reporting.repository", () => ({
  getTemplate: (...args: unknown[]) => mockGetTemplate(...args),
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
    mockCreate.mockReset();
    mockGetTemplate.mockReset().mockResolvedValue(SYSTEM_TEMPLATE_FULL);
    vi.mocked(showAlert).mockClear();
  });

  it("renders template cards", () => {
    render(<TemplatesTab onUse={() => {}} />);
    expect(screen.getByText("EU AI Act pack")).toBeInTheDocument();
    expect(screen.getAllByText(/Use Template/i).length).toBe(2);
  });

  it("offers no edit or archive on a system template", () => {
    render(<TemplatesTab onUse={() => {}} />);
    const card = cardFor("EU AI Act pack");

    expect(within(card).queryByText("Edit")).not.toBeInTheDocument();
    expect(within(card).queryByText("Archive")).not.toBeInTheDocument();
    expect(within(card).getByText("System")).toBeInTheDocument();
  });

  it("offers edit and archive on a custom template", () => {
    render(<TemplatesTab onUse={() => {}} />);
    const card = cardFor("My quarterly review");

    expect(within(card).getByText("Edit")).toBeInTheDocument();
    expect(within(card).getByText("Archive")).toBeInTheDocument();
    expect(within(card).queryByText("System")).not.toBeInTheDocument();
  });

  it("confirms before archiving, and only then calls the mutation", () => {
    render(<TemplatesTab onUse={() => {}} />);

    fireEvent.click(within(cardFor("My quarterly review")).getByText("Archive"));

    // Confirmation dialog is up and names the template; nothing sent yet.
    const dialog = screen
      .getByText("Archive template")
      .closest('[role="presentation"]') as HTMLElement;
    expect(within(dialog).getByText(/My quarterly review/)).toBeInTheDocument();
    expect(archiveMutate).not.toHaveBeenCalled();

    // The dialog's own Archive button (the card's is still in the DOM).
    fireEvent.click(within(dialog).getByText("Archive"));

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

  it("offers no edit or archive on a system template", () => {
    renderWithProviders(<TemplatesTab onUse={vi.fn()} />);

    const system = screen.getByRole("region", { name: /system templates/i });
    expect(within(system).queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(within(system).queryByRole("button", { name: /^archive$/i })).not.toBeInTheDocument();
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

  it("duplicates a system template as a copy owned by the org", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab onUse={vi.fn()} />);

    const system = screen.getByRole("region", { name: /system templates/i });
    await user.click(within(system).getByRole("button", { name: /duplicate/i }));

    // createTemplateQuery (Servers/utils/reportTemplate.utils.ts) 400s unless
    // default_scope is exactly "project" or "organization" — an omitted
    // default_scope must not reach the request body, or every Duplicate
    // click fails.
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "EU AI Act pack (copy)",
          default_scope: "organization",
        }),
        expect.anything(),
      ),
    );
  });

  // The list row has no latestVersion, so reading the section config off it
  // produced a copy with no sections. The wizard then refuses to leave its
  // Sections step and the copy can never be run, scheduled or repaired.
  it("carries the source template's section config into the copy", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab onUse={vi.fn()} />);

    const system = screen.getByRole("region", { name: /system templates/i });
    await user.click(within(system).getByRole("button", { name: /duplicate/i }));

    expect(mockGetTemplate).toHaveBeenCalledWith(2);
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          sections_config: SECTIONS_CONFIG,
          ai_blocks_config: AI_BLOCKS_CONFIG,
        }),
        expect.anything(),
      ),
    );
  });

  it("does not create an unusable copy when the full template cannot be fetched", async () => {
    mockGetTemplate.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab onUse={vi.fn()} />);

    const system = screen.getByRole("region", { name: /system templates/i });
    await user.click(within(system).getByRole("button", { name: /duplicate/i }));

    await waitFor(() => expect(showAlert).toHaveBeenCalled());
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
