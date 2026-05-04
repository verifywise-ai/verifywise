import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ForgotPassword from "../index";

// Mock SVG background
vi.mock("../../../../assets/imgs/background-grid.svg", () => ({
  ReactComponent: () => <svg data-testid="bg-svg" />,
}));

// Mock navigate and location
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null, pathname: "/forgot-password" }),
  };
});

// Mock auth repository
vi.mock("../../../../../application/repository/auth.repository", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

describe("ForgotPassword Page", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<ForgotPassword />, {
      route: "/forgot-password",
    });

    expect(container).toBeTruthy();
  });
});
