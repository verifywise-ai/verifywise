import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock hooks
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: "Admin",
    isSuperAdmin: false,
  }),
}));

vi.mock("../../../../application/contexts/PluginRegistry.context", () => ({
  usePluginRegistry: () => ({
    getPluginTabs: () => [],
    installedPlugins: [],
    isLoading: false,
  }),
}));

// Mock child tab components
vi.mock("../Profile/index", () => ({
  default: () => <div data-testid="profile-tab" />,
}));

vi.mock("../Password/index", () => ({
  default: () => <div data-testid="password-tab" />,
}));

vi.mock("../Team/index", () => ({
  default: () => <div data-testid="team-tab" />,
}));

vi.mock("../Organization", () => ({
  default: () => <div data-testid="organization-tab" />,
}));

vi.mock("../Preferences/index", () => ({
  default: () => <div data-testid="preferences-tab" />,
}));

vi.mock("../Features/index", () => ({
  default: () => <div data-testid="features-tab" />,
}));

vi.mock("../ApiKeys", () => ({
  default: () => <div data-testid="apikeys-tab" />,
}));

vi.mock("../AuditLedger", () => ({
  default: () => <div data-testid="audit-ledger-tab" />,
}));

vi.mock("../../../components/PluginSlot", () => ({
  PluginSlot: () => null,
}));

vi.mock("../../../components/HelperIcon", () => ({
  default: () => null,
  HelperIcon: () => null,
}));

import ProfilePage from "../index";

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<ProfilePage />, {
      route: "/settings",
    });
    expect(container).toBeTruthy();
  });
});
