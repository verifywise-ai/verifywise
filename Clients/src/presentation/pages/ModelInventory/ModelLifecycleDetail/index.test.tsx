import { screen } from "@testing-library/react";
import { Routes, Route, useLocation } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ModelLifecycleDetail from "./index";

// The page gates on the shared extensions list: `loaded` says whether the
// first fetch has settled, `isEnabled("model-lifecycle")` whether the
// extension is on. Each test sets the state it needs.
const extensionsState = {
  loaded: true,
  error: null as string | null,
  enabled: true,
};
vi.mock("../../../../application/contexts/Extensions.context", () => ({
  useExtensions: () => ({
    loaded: extensionsState.loaded,
    error: extensionsState.error,
    isEnabled: (key: string) => key === "model-lifecycle" && extensionsState.enabled,
  }),
  ExtensionsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../../Extensions/model-lifecycle/ModelLifecycleDetail", () => ({
  __esModule: true,
  default: ({ modelId }: { modelId: number }) => (
    <div data-testid="lifecycle-detail" data-model-id={String(modelId)} />
  ),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderAt(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/model-inventory/models/:id" element={<ModelLifecycleDetail />} />
      <Route path="/model-inventory/models" element={<ModelLifecycleDetail />} />
      <Route path="/model-inventory" element={<LocationProbe />} />
    </Routes>,
    { route },
  );
}

describe("ModelLifecycleDetail page", () => {
  beforeEach(() => {
    extensionsState.loaded = true;
    extensionsState.error = null;
    extensionsState.enabled = true;
  });

  it("renders the model-lifecycle detail with the parsed numeric model id when enabled", () => {
    renderAt("/model-inventory/models/42");

    const detail = screen.getByTestId("lifecycle-detail");
    expect(detail).toHaveAttribute("data-model-id", "42");
  });

  it("redirects to the model in the inventory when Model Lifecycle is off", () => {
    extensionsState.enabled = false;
    renderAt("/model-inventory/models/42");

    expect(screen.queryByTestId("lifecycle-detail")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/model-inventory?modelId=42");
  });

  it("redirects to the model in the inventory when the extensions list failed to load", () => {
    extensionsState.error = "Failed to load extensions";
    renderAt("/model-inventory/models/42");

    expect(screen.getByTestId("location")).toHaveTextContent("/model-inventory?modelId=42");
  });

  it("shows a spinner and does not redirect before the extensions list has loaded", () => {
    extensionsState.loaded = false;
    extensionsState.enabled = false;
    renderAt("/model-inventory/models/42");

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-detail")).not.toBeInTheDocument();
  });

  it("redirects to the inventory when the id is not a number", () => {
    renderAt("/model-inventory/models/abc");

    expect(screen.getByTestId("location")).toHaveTextContent(/^\/model-inventory$/);
  });

  it("redirects to the inventory when the id param is missing", () => {
    renderAt("/model-inventory/models");

    expect(screen.getByTestId("location")).toHaveTextContent(/^\/model-inventory$/);
  });
});
