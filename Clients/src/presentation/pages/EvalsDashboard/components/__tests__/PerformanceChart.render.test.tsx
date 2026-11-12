import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const getAllExperiments = vi.fn();
vi.mock("../../../../../application/repository/deepEval.repository", () => ({
  getAllExperiments: (...args: unknown[]) => getAllExperiments(...args),
}));
vi.mock("../../../../../application/hooks/useFormattedDate", () => ({
  default: () => (iso: string) => iso.slice(0, 10),
}));

import PerformanceChart from "../PerformanceChart";

const completed = (id: string, createdAt: string) => ({
  id,
  status: "completed",
  created_at: createdAt,
  results: { avg_scores: { answerRelevancy: 0.9 } },
});

describe("PerformanceChart", () => {
  beforeEach(() => {
    getAllExperiments.mockReset();
  });

  it("asks for a second run instead of drawing a one-point trend", async () => {
    getAllExperiments.mockResolvedValue({ experiments: [completed("e1", "2026-11-01T10:00:00Z")] });

    render(<PerformanceChart projectId="p1" timeRange="all" />);

    expect(
      await screen.findByText(
        "Run another experiment in this project to see how scores change over time.",
      ),
    ).toBeInTheDocument();
  });

  it("says so when no experiment has completed", async () => {
    getAllExperiments.mockResolvedValue({ experiments: [] });

    render(<PerformanceChart projectId="p1" timeRange="all" />);

    expect(
      await screen.findByText("No completed experiments in this time range."),
    ).toBeInTheDocument();
  });
});
