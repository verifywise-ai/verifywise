import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import type { HomeQueueResponse } from "../../../../domain/types/homeQueue.types";

// The page header's breadcrumbs carry the top-bar actions; they are not under test here.
vi.mock("../../../components/breadcrumbs/PageBreadcrumbs", () => ({
  PageBreadcrumbs: () => null,
}));

const EMPTY_QUEUE: HomeQueueResponse = {
  items: [],
  sources: {},
  counts: {},
} as unknown as HomeQueueResponse;

vi.mock("../../../../application/hooks/useHomeQueue", () => ({
  useHomeQueue: () => ({ data: EMPTY_QUEUE, isLoading: false, isError: false, error: null }),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userToken: { name: "Ada Lovelace", email: "ada@example.com" },
    userId: 1,
    userRoleName: "Admin",
  }),
}));

// Get started renders the Start here body: mock its data hooks and heavy children
// the same way StartHere.test.tsx does.
vi.mock("../../../../application/hooks/useLLMKeyStatus", () => ({
  useLLMKeyStatus: () => ({ data: { hasKeys: true }, loading: false, error: null, hasKeys: true }),
}));
vi.mock("../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [], isLoading: false }),
}));
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 1 }] }),
}));
vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisks: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../../../application/repository/user.repository", () => ({
  getUserById: vi.fn().mockResolvedValue({ data: { name: "Ada Lovelace" } }),
}));
vi.mock("canvas-confetti", () => ({ default: vi.fn() }));
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

import { renderWithProviders } from "../../../../test/renderWithProviders";
import HomePage from "../index";

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
};

const renderHome = (route: string) =>
  renderWithProviders(
    <>
      <HomePage />
      <LocationProbe />
    </>,
    { route },
  );

describe("HomePage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("has the page title and both tabs", () => {
    renderHome("/home");
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Get started" })).toBeInTheDocument();
  });

  it("shows Today by default", () => {
    renderHome("/home");
    expect(screen.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("home-today-tab")).toBeInTheDocument();
    expect(screen.queryByText("Your progress")).not.toBeInTheDocument();
  });

  it("falls back to Today for an unknown tab", () => {
    renderHome("/home?tab=nope");
    expect(screen.getByTestId("home-today-tab")).toBeInTheDocument();
  });

  it("shows the Start here content at ?tab=get-started", () => {
    renderHome("/home?tab=get-started");
    expect(screen.getByRole("tab", { name: "Get started" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByTestId("home-today-tab")).not.toBeInTheDocument();
    const panel = screen.getByTestId("home-get-started-tab");
    // The onboarding progress card's heading (alongside the "Getting started" row heading).
    expect(panel).toHaveTextContent("Getting started");
    expect(panel).toHaveTextContent("Your progress");
  });

  it("puts the tab in the URL when switching", async () => {
    const user = userEvent.setup();
    renderHome("/home");
    await user.click(screen.getByRole("tab", { name: "Get started" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/home?tab=get-started");
    expect(screen.getByTestId("home-get-started-tab")).toHaveTextContent("Your progress");
    expect(screen.queryByTestId("home-today-tab")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Today" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/home?tab=today");
    expect(screen.getByTestId("home-today-tab")).toBeInTheDocument();
    expect(screen.queryByText("Your progress")).not.toBeInTheDocument();
  });
});
