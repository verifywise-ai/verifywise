import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const arenaState = vi.hoisted(() => ({
  data: undefined as { enabled: boolean; configured: boolean } | undefined,
  isLoading: false,
  isError: false,
  mutateAsync: vi.fn(),
  isPending: false,
  canManage: true,
}));

vi.mock("../../../../application/hooks/useArenaSetting", () => ({
  useArenaSetting: () => ({
    data: arenaState.data,
    isLoading: arenaState.isLoading,
    isError: arenaState.isError,
  }),
  useUpdateArenaSetting: () => ({
    mutateAsync: arenaState.mutateAsync,
    isPending: arenaState.isPending,
  }),
}));

vi.mock("../../../../application/hooks/useCan", () => ({
  useCan: () => arenaState.canManage,
  useCanCheck: () => () => arenaState.canManage,
  usePermissionsSettled: () => true,
}));

import EvalsSidebar from "../EvalsSidebar";
import ArenaSettingSection from "../ArenaSettingSection";
import ArenaDisabledState from "../ArenaDisabledState";

beforeEach(() => {
  arenaState.data = undefined;
  arenaState.isLoading = false;
  arenaState.isError = false;
  arenaState.isPending = false;
  arenaState.canManage = true;
  arenaState.mutateAsync.mockReset();
  arenaState.mutateAsync.mockResolvedValue({ enabled: false, configured: true });
});

describe("EvalsSidebar Arena entry", () => {
  const renderSidebar = () =>
    renderWithProviders(<EvalsSidebar activeTab="overview" onTabChange={vi.fn()} />);

  it("hides Arena when the organization has it off", () => {
    arenaState.data = { enabled: false, configured: false };
    renderSidebar();
    expect(screen.getByText("Playground")).toBeInTheDocument();
    expect(screen.queryByText("Arena")).not.toBeInTheDocument();
  });

  it("hides Arena while the setting is still loading", () => {
    arenaState.isLoading = true;
    renderSidebar();
    expect(screen.queryByText("Arena")).not.toBeInTheDocument();
  });

  it("shows Arena when the organization has it on", () => {
    arenaState.data = { enabled: true, configured: false };
    renderSidebar();
    expect(screen.getByText("Arena")).toBeInTheDocument();
  });
});

describe("ArenaSettingSection", () => {
  const toggle = () => screen.getByRole("switch", { name: "Turn on Arena" });

  it("reflects the current value", () => {
    arenaState.data = { enabled: true, configured: false };
    renderWithProviders(<ArenaSettingSection />);
    expect(
      screen.getByText("Compare models side by side on the same prompts."),
    ).toBeInTheDocument();
    expect(toggle()).toBeChecked();
  });

  it("lets an Admin turn Arena off", async () => {
    arenaState.data = { enabled: true, configured: true };
    renderWithProviders(<ArenaSettingSection />);
    fireEvent.click(toggle());
    await waitFor(() => expect(arenaState.mutateAsync).toHaveBeenCalledWith(false));
  });

  it("lets an Admin turn Arena on", async () => {
    arenaState.data = { enabled: false, configured: false };
    renderWithProviders(<ArenaSettingSection />);
    expect(toggle()).not.toBeChecked();
    fireEvent.click(toggle());
    await waitFor(() => expect(arenaState.mutateAsync).toHaveBeenCalledWith(true));
  });

  it("is read-only for users without organization.admin", () => {
    arenaState.canManage = false;
    arenaState.data = { enabled: false, configured: false };
    renderWithProviders(<ArenaSettingSection />);
    expect(toggle()).toBeDisabled();
    expect(screen.getByText("Only Admins can change this setting.")).toBeInTheDocument();
  });

  it("shows an error when saving fails", async () => {
    arenaState.data = { enabled: true, configured: true };
    arenaState.mutateAsync.mockRejectedValueOnce(new Error("403"));
    renderWithProviders(<ArenaSettingSection />);
    fireEvent.click(toggle());
    expect(
      await screen.findByText("Could not save the Arena setting. Try again."),
    ).toBeInTheDocument();
  });

  it("disables the toggle when the setting cannot be loaded", () => {
    arenaState.isError = true;
    renderWithProviders(<ArenaSettingSection />);
    expect(screen.getByText("Could not load the Arena setting.")).toBeInTheDocument();
    expect(toggle()).toBeDisabled();
  });
});

describe("ArenaDisabledState", () => {
  it("offers Admins a way to the settings", () => {
    const onOpenSettings = vi.fn();
    renderWithProviders(<ArenaDisabledState onOpenSettings={onOpenSettings} />);
    expect(
      screen.getByText("Arena is turned off for your organization. Turn it on in settings."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("tells other users to ask an Admin", () => {
    arenaState.canManage = false;
    renderWithProviders(<ArenaDisabledState onOpenSettings={vi.fn()} />);
    expect(
      screen.getByText("Arena is turned off for your organization. Ask an Admin to turn it on."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open settings" })).not.toBeInTheDocument();
  });
});
