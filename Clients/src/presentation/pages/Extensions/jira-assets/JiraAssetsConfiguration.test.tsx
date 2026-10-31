import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material";
import { light } from "../../../themes";

const panelProps = vi.fn();
vi.mock("../../../components/ExtensionSyncPanel", () => ({
  default: (props: Record<string, unknown>) => {
    panelProps(props);
    return <div data-testid="shared-sync-panel" />;
  },
}));
vi.mock("../../../../application/hooks/useExtensionSync", () => ({
  useExtensionSyncStatus: () => ({ data: { last_finished_run: null } }),
}));
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Admin" }),
}));
vi.mock("../../../../application/hooks/useFormattedDate", () => ({
  default: () => () => "12-10-2026",
}));
const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: (url: string) => mockGet(url),
    post: (url: string, body: unknown) => mockPost(url, body),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import JiraAssetsConfiguration from "./JiraAssetsConfiguration";

const SAVED = {
  id: 1,
  jira_base_url: "https://x.atlassian.net",
  workspace_id: "w",
  email: "a@b.co",
  deployment_type: "cloud",
  selected_schema_id: "1",
  selected_object_type_id: "42",
  has_api_token: true,
};

const renderPage = () =>
  render(
    <ThemeProvider theme={light}>
      <JiraAssetsConfiguration />
    </ThemeProvider>,
  );

const lastPanelProps = () =>
  panelProps.mock.calls[panelProps.mock.calls.length - 1][0] as Record<string, any>;

describe("JiraAssetsConfiguration sync section", () => {
  beforeEach(() => {
    panelProps.mockReset();
    mockPost.mockReset();
    mockGet.mockImplementation(async (url: string) => ({
      data: { data: url.endsWith("/config") ? SAVED : [] },
    }));
  });

  it("renders the shared sync panel for jira-assets, with Sync now under today's rules", async () => {
    renderPage();
    expect(await screen.findByTestId("shared-sync-panel")).toBeInTheDocument();
    await waitFor(() => expect(lastPanelProps().persistSchedule).toBe(true));
    expect(lastPanelProps()).toMatchObject({
      extensionKey: "jira-assets",
      canManage: true,
      showSyncNow: true,
      syncNowDisabled: true,
    });
    expect(screen.queryByRole("button", { name: "Sync Now" })).toBeNull();
  });

  it("keeps the schedule locked and says why when the saved connection cannot be loaded", async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/config")) throw new Error("network");
      return { data: { data: [] } };
    });
    renderPage();
    expect(
      await screen.findByText(
        "Could not load the saved Jira connection. Reload the page to change the sync settings.",
      ),
    ).toBeInTheDocument();
    expect(lastPanelProps().canManage).toBe(false);
  });

  it("before the first save, keeps the schedule as a draft and sends it with the connection", async () => {
    mockGet.mockImplementation(async (url: string) => ({
      data: {
        data: url.endsWith("/config")
          ? {
              jira_base_url: "https://x.atlassian.net",
              workspace_id: "w",
              email: "a@b.co",
              api_token: "t",
            }
          : [],
      },
    }));
    mockPost.mockResolvedValue({ data: { data: { success: true } } });
    renderPage();
    await screen.findByTestId("shared-sync-panel");
    await waitFor(() => expect(lastPanelProps().persistSchedule).toBe(false));
    expect(lastPanelProps().showSyncNow).toBe(false);

    act(() => {
      lastPanelProps().onScheduleChange({ enabled: true, interval_hours: 6 });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Configuration" }));
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/extensions/jira-assets/config",
      expect.objectContaining({ sync_enabled: true, sync_interval_hours: 6 }),
    );
  });
});
