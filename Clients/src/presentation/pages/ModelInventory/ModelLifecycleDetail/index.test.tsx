import { screen } from "@testing-library/react";
import { Routes, Route } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ModelLifecycleDetail from "./index";

vi.mock("../../../components/PluginSlot", () => ({
  PluginSlot: ({ id, slotProps }: { id: string; slotProps: Record<string, unknown> }) => (
    <div data-testid="plugin-slot" data-id={id} data-model-id={String(slotProps.modelId)} />
  ),
}));

describe("ModelLifecycleDetail", () => {
  it("renders the plugin slot with the parsed numeric model id", () => {
    renderWithProviders(
      <Routes>
        <Route path="/model-inventory/models/:id" element={<ModelLifecycleDetail />} />
      </Routes>,
      { route: "/model-inventory/models/42" },
    );

    const slot = screen.getByTestId("plugin-slot");
    expect(slot).toHaveAttribute("data-model-id", "42");
  });

  it("renders nothing when the id param is missing", () => {
    const { container } = renderWithProviders(
      <Routes>
        <Route path="/model-inventory/models" element={<ModelLifecycleDetail />} />
      </Routes>,
      { route: "/model-inventory/models" },
    );
    expect(container.querySelector('[data-testid="plugin-slot"]')).not.toBeInTheDocument();
  });
});
