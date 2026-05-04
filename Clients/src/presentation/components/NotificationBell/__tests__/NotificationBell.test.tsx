import { vi } from "vitest";

vi.mock("../../../../application/hooks/useNotifications", () => ({
  useNotifications: vi.fn().mockReturnValue({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
  }),
}));

vi.mock("../../VWTooltip", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("../../Layout/icon-shake.css", () => ({}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import NotificationBell from "../index";

describe("NotificationBell", () => {
  it("renders bell icon button", () => {
    renderWithProviders(<NotificationBell />);
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });
});
