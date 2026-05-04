import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { LinkedModelsView } from "../index";

// Mock child components
vi.mock("../../Skeletons", () => ({
  default: () => <div data-testid="skeleton">Loading...</div>,
}));

vi.mock("../../EmptyState", () => ({
  EmptyState: ({ message }: { message?: string }) => <div data-testid="empty-state">{message}</div>,
}));

vi.mock("../../Link", () => ({
  VWLink: ({ children }: { children: React.ReactNode }) => <a data-testid="vw-link">{children}</a>,
}));

vi.mock("../../InfoBox", () => ({
  default: ({ message }: { message: string }) => <div data-testid="info-box">{message}</div>,
}));

describe("LinkedModelsView", () => {
  it("renders without crashing with empty models", async () => {
    const fetchModels = vi.fn().mockResolvedValue([]);

    renderWithProviders(<LinkedModelsView fetchModels={fetchModels} />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
  });

  it("shows custom empty message", async () => {
    const fetchModels = vi.fn().mockResolvedValue([]);

    renderWithProviders(
      <LinkedModelsView fetchModels={fetchModels} emptyMessage="No models available" />,
    );

    await waitFor(() => {
      expect(screen.getByText("No models available")).toBeInTheDocument();
    });
  });

  it("renders skeleton while loading", () => {
    // fetchModels never resolves to keep loading state
    const fetchModels = vi.fn().mockReturnValue(new Promise(() => {}));

    renderWithProviders(<LinkedModelsView fetchModels={fetchModels} />);

    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  it("renders table when models are returned", async () => {
    const mockModels = [
      {
        id: 1,
        provider: "OpenAI",
        model: "GPT-4",
        version: "1.0",
        status: "approved",
      },
    ];
    const fetchModels = vi.fn().mockResolvedValue(mockModels);

    renderWithProviders(<LinkedModelsView fetchModels={fetchModels} />);

    await waitFor(() => {
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });
    expect(screen.getByText("GPT-4")).toBeInTheDocument();
    expect(screen.getByText("1.0")).toBeInTheDocument();
  });

  it("renders header content when provided", async () => {
    const fetchModels = vi.fn().mockResolvedValue([]);

    renderWithProviders(
      <LinkedModelsView
        fetchModels={fetchModels}
        headerContent={<div data-testid="header-content">Header</div>}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("header-content")).toBeInTheDocument();
    });
  });
});
