import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

vi.mock("../../../../../application/hooks/useAiTrustIndex", () => ({
  useApp: () => ({
    data: {
      data: {
        slug: "x",
        name: "X",
        vendor: "V",
        category: "Assistant",
        letter_grade: "B",
        score_out_of_100: 82,
        is_tracked: false,
        data: {
          slug: "x",
          name: "X",
          vendor: "V",
          domain: "x.com",
          category: "Assistant",
          scoreOutOf100: 82,
          letterGrade: "B",
          displayedGrade: "B",
          confidence: "High",
          dealbreakerFlags: [],
          summary: "A summary.",
          highlights: [],
          policyUrl: "https://x.com",
          policyLastUpdated: null,
          modalities: [],
          processesBiometrics: false,
          indicators: null,
        },
      },
    },
    isLoading: false,
    isError: false,
  }),
  useApps: () => ({ data: { apps: [] } }),
  useTrackApp: () => ({ mutate: vi.fn(), isPending: false }),
  useUntrackApp: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../../../../application/contexts/AITrustIndexSidebar.context", () => ({
  useAITrustIndexSidebarContextSafe: () => null,
}));

import AppDetail from "../index";

describe("AppDetail", () => {
  it("renders the verdict and summary without an indicator map", () => {
    renderWithProviders(<AppDetail />, { route: "/ai-trust-index/x" });
    expect(screen.getByText(/earns/i)).toBeInTheDocument();
    expect(screen.getByText(/A summary\./)).toBeInTheDocument();
    // breakdown fallback note appears when no indicators
    expect(screen.getByText(/being prepared/i)).toBeInTheDocument();
  });
});
