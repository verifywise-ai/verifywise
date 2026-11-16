import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("shows Configure Phases with extension.admin", async () => {
    auth.keys = new Set(["extension.admin"]);
    render(<ModelLifecycleConfig />);
    expect(await screen.findByText("Design")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Configure Phases" })).toBeInTheDocument();
  });

  // The count and the word are separate text nodes so the word translates.
  it("shows the item count with a translatable singular or plural word", async () => {
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
    const one = await screen.findByText("1 item");
    expect(Array.from(one.childNodes).map((n) => n.textContent?.trim())).toEqual(["1", "", "item"]);
    expect(screen.getByText("0 items")).toBeInTheDocument();
  });

  it("hides Configure Phases without extension.admin", async () => {
    auth.keys = new Set(["model.edit"]);
    render(<ModelLifecycleConfig />);
    expect(await screen.findByText("Design")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configure Phases" })).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: "Configure Phases" }));

    const name = screen.getByPlaceholderText("Phase name");
    fireEvent.change(name, { target: { value: "Monitoring" } });
    fireEvent.click(screen.getByRole("button", { name: "Create phase" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved. Try again.");
    expect(name).toHaveValue("Monitoring");
  });

  it("rolls the switch back and says it was not saved when deactivating a phase fails", async () => {
    api.put.mockRejectedValueOnce(new Error("Bad Request"));
    render(<ModelLifecycleConfig />);
    fireEvent.click(await screen.findByRole("button", { name: "Configure Phases" }));

    const active = screen.getByRole("switch", { name: "Active" });
    expect(active).toBeChecked();
    fireEvent.click(active);

    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved. Try again.");
    expect(active).toBeChecked();
  });
});
