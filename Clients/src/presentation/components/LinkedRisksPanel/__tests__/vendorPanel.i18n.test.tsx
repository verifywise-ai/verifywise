/**
 * The vendor risk's Linked risks tab in German, French and Spanish, through the
 * real DOM translator and dictionary, the same way i18n.test.tsx checks the
 * project risk panel.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import {
  LANGS,
  expectNoUntranslatedText,
  plain,
  resetAudit,
  setLanguage,
  tr,
} from "../../../../test/i18nHelpers";
import type { RiskLink } from "../../../../domain/interfaces/i.riskLink";

const mockUseVendorRiskLinks = vi.fn();
const mockGetAllProjectRisks = vi.fn();

vi.mock("../../../../application/hooks/useRiskLinks", () => ({
  useVendorRiskLinks: (vendorRiskId: number, status?: string) =>
    mockUseVendorRiskLinks(vendorRiskId, status),
  useUpdateVendorRiskLinkStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateVendorRiskLink: () => ({ mutate: vi.fn(), isPending: false }),
  useVendorRiskSharedProjects: () => ({ data: [{ id: 12, projects: ["Lending"] }] }),
  useSuggestVendorRiskHierarchy: () => ({ mutate: vi.fn(), isPending: false }),
  useRecomputeVendorRiskLinks: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => true,
}));

vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisks: (...args: unknown[]) => mockGetAllProjectRisks(...args),
}));

vi.mock("../../../../application/repository/vendorRisk.repository", () => ({
  getAllVendorRisks: async () => ({
    data: [{ risk_id: 20, risk_description: "Other vendor risk", vendor_name: "Globex" }],
  }),
}));

import VendorRiskLinksPanel from "../VendorRiskLinksPanel";

/** Names the fixtures put on screen; the user's own data is never translated. */
const FIXTURES = new Set([
  "Loan model bias",
  "Shared risk",
  "Lending",
  "Customer records exposed",
  "Acme Cloud",
  "Other vendor risk",
  "Globex",
]);

const child = (overrides: Partial<RiskLink> = {}): RiskLink => ({
  id: 1,
  status: "suggested",
  source: "agent",
  relationType: "inherits_from",
  score: 0,
  reasons: [],
  direction: "incoming",
  decidedAt: null,
  lastComputedAt: null,
  dismissReason: null,
  dismissNote: null,
  parentLevelChangedAt: null,
  relatedRisk: {
    id: 9,
    entityType: "risk",
    name: "Loan model bias",
    riskLevel: "High risk",
    ownerId: 2,
  },
  ...overrides,
});

const result = (links: RiskLink[]) => ({
  data: links,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllProjectRisks.mockResolvedValue({ data: [{ id: 12, risk_name: "Shared risk" }] });
});

afterAll(() => setLanguage("en"));

describe.each(LANGS)("vendor risk linked risks tab in %s", (lang) => {
  beforeEach(async () => {
    await setLanguage(lang, true);
    resetAudit();
  });

  it("translates the child list, its hint and the actions", async () => {
    mockUseVendorRiskLinks.mockReturnValue(result([child()]));
    renderWithProviders(<VendorRiskLinksPanel vendorRiskId={7} />);

    for (const key of [
      "Child risks",
      "When the level of this risk changes, each child is flagged for review.",
      "Link a project risk",
      "Suggest children",
      "Show dismissed",
      "High risk",
      "Confirm",
      "Dismiss",
    ]) {
      expect((await screen.findAllByText(tr(lang, key))).length).toBeGreaterThan(0);
    }

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the empty state", async () => {
    mockUseVendorRiskLinks.mockReturnValue(result([]));
    renderWithProviders(<VendorRiskLinksPanel vendorRiskId={7} />);

    for (const key of [
      "No linked risks yet.",
      "Link a project risk that this vendor risk applies to, or relate another vendor risk. Suggestions appear here too.",
      "Scan for related vendor risks",
      "Relate a vendor risk",
    ]) {
      expect((await screen.findAllByText(tr(lang, key))).length).toBeGreaterThan(0);
    }

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the link form, its hint and the shared-project chip", async () => {
    mockUseVendorRiskLinks.mockReturnValue(result([]));
    renderWithProviders(<VendorRiskLinksPanel vendorRiskId={7} />);

    await userEvent.click(
      await screen.findByRole("button", { name: tr(lang, "Link a project risk") }),
    );
    expect(
      await screen.findByText(
        tr(
          lang,
          "A project risk can have only one parent, and a risk with child risks of its own cannot become a child.",
        ),
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByPlaceholderText(tr(lang, "Search risks")));
    const listbox = await screen.findByRole("listbox");
    expect(
      await within(listbox).findByText(tr(lang, "Same project: {name}", { name: "Lending" })),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the related group, its caption and the signal labels", async () => {
    mockUseVendorRiskLinks.mockReturnValue(
      result([
        child({
          id: 50,
          source: "derived",
          relationType: "related_to",
          score: 6,
          reasons: [
            { signal: "similar_wording", weight: 3, detail: "customer, exposed, records" },
            { signal: "same_vendor", weight: 1 },
            { signal: "shared_framework", weight: 1, detail: "EU AI Act" },
            { signal: "shared_use_case", weight: 1, detail: "Lending" },
          ],
          relatedRisk: {
            id: 12,
            entityType: "vendor_risk",
            name: "Customer records exposed",
            riskLevel: null,
            ownerId: null,
            vendorName: "Acme Cloud",
          },
        }),
      ]),
    );
    renderWithProviders(<VendorRiskLinksPanel vendorRiskId={7} />);

    for (const key of [
      "Related vendor risks",
      "Vendor risks that describe the same exposure, at this vendor or another one.",
    ]) {
      expect(await screen.findByText(tr(lang, key))).toBeInTheDocument();
    }

    // The tooltip title is also the button's accessible name (see i18n.test.tsx).
    // Wording, framework and use case details are the user's own text.
    const details = plain(
      [
        tr(lang, "Score {score}", { score: 6 }),
        `${tr(lang, "Similar wording")}: customer, exposed, records`,
        tr(lang, "Same vendor"),
        `${tr(lang, "Shared framework")}: EU AI Act`,
        `${tr(lang, "Shared use case")}: Lending`,
      ].join(" · "),
    );
    expect(await screen.findByLabelText(details)).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the relate form and its hint", async () => {
    mockUseVendorRiskLinks.mockReturnValue(result([]));
    renderWithProviders(<VendorRiskLinksPanel vendorRiskId={7} />);

    await userEvent.click(
      await screen.findByRole("button", { name: tr(lang, "Relate a vendor risk") }),
    );
    expect(
      await screen.findByText(
        tr(
          lang,
          "Related vendor risks describe the same exposure, at this vendor or another one. Neither inherits from the other.",
        ),
      ),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(tr(lang, "Search vendor risks"))).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });
});
