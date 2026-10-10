/**
 * The research findings section in German, French and Spanish, through the real DOM
 * translator and dictionary, the way the vendor risk insights are checked. Each case ends with
 * the translator's gap audit: whatever English text it could not find in the dictionary, and
 * the test did not expect, fails the case. Vendor names, finding texts, quotes, hostnames and
 * the model's own notes are data and are never translated.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import {
  LANGS,
  expectNoUntranslatedText,
  plain,
  resetAudit,
  setLanguage,
  tr,
} from "../../../../../test/i18nHelpers";
import { translations } from "../../../../../i18n/translations";
import {
  acceptedRisk,
  finding,
  FOUR_OUTCOMES,
  MODEL_NOTE,
  refusal,
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
    listVendorRiskFindings: vi.fn(),
    startVendorResearch: vi.fn(),
    getLatestVendorResearch: vi.fn(),
    acceptVendorRiskFinding: vi.fn(),
    dismissVendorRiskFinding: vi.fn(),
  }),
);

const role = vi.hoisted(() => ({ canEdit: true, isAdmin: true }));
vi.mock("../../../../../application/hooks/useMyPermissions", () => ({
  useHasPermission: (key: string) => key === "risks.edit" && role.canEdit,
}));
vi.mock("../../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => role.isAdmin,
}));

import * as repository from "../../../../../application/repository/vendorResearch.repository";
import VendorResearchFindings from "..";

const mocks = {
  config: vi.mocked(repository.getVendorResearchConfig),
  list: vi.mocked(repository.listVendorRiskFindings),
  start: vi.mocked(repository.startVendorResearch),
  latest: vi.mocked(repository.getLatestVendorResearch),
  accept: vi.mocked(repository.acceptVendorRiskFinding),
  dismiss: vi.mocked(repository.dismissVendorRiskFinding),
};

/** What the vendor filter lists: the user's own data, never translated. */
const FIXTURES = new Set(["Acme Cloud", "Zeta Labs"]);

const VENDORS = [
  { id: 7, vendor_name: "Acme Cloud" },
  { id: 8, vendor_name: "Zeta Labs" },
];

const renderSection = (route = "/vendors/risks?findingsVendorId=7") => {
  const handlers = { onOpenRisk: vi.fn(), onNotify: vi.fn() };
  renderWithProviders(<VendorResearchFindings vendors={VENDORS} {...handlers} />, { route });
  return handlers;
};

/** The date as the screen writes it in a language: day, short month, year, in UTC. */
const dateIn = (lang: (typeof LANGS)[number], iso: string) =>
  new Date(iso).toLocaleDateString({ de: "de-DE", fr: "fr-FR", es: "es-ES" }[lang], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** Every word of the register's vocabulary the section can put on a row. */
const REGISTER_WORDS = {
  likelihood: ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"],
  severity: ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"],
  level: ["Very Low Risk", "Low Risk", "Medium Risk", "High Risk", "Very High Risk"],
  confidence: ["Low", "Medium", "High"],
};

beforeEach(() => {
  vi.clearAllMocks();
  role.canEdit = true;
  role.isAdmin = true;
  mocks.config.mockResolvedValue({ searchConfigured: true, hasLlmKey: true, autoRunEnabled: true });
  mocks.list.mockResolvedValue({ rows: [finding(), secondFinding()], total: 2 });
  mocks.latest.mockResolvedValue(run({ category_summary: FOUR_OUTCOMES }));
});

afterAll(() => setLanguage("en"));

describe("the register's words", () => {
  it.each(LANGS)("are in the %s dictionary, in the form the findings use", (lang) => {
    const missing = Object.values(REGISTER_WORDS)
      .flat()
      .filter((word) => translations[lang][word] === undefined);
    expect(missing).toEqual([]);
  });
});

const CATEGORIES = [
  "Security incidents",
  "Certifications",
  "Legal and regulatory",
  "AI-specific risks",
];
const OUTCOMES = ["risks found", "nothing found", "search failed", "skipped"];

/**
 * The text the section builds out of translated parts: the pending count, the line of every
 * category, and the date of the last run. A test that is about something else still has them
 * on screen, so they are expected in every test. Only their translated forms are: the same line
 * with one part left in English would not be in this list, and would fail the test.
 */
const registerComposedText = (lang: (typeof LANGS)[number]) => {
  for (const count of [0, 1, 2, 3, 250]) tr(lang, "Pending: {count}", { count });
  for (const category of CATEGORIES) {
    for (const outcome of OUTCOMES) {
      tr(lang, "{category}: {outcome}", {
        category: tr(lang, category),
        outcome: tr(lang, outcome),
      });
    }
  }
  tr(lang, "Last run: {date}", { date: plain(dateIn(lang, "2026-10-10T09:01:00.000Z")) });
};

describe.each(LANGS)("research findings in %s", (lang) => {
  beforeEach(async () => {
    await setLanguage(lang, true);
    resetAudit();
    registerComposedText(lang);
  });

  it("translates the header, the filter and a populated list", async () => {
    renderSection();

    expect(await screen.findByText(tr(lang, "Research findings"))).toBeInTheDocument();
    expect(
      screen.getByText(tr(lang, "AI-suggested from web sources. Verify before accepting.")),
    ).toBeInTheDocument();
    expect(await screen.findByText(tr(lang, "Pending: {count}", { count: 2 }))).toBeInTheDocument();
    expect(screen.getByText(tr(lang, "Vendor"))).toBeInTheDocument();
    expect(
      await screen.findByRole("list", { name: tr(lang, "Pending research findings") }),
    ).toBeInTheDocument();

    const first = within((await screen.findByText(finding().risk_description)).closest("li")!);
    for (const word of [
      "Security incidents",
      "Risk level",
      "Severity",
      "Likelihood",
      "Confidence",
      "Sources",
      "High Risk",
      "Major",
      "Likely",
      "Medium",
      "Accept",
      "Dismiss",
    ]) {
      expect(first.getByText(tr(lang, word))).toBeInTheDocument();
    }
    const second = within(
      (await screen.findByText(secondFinding().risk_description)).closest("li")!,
    );
    for (const word of ["Certifications", "Medium Risk", "Moderate", "Possible", "High"]) {
      expect(second.getByText(tr(lang, word))).toBeInTheDocument();
    }

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the sources that have no link", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        finding({
          sources: [
            { url: "javascript:void(0)", title: "t", quote: "A quote", published_at: null },
          ],
        }),
      ],
      total: 1,
    });
    renderSection();

    expect(await screen.findByText(tr(lang, "Unknown source"))).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates every word of the register's scales on a row", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        finding({
          id: 1,
          likelihood: "Almost certain",
          risk_severity: "Catastrophic",
          risk_level: "Very High Risk",
          confidence: "high",
        }),
        finding({
          id: 2,
          risk_description: "Second",
          likelihood: "Rare",
          risk_severity: "Negligible",
          risk_level: "Very Low Risk",
          confidence: "low",
        }),
        finding({
          id: 3,
          risk_description: "Third",
          likelihood: "Unlikely",
          risk_severity: "Minor",
          risk_level: "Low Risk",
        }),
      ],
      total: 3,
    });
    renderSection();

    await screen.findByText("Second");
    for (const word of [
      "Almost certain",
      "Catastrophic",
      "Very High Risk",
      "Rare",
      "Negligible",
      "Very Low Risk",
      "Unlikely",
      "Minor",
      "Low Risk",
    ]) {
      expect(screen.getAllByText(tr(lang, word)).length).toBeGreaterThan(0);
    }

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates a run summary with all four outcomes, a model-written note and the notes of the others", async () => {
    mocks.latest.mockResolvedValue(
      run({
        category_summary: [
          { category: "security_incidents", outcome: "nothing_found", note: MODEL_NOTE },
          { category: "certifications", outcome: "findings", note: "1 potential risk found" },
          {
            category: "legal_regulatory",
            outcome: "search_failed",
            note: "Tavily search failed with status 429",
          },
          {
            category: "ai_specific",
            outcome: "skipped",
            note: "Vendor website is missing or not a valid domain",
          },
        ],
      }),
    );
    renderSection();

    expect(await screen.findByText(tr(lang, "Latest research"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: tr(lang, "Research again") })).toBeInTheDocument();
    const line = (category: string, outcome: string) =>
      tr(lang, "{category}: {outcome}", {
        category: tr(lang, category),
        outcome: tr(lang, outcome),
      });
    expect(
      await screen.findByText(line("Security incidents", "nothing found")),
    ).toBeInTheDocument();
    expect(screen.getByText(line("Certifications", "risks found"))).toBeInTheDocument();
    expect(screen.getByText(line("Legal and regulatory", "search failed"))).toBeInTheDocument();
    expect(screen.getByText(line("AI-specific risks", "skipped"))).toBeInTheDocument();
    expect(screen.getByText(tr(lang, "AI note (unverified)"))).toBeInTheDocument();
    expect(screen.getByText(MODEL_NOTE)).toBeInTheDocument();
    expect(screen.getByText(tr(lang, "1 potential risk found"))).toBeInTheDocument();
    expect(
      screen.getByText(tr(lang, "The search failed with HTTP status {status}.", { status: 429 })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(tr(lang, "The vendor website is missing or is not a valid domain.")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(lang, "Last run: {date}", { date: plain(dateIn(lang, "2026-10-10T09:01:00.000Z")) }),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the fixed notes of a run summary", async () => {
    mocks.latest.mockResolvedValue(
      run({
        category_summary: [
          {
            category: "security_incidents",
            outcome: "nothing_found",
            note: "No risks found in the search results",
          },
          {
            category: "certifications",
            outcome: "nothing_found",
            note: "Possible risks were found but could not be verified or are already recorded",
          },
          { category: "legal_regulatory", outcome: "findings", note: "12 potential risks found" },
          {
            category: "ai_specific",
            outcome: "search_failed",
            note: "search response could not be read",
          },
        ],
      }),
    );
    renderSection();

    expect(
      await screen.findByText(tr(lang, "No risks were found in the search results.")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(lang, "Possible risks were found but could not be verified, or are already recorded."),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(tr(lang, "{count} potential risks found", { count: 12 })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(tr(lang, "The search response could not be read.")),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates a failed run", async () => {
    mocks.latest.mockResolvedValue(
      run({
        status: "failed",
        error:
          "The run stopped because all searches failed: search timed out; search request failed",
        category_summary: [
          { category: "security_incidents", outcome: "search_failed", note: "search timed out" },
        ],
      }),
    );
    renderSection();

    expect(
      await screen.findByText(
        plain(`${tr(lang, "All web searches failed.")} (search timed out; search request failed)`),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(tr(lang, "The search timed out."))).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates a failed run that has no categories, and its other errors", async () => {
    mocks.latest.mockResolvedValue(
      run({ status: "failed", error: "Model call failed: HTTP 502", category_summary: [] }),
    );
    renderSection();

    expect(
      await screen.findByText(
        tr(lang, "The model call failed with HTTP status {status}.", { status: 502 }),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the running state", async () => {
    mocks.latest.mockResolvedValue(run({ status: "running" }));
    renderSection();

    expect(await screen.findByText(tr(lang, "Researching…"))).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the run that is still going after polling stopped", async () => {
    vi.useFakeTimers();
    mocks.latest.mockResolvedValue(run({ status: "running" }));
    renderSection();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(screen.getByText(tr(lang, "Still running. Check back later."))).toBeInTheDocument();
    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the message for a vendor that was never researched", async () => {
    mocks.latest.mockResolvedValue(null);
    renderSection();

    expect(
      await screen.findByText(tr(lang, "No research has run for this vendor yet.")),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the error of a latest run that could not be loaded", async () => {
    mocks.latest.mockRejectedValue(new Error("boom"));
    renderSection();

    expect(
      await screen.findByText(tr(lang, "Could not load the latest research run.")),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: tr(lang, "Retry") })).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the loading state", async () => {
    mocks.list.mockReturnValue(new Promise(() => {}));
    renderSection();
    expect(
      await screen.findByRole("status", { name: tr(lang, "Loading research findings") }),
    ).toBeInTheDocument();
    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the error state of the list", async () => {
    mocks.list.mockRejectedValue(new Error("boom"));
    renderSection();

    expect(
      await screen.findByText(tr(lang, "Could not load research findings.")),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: tr(lang, "Retry") }).length).toBeGreaterThan(0);

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the empty state", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    renderSection();

    expect(await screen.findByText(tr(lang, "No pending research findings."))).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the not-set-up state, with the hint for an Admin", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.config.mockResolvedValue({
      searchConfigured: false,
      hasLlmKey: false,
      autoRunEnabled: true,
    });
    renderSection();

    expect(await screen.findByText(tr(lang, "Vendor research is not set up."))).toBeInTheDocument();
    expect(
      screen.getByText(
        tr(
          lang,
          "Set {provider} and {key} in the server environment, and add an LLM key for your organization.",
          {
            provider: "VENDOR_RESEARCH_SEARCH_PROVIDER",
            key: "TAVILY_API_KEY",
          },
        ),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the notice that more findings are pending than shown", async () => {
    mocks.list.mockResolvedValue({ rows: [finding(), secondFinding()], total: 250 });
    renderSection();

    expect(
      await screen.findByText(
        tr(lang, "Showing {shown} of {total} pending findings. Choose a vendor to see the rest.", {
          shown: 2,
          total: 250,
        }),
      ),
    ).toBeInTheDocument();

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the tooltip of Research again when research is not set up", async () => {
    mocks.config.mockResolvedValue({
      searchConfigured: false,
      hasLlmKey: true,
      autoRunEnabled: true,
    });
    renderSection();

    const button = await screen.findByRole("button", { name: tr(lang, "Research again") });
    await userEvent.hover(button.parentElement as HTMLElement);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      tr(lang, "Vendor research is not set up."),
    );

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the toast and the notice after an accept", async () => {
    mocks.accept.mockImplementation(async () => {
      mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
      return { finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() };
    });
    const { onNotify } = renderSection();
    const row = (await screen.findByText(finding().risk_description)).closest("li") as HTMLElement;

    await userEvent.click(within(row).getByRole("button", { name: tr(lang, "Accept") }));

    expect(await screen.findByText(tr(lang, "Risk added to the register."))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: tr(lang, "Open risk") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: tr(lang, "Close") })).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith({
      variant: "success",
      body: tr(lang, "Risk added to the register"),
    });

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the dismiss modal and its five reasons", async () => {
    renderSection();
    const row = (await screen.findByText(finding().risk_description)).closest("li") as HTMLElement;

    await userEvent.click(within(row).getByRole("button", { name: tr(lang, "Dismiss") }));

    const dialog = await screen.findByRole("dialog", { name: tr(lang, "Dismiss finding") });
    expect(
      within(dialog).getByText(
        tr(
          lang,
          "Choose why this finding does not belong in the register. Similar findings are not suggested again.",
        ),
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(tr(lang, "Reason"))).toBeInTheDocument();
    expect(within(dialog).getByText(tr(lang, "Select a reason"))).toBeInTheDocument();
    expect(within(dialog).getByText(tr(lang, "Note"))).toBeInTheDocument();
    expect(within(dialog).getByText(tr(lang, "(optional)"))).toBeInTheDocument();
    expect(within(dialog).getByText(tr(lang, "Up to 500 characters."))).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: tr(lang, "Cancel") })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: tr(lang, "Dismiss") })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("combobox"));
    for (const reason of [
      "Not applicable to this vendor",
      "Already covered by an existing risk",
      "Inaccurate or not supported by the sources",
      "Accepted risk",
      "Other",
    ]) {
      expect(await screen.findByRole("option", { name: tr(lang, reason) })).toBeInTheDocument();
    }

    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates what Research again says for each refusal", async () => {
    const { onNotify } = renderSection();
    const press = async () =>
      userEvent.click(await screen.findByRole("button", { name: tr(lang, "Research again") }));

    mocks.start.mockResolvedValueOnce({ run: run({ status: "queued" }), alreadyRunning: false });
    await press();
    await waitFor(() =>
      expect(onNotify).toHaveBeenLastCalledWith({
        variant: "success",
        body: tr(lang, "Research started for {vendorName}. Findings appear on the Risks tab.", {
          vendorName: "Acme Cloud",
        }),
      }),
    );

    mocks.start.mockRejectedValueOnce(refusal(429, { code: "cooldown", retryAfterSeconds: 540 }));
    await press();
    await waitFor(() =>
      expect(onNotify).toHaveBeenLastCalledWith({
        variant: "warning",
        body: tr(lang, "Research ran recently. Try again in {minutes} min.", { minutes: 9 }),
      }),
    );
  });
});
