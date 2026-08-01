import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AIObservability from "../index";
import * as repo from "../../../../application/repository/observability.repository";

// Mock the repository so React Query hooks resolve without a real network call.
//
// The shapes below are the ones the API actually returns — getTraces resolves
// { traces, total }, not { rows, total }. The previous mock returned `rows`,
// which is a key the endpoint has never produced, so the suite passed while the
// page rendered "No traces found" against a non-empty result in production.
vi.mock("../../../../application/repository/observability.repository", () => ({
  getTraces: vi.fn(),
  getTraceDetail: vi.fn(),
  getObservabilityMetrics: vi.fn(),
}));

const mockRepo = vi.mocked(repo);

const TRACE = {
  id: "trace-1",
  name: "advisor.answer",
  timestamp: "2026-07-30T10:00:00.000Z",
  latency: 1200,
  totalCost: 0.42,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.getTraces.mockResolvedValue({ traces: [], total: 0 });
  mockRepo.getTraceDetail.mockResolvedValue({ spans: [] });
  mockRepo.getObservabilityMetrics.mockResolvedValue({ summary: {}, latencyTrend: [] });
});

describe("AIObservability Page", () => {
  it("renders without crashing and shows the traces heading", () => {
    const { getByText } = renderWithProviders(<AIObservability />, {
      route: "/ai-observability",
    });

    expect(getByText("Traces")).toBeInTheDocument();
  });

  it("renders the rows the API returns under `traces`", async () => {
    mockRepo.getTraces.mockResolvedValue({ traces: [TRACE], total: 1 });

    const { findByText, queryByText } = renderWithProviders(<AIObservability />, {
      route: "/ai-observability",
    });

    expect(await findByText("advisor.answer")).toBeInTheDocument();
    expect(queryByText("No traces found")).not.toBeInTheDocument();
  });

  it("shows the empty state only when the org genuinely has no traces", async () => {
    const { findByText } = renderWithProviders(<AIObservability />, {
      route: "/ai-observability",
    });

    expect(await findByText("No traces found")).toBeInTheDocument();
  });

  it("distinguishes a failed traces request from an empty result", async () => {
    mockRepo.getTraces.mockRejectedValue(new Error("boom"));

    const { findByText } = renderWithProviders(<AIObservability />, {
      route: "/ai-observability",
    });

    expect(await findByText(/Could not load traces/i)).toBeInTheDocument();
  });

  it("renders a string cost from the metrics endpoint without crashing", async () => {
    // pg hands numeric back as a string; `"1.50".toFixed` is not a function.
    mockRepo.getObservabilityMetrics.mockResolvedValue({
      summary: { total_traces: 3, total_cost: "1.50", avg_latency_ms: "900", error_rate_pct: "0" },
      latencyTrend: [],
    });

    const { findByText } = renderWithProviders(<AIObservability />, {
      route: "/ai-observability",
    });

    expect(await findByText("$1.50")).toBeInTheDocument();
  });

  it("exposes the period chips to the keyboard", async () => {
    const { getAllByRole } = renderWithProviders(<AIObservability />, {
      route: "/ai-observability",
    });

    await waitFor(() => {
      const chips = getAllByRole("button", { name: /Last \d+ days/i });
      expect(chips).toHaveLength(3);
      chips.forEach((chip) => expect(chip).toHaveAttribute("tabindex", "0"));
      expect(chips.filter((c) => c.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    });
  });
});
