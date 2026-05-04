import { renderWithProviders } from "../../../../test/renderWithProviders";
import SharedView from "../index";

// Mock ENV_VARs used by fetch call
vi.mock("../../../../../env.vars", () => ({
  ENV_VARs: { URL: "http://localhost:3000" },
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("SharedView Page", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Default: never-resolving fetch to keep loading state
    mockFetch.mockReturnValue(new Promise(() => {}));
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<SharedView />, {
      route: "/shared/vendors/test-token",
    });

    expect(container).toBeInTheDocument();
  });
});
