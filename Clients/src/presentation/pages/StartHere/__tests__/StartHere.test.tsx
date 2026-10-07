import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Suppress console errors from async state updates
vi.spyOn(console, "error").mockImplementation(() => {});

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

let mockUserRoleName = "Admin";
let mockHasLLMKeys: boolean | null = true;

// Mock hooks
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userToken: { name: "Test User" },
    userId: 1,
    userRoleName: mockUserRoleName,
  }),
}));

// null stands for "status not known yet" (loading).
vi.mock("../../../../application/hooks/useLLMKeyStatus", () => ({
  useLLMKeyStatus: () =>
    mockHasLLMKeys === null
      ? { data: null, loading: true, error: null, hasKeys: true }
      : {
          data: { hasKeys: mockHasLLMKeys },
          loading: false,
          error: null,
          hasKeys: mockHasLLMKeys,
        },
}));

vi.mock("../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [{ id: 1 }],
  }),
}));

// Mock repositories
vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisks: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("../../../../application/repository/user.repository", () => ({
  getUserById: vi.fn().mockResolvedValue({ data: { name: "Test User" } }),
}));

// Mock utilities
vi.mock("../../../../application/utils/greetings", () => ({
  getTimeBasedGreeting: () => ({
    greetingText: "Good morning",
    text: "Good morning, Test User",
  }),
}));

// Mock canvas-confetti
vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

// Mock heavy child components
vi.mock("../../../components/FeatureVideos/WelcomeVideo", () => ({
  WelcomeVideoPlayer: () => <div data-testid="welcome-video" />,
}));

vi.mock("../../../components/FeatureVideos/player/VideoPlayerModal", () => ({
  VideoPlayerModal: () => <div data-testid="video-modal" />,
}));

vi.mock("../../../components/FeatureVideos/shared/buildExploreConfig", () => ({
  buildExploreConfig: vi.fn(),
}));

vi.mock("../../../components/FeatureVideos/exploreVideos", () => ({
  EXPLORE_VIDEO_DATA: {},
}));

import StartHere from "../index";

describe("StartHere", () => {
  beforeEach(() => {
    localStorage.clear();
    mockUserRoleName = "Admin";
    mockHasLLMKeys = true;
    mockNavigate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    renderWithProviders(<StartHere />);
    expect(screen.getByText("Good morning")).toBeInTheDocument();
  });

  it("shows the Getting started section", () => {
    renderWithProviders(<StartHere />);
    // "Getting started" appears in both the section heading and the progress card
    const elements = screen.getAllByText("Getting started");
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows the Explore VerifyWise section", () => {
    renderWithProviders(<StartHere />);
    expect(screen.getByText("Explore VerifyWise")).toBeInTheDocument();
  });

  it("shows the Shortcuts section", () => {
    renderWithProviders(<StartHere />);
    expect(screen.getByText("Shortcuts")).toBeInTheDocument();
  });

  it("shows the Resources section", () => {
    renderWithProviders(<StartHere />);
    expect(screen.getByText("Resources")).toBeInTheDocument();
  });

  it("shows the What's new section", () => {
    renderWithProviders(<StartHere />);
    expect(screen.getByText("What's new")).toBeInTheDocument();
  });

  it("hides the LLM key hint when the organization already has a key", () => {
    mockHasLLMKeys = true;
    renderWithProviders(<StartHere />);
    expect(screen.queryByText(/LLM API key/)).not.toBeInTheDocument();
  });

  it("hides the LLM key hint while key status is still unknown", () => {
    mockHasLLMKeys = null;
    renderWithProviders(<StartHere />);
    expect(screen.queryByText(/LLM API key/)).not.toBeInTheDocument();
  });

  it("lets an admin open the LLM key form when no key is configured", async () => {
    mockHasLLMKeys = false;
    mockUserRoleName = "Admin";
    const user = userEvent.setup();
    renderWithProviders(<StartHere />);

    expect(
      screen.getByText("Configure an LLM API key so Advisor and reporting can run.", {
        exact: false,
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to settings" }));
    expect(mockNavigate).toHaveBeenCalledWith("/settings/apikeys?addKey=1");
  });

  it("tells members to contact an administrator when no key is configured", () => {
    mockHasLLMKeys = false;
    mockUserRoleName = "Editor";
    renderWithProviders(<StartHere />);

    expect(
      screen.getByText("Advisor and reporting need an LLM API key. Contact your administrator."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go to settings" })).not.toBeInTheDocument();
  });
});
