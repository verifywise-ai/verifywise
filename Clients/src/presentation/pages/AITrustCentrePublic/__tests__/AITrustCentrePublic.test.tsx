import { renderWithProviders } from "../../../../test/renderWithProviders";
import AITrustCentrePublic from "../index";

// Mock child components
vi.mock("../Overview", () => ({ default: () => <div>Overview</div> }));
vi.mock("../Resources", () => ({ default: () => <div>Resources</div> }));
vi.mock("../Subprocessors", () => ({ default: () => <div>Subprocessors</div> }));
vi.mock("../Components/Header/AITrustCentreHeader", () => ({
  default: () => <div>Header</div>,
}));

// Mock axios
vi.mock("axios", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: { trustCentre: null } } }),
  },
}));

// Mock useParams
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
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
