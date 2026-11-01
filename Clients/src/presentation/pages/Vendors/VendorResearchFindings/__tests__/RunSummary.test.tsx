/**
 * The line of the latest research run that says which search the run used. The run summary has
 * its other lines tested with the whole section (VendorResearchFindings.test.tsx); this file is
 * about the engine line only: the words for each engine, the credit that the GDELT Project's terms
 * ask for, nothing for a run from before the engine was recorded, and the words in German, French
 * and Spanish through the real translator and dictionary.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { screen, within } from "@testing-library/react";
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
import RunSummary from "../RunSummary";

const mocks = { latest: vi.mocked(repository.getLatestVendorResearch) };

const CLAUDE_LINE = "Searched with Claude web search";
const GDELT_LINE = "News searched with the GDELT Project (last 3 months)";
const GDELT_NAME = "GDELT Project";
const GDELT_URL = "https://www.gdeltproject.org/";
const SEARCHES_LINE = "Searches: 6, pages read: 4";

/** A finished run that searched, so that the line of what it did is there for the engine to follow. */
const searched = (overrides: Parameters<typeof run>[0] = {}) =>
  run({ category_summary: FOUR_OUTCOMES, searches_used: 6, pages_read: 4, ...overrides });

const renderSummary = () =>
  renderWithProviders(
    <RunSummary
      vendorId={7}
      vendorName="Acme Cloud"
      canStart
      notConfigured={false}
      onNotify={vi.fn()}
    />,
  );

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

describe("the line that says which search a run used", () => {
  it("says a run searched with the web search of Claude, under the line of what the run did", async () => {
    mocks.latest.mockResolvedValue(searched({ search_engine: "anthropic" }));
    renderSummary();

    const did = await screen.findByText(SEARCHES_LINE);
    const line = screen.getByText(CLAUDE_LINE);

    expect(follows(did, line)).toBe(true);
    // Before the day of the run, which closes the summary.
    expect(follows(line, screen.getByText(/^Last run: /))).toBe(true);
    // Claude's search needs no credit of the kind GDELT asks for.
    expect(screen.queryByRole("link", { name: GDELT_NAME })).not.toBeInTheDocument();
  });

  it("says a run searched the news with the GDELT Project, and credits the project with a link", async () => {
    mocks.latest.mockResolvedValue(searched({ search_engine: "gdelt" }));
    renderSummary();

    const did = await screen.findByText(SEARCHES_LINE);
    const line = await creditLine();

    // The words are one sentence on the screen, with the name of the project inside it.
    expect(line.textContent).toBe(GDELT_LINE);
    expect(follows(did, line)).toBe(true);
    expect(follows(line, screen.getByText(/^Last run: /))).toBe(true);

    // The link is the credit: it goes to the project's own site, and opens beside this page.
    const link = within(line).getByRole("link", { name: GDELT_NAME });
    expect(link).toHaveAttribute("href", GDELT_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(screen.queryByText(CLAUDE_LINE)).not.toBeInTheDocument();
  });

  it("credits the GDELT Project once", async () => {
    mocks.latest.mockResolvedValue(searched({ search_engine: "gdelt" }));
    renderSummary();

    await creditLine();

    expect(screen.getAllByRole("link", { name: GDELT_NAME })).toHaveLength(1);
    expect(screen.getAllByText(/GDELT Project/)).toHaveLength(1);
  });

  it("says it for a run that failed after it searched as well", async () => {
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

    expect(await screen.findByText("Searches: 3, pages read: 0")).toBeInTheDocument();
    expect((await creditLine()).textContent).toBe(GDELT_LINE);
  });

  // A run from before the column, one that searched nothing, and a response cached before the
  // field existed: none of them has an engine to name, and none of them shows a line for it.
  it.each([
    ["null", { search_engine: null }],
    ["missing", {}],
  ])("says nothing of the search of a run whose engine is %s", async (_name, fields) => {
    mocks.latest.mockResolvedValue(searched(fields));
    renderSummary();

    expect(await screen.findByText(SEARCHES_LINE)).toBeInTheDocument();
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

      expect(await screen.findByText(SEARCHES_LINE)).toBeInTheDocument();
      expect(screen.queryByText(/Searched with|News searched with/)).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: GDELT_NAME })).not.toBeInTheDocument();
      expect(screen.getByText(/^Last run: /)).toBeInTheDocument();
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
  });
});

describe("the line of the engine in German, French and Spanish", () => {
  afterAll(async () => {
    await setLanguage("en");
  });

  it.each(LANGS)(
    "is translated in %s, with the credit still a link to the project",
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

  it.each(LANGS)("says Claude's search in %s", async (lang) => {
    resetAudit();
    await setLanguage(lang);
    mocks.latest.mockResolvedValue(searched({ search_engine: "anthropic" }));
    renderSummary();

    expect(await screen.findByText(tr(lang, CLAUDE_LINE))).toBeInTheDocument();
    expect(screen.queryByText(CLAUDE_LINE)).not.toBeInTheDocument();
  });
});

describe("the dictionary", () => {
  // The line of the engine is built from the translation of the sentence, so a translation has to
  // keep what the screen finds in it: the name of the project, once, to put the link on.
  it.each(LANGS)("has the words of the engine line in %s", (lang) => {
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
