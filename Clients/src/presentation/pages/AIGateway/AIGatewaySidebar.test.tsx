import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../test/renderWithProviders";
import AIGatewaySidebar from "./AIGatewaySidebar";

describe("AIGatewaySidebar", () => {
  it("renders the core flat nav items", () => {
    renderWithProviders(
      <AIGatewaySidebar activeTab="dashboard" onTabChange={vi.fn()} />,
    );

    expect(screen.getByLabelText("Dashboard")).toBeInTheDocument();
    expect(screen.getByLabelText("Endpoints")).toBeInTheDocument();
    expect(screen.getByLabelText("Playground")).toBeInTheDocument();
    // "Guardrails" appears twice: once as the flat nav item, once as the
    // Agent Control group item (MCP guardrails) — both share the label.
    expect(screen.getAllByLabelText("Guardrails")).toHaveLength(2);
    expect(screen.getByLabelText("Models")).toBeInTheDocument();
    expect(screen.getByLabelText("Logs")).toBeInTheDocument();
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
  });

  it("hides the Prompts item when SHOW_AI_GATEWAY_PROMPTS is false (current flag value)", () => {
    renderWithProviders(<AIGatewaySidebar activeTab="dashboard" onTabChange={vi.fn()} />);
    expect(screen.queryByLabelText("Prompts")).not.toBeInTheDocument();
  });

  it("renders the Agent Control group items", () => {
    renderWithProviders(<AIGatewaySidebar activeTab="dashboard" onTabChange={vi.fn()} />);

    expect(screen.getByText("Agent Control")).toBeInTheDocument();
    expect(screen.getByLabelText("Runs")).toBeInTheDocument();
    expect(screen.getByLabelText("Activity")).toBeInTheDocument();
    expect(screen.getByLabelText("Approvals")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Guardrails")).toHaveLength(2);
    expect(screen.getByLabelText("Agent keys")).toBeInTheDocument();
    expect(screen.getByLabelText("MCP servers")).toBeInTheDocument();
    expect(screen.getByLabelText("MCP tools")).toBeInTheDocument();
  });

  it("calls onTabChange with the item's value when a flat nav item is clicked", () => {
    const onTabChange = vi.fn();
    renderWithProviders(<AIGatewaySidebar activeTab="dashboard" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByLabelText("Endpoints"));
    expect(onTabChange).toHaveBeenCalledWith("endpoints");
  });

  it("calls onTabChange with the group item's value (namespaced) when clicked", () => {
    const onTabChange = vi.fn();
    renderWithProviders(<AIGatewaySidebar activeTab="dashboard" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByLabelText("Runs"));
    expect(onTabChange).toHaveBeenCalledWith("mcp/runs");
  });

  it("marks the item matching activeTab as active (selected-path class)", () => {
    renderWithProviders(<AIGatewaySidebar activeTab="logs" onTabChange={vi.fn()} />);

    const logsButton = screen.getByLabelText("Logs").closest('[role="button"]');
    expect(logsButton).toHaveClass("selected-path");

    const dashboardButton = screen
      .getByLabelText("Dashboard")
      .closest('[role="button"]');
    expect(dashboardButton).toHaveClass("unselected");
  });

  it("marks the active group item (e.g. mcp/audit) as active", () => {
    renderWithProviders(<AIGatewaySidebar activeTab="mcp/audit" onTabChange={vi.fn()} />);

    const activityButton = screen.getByLabelText("Activity").closest('[role="button"]');
    expect(activityButton).toHaveClass("selected-path");
  });

  it("shows endpointsCount as a chip badge on the Endpoints item", () => {
    renderWithProviders(
      <AIGatewaySidebar activeTab="dashboard" onTabChange={vi.fn()} endpointsCount={7} />,
    );
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("caps the displayed count at 99+", () => {
    renderWithProviders(
      <AIGatewaySidebar activeTab="dashboard" onTabChange={vi.fn()} endpointsCount={150} />,
    );
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("does not render a count chip when endpointsCount is 0", () => {
    renderWithProviders(
      <AIGatewaySidebar activeTab="dashboard" onTabChange={vi.fn()} endpointsCount={0} />,
    );
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("AIGatewaySidebar with SHOW_AI_GATEWAY_PROMPTS enabled", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("../../../application/config/featureFlags", () => ({
      SHOW_AI_GATEWAY_PROMPTS: true,
    }));
  });

  afterEach(() => {
    vi.doUnmock("../../../application/config/featureFlags");
  });

  it("shows the Prompts item with its count when the flag is true", async () => {
    const { default: SidebarWithPrompts } = await import("./AIGatewaySidebar");
    renderWithProviders(
      <SidebarWithPrompts activeTab="prompts" onTabChange={vi.fn()} promptsCount={3} />,
    );

    expect(screen.getByLabelText("Prompts")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByLabelText("Prompts").closest('[role="button"]')).toHaveClass(
      "selected-path",
    );
  });

  it("calls onTabChange('prompts') when the Prompts item is clicked", async () => {
    const { default: SidebarWithPrompts } = await import("./AIGatewaySidebar");
    const onTabChange = vi.fn();
    renderWithProviders(<SidebarWithPrompts activeTab="dashboard" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByLabelText("Prompts"));
    expect(onTabChange).toHaveBeenCalledWith("prompts");
  });
});
