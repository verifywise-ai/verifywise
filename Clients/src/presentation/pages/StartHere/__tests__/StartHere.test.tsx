import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Suppress console errors from async state updates
vi.spyOn(console, "error").mockImplementation(() => {});

// Mock hooks
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userToken: { name: "Test User" },
    userId: 1,
  }),
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
});
