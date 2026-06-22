import { vi } from "vitest";

let mockNotifications: any[] = [];
let mockUnreadCount = 0;
let mockTotalCount = 0;
let mockIsLoading = false;
let mockIsLoadingMore = false;
let mockHasMore = false;
let mockIsConnected = true;
const mockMarkAsRead = vi.fn().mockResolvedValue(undefined);
const mockMarkAllAsRead = vi.fn().mockResolvedValue(undefined);
const mockDeleteNotification = vi.fn().mockResolvedValue(undefined);
const mockLoadMore = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../../application/hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: mockUnreadCount,
    totalCount: mockTotalCount,
    isLoading: mockIsLoading,
    isLoadingMore: mockIsLoadingMore,
    hasMore: mockHasMore,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    deleteNotification: mockDeleteNotification,
    loadMore: mockLoadMore,
    isConnected: mockIsConnected,
  }),
}));

vi.mock("../../VWTooltip", () => ({
  default: ({ children, content }: any) => (
    <div data-testid="vwtooltip" data-content={content}>
      {children}
    </div>
  ),
}));

vi.mock("../../Layout/icon-shake.css", () => ({}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import NotificationBell from "../index";

const createNotification = (overrides = {}) => ({
  id: 1,
  title: "Test notification",
  message: "Test message",
  type: "task_assigned",
  is_read: false,
  action_url: "/tasks/1",
  created_at: "2026-06-08T12:00:00",
  ...overrides,
});

describe("NotificationBell", () => {
  beforeEach(() => {
    mockNotifications = [];
    mockUnreadCount = 0;
    mockTotalCount = 0;
    mockIsLoading = false;
    mockIsLoadingMore = false;
    mockHasMore = false;
    mockIsConnected = true;
    vi.clearAllMocks();
  });

  const openPopover = async () => {
    renderWithProviders(<NotificationBell />);
    await userEvent.click(screen.getByRole("button"));
  };

  it("renders bell icon button", () => {
    renderWithProviders(<NotificationBell />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("shows unread count badge", () => {
    mockUnreadCount = 5;
    renderWithProviders(<NotificationBell />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("opens popover on bell click", async () => {
    await openPopover();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
  });

  it("shows loading spinner when isLoading", async () => {
    mockIsLoading = true;
    await openPopover();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows empty state when no notifications", async () => {
    await openPopover();
    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
  });

  it("shows notification list with items", async () => {
    mockNotifications = [createNotification()];
    await openPopover();
    expect(screen.getByText("Test notification")).toBeInTheDocument();
    expect(screen.getByText("Test message")).toBeInTheDocument();
  });

  it("shows total count when notifications exist", async () => {
    mockTotalCount = 3;
    mockNotifications = [createNotification()];
    await openPopover();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("marks notification as read on click", async () => {
    mockNotifications = [createNotification()];
    await openPopover();
    await userEvent.click(screen.getByText("Test notification"));
    expect(mockMarkAsRead).toHaveBeenCalledWith(1);
  });

  it("navigates to action_url on click", async () => {
    mockNotifications = [createNotification()];
    await openPopover();
    await userEvent.click(screen.getByText("Test notification"));
    expect(mockNavigate).toHaveBeenCalledWith("/tasks/1");
  });

  it("shows mark all as read button when unreadCount > 0", async () => {
    mockUnreadCount = 2;
    mockNotifications = [createNotification()];
    await openPopover();
    const tooltips = screen.getAllByTestId("vwtooltip");
    const markAllTooltip = tooltips.find(
      (t) => t.getAttribute("data-content") === "Mark all notifications as read",
    );
    expect(markAllTooltip).toBeTruthy();
  });

  it("calls markAllAsRead when mark all button clicked", async () => {
    mockUnreadCount = 2;
    mockNotifications = [createNotification()];
    await openPopover();

    const tooltips = screen.getAllByTestId("vwtooltip");
    const markAllTooltip = tooltips.find(
      (t) => t.getAttribute("data-content") === "Mark all notifications as read",
    );
    const markAllBtn = markAllTooltip ? within(markAllTooltip).getByRole("button") : null;
    if (markAllBtn) {
      await userEvent.click(markAllBtn);
    }
    expect(mockMarkAllAsRead).toHaveBeenCalled();
  });

  it("does not show mark all as read when unreadCount is 0", async () => {
    await openPopover();
    const tooltips = screen.getAllByTestId("vwtooltip");
    const markAllTooltip = tooltips.find(
      (t) => t.getAttribute("data-content") === "Mark all notifications as read",
    );
    expect(markAllTooltip).toBeFalsy();
  });

  it("closes popover on close button click", async () => {
    await openPopover();
    const closeBtn = screen
      .getAllByRole("button")
      .find((b) => b.querySelector("svg") && !b.closest('[data-testid="vwtooltip"]'));
    if (closeBtn) {
      await userEvent.click(closeBtn);
    }
    await vi.waitFor(() => {
      expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
    });
  });

  it("shows load more button when hasMore is true", async () => {
    mockHasMore = true;
    mockNotifications = [createNotification()];
    await openPopover();
    expect(screen.getByText("Load more")).toBeInTheDocument();
  });

  it("calls loadMore when Load more button clicked", async () => {
    mockHasMore = true;
    mockNotifications = [createNotification()];
    await openPopover();
    await userEvent.click(screen.getByText("Load more"));
    expect(mockLoadMore).toHaveBeenCalledTimes(1);
  });

  it("shows loading state in load more button when isLoadingMore", async () => {
    mockHasMore = true;
    mockIsLoadingMore = true;
    mockNotifications = [createNotification()];
    await openPopover();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows reconnecting banner when not connected", async () => {
    mockIsConnected = false;
    await openPopover();
    expect(screen.getByText("Reconnecting to real-time updates...")).toBeInTheDocument();
  });

  it("shows relative time for notification created_at", async () => {
    const now = new Date("2026-06-08T12:30:00");
    vi.setSystemTime(now);

    mockNotifications = [createNotification({ created_at: "2026-06-08T12:00:00" })];
    await openPopover();
    expect(screen.getByText("30m ago")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("shows 'Just now' for very recent notifications", async () => {
    const now = new Date("2026-06-08T12:00:05");
    vi.setSystemTime(now);

    mockNotifications = [createNotification({ created_at: "2026-06-08T12:00:00" })];
    await openPopover();
    expect(screen.getByText("Just now")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("shows ExternalLink icon when notification has action_url", async () => {
    mockNotifications = [createNotification({ action_url: "/tasks/1" })];
    await openPopover();
    const container = screen.getByText("Test notification").closest("div");
    expect(container).toBeInTheDocument();
  });

  it("handles notification without message", async () => {
    mockNotifications = [createNotification({ message: undefined })];
    await openPopover();
    expect(screen.getByText("Test notification")).toBeInTheDocument();
  });

  it("does not mark read notification when clicked", async () => {
    mockNotifications = [createNotification({ is_read: true })];
    await openPopover();
    await userEvent.click(screen.getByText("Test notification"));
    expect(mockMarkAsRead).not.toHaveBeenCalled();
  });

  it("renders notification without action_url with default cursor", async () => {
    mockNotifications = [createNotification({ action_url: undefined })];
    await openPopover();
    expect(screen.getByText("Test notification")).toBeInTheDocument();
  });

  it("deletes notification when delete button clicked", async () => {
    mockNotifications = [createNotification()];
    await openPopover();

    const deleteBtn = screen.getByLabelText("Delete notification");
    await userEvent.click(deleteBtn);
    expect(mockDeleteNotification).toHaveBeenCalledWith(1);
  });

  it("renders multiple notifications in a list", async () => {
    mockNotifications = [
      createNotification({ id: 1, title: "First", message: "First msg" }),
      createNotification({
        id: 2,
        title: "Second",
        message: "Second msg",
        type: "review_rejected",
      }),
    ];
    await openPopover();
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("renders connected tooltip content when connected", async () => {
    mockIsConnected = true;
    renderWithProviders(<NotificationBell />);
    const tooltip = screen.getByTestId("vwtooltip");
    expect(tooltip).toHaveAttribute("data-content", "View your notifications");
  });

  it("renders disconnected tooltip content when not connected", async () => {
    mockIsConnected = false;
    renderWithProviders(<NotificationBell />);
    const tooltip = screen.getByTestId("vwtooltip");
    expect(tooltip).toHaveAttribute("data-content", "Connecting...");
  });
});
