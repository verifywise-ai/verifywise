import { renderWithProviders } from "../../../../test/renderWithProviders";
import AITrustCentrePublic from "../index";

// Mock child components
vi.mock("../Overview", () => ({ default: () => <div>Overview</div> }));
vi.mock("../Resources", () => ({ default: () => <div>Resources</div> }));
vi.mock("../Subprocessors", () => ({ default: () => <div>Subprocessors</div> }));
vi.mock("../Components/Header/AITrustCentreHeader", () => ({
  default: () => <div>Header</div>,
}));

// Mock axios. renderWithProviders now transitively imports
// customAxios.ts (via ExtensionsProvider → extension.repository →
// networkServices → customAxios), which calls `axios.create()` at module
// load. Add a `create` stub that returns a fake instance with the same
// method surface so the import chain doesn't throw.
vi.mock("axios", () => {
  const instance = {
    get: vi.fn().mockResolvedValue({ data: { data: { trustCentre: null } } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
    defaults: { headers: { common: {} } },
  };
  return {
    default: {
      ...instance,
      create: vi.fn(() => instance),
    },
  };
});

// Mock useParams
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useParams: () => ({ hash: "test-hash" }) };
});

// Mock env vars
vi.mock("../../../../env.vars", () => ({
  ENV_VARs: { URL: "http://localhost:3000" },
}));

describe("AITrustCentrePublic Page", () => {
  it("renders without crashing", () => {
    const { container } = renderWithProviders(<AITrustCentrePublic />, {
      route: "/ai-trust-centre/test-hash",
    });

    expect(container).toBeTruthy();
  });
});
