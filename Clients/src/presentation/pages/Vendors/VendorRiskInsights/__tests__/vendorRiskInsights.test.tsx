import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import type { VendorRisk } from "../../../../../domain/types/VendorRisk";

const mockGetVendorExposure = vi.fn();
const mockGetVendorDuplicates = vi.fn();
const mockGetVendorCoverage = vi.fn();
const mockNavigate = vi.fn();
let mockIsAdmin = true;

vi.mock("../../../../../application/repository/riskLink.repository", () => ({
  getVendorExposure: (...args: unknown[]) => mockGetVendorExposure(...args),
  getVendorDuplicateCandidates: (...args: unknown[]) => mockGetVendorDuplicates(...args),
  getVendorFrameworkCoverage: (...args: unknown[]) => mockGetVendorCoverage(...args),
}));

vi.mock("../../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => mockIsAdmin,
}));

vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [{ id: 7, name: "Ada", surname: "Lovelace", email: "ada@x.io", roleId: 1 }],
    loading: false,
    error: null,
    refreshUsers: vi.fn(),
  }),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => mockNavigate,
}));

import VendorRiskInsights from "..";
import { heatPosition, matchesHeatCell } from "../HeatMapSection";
import { vendorLevelRank } from "../CoverageSection";
import { coverageReport, duplicateReport, exposureReport, vendorRisk } from "./fixtures";

const renderInsights = (props: Partial<Parameters<typeof VendorRiskInsights>[0]> = {}) => {
  const handlers = { onSelectCell: vi.fn(), onOpenRisk: vi.fn() };
  renderWithProviders(
    <VendorRiskInsights risks={[]} selectedCell={null} {...handlers} {...props} />,
  );
  return handlers;
};

const open = async (title: string) =>
  userEvent.click(screen.getByRole("button", { name: new RegExp(`^${title}`) }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockIsAdmin = true;
  mockGetVendorExposure.mockResolvedValue(exposureReport());
  mockGetVendorDuplicates.mockResolvedValue(duplicateReport());
  mockGetVendorCoverage.mockResolvedValue(coverageReport());
});

describe("heat map helpers", () => {
  it("places a vendor risk on the 1-5 scales by its likelihood and severity", () => {
    expect(heatPosition("Possible", "Major")).toEqual({ likelihood: 3, severity: 4 });
    expect(heatPosition("almost certain", "Catastrophic")).toEqual({ likelihood: 5, severity: 5 });
  });

  it("reads Critical as the top severity and files unknown values under 1, like the map", () => {
    expect(heatPosition("Rare", "Critical")).toEqual({ likelihood: 1, severity: 5 });
    expect(heatPosition("", "")).toEqual({ likelihood: 1, severity: 1 });
  });

  it("matches a risk against the selected cell", () => {
    const risk = vendorRisk({ likelihood: "Likely", risk_severity: "Minor" });
    expect(matchesHeatCell(risk, { likelihood: 4, severity: 2 })).toBe(true);
    expect(matchesHeatCell(risk, { likelihood: 4, severity: 3 })).toBe(false);
  });
});

describe("vendorLevelRank", () => {
  it("ranks level words instead of sorting them alphabetically", () => {
    const levels = ["Low", "Very high risk", "Medium", "Very low", "High", "Critical"];
    const ranked = [...levels].sort((a, b) => vendorLevelRank(b)! - vendorLevelRank(a)!);
    expect(ranked.map(vendorLevelRank)).toEqual([5, 5, 4, 3, 2, 1]);
  });

  it("returns null for no level, so the table sorts it last", () => {
    expect(vendorLevelRank(null)).toBeNull();
    expect(vendorLevelRank("")).toBeNull();
  });
});

describe("VendorRiskInsights", () => {
  it("starts with every section closed and fetches no report", () => {
    renderInsights();

    for (const title of [
      "Heat map",
      "Blast radius",
      "Duplicate vendor risks",
      "Framework coverage",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${title}`) })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
    expect(mockGetVendorExposure).not.toHaveBeenCalled();
    expect(mockGetVendorDuplicates).not.toHaveBeenCalled();
    expect(mockGetVendorCoverage).not.toHaveBeenCalled();
  });

  it("runs a scan only once its section is opened", async () => {
    renderInsights();

    await open("Duplicate vendor risks");

    expect(await screen.findByText("Customer data leak")).toBeInTheDocument();
    expect(mockGetVendorDuplicates).toHaveBeenCalledTimes(1);
    expect(mockGetVendorCoverage).not.toHaveBeenCalled();
  });

  it("remembers which sections were left open", async () => {
    const { unmount } = renderWithProviders(
      <VendorRiskInsights
        risks={[]}
        selectedCell={null}
        onSelectCell={vi.fn()}
        onOpenRisk={vi.fn()}
      />,
    );
    await open("Framework coverage");
    unmount();

    renderInsights();

    expect(screen.getByRole("button", { name: /^Framework coverage/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: /^Heat map/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("starts closed when the remembered state is unreadable", () => {
    localStorage.setItem("vendor-risk-insights-open", "{not json");

    renderInsights();

    expect(screen.getByRole("button", { name: /^Heat map/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

describe("heat map section", () => {
  it("plots each vendor risk once, however many use cases it has rows for", async () => {
    const risks = [
      vendorRisk({ risk_id: 1, project_titles: "Lending" } as Partial<VendorRisk>),
      vendorRisk({ risk_id: 1, project_titles: "Onboarding" } as Partial<VendorRisk>),
      vendorRisk({ risk_id: 2 }),
    ];
    renderInsights({ risks });

    await open("Heat map");

    expect(screen.getByRole("button", { name: /likelihood.*: 2 risks$/ })).toBeInTheDocument();
  });

  it("hands the selected cell to the page", async () => {
    const risks = [vendorRisk({ risk_id: 1 })];
    const { onSelectCell } = renderInsights({ risks });
    await open("Heat map");

    await userEvent.click(screen.getByRole("button", { name: /likelihood.*: 1 risks$/ }));
    expect(onSelectCell).toHaveBeenLastCalledWith({ likelihood: 3, severity: 4 });
  });

  it("clears the selection when the selected cell is chosen again", async () => {
    const risks = [vendorRisk({ risk_id: 1 })];
    const { onSelectCell } = renderInsights({
      risks,
      selectedCell: { likelihood: 3, severity: 4 },
    });
    await open("Heat map");

    const cell = screen.getByRole("button", { name: /likelihood.*: 1 risks$/ });
    expect(cell).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(cell);
    expect(onSelectCell).toHaveBeenLastCalledWith(null);
  });
});

describe("blast radius section", () => {
  it("sums the reach across vendors and lists the widest first", async () => {
    renderInsights();
    await open("Blast radius");

    const tile = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    expect(await screen.findByText("Vendors with reach")).toBeInTheDocument();
    expect(tile("Vendors with reach")).toBe("1");
    expect(tile("Vendor risks with no children")).toBe("2");

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Acme Cloud")).toBeInTheDocument();
    expect(within(rows[0]).getByText("1 of 2")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Lending, Onboarding")).toBeInTheDocument();
  });

  it("links an administrator to the vendor's part of the map", async () => {
    renderInsights();
    await open("Blast radius");

    const links = await screen.findAllByText("View on map");
    // Zeta Labs has nothing on the map, so only Acme Cloud gets a link.
    expect(links).toHaveLength(1);
    await userEvent.click(links[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/risk-inheritance?vendor=10");
  });

  it("gives no map link to someone who cannot open the map", async () => {
    mockIsAdmin = false;
    renderInsights();
    await open("Blast radius");

    expect(await screen.findByText("Acme Cloud")).toBeInTheDocument();
    expect(screen.queryByText("View on map")).not.toBeInTheDocument();
  });

  it("explains how to give a vendor reach when nothing inherits yet", async () => {
    mockGetVendorExposure.mockResolvedValue(
      exposureReport({
        vendors: [
          {
            vendor_id: 11,
            vendor_name: "Zeta Labs",
            vendor_risks: 1,
            linked_vendor_risks: 0,
            inheriting_risks: 0,
            suggested: 0,
            use_cases: [],
          },
        ],
      }),
    );
    renderInsights();
    await open("Blast radius");

    expect(
      await screen.findByText(/No project risk inherits from a vendor risk yet/),
    ).toBeInTheDocument();
  });

  it("says so when there are no vendor risks", async () => {
    mockGetVendorExposure.mockResolvedValue({ risks: [], vendors: [] });
    renderInsights();
    await open("Blast radius");

    expect(await screen.findByText("No vendor risks yet.")).toBeInTheDocument();
  });

  it("shows the error instead of an empty report", async () => {
    mockGetVendorExposure.mockRejectedValue(new Error("Failed to fetch vendor exposure"));
    renderInsights();
    await open("Blast radius");

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch vendor exposure");
  });
});

describe("duplicate vendor risks section", () => {
  it("lists the pair with its vendor, similarity and shared words", async () => {
    renderInsights();
    await open("Duplicate vendor risks");

    expect(
      await screen.findByText(/12 vendor risks scanned, 30 pairs compared\./),
    ).toBeInTheDocument();
    expect(screen.getByText("Leak of customer data")).toBeInTheDocument();
    expect(screen.getByLabelText("62 percent similar")).toBeInTheDocument();
    expect(screen.getByText("customer, data, leak")).toBeInTheDocument();
    expect(screen.getByText(/#21 · Ada Lovelace/)).toBeInTheDocument();
  });

  it("opens either risk of the pair", async () => {
    const { onOpenRisk } = renderInsights();
    await open("Duplicate vendor risks");

    await userEvent.click(await screen.findByText("Leak of customer data"));
    expect(onOpenRisk).toHaveBeenCalledWith(22);
  });

  it("says so when nothing looks duplicated, and flags a capped scan", async () => {
    mockGetVendorDuplicates.mockResolvedValue(
      duplicateReport({ candidates: [], matched: 0, truncated: true }),
    );
    renderInsights();
    await open("Duplicate vendor risks");

    expect(await screen.findByText("No likely duplicates among vendor risks.")).toBeInTheDocument();
    expect(screen.getByText(/This scan hit its size limit/)).toBeInTheDocument();
  });
});

describe("framework coverage section", () => {
  it("splits unmapped risks into gaps and risks with no framework to map to", async () => {
    renderInsights();
    await open("Framework coverage");

    const tile = (label: string) => screen.getAllByText(label)[0].nextElementSibling?.textContent;
    expect(await screen.findByText("Active vendor risks")).toBeInTheDocument();
    expect(tile("Active vendor risks")).toBe("5");
    expect(tile("Mapped to a framework")).toBe("3");

    expect(screen.getByText("Unvetted subprocessor")).toBeInTheDocument();
    expect(screen.getByText("EU AI Act, ISO 42001")).toBeInTheDocument();
    expect(screen.getByText("Weak SLA")).toBeInTheDocument();
    expect(screen.getByText(/attach a framework to the use case first/)).toBeInTheDocument();
  });

  it("opens a risk from either list", async () => {
    const { onOpenRisk } = renderInsights();
    await open("Framework coverage");

    await userEvent.click(await screen.findByText("Weak SLA"));
    expect(onOpenRisk).toHaveBeenCalledWith(32);
  });

  it("says every risk is covered when nothing is left unmapped", async () => {
    mockGetVendorCoverage.mockResolvedValue(
      coverageReport({
        summary: { total_active_risks: 3, mapped: 3, gap: 0, no_framework: 0 },
        gaps: [],
        no_framework: [],
      }),
    );
    renderInsights();
    await open("Framework coverage");

    expect(
      await screen.findByText("Every active vendor risk is mapped to at least one framework."),
    ).toBeInTheDocument();
  });

  it("says when the lists were capped", async () => {
    mockGetVendorCoverage.mockResolvedValue(coverageReport({ truncated: true }));
    renderInsights();
    await open("Framework coverage");

    expect(
      await screen.findByText(/More risks matched than a single report lists/),
    ).toBeInTheDocument();
  });
});
