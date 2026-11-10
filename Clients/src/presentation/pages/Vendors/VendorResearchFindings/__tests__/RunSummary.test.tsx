/**
 * Which search a run used, in the two places that say it. Claude's own search needs no credit, so
 * it is named with what the run did, behind "How it was researched". The GDELT Project's terms ask
 * for a credit with a link, so the project is credited under the summary, on screen without a
 * click. Nothing is said for a run from before the engine was recorded, and the words are in
 * German, French and Spanish through the real translator and dictionary.
 *
 * The other lines of the run are tested with the whole section (VendorResearchFindings.test.tsx
 * and PlainLayout.test.tsx).
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { LANGS, resetAudit, setLanguage, tr } from "../../../../../test/i18nHelpers";
import { translations } from "../../../../../i18n/translations";
import { FOUR_OUTCOMES, run } from "./fixtures";

vi.mock(
  "../../../../../application/repository/vendorResearch.repository",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../../../application/repository/vendorResearch.repository")
    >()),
    getLatestVendorResearch: vi.fn(),
    startVendorResearch: vi.fn(),
  }),
);

import * as repository from "../../../../../application/repository/vendorResearch.repository";
import { useLatestVendorResearch } from "../../../../../application/hooks/useVendorResearch";
import ResearchCredits from "../ResearchCredits";
import RunSummary from "../RunSummary";

const mocks = { latest: vi.mocked(repository.getLatestVendorResearch) };

const CLAUDE_LINE = "Searched with Claude web search";
const GDELT_LINE = "News searched with the GDELT Project (last 3 months)";
const GDELT_NAME = "GDELT Project";
const GDELT_URL = "https://www.gdeltproject.org/";
const SEARCHES_LINE = "Searches: 6, pages read: 4";
const DETAILS = "How it was researched";

/** A finished run that searched, so that the line of what it did is there for the engine to follow. */
const searched = (overrides: Parameters<typeof run>[0] = {}) =>
  run({ category_summary: FOUR_OUTCOMES, searches_used: 6, pages_read: 4, ...overrides });

const onNotify = vi.fn();

/** The summary and the credits as the section mounts them: on one read of the vendor's latest run. */
function SummaryAndCredits() {
  const latest = useLatestVendorResearch(7);
  return (
    <>
      <RunSummary
        latest={latest}
        vendorId={7}
        vendorName="Acme Cloud"
        canStart
        notConfigured={false}
        onNotify={onNotify}
      />
      <ResearchCredits run={latest.data} />
    </>
  );
}

const renderSummary = () => renderWithProviders(<SummaryAndCredits />);

/** Opens what the run found and checked; the name of the button is in the language of the page. */
const openDetails = async (name = DETAILS) =>
  userEvent.click(await screen.findByRole("button", { name }));

/** The paragraph that holds the credit: the link, and the words around it. */
const creditLine = async () => {
  const link = await screen.findByRole("link", { name: GDELT_NAME });
  return link.closest("p") as HTMLElement;
};

const follows = (a: HTMLElement, b: HTMLElement) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the lines that say which search a run used", () => {
  it("names the web search of Claude with what the run did, once the details are open", async () => {
    mocks.latest.mockResolvedValue(searched({ search_engine: "anthropic" }));
    renderSummary();

    await screen.findByRole("button", { name: DETAILS });
    expect(screen.queryByText(CLAUDE_LINE)).not.toBeInTheDocument();
    await openDetails();

    expect(follows(screen.getByText(SEARCHES_LINE), screen.getByText(CLAUDE_LINE))).toBe(true);
    // Claude's search needs no credit of the kind GDELT asks for.
    expect(screen.queryByRole("link", { name: GDELT_NAME })).not.toBeInTheDocument();
  });

  it("credits the GDELT Project with a link, under the summary and without a click", async () => {
    mocks.latest.mockResolvedValue(searched({ search_engine: "gdelt" }));
    renderSummary();

    const line = await creditLine();

    // The words are one sentence on the screen, with the name of the project inside it.
    expect(line.textContent).toBe(GDELT_LINE);
    // The credit is under the day of the run, and none of the lines behind the button.
    expect(follows(screen.getByText(/^Last researched: /), line)).toBe(true);
    expect(screen.getByRole("button", { name: DETAILS })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(SEARCHES_LINE)).not.toBeInTheDocument();

    // The link is the credit: it goes to the project's own site, and opens beside this page.
    const link = within(line).getByRole("link", { name: GDELT_NAME });
    expect(link).toHaveAttribute("href", GDELT_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("credits the GDELT Project once, whether the details are open or not", async () => {
    mocks.latest.mockResolvedValue(searched({ search_engine: "gdelt" }));
    renderSummary();
    await creditLine();

    await openDetails();

    expect(screen.getByText(SEARCHES_LINE)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: GDELT_NAME })).toHaveLength(1);
    expect(screen.getAllByText(/GDELT Project/)).toHaveLength(1);
    expect(screen.queryByText(CLAUDE_LINE)).not.toBeInTheDocument();
  });

  it("credits it for a run that failed after it searched as well", async () => {
    mocks.latest.mockResolvedValue(
      run({
        status: "failed",
        error: "The run stopped because the web could not be reached",
        searches_used: 3,
        pages_read: 0,
        search_engine: "gdelt",
      }),
    );
    renderSummary();

    expect((await creditLine()).textContent).toBe(GDELT_LINE);
    await openDetails();
    expect(screen.getByText("Searches: 3, pages read: 0")).toBeInTheDocument();
  });

  // A run from before the column, one that searched nothing, and a response cached before the
  // field existed: none of them has an engine to name, and none of them shows a line for it.
  it.each([
    ["null", { search_engine: null }],
    ["missing", {}],
  ])("says nothing of the search of a run whose engine is %s", async (_name, fields) => {
    mocks.latest.mockResolvedValue(searched(fields));
    renderSummary();
    await openDetails();

    expect(screen.getByText(SEARCHES_LINE)).toBeInTheDocument();
    expect(screen.queryByText(/Searched with/)).not.toBeInTheDocument();
    expect(screen.queryByText(/News searched with/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: GDELT_NAME })).not.toBeInTheDocument();
  });

  it("says nothing for an engine it has no words for, and shows the rest of the run", async () => {
    // OpenAI's search is in the table's list, for a later engine; no run uses it yet. Bing is the
    // feed that was removed, and could only come from a table that was written by hand.
    for (const engine of ["openai", "bing"]) {
      mocks.latest.mockResolvedValue(searched({ search_engine: engine as unknown as "anthropic" }));
      const { unmount } = renderSummary();
      await openDetails();

      expect(screen.getByText(SEARCHES_LINE)).toBeInTheDocument();
      expect(screen.queryByText(/Searched with|News searched with/)).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: GDELT_NAME })).not.toBeInTheDocument();
      expect(screen.getByText(/^Last researched: /)).toBeInTheDocument();
      unmount();
    }
  });

  it("says nothing of the search while the run is going", async () => {
    mocks.latest.mockResolvedValue(
      run({ status: "running", searches_used: 2, pages_read: 1, search_engine: "gdelt" }),
    );
    renderSummary();

    expect(await screen.findByText("Researching…")).toBeInTheDocument();
    expect(screen.queryByText(/Searched with|News searched with/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: GDELT_NAME })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: DETAILS })).not.toBeInTheDocument();
  });
});

describe("the lines of the engine in German, French and Spanish", () => {
  afterAll(async () => {
    await setLanguage("en");
  });

  it.each(LANGS)(
    "translates the credit in %s, with the name still a link to the project",
    async (lang) => {
      resetAudit();
      await setLanguage(lang);
      mocks.latest.mockResolvedValue(searched({ search_engine: "gdelt" }));
      renderSummary();

      const line = await creditLine();

      expect(line.textContent).toBe(tr(lang, GDELT_LINE));
      expect(line.textContent).not.toBe(GDELT_LINE);
      const link = within(line).getByRole("link", { name: GDELT_NAME });
      expect(link).toHaveAttribute("href", GDELT_URL);
      expect(link).toHaveAttribute("target", "_blank");
      // The name stays the project's own; the words around it are the language's.
      expect(link.textContent).toBe(GDELT_NAME);
    },
  );

  it.each(LANGS)("says Claude's search in %s, behind the button of that language", async (lang) => {
    resetAudit();
    await setLanguage(lang);
    mocks.latest.mockResolvedValue(searched({ search_engine: "anthropic" }));
    renderSummary();

    await openDetails(tr(lang, DETAILS));

    expect(await screen.findByText(tr(lang, CLAUDE_LINE))).toBeInTheDocument();
    expect(screen.queryByText(CLAUDE_LINE)).not.toBeInTheDocument();
  });
});

describe("the dictionary", () => {
  // The credit is built from the translation of the sentence, so a translation has to keep what
  // the screen finds in it: the name of the project, once, to put the link on.
  it.each(LANGS)("has the words of the engine lines in %s", (lang) => {
    for (const key of [CLAUDE_LINE, GDELT_LINE]) {
      const text = translations[lang][key];
      expect(text, `${lang}: ${key}`).toEqual(expect.any(String));
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text, `${lang}: ${key} is still English`).not.toBe(key);
    }
    const sentence = translations[lang][GDELT_LINE];
    expect(sentence.split(GDELT_NAME)).toHaveLength(2);
    expect(translations[lang][CLAUDE_LINE]).toContain("Claude");
  });
});
