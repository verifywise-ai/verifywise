import { vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Who may change AI Trust Index settings is the aiTrustIndex.admin key (the
// key PUT /ai-trust-index/settings authorizes on), never the role name.
const permissionState = vi.hoisted(() => ({ canManage: false, settled: true }));
vi.mock("../../../../application/hooks/useCan", () => {
  const useCan = (key: string) => key === "aiTrustIndex.admin" && permissionState.canManage;
  return {
    useCan,
    useCanCheck: () => useCan,
    usePermissionsSettled: () => permissionState.settled,
  };
});
const mutate = vi.hoisted(() => vi.fn());
vi.mock("../../../../application/hooks/useAiTrustIndex", () => ({
  useSettings: () => ({
    data: { data: { recipientUserIds: [], recipientEmails: [] } },
    isLoading: false,
  }),
  useUpdateSettings: () => ({ mutate }),
}));
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [], loading: false }),
}));
vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../components/Sidebar/SidebarShell", () => ({
  default: ({ flatItems }: { flatItems: Array<{ id: string; label: string }> }) => (
    <ul>
      {flatItems.map((i) => (
        <li key={i.id}>{i.label}</li>
      ))}
    </ul>
  ),
}));

import Settings from "../Settings";
import AITrustIndexSidebar from "../AITrustIndexSidebar";

const LOCKED = "Only administrators can change AI Trust Index notification settings.";

beforeEach(() => {
  permissionState.canManage = false;
  permissionState.settled = true;
});

describe("AI Trust Index settings page", () => {
  it("refuses a user without aiTrustIndex.admin", () => {
    renderWithProviders(<Settings />);
    expect(screen.getByText(LOCKED)).toBeInTheDocument();
  });

  it("opens for a holder of aiTrustIndex.admin", () => {
    permissionState.canManage = true;
    renderWithProviders(<Settings />);
    expect(screen.queryByText(LOCKED)).not.toBeInTheDocument();
    expect(screen.getByText(/checked automatically every week/)).toBeInTheDocument();
  });

  it("does not refuse a custom role while its permissions load", () => {
    permissionState.settled = false;
    renderWithProviders(<Settings />);
    expect(screen.queryByText(LOCKED)).not.toBeInTheDocument();
    expect(screen.queryByText(/checked automatically every week/)).not.toBeInTheDocument();
  });
});

describe("classic AI Trust Index sidebar", () => {
  const renderSidebar = () =>
    renderWithProviders(<AITrustIndexSidebar activeTab="browse" onTabChange={() => {}} />);

  it("hides Settings without aiTrustIndex.admin", () => {
    renderSidebar();
    expect(screen.getByText("Browse")).toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("shows Settings with aiTrustIndex.admin", () => {
    permissionState.canManage = true;
    renderSidebar();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });
});
