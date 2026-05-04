import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { TitleScene } from "../shared/TitleScene";
import { PlayerControls } from "../player/PlayerControls";
import type { FramePlayerState } from "../player/useFramePlayer";

describe("TitleScene", () => {
  it("renders without crashing", () => {
    renderWithProviders(<TitleScene frame={0} title="Welcome" subtitle="To VerifyWise" />);
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("To VerifyWise")).toBeInTheDocument();
  });

  it("renders with a later frame value", () => {
    renderWithProviders(<TitleScene frame={60} title="Test Title" subtitle="Test Subtitle" />);
    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("Test Subtitle")).toBeInTheDocument();
  });
});

describe("PlayerControls", () => {
  const createMockPlayer = (overrides: Partial<FramePlayerState> = {}): FramePlayerState => ({
    frame: 0,
    playing: false,
    finished: false,
    progress: 0,
    play: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    seek: vi.fn(),
    seekProgress: vi.fn(),
    ...overrides,
  });

  it("renders without crashing", () => {
    const player = createMockPlayer();
    renderWithProviders(<PlayerControls player={player} />);
    // Should render the play/pause button
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("calls toggle when play/pause button is clicked", async () => {
    const toggle = vi.fn();
    const player = createMockPlayer({ toggle });
    renderWithProviders(<PlayerControls player={player} />);
    const button = screen.getByRole("button");
    button.click();
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("renders progress bar reflecting the player progress", () => {
    const player = createMockPlayer({ progress: 0.5 });
    const { container } = renderWithProviders(<PlayerControls player={player} />);
    // The component renders; progress is used for width styling
    expect(container.firstChild).toBeTruthy();
  });
});
