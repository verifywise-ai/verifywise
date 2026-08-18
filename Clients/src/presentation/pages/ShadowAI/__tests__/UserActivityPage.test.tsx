import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import {
  ShadowAiUserActivity,
  ShadowAiDepartmentActivity,
} from "../../../../domain/interfaces/i.shadowAi";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockGetUsers = vi.fn();
const mockGetUserDetail = vi.fn();
const mockGetDepartmentActivity = vi.fn();

vi.mock("../../../../application/repository/shadowAi.repository", () => ({
  getUsers: (...args: any[]) => mockGetUsers(...args),
  getUserDetail: (...args: any[]) => mockGetUserDetail(...args),
  getDepartmentActivity: (...args: any[]) => mockGetDepartmentActivity(...args),
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

import UserActivityPage from "../UserActivityPage";

const users: ShadowAiUserActivity[] = [
  { user_email: "alice@example.com", total_prompts: 40, risk_score: 60, department: "Engineering" },
  { user_email: "bob@example.com", total_prompts: 10, risk_score: 20, department: "Finance" },
];

const departments: ShadowAiDepartmentActivity[] = [
  { department: "Engineering", users: 8, total_prompts: 200, top_tool: "ChatGPT", risk_score: 55 },
  { department: "Finance", users: 3, total_prompts: 50, top_tool: "Claude", risk_score: 30 },
];

describe("ShadowAI - UserActivityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUsers.mockResolvedValue({ users, total: 2, page: 1, limit: 20 });
    mockGetDepartmentActivity.mockResolvedValue(departments);
  });

  it("renders without crashing", () => {
    renderWithProviders(<UserActivityPage />, { route: "/shadow-ai/user-activity/users" });
    expect(screen.getByTestId("page-header")).toBeInTheDocument();
  });

  it("shows an empty state when there is no user activity", async () => {
    mockGetUsers.mockResolvedValue({ users: [], total: 0, page: 1, limit: 20 });
    renderWithProviders(<UserActivityPage />, { route: "/shadow-ai/user-activity/users" });

    await waitFor(() => {
      expect(screen.getByText(/No user activity detected yet/)).toBeInTheDocument();
    });
  });

  it("renders the users table", async () => {
    renderWithProviders(<UserActivityPage />, { route: "/shadow-ai/user-activity/users" });

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("Engineering").length).toBeGreaterThan(0);
  });

  it("shows the departments tab and switches to it", async () => {
    renderWithProviders(<UserActivityPage />, { route: "/shadow-ai/user-activity/users" });

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /Departments/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/shadow-ai/user-activity/departments");
  });

  it("renders the departments table on the departments route", async () => {
    renderWithProviders(<UserActivityPage />, { route: "/shadow-ai/user-activity/departments" });

    await waitFor(() => {
      expect(mockGetDepartmentActivity).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("ChatGPT")).toBeInTheDocument();
    });
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("opens the user detail view when a user row is clicked", async () => {
    mockGetUserDetail.mockResolvedValue({
      email: "alice@example.com",
      department: "Engineering",
      tools: [{ tool_name: "ChatGPT", event_count: 12, last_used: "2026-02-01T00:00:00Z" }],
      total_prompts: 40,
    });

    renderWithProviders(<UserActivityPage />, { route: "/shadow-ai/user-activity/users" });

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("alice@example.com"));

    await waitFor(() => {
      expect(mockGetUserDetail).toHaveBeenCalledWith("alice@example.com", "30d");
    });
    await waitFor(() => {
      expect(screen.getByText("Tools used")).toBeInTheDocument();
    });
    expect(screen.getAllByText("ChatGPT").length).toBeGreaterThan(0);
  });

  it("shows 'No tool usage recorded' when the user has no tools", async () => {
    mockGetUserDetail.mockResolvedValue({
      email: "alice@example.com",
      department: "Engineering",
      tools: [],
      total_prompts: 0,
    });

    renderWithProviders(<UserActivityPage />, { route: "/shadow-ai/user-activity/users" });

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("alice@example.com"));

    await waitFor(() => {
      expect(screen.getByText("No tool usage recorded")).toBeInTheDocument();
    });
  });

  it("navigates back to the users list from the detail view", async () => {
    mockGetUserDetail.mockResolvedValue({
      email: "alice@example.com",
      department: "Engineering",
      tools: [],
      total_prompts: 0,
    });

    renderWithProviders(<UserActivityPage />, { route: "/shadow-ai/user-activity/users" });

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("alice@example.com"));

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button"));
    expect(mockNavigate).toHaveBeenCalledWith("/shadow-ai/user-activity/users");
  });

  it("reloads data when the period selector changes", async () => {
    renderWithProviders(<UserActivityPage />, { route: "/shadow-ai/user-activity/users" });

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenCalledWith(
        expect.objectContaining({ period: "30d", page: 1 }),
      );
    });

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Last 90 days" }));

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenLastCalledWith(expect.objectContaining({ period: "90d" }));
    });
  });

  it("sorts the users table by a column", async () => {
    renderWithProviders(<UserActivityPage />, { route: "/shadow-ai/user-activity/users" });

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });

    // Ascending by total prompts should put bob (10) before alice (40).
    fireEvent.click(screen.getByText("Total prompts"));

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("bob@example.com");
  });

  it("logs and recovers when loading fails", async () => {
    mockGetUsers.mockRejectedValue(new Error("network error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(<UserActivityPage />, { route: "/shadow-ai/user-activity/users" });

    await waitFor(() => {
      expect(screen.getByTestId("page-header")).toBeInTheDocument();
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
