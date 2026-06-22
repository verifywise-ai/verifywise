import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import Sidebar from "../index";

vi.mock("../../../../application/hooks/useMultipleOnScreen", () => ({
  default: () => ({ refs: { current: [] }, allVisible: false }),
}));

vi.mock("../../../../application/repository/task.repository", () => ({
  getAllTasks: vi.fn().mockResolvedValue({ data: { tasks: [] } }),
}));

vi.mock("../../UserGuide", () => ({
  useUserGuideSidebarContext: () => ({
    open: vi.fn(),
    openTab: vi.fn(),
  }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: "/", search: "", hash: "", state: null, key: "default" }),
  };
});

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the Dashboard nav link", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("should render the Tasks nav link", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("Tasks")).toBeInTheDocument();
  });

  it("should render the Frameworks nav link", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("Frameworks")).toBeInTheDocument();
  });

  it("should render INVENTORY group items", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("Use cases")).toBeInTheDocument();
    expect(screen.getByText("Model inventory")).toBeInTheDocument();
    expect(screen.getByText("Datasets")).toBeInTheDocument();
    expect(screen.getByText("Agent discovery")).toBeInTheDocument();
  });

  it("should render ASSURANCE group items", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("Risk management")).toBeInTheDocument();
    expect(screen.getByText("Training registry")).toBeInTheDocument();
    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.getByText("Reporting")).toBeInTheDocument();
    expect(screen.getByText("AI trust center")).toBeInTheDocument();
  });

  it("should render GOVERNANCE group items", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("Vendors")).toBeInTheDocument();
    expect(screen.getByText("Policy manager")).toBeInTheDocument();
    expect(screen.getByText("Incident management")).toBeInTheDocument();
  });

  it("should render group section labels", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("INVENTORY")).toBeInTheDocument();
    expect(screen.getByText("ASSURANCE")).toBeInTheDocument();
    expect(screen.getByText("GOVERNANCE")).toBeInTheDocument();
  });

  it("should render Start here nav link", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("Start here")).toBeInTheDocument();
  });

  it("should navigate when a nav item is clicked", () => {
    renderWithProviders(<Sidebar />);

    const dashboardItem = screen.getByText("Dashboard");
    fireEvent.click(dashboardItem);

    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
