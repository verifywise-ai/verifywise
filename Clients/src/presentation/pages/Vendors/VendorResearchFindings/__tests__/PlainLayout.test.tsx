/**
 * The research findings section as a person who does not know how the research works reads it:
 * a short summary of what is pending, one line for each finding with the rest behind a click, the
 * findings in groups with the most severe first, a note said once instead of on every row, and
 * the details of the run behind one button. What is a gap in the checks, a caution about a
 * finding, or a credit a licence asks for stays on screen without a click.
 *
 * The decisions on a finding, the vendor filter and the states of the section are tested with the
 * whole section in VendorResearchFindings.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import {
  acceptedRisk,
  ATTRIBUTIONS,
  coverage,
  credibleFinding,
  finding,
  formEdits,
  FOUR_OUTCOMES,
  listCopy,
  run,
  secondFinding,
} from "./fixtures";

vi.mock(
  "../../../../../application/repository/vendorResearch.repository",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../../../application/repository/vendorResearch.repository")
    >()),
    getVendorResearchConfig: vi.fn(),
    getVendorResearchSettings: vi.fn(),
    saveVendorResearchSettings: vi.fn(),
    listVendorRiskFindings: vi.fn(),
    startVendorResearch: vi.fn(),
    getLatestVendorResearch: vi.fn(),
    acceptVendorRiskFinding: vi.fn(),
    dismissVendorRiskFinding: vi.fn(),
  }),
);

const role = vi.hoisted(() => ({ canEdit: true, isAdmin: false }));
vi.mock("../../../../../application/hooks/useMyPermissions", () => ({
  useHasPermission: (key: string) => key === "vendor.edit" && role.canEdit,
}));
vi.mock("../../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => role.isAdmin,
}));
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 4, userRoleName: "Admin" }),
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 4 }, { id: 9 }] }),
}));
vi.mock("../../../../../application/hooks/useLLMKeys", () => ({
  useLLMKeys: () => ({ keys: [], loading: false }),
  invalidateLLMKeyQueries: vi.fn(),
}));
// The vendor risk form has its own tests: here the stand-in does what the form does with a preview.
vi.mock("../../../../components/Modals/NewRisk", async () => ({
  default: (await import("./vendorRiskFormStub")).VendorRiskFormStub,
}));

import * as repository from "../../../../../application/repository/vendorResearch.repository";
import { joinAttributions } from "../../../../../application/utils/vendorResearchText";
import type { VendorRiskFinding } from "../../../../../domain/interfaces/i.vendorResearch";
import VendorResearchFindings from "..";

const mocks = {
  config: vi.mocked(repository.getVendorResearchConfig),
  list: vi.mocked(repository.listVendorRiskFindings),
  latest: vi.mocked(repository.getLatestVendorResearch),
  accept: vi.mocked(repository.acceptVendorRiskFinding),
};

const VENDORS = [
  { id: 8, vendor_name: "Zeta Labs" },
  { id: 7, vendor_name: "Acme Cloud" },
];
const ALL_VENDORS = "/vendors/risks";
const WITH_VENDOR_7 = "/vendors/risks?findingsVendorId=7";

const renderSection = (route = WITH_VENDOR_7) => {
  const handlers = { onOpenRisk: vi.fn(), onNotify: vi.fn() };
  const view = renderWithProviders(<VendorResearchFindings vendors={VENDORS} {...handlers} />, {
    route,
  });
  return { ...view, ...handlers };
};

const FIRST = "Customer data was exposed in a breach";
const SECOND = "The ISO 27001 certificate has lapsed";
const IMPACT = "Personal data of our customers could be exposed";
const PLAN = "Ask the vendor for its incident report";
const WHY = "The vendor confirmed the breach, and customer data was involved.";
const QUOTE = "The vendor confirmed the incident.";

const listOf = (rows: VendorRiskFinding[], total = rows.length) =>
  mocks.list.mockResolvedValue({ rows, total });

/** The row of a finding, as it is on screen: nothing is opened. */
const rowOf = (text: string) => screen.getByText(text).closest("li") as HTMLElement;
/** The button that opens and closes the details of a row: it holds the level and the risk. */
const toggleOf = (text: string) => screen.getByText(text).closest("button") as HTMLElement;
const detailsButton = () => screen.findByRole("button", { name: "How it was researched" });
/** The risks on screen, in the order of the page. */
const risksInOrder = (texts: string[]) =>
  texts
    .map((text) => screen.getByText(text))
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map((element) => element.textContent);
const follows = (a: HTMLElement, b: HTMLElement) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

const legacy = { rule: "legacy_confidence" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  role.canEdit = true;
  role.isAdmin = false;
  formEdits.current = {};
  mocks.config.mockResolvedValue({ hasLlmKey: true, autoRunEnabled: true });
  listOf([finding(), secondFinding()]);
  mocks.latest.mockResolvedValue(run({ category_summary: FOUR_OUTCOMES }));
});

describe("the summary of what is pending", () => {
  it("counts the findings and the high ones, and names the categories with the most", async () => {
    listOf([
      finding({ id: 1, category: "legal_regulatory", risk_description: "A" }),
      finding({ id: 2, category: "legal_regulatory", risk_description: "B" }),
      finding({ id: 3, category: "security_incidents", risk_description: "C" }),
      finding({
        id: 4,
        category: "availability",
        risk_description: "D",
        risk_level: "Low Risk",
      }),
    ]);
    renderSection(ALL_VENDORS);

    expect(
      await screen.findByText("4 possible risks to review. 3 are high risk."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Most are about: Legal and regulatory (2), Security incidents (1)."),
    ).toBeInTheDocument();
  });

  it("stands above the findings it counts", async () => {
    renderSection(ALL_VENDORS);

    const sentence = await screen.findByText("2 possible risks to review. 1 is high risk.");
    expect(follows(sentence, screen.getByText(FIRST))).toBe(true);
  });

  it("only counts when the server holds more findings than it sent", async () => {
    listOf([finding({ id: 1 }), secondFinding({ id: 2, category: "availability" })], 250);
    renderSection(ALL_VENDORS);

    expect(await screen.findByText("250 possible risks to review.")).toBeInTheDocument();
    expect(screen.queryByText(/high risk\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Most are about/)).not.toBeInTheDocument();
    // The notice that says why is the one the section always had.
    expect(
      screen.getByText("Showing 2 of 250 pending findings. Choose a vendor to see the rest."),
    ).toBeInTheDocument();
  });

  it("is not there when nothing is pending", async () => {
    listOf([]);
    renderSection(ALL_VENDORS);
    await userEvent.click(await screen.findByRole("button", { name: /^Research findings/ }));

    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
    expect(screen.queryByText(/possible risks? to review/)).not.toBeInTheDocument();
  });

  it("no longer has a heading of its own, nor the day of the run under another name", async () => {
    renderSection();
    await screen.findByText(FIRST);

    expect(await screen.findByText("Last researched: 10 Oct 2026")).toBeInTheDocument();
    expect(screen.queryByText("Latest research")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Last run:/)).not.toBeInTheDocument();
  });
});

describe("how the vendor was researched, behind one button", () => {
  it("keeps what the run found and checked off the screen until it is asked for", async () => {
    mocks.latest.mockResolvedValue(
      run({
        category_summary: FOUR_OUTCOMES,
        coverage: coverage({ lookups: [{ id: "nvd", outcome: "found" }] }),
        searches_used: 6,
        pages_read: 4,
      }),
    );
    renderSection();

    const button = await detailsButton();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Security incidents: risks found")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Checked:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Sources cited:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Searches:/)).not.toBeInTheDocument();
    expect(screen.queryByText("What the last research found")).not.toBeInTheDocument();

    await userEvent.click(button);

    const hide = screen.getByRole("button", { name: "Hide research details" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    const shown = screen;
    expect(shown.getByText("What the last research found")).toBeInTheDocument();
    expect(shown.getByText("Security incidents: risks found")).toBeInTheDocument();
    expect(shown.getByText("2 potential risks found")).toBeInTheDocument();
    expect(shown.getByText("What it checked")).toBeInTheDocument();
    expect(
      shown.getByText(
        "Checked: CISA Known Exploited Vulnerabilities (1), OFAC Specially Designated Nationals list (0), UK Sanctions List (0), EU consolidated list of financial sanctions (0), the National Vulnerability Database",
      ),
    ).toBeInTheDocument();
    expect(
      shown.getByText("Sources cited: 1 official, 0 trusted press, 0 vendor, 0 unverified"),
    ).toBeInTheDocument();
    expect(shown.getByText("Searches: 6, pages read: 4")).toBeInTheDocument();

    await userEvent.click(hide);

    expect(screen.getByRole("button", { name: "How it was researched" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("Security incidents: risks found")).not.toBeInTheDocument();
  });

  it("offers no button for a run that has nothing more to say", async () => {
    mocks.latest.mockResolvedValue(run());
    renderSection();

    expect(await screen.findByText("Last researched: 10 Oct 2026")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "How it was researched" })).not.toBeInTheDocument();
  });

  it("says in a sentence, without a click, what the run could not check", async () => {
    mocks.latest.mockResolvedValue(
      run({
        coverage: coverage({
          lookups: [
            { id: "nvd", outcome: "found" },
            { id: "cve", outcome: "failed" },
          ],
        }),
      }),
    );
    renderSection();

    expect(
      await screen.findByText(
        "One source could not be checked, so results may be incomplete: the CVE Program.",
      ),
    ).toBeInTheDocument();
    // The line of the details is behind the button, with the others.
    expect(screen.queryByText("Not checked: the CVE Program")).not.toBeInTheDocument();
    await userEvent.click(await detailsButton());
    expect(screen.getByText("Not checked: the CVE Program")).toBeInTheDocument();
  });

  it("counts and names several sources the run could not check", async () => {
    mocks.latest.mockResolvedValue(
      run({
        coverage: coverage({
          sources: [listCopy("kev", { outcome: "failed", checked: false })],
          lookups: [{ id: "sec", outcome: "failed" }],
        }),
      }),
    );
    renderSection();

    expect(
      await screen.findByText(
        "2 sources could not be checked, so results may be incomplete: CISA Known Exploited Vulnerabilities, SEC EDGAR.",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing of the kind for a run that checked everything it asked", async () => {
    mocks.latest.mockResolvedValue(
      run({ coverage: coverage({ lookups: [{ id: "nvd", outcome: "found" }] }) }),
    );
    renderSection();

    await screen.findByText("Last researched: 10 Oct 2026");
    expect(screen.queryByText(/could not be checked/)).not.toBeInTheDocument();
  });

  it("says without a click that a list was out of date, and that the public databases are off", async () => {
    mocks.latest.mockResolvedValue(
      run({
        coverage: coverage({
          sources: [listCopy("ofac", { stale: true, last_success_at: "2026-10-01T08:00:00.000Z" })],
          lookups: [],
        }),
      }),
    );
    const { unmount } = renderSection();

    expect(
      await screen.findByText(
        "OFAC Specially Designated Nationals list: last updated 1 Oct 2026, not up to date",
      ),
    ).toBeInTheDocument();
    unmount();

    mocks.latest.mockResolvedValue(
      run({
        coverage: coverage({
          sources: [listCopy("kev", { checked: false, outcome: "off" })],
          lookups: [],
        }),
      }),
    );
    renderSection();

    expect(await screen.findByText("Public databases turned off")).toBeInTheDocument();
  });

  it("shows the error of a failed run without a click, and what it did behind the button", async () => {
    mocks.latest.mockResolvedValue(
      run({
        status: "failed",
        error: "The run stopped because the web could not be reached",
        category_summary: [
          {
            category: "security_incidents",
            outcome: "search_failed",
            note: "The search was not available",
          },
        ],
        searches_used: 3,
      }),
    );
    renderSection();

    expect(
      await screen.findByText("The web could not be reached from the server."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Security incidents: could not be researched"),
    ).not.toBeInTheDocument();
    await userEvent.click(await detailsButton());
    expect(screen.getByText("Security incidents: could not be researched")).toBeInTheDocument();
    expect(screen.getByText("Searches: 3, pages read: 0")).toBeInTheDocument();
  });

  it("names the search of Claude in the details, where no credit is owed", async () => {
    mocks.latest.mockResolvedValue(run({ search_engine: "anthropic", searches_used: 2 }));
    renderSection();

    const button = await detailsButton();
    expect(screen.queryByText("Searched with Claude web search")).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(screen.getByText("Searched with Claude web search")).toBeInTheDocument();
  });

  it("offers the button for a run that only has its search to name", async () => {
    mocks.latest.mockResolvedValue(run({ search_engine: "anthropic" }));
    renderSection();

    await userEvent.click(await detailsButton());

    expect(screen.getByText("Searched with Claude web search")).toBeInTheDocument();
    // Nothing was found or counted, so the details have no heading for it.
    expect(screen.queryByText("What the last research found")).not.toBeInTheDocument();
  });

  it("has no details while a run is going, only that it is", async () => {
    mocks.latest.mockResolvedValue(
      run({ status: "running", category_summary: FOUR_OUTCOMES, searches_used: 2 }),
    );
    renderSection();

    expect(await screen.findByText("Researching…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "How it was researched" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Last researched:/)).not.toBeInTheDocument();
  });

  it("keeps the vendor researchable when nothing is pending", async () => {
    listOf([]);
    renderSection();

    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
    expect(await screen.findByText("Last researched: 10 Oct 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Research again" })).toBeEnabled();
    expect(await detailsButton()).toBeInTheDocument();
    expect(screen.queryByText(/possible risks? to review/)).not.toBeInTheDocument();
  });
});

describe("the credits a licence asks for", () => {
  const GDELT = "News searched with the GDELT Project (last 3 months)";
  const credited = () =>
    run({
      category_summary: FOUR_OUTCOMES,
      search_engine: "gdelt",
      coverage: coverage({ lookups: [{ id: "nvd", outcome: "found" }] }),
    });
  // The four lists of the fixture, each in its owner's words.
  const DATA_SOURCES = `Data sources: ${joinAttributions(ATTRIBUTIONS)}`;

  it("stay on screen without a click, under the findings", async () => {
    mocks.latest.mockResolvedValue(credited());
    renderSection();
    await screen.findByText(FIRST);

    const link = await screen.findByRole("link", { name: "GDELT Project" });
    expect(link).toHaveAttribute("href", "https://www.gdeltproject.org/");
    expect(link.closest("p")).toHaveTextContent(GDELT);
    const sources = screen.getByText(DATA_SOURCES);
    expect(follows(screen.getByText(SECOND), link)).toBe(true);
    expect(follows(link, sources)).toBe(true);
    // Once: the details of the run do not say them again.
    await userEvent.click(await detailsButton());
    expect(screen.getAllByRole("link", { name: "GDELT Project" })).toHaveLength(1);
    expect(screen.getAllByText(/^Data sources:/)).toHaveLength(1);
  });

  it("stay on screen for a vendor with nothing pending", async () => {
    listOf([]);
    mocks.latest.mockResolvedValue(credited());
    renderSection();

    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "GDELT Project" })).toBeInTheDocument();
    expect(screen.getByText(DATA_SOURCES)).toBeInTheDocument();
  });

  it("are not shown for a run that has none to give", async () => {
    mocks.latest.mockResolvedValue(run({ category_summary: FOUR_OUTCOMES }));
    renderSection();
    await screen.findByText("Last researched: 10 Oct 2026");

    expect(screen.queryByRole("link", { name: "GDELT Project" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Data sources:/)).not.toBeInTheDocument();
  });

  it("are not shown while a run is going, as its lines are not", async () => {
    mocks.latest.mockResolvedValue({ ...credited(), status: "running" });
    renderSection();

    expect(await screen.findByText("Researching…")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "GDELT Project" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Data sources:/)).not.toBeInTheDocument();
  });

  it("are not asked for when every vendor is listed, as no run is shown then", async () => {
    mocks.latest.mockResolvedValue(credited());
    renderSection(ALL_VENDORS);
    await screen.findByText(FIRST);

    expect(mocks.latest).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "GDELT Project" })).not.toBeInTheDocument();
  });
});

describe("the findings in groups, the most severe first", () => {
  const rows = () => [
    finding({
      id: 1,
      category: "availability",
      risk_description: "Outage",
      risk_level: "Low Risk",
    }),
    finding({
      id: 2,
      category: "security_incidents",
      risk_description: "Old breach",
      risk_level: "Medium Risk",
    }),
    finding({
      id: 3,
      category: "legal_regulatory",
      risk_description: "Lawsuit",
      risk_level: "High Risk",
    }),
    finding({
      id: 4,
      category: "security_incidents",
      risk_description: "New breach",
      risk_level: "Very High Risk",
    }),
  ];

  it("groups one vendor's findings by category, each group under its name and its count", async () => {
    listOf(rows());
    renderSection();
    await screen.findByText("Outage");

    const groups = screen
      .getAllByRole("list")
      .filter((list) => list.getAttribute("aria-labelledby"));
    expect(
      groups.map((group) => [
        document.getElementById(group.getAttribute("aria-labelledby") as string)?.textContent,
        within(group).getAllByRole("listitem").length,
      ]),
    ).toEqual([
      ["Security incidents", 2],
      ["Legal and regulatory", 1],
      ["Availability", 1],
    ]);
    const security = screen.getByText("Security incidents").closest("li") as HTMLElement;
    expect(within(security).getByText("2")).toBeInTheDocument();
    expect(risksInOrder(["Outage", "Old breach", "Lawsuit", "New breach"])).toEqual([
      "New breach",
      "Old breach",
      "Lawsuit",
      "Outage",
    ]);
  });

  it("does not repeat the category or the vendor on the rows of one vendor", async () => {
    listOf(rows());
    renderSection();
    await screen.findByText("Outage");

    expect(screen.getAllByText("Security incidents")).toHaveLength(1);
    expect(within(rowOf("Outage")).queryByText("Acme Cloud")).not.toBeInTheDocument();
  });

  it("groups the findings of every vendor by vendor, and says the category on the row", async () => {
    listOf([
      finding({ id: 1, vendor_id: 8, vendor_name: "Zeta Labs", risk_description: "Zeta risk" }),
      finding({
        id: 2,
        vendor_id: 7,
        vendor_name: "Acme Cloud",
        risk_description: "Acme low",
        risk_level: "Low Risk",
        category: "availability",
      }),
      finding({ id: 3, vendor_id: 7, vendor_name: "Acme Cloud", risk_description: "Acme high" }),
    ]);
    renderSection(ALL_VENDORS);
    await screen.findByText("Zeta risk");

    const groups = screen
      .getAllByRole("list")
      .filter((list) => list.getAttribute("aria-labelledby"));
    expect(
      groups.map(
        (group) =>
          document.getElementById(group.getAttribute("aria-labelledby") as string)?.textContent,
      ),
    ).toEqual(["Acme Cloud", "Zeta Labs"]);
    expect(risksInOrder(["Zeta risk", "Acme low", "Acme high"])).toEqual([
      "Acme high",
      "Acme low",
      "Zeta risk",
    ]);
    expect(within(rowOf("Acme low")).getByText("Availability")).toBeInTheDocument();
    expect(within(rowOf("Acme high")).getByText("Security incidents")).toBeInTheDocument();
  });

  it("names a vendor whose rows carry no name by its number", async () => {
    listOf([finding({ id: 1, vendor_id: 31, vendor_name: undefined })]);
    renderSection(ALL_VENDORS);
    await screen.findByText(FIRST);

    expect(screen.getByText("Vendor 31")).toBeInTheDocument();
  });

  it("keeps all the groups in the one list of pending findings", async () => {
    listOf(rows());
    renderSection();
    await screen.findByText("Outage");

    const pending = screen.getByRole("list", { name: "Pending research findings" });
    for (const risk of ["Outage", "Old breach", "Lawsuit", "New breach"]) {
      expect(within(pending).getByText(risk)).toBeInTheDocument();
    }
  });

  it("sends focus to the next row on screen after a decision, not to the next one the server listed", async () => {
    // On screen: New breach, Old breach, Lawsuit, Outage. From the server: Outage, Old breach,
    // Lawsuit, New breach.
    listOf(rows());
    mocks.accept.mockImplementation(async () => {
      listOf(rows().filter((row) => row.id !== 4));
      return { finding: finding({ id: 4, status: "accepted" }), vendorRisk: acceptedRisk() };
    });
    renderSection();
    await screen.findByText("New breach");

    await userEvent.click(within(rowOf("New breach")).getByRole("button", { name: "Preview" }));
    const form = await screen.findByRole("dialog", { name: "Review suggested risk" });
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByText("New breach")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(toggleOf("Old breach")));
  });
});

describe("a finding on one line, with the rest behind a click", () => {
  it("shows the level, the risk, how well it is established and the decision, and nothing else", async () => {
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    expect(row.getByText("High Risk")).toBeInTheDocument();
    expect(row.getByText("Credibility")).toBeInTheDocument();
    expect(row.getByText("Medium")).toBeInTheDocument();
    expect(row.getByRole("button", { name: "Preview" })).toBeInTheDocument();
    expect(row.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    for (const hidden of [IMPACT, PLAN, WHY, QUOTE]) {
      expect(row.queryByText(hidden)).not.toBeInTheDocument();
    }
    expect(row.queryByRole("link")).not.toBeInTheDocument();
    for (const caption of [
      "Sources",
      "Why it matters to you",
      "What to do",
      "Why this risk level",
    ]) {
      expect(row.queryByText(caption)).not.toBeInTheDocument();
    }
    // The three scales no longer stand side by side as chips with captions.
    for (const old of ["Risk level", "Severity", "Likelihood", "Major", "Likely"]) {
      expect(row.queryByText(old)).not.toBeInTheDocument();
    }
  });

  it("opens on a click of the risk, and closes on another", async () => {
    renderSection();
    await screen.findByText(FIRST);
    const toggle = toggleOf(FIRST);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const details = within(
      document.getElementById(toggle.getAttribute("aria-controls") as string)!,
    );
    const impact = details.getByText(IMPACT);
    const plan = details.getByText(PLAN);
    const why = details.getByText(WHY);
    expect(follows(details.getByText("Why it matters to you"), impact)).toBe(true);
    expect(follows(impact, details.getByText("What to do"))).toBe(true);
    expect(follows(details.getByText("What to do"), plan)).toBe(true);
    expect(follows(plan, details.getByText("Why this risk level"))).toBe(true);
    expect(follows(details.getByText("Why this risk level"), why)).toBe(true);
    expect(follows(why, details.getByText("Severity: Major · Likelihood: Likely"))).toBe(true);
    expect(
      follows(
        details.getByText("Severity: Major · Likelihood: Likely"),
        details.getByText("Sources"),
      ),
    ).toBe(true);
    expect(details.getByRole("link", { name: "news.example.com" })).toHaveAttribute(
      "href",
      "https://news.example.com/breach",
    );
    expect(details.getByText(QUOTE)).toBeInTheDocument();
    // The other row stays as it was.
    expect(toggleOf(SECOND)).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(IMPACT)).not.toBeInTheDocument();
  });

  it("opens from the keyboard", async () => {
    renderSection();
    await screen.findByText(FIRST);

    toggleOf(FIRST).focus();
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText(IMPACT)).toBeInTheDocument();
  });

  it("names the scales even for a finding that has no sentence of its own for them", async () => {
    listOf([finding({ rationale: null })]);
    renderSection();
    await screen.findByText(FIRST);

    await userEvent.click(toggleOf(FIRST));

    expect(screen.getByText("Why this risk level")).toBeInTheDocument();
    expect(screen.getByText("Severity: Major · Likelihood: Likely")).toBeInTheDocument();
  });

  it("does not open when the decision buttons are used", async () => {
    renderSection();
    await screen.findByText(FIRST);

    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Preview" }));

    expect(
      await screen.findByRole("dialog", { name: "Review suggested risk" }),
    ).toBeInTheDocument();
    expect(toggleOf(FIRST)).toHaveAttribute("aria-expanded", "false");
  });

  it("can be read by a role that cannot decide", async () => {
    role.canEdit = false;
    renderSection();
    await screen.findByText(FIRST);

    expect(within(rowOf(FIRST)).getAllByRole("button")).toHaveLength(1);
    await userEvent.click(toggleOf(FIRST));

    expect(screen.getByText(IMPACT)).toBeInTheDocument();
  });

  it("stays open while another finding is decided", async () => {
    mocks.accept.mockImplementation(async () => {
      listOf([finding()]);
      return { finding: secondFinding({ status: "accepted" }), vendorRisk: acceptedRisk() };
    });
    renderSection();
    await screen.findByText(FIRST);
    await userEvent.click(toggleOf(FIRST));

    await userEvent.click(within(rowOf(SECOND)).getByRole("button", { name: "Preview" }));
    const form = await screen.findByRole("dialog", { name: "Review suggested risk" });
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByText(SECOND)).not.toBeInTheDocument());
    expect(screen.getByText(IMPACT)).toBeInTheDocument();
    expect(toggleOf(FIRST)).toHaveAttribute("aria-expanded", "true");
  });
});

describe("how well a finding is established, in one line", () => {
  const KEV_LINE =
    "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-28001), as of 7 Oct 2026.";
  const EARLIER_NOTE =
    "Rated before the source rules; this is the earlier confidence level until the label is recomputed.";

  it("reads the sentence of the rule that decided the label, with no chip beside it", async () => {
    listOf([credibleFinding()]);
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    expect(row.getByText(KEV_LINE)).toBeInTheDocument();
    // The label is the first word of the sentence: it is not said a second time.
    expect(row.queryByText("High")).not.toBeInTheDocument();
  });

  it("counts the sources of an earlier estimate, under an asterisk that is explained once", async () => {
    listOf([
      finding({ id: 1, credibility_basis: legacy }),
      secondFinding({ id: 2, credibility_basis: legacy }),
      credibleFinding({ id: 3, risk_description: "Third" }),
    ]);
    renderSection();
    await screen.findByText(FIRST);

    expect(
      within(rowOf(FIRST)).getByText("Medium*: one source reports it (news.example.com)."),
    ).toBeInTheDocument();
    expect(
      within(rowOf(SECOND)).getByText("High*: one source reports it (registry.example.org)."),
    ).toBeInTheDocument();
    const legend = screen.getAllByText(
      "* Earlier estimate: 2 of these findings were rated before the current rules for rating sources.",
    );
    expect(legend).toHaveLength(1);
    expect(follows(legend[0], screen.getByText("Third"))).toBe(true);
    // What every such row used to say, and the note beside its chip.
    expect(screen.queryByText(EARLIER_NOTE)).not.toBeInTheDocument();
    expect(screen.queryByText("Earlier rating")).not.toBeInTheDocument();
  });

  it("says what the asterisk means to those who do not see it", async () => {
    listOf([
      finding({ credibility_basis: legacy }),
      credibleFinding({ id: 2, risk_description: "Other" }),
    ]);
    renderSection();
    await screen.findByText(FIRST);

    expect(rowOf(FIRST)).toHaveTextContent(
      "Medium*: one source reports it (news.example.com). (Earlier estimate)",
    );
    expect(rowOf("Other")).not.toHaveTextContent("Earlier estimate");
  });

  it("shows no legend when no finding carries an earlier estimate", async () => {
    listOf([credibleFinding()]);
    renderSection();
    await screen.findByText(FIRST);

    expect(screen.queryByText(/^\* Earlier estimate/)).not.toBeInTheDocument();
  });

  it("says that a label was rated again only once the row is open", async () => {
    listOf([
      finding({
        credibility: "low",
        credibility_basis: {
          rule: "backfill_self_claim",
          registry_version: "2026-10-29.1",
          name_only: false,
          sources: [],
        },
      }),
    ]);
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    expect(row.getByText("Low: only the vendor's own claims support it.")).toBeInTheDocument();
    expect(row.queryByText(/Rated again/)).not.toBeInTheDocument();

    await userEvent.click(toggleOf(FIRST));

    expect(
      row.getByText(
        "Low: only the vendor's own claims support it. Rated again with the current rule.",
      ),
    ).toBeInTheDocument();
  });

  it("shows no credibility for a finding that has none", async () => {
    listOf([finding({ credibility: null })]);
    renderSection();
    await screen.findByText(FIRST);

    expect(within(rowOf(FIRST)).queryByText("Credibility")).not.toBeInTheDocument();
  });
});

describe("the cautions of a finding, on screen without a click", () => {
  const SNIPPET = "Based on search results only: it could not be confirmed on the source pages.";
  const NAME = "Matched by name only: this may be another company.";
  const WITHDRAWN = "A cited record was withdrawn by its source.";

  it("says that a finding rests on search results only", async () => {
    listOf([finding({ snippet_only: true }), secondFinding()]);
    renderSection();
    await screen.findByText(FIRST);

    expect(within(rowOf(FIRST)).getByText(SNIPPET)).toBeInTheDocument();
    expect(within(rowOf(SECOND)).queryByText(SNIPPET)).not.toBeInTheDocument();
    // The earlier words for it are gone, from the open row as well.
    await userEvent.click(toggleOf(FIRST));
    expect(screen.queryByText(/Not confirmed on the page/)).not.toBeInTheDocument();
    expect(within(rowOf(FIRST)).getAllByText(SNIPPET)).toHaveLength(1);
  });

  it("says that a record matched by name only, and that a cited record was withdrawn", async () => {
    listOf([
      finding({
        credibility: "high",
        credibility_basis: {
          rule: "trusted_press_two",
          registry_version: "2026-10-29.1",
          name_only: true,
          sources: [],
        },
        sources: [
          {
            url: "https://www.cisa.gov/kev",
            title: "t",
            quote: "A command injection vulnerability",
            published_at: null,
            category: "official",
            record: {
              source_id: "kev",
              record_id: 41,
              status: "withdrawn",
              match_strength: "strong",
            },
          },
        ],
      }),
    ]);
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    expect(row.getByText(NAME)).toBeInTheDocument();
    expect(row.getByText(WITHDRAWN)).toBeInTheDocument();
    expect(follows(row.getByText("Credibility"), row.getByText(NAME))).toBe(true);
  });

  it("has none for a finding that needs none", async () => {
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    for (const caution of [SNIPPET, NAME, WITHDRAWN]) {
      expect(row.queryByText(caution)).not.toBeInTheDocument();
    }
  });
});

describe("the sources of an open finding", () => {
  it("says what kind of source each is, and what became of a record, in plain words", async () => {
    const record = (status: "active" | "withdrawn" | "rejected" | "delisted") => ({
      source_id: "kev" as const,
      record_id: 1,
      status,
      match_strength: "strong" as const,
    });
    const cited = (host: string, overrides: Partial<VendorRiskFinding["sources"][number]>) => ({
      url: `https://${host}/a`,
      title: "t",
      quote: `quote of ${host}`,
      published_at: null,
      ...overrides,
    });
    listOf([
      finding({
        sources: [
          cited("official.example", { category: "official", record: record("withdrawn") }),
          cited("press.example", { category: "trusted_press" }),
          cited("vendor.example", { category: "vendor" }),
          cited("forum.example", { category: "unverified" }),
          cited("rejected.example", { category: "official", record: record("rejected") }),
          cited("delisted.example", { category: "official", record: record("delisted") }),
          cited("plain.example", {}),
        ],
      }),
    ]);
    renderSection();
    await screen.findByText(FIRST);
    await userEvent.click(toggleOf(FIRST));

    const tagsOf = (host: string) => {
      const source = screen.getByText(`quote of ${host}`).parentElement as HTMLElement;
      return within(source)
        .queryAllByText(/source$|publisher$|page$|^Record|^Removed/)
        .map((tag) => tag.textContent);
    };
    expect(tagsOf("official.example")).toEqual(["Official source", "Record withdrawn"]);
    expect(tagsOf("press.example")).toEqual(["Trusted publisher"]);
    expect(tagsOf("vendor.example")).toEqual(["Vendor's own page"]);
    expect(tagsOf("forum.example")).toEqual(["Unverified source"]);
    expect(tagsOf("rejected.example")).toEqual(["Official source", "Record rejected"]);
    expect(tagsOf("delisted.example")).toEqual(["Official source", "Removed from the list"]);
    expect(tagsOf("plain.example")).toEqual([]);
    // The bare words they replace.
    for (const old of [
      "Official",
      "Trusted press",
      "Unverified",
      "Withdrawn",
      "Rejected",
      "Delisted",
    ]) {
      expect(within(rowOf(FIRST)).queryByText(old)).not.toBeInTheDocument();
    }
  });
});
