/**
 * The Linked risks panel in German, French and Spanish.
 *
 * Rendered through the real DOM translator and the real dictionary (see
 * test/i18nHelpers). The panel, the link form and the dismiss form are driven
 * through the same paths a user takes, so the notices, errors and accessible
 * names that only appear after an interaction are checked too.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { screen } from "@testing-library/react";
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

const mockUseRiskLinks = vi.fn();
const mockUpdateStatus = vi.fn();
const mockRecompute = vi.fn();
const mockSuggest = vi.fn();
const mockCreate = vi.fn();
const mockUseSharedProjects = vi.fn();
const mockGetAllProjectRisks = vi.fn();
const mockGetAllVendorRisks = vi.fn();
let mockIsAdmin = true;

vi.mock("../../../../application/hooks/useRiskLinks", () => ({
  useRiskLinks: (riskId: number, status?: string) => mockUseRiskLinks(riskId, status),
  useUpdateRiskLinkStatus: () => ({ mutate: mockUpdateStatus, isPending: false }),
  useRecomputeRiskLinks: () => ({ mutate: mockRecompute, isPending: false }),
  useSuggestRiskHierarchy: () => ({ mutate: mockSuggest, isPending: false }),
  useCreateRiskLink: () => ({ mutate: mockCreate, isPending: false }),
  useAcknowledgeParentLevelChange: () => ({ mutate: vi.fn(), isPending: false }),
  useSharedProjects: () => mockUseSharedProjects(),
}));

vi.mock("../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => mockIsAdmin,
}));

vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisks: (...args: unknown[]) => mockGetAllProjectRisks(...args),
}));

vi.mock("../../../../application/repository/vendorRisk.repository", () => ({
  getAllVendorRisks: (...args: unknown[]) => mockGetAllVendorRisks(...args),
}));

vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));

import LinkedRisksPanel from "..";

/** Names and free text the fixtures put on screen; the user's own data is never translated. */
const FIXTURES = new Set([
  "Drift in production",
  "Vendor outage",
  "Model drift",
  "Quasar ledger drift",
  "Subject risk",
  "Fraud Detection",
  "AC-17 remote access",
]);

const link = (overrides: Partial<RiskLink> = {}): RiskLink => ({
  id: 1,
  status: "suggested",
  source: "derived",
  relationType: "related_to",
  score: 4.2,
  reasons: [],
  direction: "undirected",
  decidedAt: null,
  lastComputedAt: null,
  dismissReason: null,
  dismissNote: null,
  parentLevelChangedAt: null,
  relatedRisk: {
    id: 9,
    entityType: "risk",
    name: "Model drift",
    riskLevel: "High risk",
    ownerId: 2,
  },
  ...overrides,
});

const result = (links: RiskLink[], extra: Record<string, unknown> = {}) => ({
  data: links,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAdmin = true;
  mockUseSharedProjects.mockReturnValue({ data: [] });
  mockGetAllProjectRisks.mockResolvedValue({
    data: [
      { id: 42, risk_name: "Subject risk" },
      { id: 10, risk_name: "Quasar ledger drift" },
    ],
  });
  mockGetAllVendorRisks.mockResolvedValue({
    data: [{ id: 2, risk_description: "Vendor outage" }],
  });
});

afterAll(() => setLanguage("en"));

describe.each(LANGS)("linked risks panel in %s", (lang) => {
  beforeEach(async () => {
    await setLanguage(lang, true);
    resetAudit();
  });

  const expectClean = () => {
    // The default fixture is a derived link, so its details button carries this label.
    tr(lang, "Score {score}", { score: 4.2 });
    expectNoUntranslatedText(lang, FIXTURES);
  };

  it("translates the groups, chips, actions and the reason tooltip", async () => {
    mockUseRiskLinks.mockReturnValue(
      result([
        link({
          id: 1,
          status: "confirmed",
          source: "user",
          relationType: "inherits_from",
          direction: "outgoing",
          parentLevelChangedAt: "2026-09-01T00:00:00Z",
          relatedRisk: {
            id: 3,
            entityType: "model_risk",
            name: "Drift in production",
            riskLevel: "High risk",
            ownerId: null,
          },
        }),
        link({
          id: 2,
          status: "confirmed",
          source: "user",
          relationType: "inherits_from",
          direction: "incoming",
          relatedRisk: {
            id: 4,
            entityType: "vendor_risk",
            name: "Vendor outage",
            riskLevel: "Low risk",
            ownerId: null,
          },
        }),
        link({
          id: 3,
          reasons: [
            { signal: "shared_category", weight: 3, detail: "Operational risk, Legal risk" },
            {
              signal: "shared_framework_element",
              weight: 2,
              detail: "2 EU AI Act controls, 1 ISO 42001 subclause",
            },
            { signal: "same_lifecycle_phase", weight: 2, detail: "Problem definition & planning" },
            { signal: "shared_control", weight: 2, detail: "AC-17 remote access" },
            { signal: "shared_project", weight: 1 },
          ],
          relatedRisk: {
            id: 9,
            entityType: "risk",
            name: null,
            riskLevel: "No risk",
            ownerId: null,
          },
        }),
      ]),
    );
    renderWithProviders(<LinkedRisksPanel riskId={42} />);

    for (const key of [
      "Parent risk",
      "Child risks",
      "Relates to",
      "Link a risk",
      "Suggest hierarchy",
      "Show dismissed",
      "Parent level changed",
      "Mark reviewed",
      "Model risk",
      "Vendor risk",
      "High risk",
      "Low risk",
      "No risk",
      "Confirm",
    ]) {
      expect((await screen.findAllByText(tr(lang, key))).length).toBeGreaterThan(0);
    }
    expect((await screen.findAllByText(tr(lang, "Dismiss"))).length).toBe(3);
    // A link whose risk has no name falls back to a translated "Risk {id}".
    expect(await screen.findByText(tr(lang, "Risk {id}", { id: 9 }))).toBeInTheDocument();

    // The tooltip title is also the button's accessible name: MUI's Tooltip sets
    // aria-label from a string title and overrides the "Why {name} is linked" label.
    const details = plain(
      [
        tr(lang, "Score {score}", { score: 4.2 }),
        `${tr(lang, "Shared category")}: ${tr(lang, "Operational risk")}, ${tr(lang, "Legal risk")}`,
        `${tr(lang, "Shared framework element")}: 2 ${tr(lang, "EU AI Act controls")}, 1 ${tr(lang, "ISO 42001 subclause")}`,
        `${tr(lang, "Same lifecycle phase")}: ${tr(lang, "Problem definition & planning")}`,
        `${tr(lang, "Shared control")}: AC-17 remote access`,
        tr(lang, "Shared project"),
      ].join(" · "),
    );
    const why = await screen.findByLabelText(details);
    await userEvent.hover(why);
    expect(await screen.findByText(details)).toBeInTheDocument();

    expectClean();
  });

  it("translates the dismissed view and its reason chip", async () => {
    mockUseRiskLinks.mockImplementation((_id: number, status?: string) =>
      result(
        status === "dismissed"
          ? [
              link({
                status: "dismissed",
                dismissReason: "not_related",
                relatedRisk: {
                  id: 9,
                  entityType: "risk",
                  name: "Model drift",
                  riskLevel: null,
                  ownerId: null,
                },
              }),
            ]
          : [],
      ),
    );
    renderWithProviders(<LinkedRisksPanel riskId={42} />);

    await userEvent.click(await screen.findByRole("button", { name: tr(lang, "Show dismissed") }));

    expect(await screen.findByText(tr(lang, "Hide dismissed"))).toBeInTheDocument();
    expect(await screen.findByText(tr(lang, "These aren't actually related"))).toBeInTheDocument();
    expect(await screen.findByText(tr(lang, "Restore"))).toBeInTheDocument();
    expect(await screen.findByText(tr(lang, "Confirm"))).toBeInTheDocument();

    expectClean();
  });

  it("translates the empty state for an admin, a member and a failed load", async () => {
    mockUseRiskLinks.mockReturnValue(result([]));
    const admin = renderWithProviders(<LinkedRisksPanel riskId={42} />);
    expect(await screen.findByText(tr(lang, "No linked risks yet."))).toBeInTheDocument();
    expect(await screen.findByText(tr(lang, "Scan for related risks"))).toBeInTheDocument();
    admin.unmount();

    mockIsAdmin = false;
    const member = renderWithProviders(<LinkedRisksPanel riskId={42} />);
    expect(
      await screen.findByText(
        tr(lang, "Links appear as risks are saved, or after an administrator runs a scan."),
      ),
    ).toBeInTheDocument();
    member.unmount();

    mockUseRiskLinks.mockReturnValue(result([], { isError: true }));
    renderWithProviders(<LinkedRisksPanel riskId={42} />);
    expect(await screen.findByText(tr(lang, "Failed to load linked risks."))).toBeInTheDocument();
    expect(await screen.findByText(tr(lang, "Retry"))).toBeInTheDocument();

    expectClean();
  });

  it("translates the scan notices and their failures", async () => {
    mockUseRiskLinks.mockReturnValue(result([]));
    mockRecompute.mockImplementationOnce(
      (_input: unknown, options: { onSuccess: (r: unknown) => void }) =>
        options.onSuccess({ enqueued: 5 }),
    );
    const first = renderWithProviders(<LinkedRisksPanel riskId={42} />);
    await userEvent.click(
      await screen.findByRole("button", { name: tr(lang, "Scan for related risks") }),
    );
    expect(
      await screen.findByText(
        tr(lang, "Scanning {count} risks. Links will appear as the scan completes.", { count: 5 }),
      ),
    ).toBeInTheDocument();
    first.unmount();

    mockRecompute.mockImplementationOnce(
      (_input: unknown, options: { onError: (e: unknown) => void }) => options.onError({}),
    );
    renderWithProviders(<LinkedRisksPanel riskId={42} />);
    await userEvent.click(
      await screen.findByRole("button", { name: tr(lang, "Scan for related risks") }),
    );
    expect(await screen.findByText(tr(lang, "Failed to start the scan"))).toBeInTheDocument();

    expectClean();
  });

  it("translates the hierarchy notices", async () => {
    mockUseRiskLinks.mockReturnValue(result([link()]));
    mockSuggest.mockImplementationOnce(
      (_input: unknown, options: { onSuccess: (r: unknown) => void }) =>
        options.onSuccess({ enqueued: 3, skipped: 2 }),
    );
    const first = renderWithProviders(<LinkedRisksPanel riskId={42} />);
    await userEvent.click(
      await screen.findByRole("button", { name: tr(lang, "Suggest hierarchy") }),
    );
    expect(
      await screen.findByText(
        plain(
          `${tr(lang, "Grouping {count} clusters of related risks. Suggestions appear here as they finish.", { count: 3 })} ${tr(lang, "{count} clusters were too large to group in one pass.", { count: 2 })}`,
        ),
      ),
    ).toBeInTheDocument();
    first.unmount();

    mockSuggest.mockImplementationOnce(
      (_input: unknown, options: { onSuccess: (r: unknown) => void }) =>
        options.onSuccess({ enqueued: 0, skipped: 0 }),
    );
    const second = renderWithProviders(<LinkedRisksPanel riskId={42} />);
    await userEvent.click(
      await screen.findByRole("button", { name: tr(lang, "Suggest hierarchy") }),
    );
    expect(
      await screen.findByText(
        tr(lang, "No clusters of related risks to group yet. Run a scan for related risks first."),
      ),
    ).toBeInTheDocument();
    second.unmount();

    mockSuggest.mockImplementationOnce(
      (_input: unknown, options: { onError: (e: unknown) => void }) =>
        options.onError({ status: 404 }),
    );
    renderWithProviders(<LinkedRisksPanel riskId={42} />);
    await userEvent.click(
      await screen.findByRole("button", { name: tr(lang, "Suggest hierarchy") }),
    );
    expect(
      await screen.findByText(tr(lang, "Failed to start the hierarchy suggestions")),
    ).toBeInTheDocument();

    expectClean();
  });

  it("translates the dismiss reason form", async () => {
    mockUseRiskLinks.mockReturnValue(result([link()]));
    renderWithProviders(<LinkedRisksPanel riskId={42} />);

    await userEvent.click(await screen.findByRole("button", { name: tr(lang, "Dismiss") }));

    expect(
      await screen.findByRole("radiogroup", {
        name: tr(lang, "Why are you dismissing {name}?", { name: "Model drift" }),
      }),
    ).toBeInTheDocument();
    for (const key of [
      "These aren't actually related",
      "Related, but not worth a link",
      "Another link already covers this",
    ]) {
      expect(await screen.findByText(tr(lang, key))).toBeInTheDocument();
    }
    await userEvent.click(await screen.findByRole("radio", { name: tr(lang, "Other") }));
    expect(await screen.findByText(tr(lang, "What happened?"))).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: tr(lang, "Cancel") })).toBeInTheDocument();

    expectClean();
  });

  it("translates the link form: relations, parent sources, restriction and errors", async () => {
    mockUseRiskLinks.mockReturnValue(
      result([
        link({
          id: 1,
          status: "confirmed",
          source: "user",
          relationType: "inherits_from",
          direction: "outgoing",
          relatedRisk: {
            id: 3,
            entityType: "risk",
            name: "Drift in production",
            riskLevel: null,
            ownerId: null,
          },
        }),
      ]),
    );
    renderWithProviders(<LinkedRisksPanel riskId={42} />);

    await userEvent.click(await screen.findByRole("button", { name: tr(lang, "Link a risk") }));

    for (const key of ["Relates to", "Inherits from", "Is inherited by"]) {
      expect(await screen.findByRole("radio", { name: tr(lang, key) })).toBeInTheDocument();
    }
    // Already has a parent: the form says why it can only relate.
    expect(
      await screen.findByText(
        tr(lang, "This risk already has a parent, so it can only relate to other risks."),
      ),
    ).toBeInTheDocument();
    expect(await screen.findByPlaceholderText(tr(lang, "Search risks"))).toBeInTheDocument();

    await userEvent.click(await screen.findByPlaceholderText(tr(lang, "Search risks")));
    mockCreate.mockImplementationOnce(
      (_input: unknown, options: { onError: (e: unknown) => void }) =>
        options.onError({ status: 404 }),
    );
    await userEvent.click(await screen.findByText("Quasar ledger drift"));
    await userEvent.click(await screen.findByRole("button", { name: tr(lang, "Link") }));
    expect(
      await screen.findByText(tr(lang, "One of these risks no longer exists")),
    ).toBeInTheDocument();

    expectClean();
  });

  it("translates the parent source choices and the same-project badge", async () => {
    mockUseRiskLinks.mockReturnValue(result([]));
    mockUseSharedProjects.mockReturnValue({
      data: [{ entityType: "vendor_risk", id: 2, projects: ["Fraud Detection", "KYC"] }],
    });
    renderWithProviders(<LinkedRisksPanel riskId={42} />);

    await userEvent.click(await screen.findByRole("button", { name: tr(lang, "Link a risk") }));
    await userEvent.click(await screen.findByRole("radio", { name: tr(lang, "Inherits from") }));
    for (const key of ["Project risk", "Model risk", "Vendor risk"]) {
      expect(await screen.findByRole("radio", { name: tr(lang, key) })).toBeInTheDocument();
    }
    await userEvent.click(await screen.findByRole("radio", { name: tr(lang, "Vendor risk") }));
    await userEvent.click(await screen.findByPlaceholderText(tr(lang, "Search risks")));

    expect(
      await screen.findByText(
        tr(lang, "Same project: {name} +{count}", { name: "Fraud Detection", count: 1 }),
      ),
    ).toBeInTheDocument();

    // The other restriction: a parent cannot become a child.
    expectClean();
  });
});

describe("static strings on surfaces too heavy to render here", () => {
  // Evidence Hub's risk picker and the risk table's stale-evidence chip are plain
  // labels; the DOM translator only needs them in the dictionary.
  it.each(LANGS)("has the Evidence Hub and risk table labels in %s", (lang) => {
    for (const key of ["Mapped risks", "Select risks", "Evidence stale"]) {
      expect(tr(lang, key)).not.toBe(key);
    }
  });
});

describe("the word for Dismiss", () => {
  // "Dismiss" here means turn a suggestion down, not close a window. It was once
  // Schließen / Fermer, which read as "Close" on the button and next to "Dismissed".
  it.each(LANGS)("is not the word for Close in %s", (lang) => {
    expect(tr(lang, "Dismiss")).not.toBe(tr(lang, "Close"));
  });

  it.each([
    ["de", "Verwerfen", "Verworfen"],
    ["fr", "Rejeter", "Rejeté"],
    ["es", "Descartar", "Descartado"],
  ] as const)("is the same verb as Dismissed in %s", (lang, verb, status) => {
    expect(tr(lang, "Dismiss")).toBe(verb);
    expect(tr(lang, "Dismissed")).toBe(status);
  });
});

describe("a panel rendered before its dictionary has loaded", () => {
  // Dictionaries load lazily, so the app's first paint can come before them.
  // The DOM translator catches plain text afterwards, but not text composed
  // with t() — that only changes if the component re-renders.
  it("re-renders text composed with t() once the dictionary arrives", async () => {
    await setLanguage("en");
    mockUseRiskLinks.mockReturnValue(
      result([
        link({
          relatedRisk: { id: 9, entityType: "risk", name: null, riskLevel: null, ownerId: null },
        }),
      ]),
    );

    const loaded = setLanguage("de");
    renderWithProviders(<LinkedRisksPanel riskId={42} />);
    await loaded;

    expect(await screen.findByText(tr("de", "Risk {id}", { id: 9 }))).toBeInTheDocument();
  });
});
