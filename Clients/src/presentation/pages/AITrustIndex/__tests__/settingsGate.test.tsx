import { vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Who may view and change AI Trust Index settings is the aiTrustIndex.admin
// key (the key GET and PUT /ai-trust-index/settings authorize on), never the
// role name.
const permissionState = vi.hoisted(() => ({ canManage: false, settled: true }));
vi.mock("../../../../application/hooks/useCan", () => {
  const useCan = (key: string) => key === "aiTrustIndex.admin" && permissionState.canManage;
  return {
    useCan,
    useCanCheck: () => useCan,
    usePermissionsSettled: () => permissionState.settled,
  };
});
const settingsState = vi.hoisted(() => ({
  // One stable object, like React Query's cached data.
  result: {
    data: { data: { recipientUserIds: [2], recipientEmails: ["dpo@acme.com"] } },
    isLoading: false,
  },
  enabledCalls: [] as boolean[],
}));
const mutate = vi.hoisted(() => vi.fn());
vi.mock("../../../../application/hooks/useAiTrustIndex", () => ({
  useSettings: ({ enabled = true }: { enabled?: boolean } = {}) => {
    settingsState.enabledCalls.push(enabled);
    return enabled ? settingsState.result : { data: undefined, isLoading: false };
  },
  useUpdateSettings: () => ({ mutate, isPending: false }),
}));
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [
      { id: 2, name: "Ann", surname: "Lee" },
      { id: 3, name: "Bo", surname: "Ng" },
    ],
    loading: false,
  }),
}));
vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// The user picker: a button that adds user 3, standing in for a user's pick.
vi.mock("../../../components/Inputs/Autocomplete", () => ({
  default: (props: {
    value: Array<{ id: number }>;
    onChange: (e: unknown, value: Array<{ id: number }>) => void;
  }) => (
    <button
      data-testid="add-recipient"
      onClick={() => props.onChange(null, [...props.value, { id: 3 }])}
    />
  ),
}));
vi.mock("../../../components/Inputs/ChipInput", () => ({
  default: () => <div />,
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

const LOCKED = "You do not have permission to view or change AI Trust Index notification settings.";

beforeEach(() => {
  permissionState.canManage = false;
  permissionState.settled = true;
  settingsState.enabledCalls = [];
  mutate.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("AI Trust Index settings page", () => {
  it("refuses a user without aiTrustIndex.admin, and does not ask for the settings", () => {
    renderWithProviders(<Settings />);
    expect(screen.getByText(LOCKED)).toBeInTheDocument();
    expect(settingsState.enabledCalls.every((e) => e === false)).toBe(true);
  });

  it("opens for a holder of aiTrustIndex.admin", () => {
    permissionState.canManage = true;
    renderWithProviders(<Settings />);
    expect(screen.queryByText(LOCKED)).not.toBeInTheDocument();
    expect(screen.getByText(/checked automatically every week/)).toBeInTheDocument();
    expect(settingsState.enabledCalls.every((e) => e === true)).toBe(true);
  });

  it("does not refuse a custom role while its permissions load", () => {
    permissionState.settled = false;
    renderWithProviders(<Settings />);
    expect(screen.queryByText(LOCKED)).not.toBeInTheDocument();
    expect(screen.queryByText(/checked automatically every week/)).not.toBeInTheDocument();
  });
});

describe("AI Trust Index settings auto-save", () => {
  beforeEach(() => {
    permissionState.canManage = true;
    vi.useFakeTimers();
  });

  it("sends nothing when the saved settings load", async () => {
    renderWithProviders(<Settings />);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("saves once, after the debounce, when the user changes the recipients", async () => {
    renderWithProviders(<Settings />);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    fireEvent.click(screen.getByTestId("add-recipient"));
    await act(() => vi.advanceTimersByTimeAsync(599));
    expect(mutate).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({
      recipientUserIds: [2, 3],
      recipientEmails: ["dpo@acme.com"],
    });
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
