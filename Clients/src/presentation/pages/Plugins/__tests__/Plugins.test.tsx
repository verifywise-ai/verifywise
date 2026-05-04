import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock hooks
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: "Admin",
  }),
}));

vi.mock("../../../../application/hooks/usePlugins", () => ({
  usePlugins: () => ({
    plugins: [],
    loading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../../../../application/hooks/usePluginInstallation", () => ({
  usePluginInstallation: () => ({
    uninstall: vi.fn(),
    uninstalling: null,
  }),
}));

// Mock child components
vi.mock("../../../components/PluginCard", () => ({
  default: () => <div data-testid="plugin-card" />,
}));

vi.mock("../../../components/EmptyState/EmptyStateTip", () => ({
  default: () => null,
}));

import Plugins from "../index";

describe("Plugins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<Plugins />, {
      route: "/plugins",
    });
    expect(container).toBeTruthy();
  });
});
