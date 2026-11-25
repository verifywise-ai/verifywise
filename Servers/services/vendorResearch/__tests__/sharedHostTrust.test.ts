/**
 * A vendor whose website is a page on a host where many have pages (github.com/acme-widgets, whose
 * domain is github.com) owns none of the host's other pages. A stranger's page there that calls
 * itself a privacy policy, read in two runs with changed text, must reach the analysis prompt as
 * an ordinary page: not as the vendor's site and not as a change of the vendor's terms (vr-16).
 * The same page on a vendor's own site keeps both, which shows the test can see them.
 */
import {
  RESEARCH_CATEGORIES,
  type ResearchCategory,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import type { FetchedPage } from "../../webResearch/readPage";
import { createWebSession } from "../../webResearch/webSession";
import { buildEvidencePack, provenanceOf } from "../evidence";
import { type StoredSnapshot, collectPolicyPages, comparePages } from "../policySnapshots";
import { buildUserPrompt } from "../prompts";
import { buildTarget } from "../target";

const BEFORE = "Example privacy policy\nWe never sell your data.\nWe never train AI on your data.";
const AFTER =
  "Example privacy policy\nWe sell your data to data brokers.\nWe train AI on your data.";

/** The source lines of the analysis prompt of a page read in two runs, its text changed between. */
async function promptOfChangedPage(website: string, pageUrl: string): Promise<string> {
  const target = buildTarget({
    vendor_name: "Example Widgets",
    website,
    vendor_provides: "AI chat",
  });
  let text = BEFORE;
  const reader = async (): Promise<FetchedPage> => ({
    url: pageUrl,
    title: "Example Widgets privacy policy",
    text,
    publishedAt: null,
    links: [],
  });
  const runOnce = async () => {
    const policies = collectPolicyPages(reader, [target.domain ?? ""]);
    const session = createWebSession<ResearchCategory>({
      engine: {
        id: "replay",
        kinds: ["web", "news"],
        newsWindowMonths: null,
        // The page is a result of a search, so that it is read whether or not it is the vendor's.
        search: async () => [
          { title: "Privacy", url: pageUrl, snippet: "Privacy", publishedAt: null, source: null },
        ],
      },
      readPage: policies.read,
      domain: target.domain,
      cutoffs: {},
      isRelevant: () => true,
    });
    await session.search("Example Widgets privacy policy", "web", RESEARCH_CATEGORIES[0]);
    await session.read(pageUrl, RESEARCH_CATEGORIES[0]);
    return { ledger: session.snapshot().ledger, pages: policies.pages() };
  };

  const first = await runOnce();
  const stored = new Map<string, StoredSnapshot>(
    comparePages({ pages: first.pages, stored: new Map(), now: new Date("2026-11-04") }).writes.map(
      (write) => [
        write.pageKey,
        { hash: write.hash, body: write.body, lastSeenAt: new Date("2026-11-04") },
      ],
    ),
  );
  text = AFTER;
  const second = await runOnce();
  const changes = comparePages({ pages: second.pages, stored, now: new Date("2026-11-11") });
  const entries = [...changes.entries, ...second.ledger];
  const prompt = buildUserPrompt(
    target,
    buildEvidencePack(entries, { dropBlocked: true }),
    null,
    [],
    provenanceOf(entries),
  );
  return prompt
    .split("\n")
    .filter((line) => line.startsWith("<source"))
    .join("\n");
}

describe("a vendor whose website is a page on a host where many have pages", () => {
  it("does not give a stranger's page on the host the vendor's site, nor a change of it the vendor's terms", async () => {
    const sources = await promptOfChangedPage(
      "https://github.com/example-widgets",
      "https://github.com/mallory/example-widgets-legal/blob/main/privacy-policy.md",
    );

    expect(sources).toContain("github.com/mallory/");
    expect(sources).not.toContain('site="vendor"');
    expect(sources).not.toContain('change="terms"');
  });

  // The hosts of code, models, packages and documents are such hosts too (TR4-LLM-2).
  it.each([
    [
      "https://huggingface.co/example-widgets",
      "https://huggingface.co/mallory/example-widgets-legal/blob/main/privacy-policy.md",
    ],
    [
      "https://bitbucket.org/example-widgets",
      "https://bitbucket.org/mallory/example-widgets-legal/src/main/privacy-policy.md",
    ],
    [
      "https://www.notion.so/example-widgets",
      "https://www.notion.so/mallory/Example-Widgets-privacy-policy-0123456789abcdef",
    ],
    [
      "https://pypi.org/project/example-widgets",
      "https://pypi.org/project/example-widgets-legal/privacy-policy",
    ],
  ])("does the same for a website at %s", async (website, page) => {
    const sources = await promptOfChangedPage(website, page);

    expect(sources).toContain(page.slice(0, 40));
    expect(sources).not.toContain('site="vendor"');
    expect(sources).not.toContain('change="terms"');
  });

  it("gives a page of a vendor's documents site on a host that gives each its own subdomain both", async () => {
    const sources = await promptOfChangedPage(
      "https://example-widgets.readthedocs.io",
      "https://example-widgets.readthedocs.io/en/latest/privacy.html",
    );

    expect(sources).toContain('site="vendor"');
    expect(sources).toContain('change="terms"');
  });

  it("gives a page of the vendor's own site under such a host both", async () => {
    const sources = await promptOfChangedPage(
      "https://example-widgets.github.io",
      "https://example-widgets.github.io/privacy",
    );

    expect(sources).toContain('site="vendor"');
    expect(sources).toContain('change="terms"');
  });
});
