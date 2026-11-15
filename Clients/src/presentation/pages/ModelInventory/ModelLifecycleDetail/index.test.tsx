import { fireEvent, screen } from "@testing-library/react";
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
  // Whether a list is held (the catalog always has rows once a fetch succeeded).
  hasList: true,
};
const refetch = vi.fn();
vi.mock("../../../../application/contexts/Extensions.context", () => ({
  useExtensions: () => ({
    extensions: extensionsState.hasList ? [{ key: "model-lifecycle" }] : [],
    loaded: extensionsState.loaded,
    error: extensionsState.error,
    refetch,
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
    extensionsState.hasList = true;
    refetch.mockClear();
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

  it("shows an error with Try again, not a redirect, when the first load failed", () => {
    extensionsState.error = "Failed to load extensions";
    extensionsState.hasList = false;
    extensionsState.enabled = false;
    renderAt("/model-inventory/models/42");

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the model lifecycle.");
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps showing the lifecycle when a later refetch fails", () => {
    extensionsState.error = "Failed to load extensions";
    renderAt("/model-inventory/models/42");

    expect(screen.getByTestId("lifecycle-detail")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("still redirects when the held list says Model Lifecycle is off and a refetch failed", () => {
    extensionsState.error = "Failed to load extensions";
    extensionsState.enabled = false;
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
