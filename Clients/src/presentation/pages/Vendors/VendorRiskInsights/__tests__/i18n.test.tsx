/**
 * The vendor risk insights in German, French and Spanish, through the real DOM
 * translator and dictionary, the same way the risk inheritance reports are
 * checked. Each case ends with the translator's gap audit.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import {
  LANGS,
  expectNoUntranslatedText,
  plain,
  resetAudit,
  setLanguage,
  tr,
} from "../../../../../test/i18nHelpers";
import { coverageReport, duplicateReport, exposureReport, vendorRisk } from "./fixtures";

const mockGetVendorExposure = vi.fn();
const mockGetVendorDuplicates = vi.fn();
const mockGetVendorCoverage = vi.fn();

vi.mock("../../../../../application/repository/riskLink.repository", () => ({
  getVendorExposure: (...args: unknown[]) => mockGetVendorExposure(...args),
  getVendorDuplicateCandidates: (...args: unknown[]) => mockGetVendorDuplicates(...args),
  getVendorFrameworkCoverage: (...args: unknown[]) => mockGetVendorCoverage(...args),
}));

vi.mock("../../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => true,
}));

vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [{ id: 7, name: "Ada", surname: "Lovelace", email: "ada@x.io", roleId: 1 }],
    loading: false,
    error: null,
    refreshUsers: vi.fn(),
  }),
}));

import VendorRiskInsights from "..";

/** Names the fixtures put on screen; the user's own data is never translated. */
const FIXTURES = new Set([
  "Ada Lovelace",
  "Acme Cloud",
  "Zeta Labs",
  "Lending, Onboarding",
  "Customer data leak",
  "Leak of customer data",
  "customer, data, leak",
  "Unvetted subprocessor",
  "Very high risk",
  "Weak SLA",
  "Low",
  "High",
  "EU AI Act, ISO 42001",
]);

/** Matches an element whose text includes `text`, read literally. */
const containing = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const renderOpen = (sections: string[]) => {
  localStorage.setItem("vendor-risk-insights-open", JSON.stringify(sections));
  renderWithProviders(
    <VendorRiskInsights
      risks={[vendorRisk({ risk_id: 1 })]}
      selectedCell={null}
      onSelectCell={vi.fn()}
      onOpenRisk={vi.fn()}
    />,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockGetVendorExposure.mockResolvedValue(exposureReport());
  mockGetVendorDuplicates.mockResolvedValue(duplicateReport());
  mockGetVendorCoverage.mockResolvedValue(coverageReport());
});

afterAll(() => setLanguage("en"));

describe.each(LANGS)("vendor risk insights in %s", (lang) => {
  beforeEach(async () => {
    await setLanguage(lang, true);
    resetAudit();
  });

  it("translates the section titles and descriptions", async () => {
    renderOpen([]);

    for (const key of [
      "Heat map",
      "Vendor risks by likelihood and severity. Select a cell to filter the table.",
      "Blast radius",
      "How many project risks and use cases inherit from the risks of each vendor.",
      "Duplicate vendor risks",
      "Risks of the same vendor that look like one risk entered twice.",
      "Framework coverage",
      "Which vendor risks are not mapped to a framework yet.",
    ]) {
      expect(await screen.findByText(tr(lang, key))).toBeInTheDocument();
    }

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the heat map caption and the cell's label", async () => {
    renderOpen(["heatMap"]);

    expect(
      await screen.findByText(
        tr(
          lang,
          "Each cell counts vendor risks by likelihood and severity. Select a cell to filter the table below, and select it again to show every risk.",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: tr(lang, "{likelihood} likelihood, {severity} severity: {count} risks", {
          likelihood: tr(lang, "Medium"),
          severity: tr(lang, "High"),
          count: 1,
        }),
      }),
    ).toBeInTheDocument();
  });

  it("translates the blast radius tiles, table and link", async () => {
    renderOpen(["blastRadius"]);

    for (const key of [
      "Vendors with reach",
      "Vendor risks with no children",
      "Vendor risks with children",
      "View on map",
    ]) {
      expect((await screen.findAllByText(tr(lang, key))).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(tr(lang, "Inheriting project risks")).length).toBe(2);
    expect(screen.getAllByText(tr(lang, "Affected use cases")).length).toBe(2);
    expect(
      screen.getByText(tr(lang, "{linked} of {total}", { linked: 1, total: 2 })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(tr(lang, "{linked} of {total}", { linked: 0, total: 1 })),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the duplicate scan caption and table", async () => {
    renderOpen(["duplicates"]);

    // One caption, two sentences: the filled count and the fixed explanation.
    const caption = await screen.findByText(
      containing(
        tr(lang, "{scanned} vendor risks scanned, {compared} pairs compared.", {
          scanned: "12",
          compared: "30",
        }),
      ),
    );
    expect(caption).toHaveTextContent(
      tr(
        lang,
        "Only risks of the same vendor are compared: the same risk at two vendors is a pattern, not a duplicate.",
      ),
    );
    expect(screen.getByText(tr(lang, "Possible duplicate of"))).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the coverage tiles, captions and empty-list text", async () => {
    renderOpen(["coverage"]);

    for (const key of [
      "Active vendor risks",
      "Mapped to a framework",
      "Frameworks in its use cases",
      "The vendor serves a use case that has a framework attached, but these risks are not mapped to any framework. Map them from the risk itself.",
      "None of the use cases these vendors serve has a framework attached, so there is nothing to map to. Not a finding: attach a framework to the use case first.",
    ]) {
      expect(await screen.findByText(tr(lang, key))).toBeInTheDocument();
    }
    // The list headings add the row count to the translated title.
    plain(`${tr(lang, "Coverage gaps")} (1)`);
    plain(`${tr(lang, "No framework yet")} (1)`);

    expectNoUntranslatedText(lang, FIXTURES);
  });
});
