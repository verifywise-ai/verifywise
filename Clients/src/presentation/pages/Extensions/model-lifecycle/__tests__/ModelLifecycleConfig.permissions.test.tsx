import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("hides Configure Phases without extension.admin", async () => {
    auth.keys = new Set(["model.edit"]);
    render(<ModelLifecycleConfig />);
    expect(await screen.findByText("Design")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configure Phases" })).not.toBeInTheDocument();
  });
});
