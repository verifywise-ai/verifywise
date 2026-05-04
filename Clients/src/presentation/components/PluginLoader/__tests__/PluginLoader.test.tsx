import { vi } from "vitest";

vi.mock("../../../../application/contexts/PluginRegistry.context", () => ({
  usePluginRegistry: vi.fn().mockReturnValue({
    installedPlugins: [{ pluginKey: "soc2", status: "installed" }],
    loadPluginUI: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: [{ key: "soc2", ui: { bundleUrl: "/api/plugins/soc2/bundle.js", slots: [] } }],
      },
    }),
  },
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import PluginLoader from "../index";
import { waitFor } from "@testing-library/react";
import { usePluginRegistry } from "../../../../application/contexts/PluginRegistry.context";

describe("PluginLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing (null)", () => {
    const { container } = renderWithProviders(<PluginLoader />);
    expect(container.firstChild).toBeNull();
  });

  it("calls loadPluginUI for installed plugins with UI config", async () => {
    renderWithProviders(<PluginLoader />);
    const registry = vi.mocked(usePluginRegistry)();
    await waitFor(() => {
      expect(registry.loadPluginUI).toHaveBeenCalledWith("soc2", {
        bundleUrl: "/api/plugins/soc2/bundle.js",
        slots: [],
      });
    });
  });
});
