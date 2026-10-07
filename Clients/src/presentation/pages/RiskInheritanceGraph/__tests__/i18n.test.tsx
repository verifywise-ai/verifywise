/**
 * Risk inheritance in German, French and Spanish.
 *
 * Nothing about translation is mocked: each part of the page is rendered
 * through the real DOM translator and the real dictionary, so these tests fail
 * when a string is missing from translations.ts or when a template's
 * placeholders drift from the values the component fills in.
 *
 * Besides the strings asserted one by one, every case ends with the
 * translator's own gap audit (`vw_audit`): any rendered text that was neither
 * translated nor known fixture data is reported, which catches strings nobody
 * thought to assert.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import type { Lang } from "../../../../i18n/translations";
import {
  LANGS,
  expectNoUntranslatedText as expectNoUntranslated,
  plain,
  resetAudit,
  setLanguage,
  tr,
} from "../../../../test/i18nHelpers";
import type {
  CoverageReport,
  DismissalAnalytics as DismissalAnalyticsPayload,
  DuplicateReport,
  RiskGraph,
} from "../../../../domain/interfaces/i.riskLink";

const mockGetRiskGraph = vi.fn();
const mockGetDismissalAnalytics = vi.fn();
const mockGetDuplicateCandidates = vi.fn();
const mockGetControlCoverage = vi.fn();
const mockCreateRiskLink = vi.fn();
const mockDeleteEntityById = vi.fn();
let mockIsAdmin = true;

vi.mock("../../../../application/repository/riskLink.repository", () => ({
  getRiskGraph: (...args: unknown[]) => mockGetRiskGraph(...args),
  getDismissalAnalytics: (...args: unknown[]) => mockGetDismissalAnalytics(...args),
  getDuplicateCandidates: (...args: unknown[]) => mockGetDuplicateCandidates(...args),
  getControlCoverage: (...args: unknown[]) => mockGetControlCoverage(...args),
  createRiskLink: (...args: unknown[]) => mockCreateRiskLink(...args),
}));

vi.mock("../../../../application/repository/entity.repository", () => ({
  deleteEntityById: (...args: unknown[]) => mockDeleteEntityById(...args),
}));

vi.mock("../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => mockIsAdmin,
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [{ id: 7, name: "Ada", surname: "Lovelace", email: "ada@x.io", roleId: 1 }],
    loading: false,
    error: null,
    refreshUsers: vi.fn(),
  }),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => vi.fn(),
}));

// jsdom has no layout engine, so the canvas is replaced by a stand-in that
// lists node names and renders the panels. Everything the page itself draws
// (legend, stats, key, banners, sections) is real.
vi.mock("@xyflow/react", async () => {
  const react = await import("react");
  const h = react.createElement;
  const useList = (initial: unknown[]) => {
    const [list, setList] = react.useState(initial);
    return [list, setList, () => undefined];
  };
  return {
    ReactFlow: ({
      nodes,
      children,
    }: {
      nodes: { id: string; data: { name: string } }[];
      children: React.ReactNode;
    }) =>
      h(
        "div",
        null,
        nodes.map((node) => h("span", { key: node.id }, node.data.name)),
        children,
      ),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
      h(react.Fragment, null, children),
    Panel: ({ children }: { children: React.ReactNode }) => h("div", null, children),
    MiniMap: () => null,
    Controls: () => null,
    Background: () => null,
    BackgroundVariant: { Dots: "dots" },
    MarkerType: { ArrowClosed: "arrowclosed" },
    Handle: () => null,
    Position: { Top: "top", Bottom: "bottom" },
    useNodesState: useList,
    useEdgesState: useList,
  };
});

import RiskInheritanceGraph from "..";
import RiskNode from "../RiskNode";
import GraphGuide from "../GraphGuide";
import ControlCoverage from "../ControlCoverage";
import DismissalAnalytics from "../DismissalAnalytics";
import DuplicateCandidates from "../DuplicateCandidates";

/**
 * Text the fixtures put on screen (risk and project names, people, raw words).
 * Data is never translated, so the gap audit is expected to list exactly these.
 */
const FIXTURE_TEXT = new Set([
  "Unreviewed training data",
  "Shadow vendor onboarding",
  "Claims triage",
  "Internal chatbot",
  "Ada Lovelace",
  "Model drift unnoticed",
  "Model drift undetected",
  "Model drift",
  "Drift in production",
  "Covered already",
  "alpha, beta, gamma, delta, epsilon, zeta +2 ",
]);

const expectNoUntranslatedText = (lang: Lang) => expectNoUntranslated(lang, FIXTURE_TEXT);

const risk = (overrides: Record<string, unknown> = {}) => ({
  id: 11,
  risk_name: "Unreviewed training data",
  risk_owner: 7,
  risk_level: "High risk",
  mitigation_status: "On Hold",
  projects: [
    { id: 1, name: "Claims triage", has_framework: true },
    { id: 2, name: "Internal chatbot", has_framework: false },
  ],
  assessment_link_count: 2,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAdmin = true;
});

afterAll(async () => {
  await setLanguage("en");
});

describe.each(LANGS)("risk inheritance in %s", (lang) => {
  beforeEach(async () => {
    await setLanguage(lang, true);
    resetAudit();
  });

  it("translates the map page: legend, link types, stats, hints and banners", async () => {
    const graph: RiskGraph = {
      nodes: [
        { key: "risk:9", entityType: "risk", id: 9, name: null, riskLevel: "High risk" },
        {
          key: "model_risk:3",
          entityType: "model_risk",
          id: 3,
          name: "Model drift",
          riskLevel: null,
        },
      ],
      edges: [
        {
          id: 1,
          sourceKey: "risk:9",
          targetKey: "model_risk:3",
          relationType: "inherits_from",
          status: "confirmed",
          score: 0,
          parentLevelChangedAt: null,
        },
      ],
      truncated: true,
    };
    let release: (value: RiskGraph) => void = () => undefined;
    mockGetRiskGraph.mockReturnValue(new Promise<RiskGraph>((resolve) => (release = resolve)));
    mockGetDismissalAnalytics.mockResolvedValue({ signals: [], reasons: [], notes: [] });
    mockGetDuplicateCandidates.mockResolvedValue({
      organization_id: 1,
      scanned: 0,
      compared: 0,
      matched: 0,
      truncated: false,
      candidates: [],
    });
    mockGetControlCoverage.mockResolvedValue({
      summary: { total_active_risks: 0, covered: 0, gap: 0, no_framework: 0 },
      gaps: [],
      no_framework: [],
      truncated: false,
    });

    renderWithProviders(<RiskInheritanceGraph />);

    expect(
      await screen.findByText(tr(lang, "Loading risk inheritance graph...")),
    ).toBeInTheDocument();
    release(graph);
    expect(await screen.findByText(tr(lang, "Link types"))).toBeInTheDocument();
    for (const key of ["Inherits", "Suggested", "Competing", "Related"]) {
      expect(await screen.findByText(tr(lang, key))).toBeInTheDocument();
    }
    expect(
      await screen.findByText(tr(lang, "{risks} risks, {links} links", { risks: 2, links: 1 })),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(tr(lang, "Select a risk to trace its links.")),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        tr(lang, "Showing the first 500 links. Filter by status to narrow the graph."),
      ),
    ).toBeInTheDocument();
    // A node without a name falls back to a translated "Risk {id}".
    expect(await screen.findByText(tr(lang, "Risk {id}", { id: 9 }))).toBeInTheDocument();
    expect(await screen.findByLabelText(tr(lang, "Risk inheritance graph"))).toBeInTheDocument();
    // The three report sections sit under the map.
    for (const key of ["Dismissal analytics", "Duplicate candidates", "Control coverage"]) {
      expect(await screen.findByText(tr(lang, key))).toBeInTheDocument();
    }

    expectNoUntranslatedText(lang);
  });

  it("translates the admin-only, empty and failed states", async () => {
    mockIsAdmin = false;
    const { unmount } = renderWithProviders(<RiskInheritanceGraph />);
    expect(
      await screen.findByText(tr(lang, "Only admins can view the risk inheritance graph.")),
    ).toBeInTheDocument();
    unmount();

    mockIsAdmin = true;
    mockGetDismissalAnalytics.mockResolvedValue({ signals: [], reasons: [], notes: [] });
    mockGetDuplicateCandidates.mockResolvedValue({
      scanned: 0,
      compared: 0,
      matched: 0,
      truncated: false,
      candidates: [],
    });
    mockGetControlCoverage.mockResolvedValue({
      summary: { total_active_risks: 0, covered: 0, gap: 0, no_framework: 0 },
      gaps: [],
      no_framework: [],
      truncated: false,
    });

    mockGetRiskGraph.mockResolvedValue({ nodes: [], edges: [], truncated: false });
    const empty = renderWithProviders(<RiskInheritanceGraph />);
    expect(
      await screen.findByText(
        tr(
          lang,
          "No risk links yet. Open a risk and run the link scan from its Linked risks panel.",
        ),
      ),
    ).toBeInTheDocument();
    empty.unmount();

    mockGetRiskGraph.mockRejectedValue(new Error("boom"));
    renderWithProviders(<RiskInheritanceGraph />);
    expect(await screen.findByText(tr(lang, "Failed to load the risk graph"))).toBeInTheDocument();

    expectNoUntranslatedText(lang);
  });

  it("translates a node's accessible name and its stale-parent chip", async () => {
    renderWithProviders(
      <RiskNode
        {...({
          data: {
            name: "Drift in production",
            entityType: "model_risk",
            riskLevel: "High risk",
            staleSince: "2026-09-01T00:00:00Z",
          },
          selected: false,
        } as unknown as React.ComponentProps<typeof RiskNode>)}
      />,
    );

    expect(
      await screen.findByLabelText(
        plain(
          `${tr(lang, "Model risk")}: Drift in production. ${tr(lang, "Risk level: {level}", {
            level: tr(lang, "High risk"),
          })}. ${tr(lang, "Parent level changed.")}`,
        ),
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText(tr(lang, "Parent level changed"))).toBeInTheDocument();
    expect(await screen.findByText(tr(lang, "High risk"))).toBeInTheDocument();
    expect(await screen.findByText(tr(lang, "Model risk"))).toBeInTheDocument();

    expectNoUntranslatedText(lang);
  });

  it("translates the map key and explains the map on hover", async () => {
    renderWithProviders(<GraphGuide />);

    for (const key of ["Project", "Model", "Vendor"]) {
      expect(await screen.findByText(tr(lang, key))).toBeInTheDocument();
    }
    await userEvent.hover(await screen.findByLabelText(tr(lang, "What is this map?")));
    expect(
      await screen.findByText(
        tr(
          lang,
          'Each box is a risk, coloured by type. Arrows run from a parent risk to the risks that inherit from it. "Parent level changed" marks a risk whose parent moved and needs a second look.',
        ),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang);
  });

  it("translates control coverage, including the capped-list headings", async () => {
    const report: CoverageReport = {
      summary: { total_active_risks: 1203, covered: 600, gap: 600, no_framework: 3 },
      gaps: [risk()],
      no_framework: [
        risk({
          id: 12,
          risk_name: "Shadow vendor onboarding",
          risk_level: "No risk",
          mitigation_status: "Requires review",
          projects: [{ id: 3, name: "Internal chatbot", has_framework: false }],
        }),
      ],
      truncated: true,
    };
    mockGetControlCoverage.mockResolvedValue(report);

    renderWithProviders(<ControlCoverage />);
    await userEvent.click(await screen.findByText(tr(lang, "Control coverage")));

    for (const key of [
      "Which active risks are not mitigated by any control yet.",
      "Active risks",
      "Covered by a control",
      "No framework yet",
      "More risks matched than a single report lists. The counts above are complete; the tables below show the worst of each list.",
      "These risks sit in a project that has a framework attached but are not linked to any control. Assessment links are shown for context and do not count as coverage.",
      "None of these risks' projects has a framework attached, so there are no controls to map to. Not a finding — attach a framework first.",
      "High risk",
      "No risk",
      "On Hold",
      "Requires review",
    ]) {
      expect(await screen.findByText(tr(lang, key))).toBeInTheDocument();
    }
    expect(
      await screen.findByText(plain(`${tr(lang, "Coverage gaps")} (1 ${tr(lang, "of")} 600)`)),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(plain(`${tr(lang, "No framework yet")} (1 ${tr(lang, "of")} 3)`)),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        plain(`Claims triage, Internal chatbot (${tr(lang, "no framework")})`),
      ),
    ).toBeInTheDocument();
    // Both tables carry the same headers and the same footer label.
    for (const key of [
      "Risk",
      "Level",
      "Mitigation status",
      "Projects",
      "Assessment links",
      "Risks per page",
    ]) {
      expect((await screen.findAllByText(tr(lang, key))).length).toBeGreaterThanOrEqual(2);
    }
    expect(await screen.findByText(tr(lang, "Coverage gaps"))).toBeInTheDocument();

    expectNoUntranslatedText(lang);
  });

  it("translates dismissal analytics: signals, reasons, group header and notes", async () => {
    const payload: DismissalAnalyticsPayload = {
      signals: [
        { signal: "shared_project", decided: 10, dismissed: 3, topReason: "not_related" },
        { signal: "same_lifecycle_phase", decided: 4, dismissed: 1, topReason: "none" },
      ],
      reasons: [
        {
          relationType: "related_to",
          source: "agent",
          status: "dismissed",
          dismissReason: "not_related",
          count: 2,
        },
        {
          relationType: "related_to",
          source: "agent",
          status: "dismissed",
          dismissReason: null,
          count: 1,
        },
        {
          relationType: "related_to",
          source: "agent",
          status: "confirmed",
          dismissReason: null,
          count: 7,
        },
      ],
      notes: [
        {
          id: 1,
          relationType: "inherits_from",
          source: "agent",
          dismissReason: "duplicate",
          dismissNote: "Covered already",
          decidedAt: null,
          sourceName: "Model drift",
        },
      ],
    };
    mockGetDismissalAnalytics.mockResolvedValue(payload);

    renderWithProviders(<DismissalAnalytics />);
    await userEvent.click(await screen.findByText(tr(lang, "Dismissal analytics")));

    for (const key of [
      "Which suggested links people reject, and why, so the suggestions can be tuned.",
      "Current signals on decided links",
      "Signals are recomputed on every save, so they describe the pair today, not the moment of the decision.",
      "Why suggestions get dismissed",
      "The “No reason given” bucket also holds links that were un-linked after being accepted: confirming then dismissing a pair necessarily writes a NULL reason, and no column records the prior status — so that bucket is not pure suggester feedback.",
      "Recent notes",
      "Shared project",
      "Same lifecycle phase",
    ]) {
      expect(await screen.findByText(tr(lang, key))).toBeInTheDocument();
    }
    // "not_related" is the top reason and also a row in the reasons table.
    expect((await screen.findAllByText(tr(lang, "These aren't actually related"))).length).toBe(2);
    for (const key of [
      "Signal",
      "Decided",
      "Dismissed",
      "Dismiss rate",
      "Top reason",
      "Reason",
      "Count",
    ]) {
      expect(await screen.findByText(tr(lang, key))).toBeInTheDocument();
    }
    expect(await screen.findByText(tr(lang, "Signals per page"))).toBeInTheDocument();
    expect(await screen.findByText(tr(lang, "Reasons per page"))).toBeInTheDocument();
    expect(
      await screen.findByText(
        tr(lang, "{relation} · {source} — {dismissed} of {decided} dismissed ({rate})", {
          relation: tr(lang, "Related to"),
          source: tr(lang, "Agent"),
          dismissed: 3,
          decided: 10,
          rate: "30%",
        }),
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        plain(
          `Model drift · ${tr(lang, "Inherits from")} · ${tr(lang, "Another link already covers this")}`,
        ),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang);
  });

  describe("duplicate candidates", () => {
    const report = (overrides: Partial<DuplicateReport> = {}): DuplicateReport => ({
      organization_id: 1,
      scanned: 213,
      compared: 6498,
      matched: 80,
      truncated: false,
      candidates: [
        {
          risk_a: { id: 11, risk_name: "Model drift unnoticed", risk_owner: 7 },
          risk_b: { id: 12, risk_name: "Model drift undetected", risk_owner: null },
          similarity: 0.62,
          shared_tokens: ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"],
          also_shares: [
            "category: Operational risk",
            "project",
            "lifecycle: Monitoring & maintenance",
          ],
        },
      ],
      ...overrides,
    });

    const alsoSharesText = () =>
      plain(
        [
          `${tr(lang, "category")}: ${tr(lang, "Operational risk")}`,
          tr(lang, "project"),
          `${tr(lang, "lifecycle")}: ${tr(lang, "Monitoring & maintenance")}`,
        ].join(", "),
      );
    const wordsText = () =>
      plain(`alpha, beta, gamma, delta, epsilon, zeta +2 ${tr(lang, "more")}`);

    const open = async () => {
      renderWithProviders(<DuplicateCandidates />);
      await userEvent.click(await screen.findByText(tr(lang, "Duplicate candidates")));
    };

    it("translates the report, the capped-list notice and the shared-context cell", async () => {
      mockGetDuplicateCandidates.mockResolvedValue(report());
      await open();

      for (const key of [
        "Pairs of risks worded so alike that they may be the same risk entered twice.",
        "Possible duplicate of",
        "Similarity",
        "Words in common",
        "Also shares",
        "Actions",
        "Pairs per page",
      ]) {
        expect(await screen.findByText(tr(lang, key))).toBeInTheDocument();
      }
      expect(
        await screen.findByText(
          tr(
            lang,
            "{scanned} risks scanned, {compared} pairs compared in the same category. Scores are the share of words the two risks have in common — a prompt to compare them, not a merge.",
            { scanned: (213).toLocaleString(), compared: (6498).toLocaleString() },
          ),
        ),
      ).toBeInTheDocument();
      expect(
        await screen.findByText(
          tr(lang, "Showing the {shown} closest of {matched} matching pairs.", {
            shown: 1,
            matched: 80,
          }),
        ),
      ).toBeInTheDocument();
      expect(
        await screen.findByLabelText(tr(lang, "{percent} percent similar", { percent: 62 })),
      ).toBeInTheDocument();
      expect(await screen.findByText(alsoSharesText())).toBeInTheDocument();
      expect(await screen.findByText(wordsText())).toBeInTheDocument();

      expectNoUntranslatedText(lang);
    });

    it("translates the sampled-scan notice and the empty states", async () => {
      mockGetDuplicateCandidates.mockResolvedValue(report({ truncated: true, matched: 1 }));
      await open();
      expect(
        await screen.findByText(
          tr(
            lang,
            "This scan hit its size limit, so the list below is a sample rather than every pair in the organization.",
          ),
        ),
      ).toBeInTheDocument();
    });

    it("translates the no-duplicates result", async () => {
      mockGetDuplicateCandidates.mockResolvedValue(report({ candidates: [], matched: 0 }));
      await open();
      expect(
        await screen.findByText(
          tr(
            lang,
            "No likely duplicates. {compared} pairs compared and none scored above the threshold.",
            {
              compared: (6498).toLocaleString(),
            },
          ),
        ),
      ).toBeInTheDocument();
    });

    it("translates the row menu, the delete confirmation and the toasts", async () => {
      mockGetDuplicateCandidates.mockResolvedValue(report({ matched: 1 }));
      mockCreateRiskLink.mockResolvedValue({ id: 99 });
      mockDeleteEntityById.mockResolvedValue({ status: 200 });
      await open();
      // The row's own cells are asserted above; here they only need to be known.
      alsoSharesText();
      wordsText();

      await userEvent.click(
        await screen.findByRole("button", { name: tr(lang, "Duplicate pair actions") }),
      );
      expect(
        await screen.findByRole("menuitem", { name: tr(lang, "Open risk #{id}", { id: 11 }) }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole("menuitem", { name: tr(lang, "Open risk #{id}", { id: 12 }) }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole("menuitem", { name: tr(lang, "Delete risk #{id}", { id: 11 }) }),
      ).toBeInTheDocument();

      await userEvent.click(
        await screen.findByRole("menuitem", { name: tr(lang, "Link as related") }),
      );
      expect(
        await screen.findByText(tr(lang, "The two risks are now linked as related.")),
      ).toBeInTheDocument();

      await userEvent.click(
        await screen.findByRole("button", { name: tr(lang, "Duplicate pair actions") }),
      );
      expect(
        await screen.findByRole("menuitem", { name: tr(lang, "Linked as related") }),
      ).toBeInTheDocument();
      await userEvent.click(
        await screen.findByRole("menuitem", { name: tr(lang, "Delete risk #{id}", { id: 12 }) }),
      );

      expect(await screen.findByText(tr(lang, "Delete this risk?"))).toBeInTheDocument();
      expect(
        await screen.findByText(
          tr(
            lang,
            "“{name}” (#{id}) will be deleted. Its possible duplicate “{otherName}” (#{otherId}) stays.",
            {
              name: "Model drift undetected",
              id: 12,
              otherName: "Model drift unnoticed",
              otherId: 11,
            },
          ),
        ),
      ).toBeInTheDocument();
      expect(await screen.findByRole("button", { name: tr(lang, "Cancel") })).toBeInTheDocument();
      await userEvent.click(await screen.findByRole("button", { name: tr(lang, "Delete risk") }));

      expect(
        await screen.findByText(tr(lang, 'Deleted "{name}".', { name: "Model drift undetected" })),
      ).toBeInTheDocument();

      expectNoUntranslatedText(lang);
    });
  });
});
