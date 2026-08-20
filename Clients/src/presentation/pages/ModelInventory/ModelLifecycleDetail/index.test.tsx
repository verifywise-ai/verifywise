import { screen } from "@testing-library/react";
import { Routes, Route } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ModelLifecycleDetail from "./index";

// The page now delegates to the model-lifecycle extension component and
// gates rendering on `useExtensions().isEnabled("model-lifecycle")` (the
// old PluginSlot layer was removed in the extensions refactor). Mock both.
vi.mock("../../../../application/contexts/Extensions.context", () => ({
  useExtensions: () => ({ isEnabled: () => true }),
  ExtensionsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../../Extensions/model-lifecycle/ModelLifecycleDetail", () => ({
  __esModule: true,
  default: ({ modelId }: { modelId: number }) => (
    <div data-testid="lifecycle-detail" data-model-id={String(modelId)} />
  ),
}));

describe("ModelLifecycleDetail page", () => {
  it("renders the model-lifecycle detail with the parsed numeric model id", () => {
    renderWithProviders(
      <Routes>
        <Route path="/model-inventory/models/:id" element={<ModelLifecycleDetail />} />
      </Routes>,
      { route: "/model-inventory/models/42" },
    );

    const detail = screen.getByTestId("lifecycle-detail");
    expect(detail).toHaveAttribute("data-model-id", "42");
  });

  it("renders nothing when the id param is missing", () => {
    const { container } = renderWithProviders(
      <Routes>
        <Route path="/model-inventory/models" element={<ModelLifecycleDetail />} />
      </Routes>,
      { route: "/model-inventory/models" },
    );
    expect(container.querySelector('[data-testid="lifecycle-detail"]')).not.toBeInTheDocument();
  });
});
