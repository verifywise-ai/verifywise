import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ModelLifecycleConfig from "../ModelLifecycleConfig";

const api = vi.hoisted(() => ({ delete: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("../../../../../infrastructure/api/networkServices", () => ({ apiServices: api }));

const auth = vi.hoisted(() => ({ keys: new Set<string>() }));
vi.mock("../../../../../application/hooks/useCan", () => ({
  useCan: (key: string) => auth.keys.has(key),
  useCanCheck: () => (key: string) => auth.keys.has(key),
  usePermissionsSettled: () => true,
}));

const phases = [
  { id: 1, name: "Design", description: null, display_order: 1, is_active: true, items: [] },
];

describe("ModelLifecycleConfig setup entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { data: phases } });
  });

  it("shows Configure phases with extension.admin", async () => {
    auth.keys = new Set(["extension.admin"]);
    render(<ModelLifecycleConfig />);
    expect(await screen.findByText("Design")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Configure phases" })).toBeInTheDocument();
  });

  // The count and the word are separate text nodes so the word translates.
  it("shows the item count as one singular or plural template", async () => {
    api.get.mockResolvedValue({
      data: {
        data: [
          { ...phases[0], items: [{ id: 1 }] },
          { ...phases[0], id: 2, name: "Deploy", items: [] },
        ],
      },
    });
    auth.keys = new Set(["model.edit"]);
    render(<ModelLifecycleConfig />);
    expect(await screen.findByText("1 item")).toBeInTheDocument();
    expect(screen.getByText("0 items")).toBeInTheDocument();
  });

  it("hides Configure phases without extension.admin", async () => {
    auth.keys = new Set(["model.edit"]);
    render(<ModelLifecycleConfig />);
    expect(await screen.findByText("Design")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configure phases" })).not.toBeInTheDocument();
  });

  it("tells an Admin to add phases with the button when there are none", async () => {
    api.get.mockResolvedValue({ data: { data: [] } });
    auth.keys = new Set(["extension.admin"]);
    render(<ModelLifecycleConfig />);
    expect(
      await screen.findByText(
        "No lifecycle phases configured yet. Click the button below to add phases.",
      ),
    ).toBeInTheDocument();
  });

  it("tells a non-admin that an Admin adds phases when there are none", async () => {
    api.get.mockResolvedValue({ data: { data: [] } });
    auth.keys = new Set(["model.edit"]);
    render(<ModelLifecycleConfig />);
    expect(
      await screen.findByText("No lifecycle phases yet. An Admin can add them."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Click the button below/)).not.toBeInTheDocument();
  });
});

describe("ModelLifecycleConfig failed writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { data: phases } });
    auth.keys = new Set(["extension.admin"]);
  });

  it("keeps the new phase name and says it was not saved when creating a phase fails", async () => {
    api.post.mockRejectedValueOnce(new Error("Bad Request"));
    render(<ModelLifecycleConfig />);
    fireEvent.click(await screen.findByRole("button", { name: "Configure phases" }));

    const name = screen.getByPlaceholderText("Phase name");
    fireEvent.change(name, { target: { value: "Monitoring" } });
    fireEvent.click(screen.getByRole("button", { name: "Create phase" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved. Try again.");
    expect(name).toHaveValue("Monitoring");
  });

  it("rolls the switch back and says it was not saved when deactivating a phase fails", async () => {
    api.put.mockRejectedValueOnce(new Error("Bad Request"));
    render(<ModelLifecycleConfig />);
    fireEvent.click(await screen.findByRole("button", { name: "Configure phases" }));

    const active = screen.getByRole("switch", { name: "Active" });
    expect(active).toBeChecked();
    fireEvent.click(active);

    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved. Try again.");
    expect(active).toBeChecked();
  });
});

describe("ModelLifecycleConfig house modals and copy", () => {
  const withItems = [
    {
      ...phases[0],
      items: [
        {
          id: 11,
          phase_id: 1,
          name: "Model card",
          item_type: "textarea",
          is_required: false,
          display_order: 1,
          config: {},
          is_active: true,
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { data: withItems } });
    auth.keys = new Set(["extension.admin"]);
  });

  async function openConfig() {
    render(<ModelLifecycleConfig />);
    fireEvent.click(await screen.findByRole("button", { name: "Configure phases" }));
  }

  // Heading, count and word are separate text nodes so each translates.
  it("shows the configured phases heading as one sentence-case template", async () => {
    render(<ModelLifecycleConfig />);
    expect(await screen.findByText("Configured phases (1 active)")).toBeInTheDocument();
  });

  it("opens the configuration as a standard modal that Close dismisses", async () => {
    await openConfig();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Configure model lifecycle");
    expect(
      screen.getByText(
        "Set the phases and items each model goes through. Changes save as you make them.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByText("Configure model lifecycle")).not.toBeInTheDocument(),
    );
  });

  it("shows the item type by its sentence-case label", async () => {
    await openConfig();
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Design"));
    expect(await screen.findByText("Text area")).toBeInTheDocument();
  });

  it("offers a Required switch, not the Req abbreviation, when adding an item", async () => {
    await openConfig();
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Design"));
    fireEvent.click(await screen.findByRole("button", { name: "Add item" }));
    expect(screen.getAllByRole("switch", { name: "Required" })).toHaveLength(2);
    expect(screen.queryByText("Req")).not.toBeInTheDocument();
    expect(screen.getByTestId("model-lifecycle-add-item-submit")).toBeDisabled();
  });

  it("disables moving the first phase up and the last phase down", async () => {
    await openConfig();
    expect(screen.getByRole("button", { name: "Move phase up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move phase down" })).toBeDisabled();
  });

  it("deletes a phase from a destructive confirmation modal", async () => {
    api.delete.mockResolvedValueOnce({ status: 200 });
    await openConfig();
    fireEvent.click(screen.getByRole("button", { name: "Delete phase" }));
    expect(
      await screen.findByText("Delete this phase and all its items? This cannot be undone."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/extensions/model-lifecycle/phases/1"),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Delete this phase and all its items? This cannot be undone."),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps the delete confirmation open while the delete is in flight", async () => {
    let finish: (v: unknown) => void = () => {};
    api.delete.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    await openConfig();
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Design"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete item" }));
    expect(await screen.findByText("Delete this item? This cannot be undone.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/extensions/model-lifecycle/items/11"),
    );

    // Cancel and the close icon do nothing until the request settles.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const closeIcons = screen.getAllByRole("button", { name: "Close dialog" });
    fireEvent.click(closeIcons[closeIcons.length - 1]);
    expect(screen.getByText("Delete this item? This cannot be undone.")).toBeInTheDocument();

    finish({ status: 200 });
    await waitFor(() =>
      expect(
        screen.queryByText("Delete this item? This cannot be undone."),
      ).not.toBeInTheDocument(),
    );
  });

  it("cancels a phase rename with Escape without closing the modal", async () => {
    await openConfig();
    fireEvent.click(screen.getByRole("button", { name: "Edit phase name" }));
    const input = screen.getByDisplayValue("Design");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByDisplayValue("Design")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Configure model lifecycle");
  });
});
