import { renderWithProviders } from "../../../../../test/renderWithProviders";
import RegisterAdmin from "../index";

// Mock SVG background
vi.mock("../../../../assets/imgs/background-grid.svg", () => ({
  ReactComponent: () => <svg data-testid="bg-svg" />,
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// Mock user repository
vi.mock("../../../../../application/repository/user.repository", () => ({
  createNewUser: vi.fn().mockResolvedValue({ status: 201 }),
}));

// Mock useUsers hook
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));

// Mock log engine
vi.mock("../../../../../application/tools/log.engine", () => ({
  logEngine: vi.fn(),
}));

describe("RegisterAdmin Page", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<RegisterAdmin multiTenant={false} />, {
      route: "/register",
    });

    expect(container).toBeTruthy();
  });
});
