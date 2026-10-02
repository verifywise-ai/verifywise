import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import userEvent from "@testing-library/user-event";
import {
  rateText,
  ratePercent,
  signalLabel,
  topReasonLabel,
  reasonLabel,
  groupReasons,
} from "../DismissalAnalytics";
import type { DismissalAnalytics as DismissalAnalyticsPayload } from "../../../../domain/interfaces/i.riskLink";

const mockGetDismissalAnalytics = vi.fn();

vi.mock("../../../../application/repository/riskLink.repository", () => ({
  getDismissalAnalytics: (...args: unknown[]) => mockGetDismissalAnalytics(...args),
}));

import DismissalAnalytics from "../DismissalAnalytics";

describe("dismissal analytics helpers", () => {
  it("never renders NaN for a zero denominator", () => {
    expect(rateText(0, 0)).toBe("—");
    expect(ratePercent(0, 0)).toBe(0);
  });

  it("computes whole-percent rates", () => {
    expect(rateText(40, 24)).toBe("60%");
    expect(rateText(3, 1)).toBe("33%");
  });

  it("labels the null bucket honestly", () => {
    expect(reasonLabel(null)).toBe("No reason given");
    expect(topReasonLabel(null)).toBe("—");
    expect(topReasonLabel("none")).toBe("No reason given");
  });

  it("renders an unknown signal key readably instead of blank", () => {
    expect(signalLabel("future_provider_x")).toBe("Future provider x");
    expect(signalLabel("shared_category")).toBe("Shared category");
  });

  it("pools group denominators without crossing relation or source", () => {
    const groups = groupReasons([
      {
        relationType: "inherits_from",
        source: "agent",
        status: "confirmed",
        dismissReason: null,
        count: 16,
      },
      {
        relationType: "inherits_from",
        source: "agent",
        status: "dismissed",
        dismissReason: null,
        count: 20,
      },
      {
        relationType: "inherits_from",
        source: "agent",
        status: "dismissed",
        dismissReason: "wrong_parent",
        count: 4,
      },
      {
        relationType: "related_to",
        source: "derived",
        status: "dismissed",
        dismissReason: null,
        count: 5,
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      relationType: "inherits_from",
      source: "agent",
      decided: 40,
      dismissed: 24,
    });
    // Only dismissed links carry a reason; confirmed links are counted in
    // `decided` but must never appear as a "No reason given" dismissal.
    expect(groups[0].rows.map((row) => row.count).sort((a, b) => a - b)).toEqual([4, 20]);
    expect(groups[0].rows.some((row) => row.count === 16)).toBe(false);
  });

  it("counts confirmed links as decided but never lists them as dismissals", () => {
    const groups = groupReasons([
      {
        relationType: "related_to",
        source: "derived",
        status: "confirmed",
        dismissReason: null,
        count: 7,
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ decided: 7, dismissed: 0 });
    expect(groups[0].rows).toHaveLength(0);
  });
});

describe("DismissalAnalytics rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const payload = (
    overrides: Partial<DismissalAnalyticsPayload> = {},
  ): DismissalAnalyticsPayload => ({
    signals: [],
    reasons: [],
    notes: [],
    ...overrides,
  });

  it("renders the null bucket and an unknown signal after expanding", async () => {
    mockGetDismissalAnalytics.mockResolvedValue(
      payload({
        signals: [{ signal: "future_provider_x", decided: 5, dismissed: 0, topReason: null }],
        reasons: [
          {
            relationType: "related_to",
            source: "derived",
            status: "dismissed",
            dismissReason: null,
            count: 2,
          },
        ],
      }),
    );
    renderWithProviders(<DismissalAnalytics />);

    await userEvent.click(await screen.findByText("Dismissal analytics"));

    expect(await screen.findByText("Future provider x")).toBeInTheDocument();
    expect(screen.getAllByText("No reason given").length).toBeGreaterThan(0);
    // topReason null (decided links, zero dismissals) renders a dash, never a
    // blank cell.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the empty state when nothing is decided yet", async () => {
    mockGetDismissalAnalytics.mockResolvedValue(payload());
    renderWithProviders(<DismissalAnalytics />);

    await userEvent.click(await screen.findByText("Dismissal analytics"));

    expect(await screen.findByText(/No decided links yet/, { exact: false })).toBeInTheDocument();
  });
});
