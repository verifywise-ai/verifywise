import { renderWithProviders } from "../../../../test/renderWithProviders";
import AIObservability from "../index";

// Mock the repository so React Query hooks resolve without a real network call
vi.mock("../../../../application/repository/observability.repository", () => ({
  getTraces: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  getTraceDetail: vi.fn().mockResolvedValue({ spans: [] }),
  getObservabilityMetrics: vi.fn().mockResolvedValue({}),
}));

describe("AIObservability Page", () => {
  it("renders without crashing and shows the traces heading", () => {
    const { getByText } = renderWithProviders(<AIObservability />, {
      route: "/ai-observability",
    });

    expect(getByText("Traces")).toBeInTheDocument();
  });
});
