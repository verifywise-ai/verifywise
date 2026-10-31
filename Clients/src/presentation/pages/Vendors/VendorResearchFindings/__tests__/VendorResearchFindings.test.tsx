import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import {
  acceptedRisk,
  ATTRIBUTIONS,
  coverage,
  credibleFinding,
  deferred,
  finding,
  formEdits,
  FOUR_OUTCOMES,
  KEV_RECORD,
  listCopy,
  MODEL_NOTE,
  progress,
  refusal,
  run,
  secondFinding,
} from "./fixtures";

// The Task 9 repository, with `readVendorResearchError` kept real: the screen reads refusals with it.
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
  useHasPermission: (key: string) => key === "risks.edit" && role.canEdit,
}));
vi.mock("../../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => role.isAdmin,
}));
// The person who adds a risk is user 4; the users of the organization are 4 and 9.
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 4, userRoleName: "Admin" }),
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 4 }, { id: 9 }] }),
}));
// The keys of the organization, which the research settings window offers.
vi.mock("../../../../../application/hooks/useLLMKeys", () => ({
  useLLMKeys: () => ({
    keys: [
      { id: 30, name: "OpenAI", model: "gpt-newest" },
      { id: 20, name: "Anthropic", model: "claude-deep" },
    ],
    loading: false,
  }),
  invalidateLLMKeyQueries: vi.fn(),
}));

// The vendor risk form has its own tests: here the stand-in does what the form does with a preview.
vi.mock("../../../../components/Modals/NewRisk", async () => ({
  default: (await import("./vendorRiskFormStub")).VendorRiskFormStub,
}));

import * as repository from "../../../../../application/repository/vendorResearch.repository";
import {
  VENDOR_RESEARCH_FOLLOW_KEY,
  followResearch,
} from "../../../../../application/hooks/useVendorResearch";
import { joinAttributions } from "../../../../../application/utils/vendorResearchText";
import VendorResearchFindings from "..";

const mocks = {
  config: vi.mocked(repository.getVendorResearchConfig),
  settings: vi.mocked(repository.getVendorResearchSettings),
  saveSettings: vi.mocked(repository.saveVendorResearchSettings),
  list: vi.mocked(repository.listVendorRiskFindings),
  start: vi.mocked(repository.startVendorResearch),
  latest: vi.mocked(repository.getLatestVendorResearch),
  accept: vi.mocked(repository.acceptVendorRiskFinding),
  dismiss: vi.mocked(repository.dismissVendorRiskFinding),
};

interface TestVendor {
  id: number;
  vendor_name: string;
  assignee?: number | null;
}
const VENDORS: TestVendor[] = [
  { id: 8, vendor_name: "Zeta Labs" },
  { id: 7, vendor_name: "Acme Cloud" },
];
const WITH_VENDOR_7 = "/vendors/risks?findingsVendorId=7";

const renderSection = (
  options: { route?: string; vendors?: TestVendor[]; queryClient?: QueryClient } = {},
) => {
  const handlers = { onOpenRisk: vi.fn(), onNotify: vi.fn() };
  const view = renderWithProviders(
    <VendorResearchFindings vendors={options.vendors ?? VENDORS} {...handlers} />,
    { route: options.route ?? "/vendors/risks", queryClient: options.queryClient },
  );
  return { ...view, ...handlers };
};

/** A client like the test default, made here so that a test can leave something in its cache first. */
const newQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const header = () => screen.getByRole("button", { name: /^Research findings/ });
const rowOf = (text: string) => screen.getByText(text).closest("li") as HTMLElement;
const noticeOf = (text: HTMLElement) => text.closest("[role='status']") as HTMLElement;
/** The options of the open select, by name. The shared Select writes a space after each name. */
const optionNames = async () =>
  (await screen.findAllByRole("option")).map((option) => option.textContent?.trim());
const FIRST = "Customer data was exposed in a breach";
const SECOND = "The ISO 27001 certificate has lapsed";

/** Opens the dismiss modal of the row with this text. */
const openDismissal = async (text = FIRST) => {
  await userEvent.click(within(rowOf(text)).getByRole("button", { name: "Dismiss" }));
  return screen.findByRole("dialog", { name: "Dismiss finding" });
};
const choose = async (dialog: HTMLElement, reason: string) => {
  await userEvent.click(within(dialog).getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name: reason }));
};
/** The first button of the row with this text, which is where focus goes when it takes a place. */
const firstButtonOf = (text: string) => within(rowOf(text)).getAllByRole("button")[0];

/** Opens the vendor risk form on the finding of the row with this text. */
const openPreview = async (text = FIRST) => {
  await userEvent.click(within(rowOf(text)).getByRole("button", { name: "Preview" }));
  return screen.findByRole("dialog", { name: "Review suggested risk" });
};
const clickSave = (dialog: HTMLElement) =>
  userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
/** Opens the form on the finding and saves it there: the way a finding is accepted. */
const accept = async (text: string) => clickSave(await openPreview(text));
const closeForm = (dialog: HTMLElement) =>
  userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
/** An accept that works: the finding leaves the server's list and the second one stays. */
const acceptsAndLeavesOnlyTheSecond = () =>
  mocks.accept.mockImplementation(async () => {
    mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
    return { finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() };
  });

beforeEach(() => {
  vi.clearAllMocks();
  role.canEdit = true;
  role.isAdmin = false;
  formEdits.current = {};
  mocks.config.mockResolvedValue({ hasLlmKey: true, autoRunEnabled: true });
  mocks.settings.mockResolvedValue({
    researchKeyId: null,
    analysisKeyId: null,
    scanIntervalDays: null,
  });
  mocks.saveSettings.mockImplementation(async (settings) => settings);
  mocks.list.mockResolvedValue({ rows: [finding(), secondFinding()], total: 2 });
  mocks.latest.mockResolvedValue(run({ category_summary: FOUR_OUTCOMES }));
});

describe("the states of the section", () => {
  it("shows a skeleton while the findings load", async () => {
    mocks.list.mockReturnValue(new Promise(() => {}));
    renderSection({ route: WITH_VENDOR_7 });

    expect(
      await screen.findByRole("status", { name: "Loading research findings" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No pending research findings.")).not.toBeInTheDocument();
  });

  it("shows an inline error with a way to retry when the findings cannot be loaded", async () => {
    mocks.list.mockRejectedValueOnce(new Error("boom"));
    renderSection({ route: WITH_VENDOR_7 });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load research findings.");

    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    expect(screen.queryByText("Could not load research findings.")).not.toBeInTheDocument();
  });

  it("shows the error instead of stale rows when refreshing the list fails", async () => {
    mocks.accept.mockImplementation(async () => {
      mocks.list.mockRejectedValue(new Error("boom"));
      return { finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() };
    });
    renderSection();
    await screen.findByText(FIRST);

    await accept(FIRST);

    expect(await screen.findByText("Could not load research findings.")).toBeInTheDocument();
    expect(screen.queryByText(SECOND)).not.toBeInTheDocument();
  });

  it("says research is not set up when nothing is pending and the organization has no LLM key", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.config.mockResolvedValue({ hasLlmKey: false, autoRunEnabled: true });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Vendor research is not set up.")).toBeInTheDocument();
    expect(screen.queryByText("No pending research findings.")).not.toBeInTheDocument();
  });

  it("tells an Admin to add an LLM key", async () => {
    role.isAdmin = true;
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.config.mockResolvedValue({ hasLlmKey: false, autoRunEnabled: true });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Vendor research is not set up.")).toBeInTheDocument();
    expect(
      screen.getByText("Add an LLM key under Settings → API Keys, in the LLM Keys section."),
    ).toBeInTheDocument();
  });

  it("keeps the setup hint from everyone who is not an Admin", async () => {
    role.isAdmin = false;
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.config.mockResolvedValue({ hasLlmKey: false, autoRunEnabled: true });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Vendor research is not set up.")).toBeInTheDocument();
    expect(screen.queryByText(/Add an LLM key/)).not.toBeInTheDocument();
  });

  it("says nothing is pending when the setup is complete and the list is empty", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
    expect(screen.queryByText("Vendor research is not set up.")).not.toBeInTheDocument();
  });

  it("says no findings are pending, with no setup hint, once the organization has an LLM key", async () => {
    role.isAdmin = true;
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.config.mockResolvedValue({ hasLlmKey: true, autoRunEnabled: false });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
    expect(screen.queryByText("Vendor research is not set up.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Add an LLM key/)).not.toBeInTheDocument();
  });

  it("waits for the settings before it calls an empty list empty or not set up", async () => {
    const config = deferred<Awaited<ReturnType<typeof repository.getVendorResearchConfig>>>();
    mocks.config.mockReturnValue(config.promise);
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    renderSection({ route: WITH_VENDOR_7 });

    expect(
      await screen.findByRole("status", { name: "Loading research findings" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No pending research findings.")).not.toBeInTheDocument();
    expect(screen.queryByText("Vendor research is not set up.")).not.toBeInTheDocument();

    await act(async () => {
      config.resolve({ hasLlmKey: true, autoRunEnabled: true });
    });
    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
  });

  it("shows the rows even when the organization is not set up, and only disables Research again", async () => {
    mocks.config.mockResolvedValue({ hasLlmKey: false, autoRunEnabled: true });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    // The button is rebuilt inside its tooltip once the settings say research is not set up.
    const againButton = () => screen.getByRole("button", { name: "Research again" });
    await waitFor(() => expect(againButton()).toBeDisabled());
    await userEvent.hover(againButton().parentElement as HTMLElement);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Vendor research is not set up.");
    // Adding what was found does not depend on the setup.
    expect(within(rowOf(FIRST)).getByRole("button", { name: "Preview" })).toBeEnabled();
  });
});

describe("opening and closing the section", () => {
  it("starts closed to its header when nothing is pending", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    renderSection();

    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    expect(header()).toHaveAttribute("aria-expanded", "false");
    expect(await screen.findByText("Pending: 0")).toBeInTheDocument();
    expect(screen.queryByText("No pending research findings.")).not.toBeInTheDocument();
  });

  it("opens by itself when findings are pending, and shows how many", async () => {
    renderSection();

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    expect(header()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Pending: 2")).toBeInTheDocument();
  });

  it("opens when the vendor comes from the URL, even with nothing pending", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
    expect(header()).toHaveAttribute("aria-expanded", "true");
  });

  it("lets the user's choice win over the default, both ways", async () => {
    renderSection();
    await screen.findByText(FIRST);

    await userEvent.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(FIRST)).not.toBeInTheDocument();
    // The count is still in the header of a closed section.
    expect(screen.getByText("Pending: 2")).toBeInTheDocument();

    await userEvent.click(header());
    expect(await screen.findByText(FIRST)).toBeInTheDocument();
  });

  it("stays open when the user picks a vendor that has nothing pending", async () => {
    mocks.list.mockImplementation(async (filter) =>
      filter.vendorId === 8 ? { rows: [], total: 0 } : { rows: [finding()], total: 1 },
    );
    renderSection();
    await screen.findByText(FIRST);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Zeta Labs" }));

    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
    expect(header()).toHaveAttribute("aria-expanded", "true");
  });

  it("always says the findings are suggestions to verify, open or closed", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    renderSection();

    const sentence = "AI-suggested from web sources. Verify before accepting.";
    expect(screen.getByText(sentence)).toBeInTheDocument();
    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    await userEvent.click(header());
    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
    expect(screen.getByText(sentence)).toBeInTheDocument();
  });
});

describe("a finding", () => {
  it("shows its category, vendor, texts, level, severity, likelihood and confidence", async () => {
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    expect(row.getByText("Security incidents")).toBeInTheDocument();
    expect(row.getByText("Acme Cloud")).toBeInTheDocument();
    expect(row.getByText("Personal data of our customers could be exposed")).toBeInTheDocument();
    expect(row.getByText("High Risk")).toBeInTheDocument();
    expect(row.getByText("Major")).toBeInTheDocument();
    expect(row.getByText("Likely")).toBeInTheDocument();
    expect(row.getByText("Medium")).toBeInTheDocument();
    for (const caption of ["Risk level", "Severity", "Likelihood", "Confidence"]) {
      expect(row.getByText(caption)).toBeInTheDocument();
    }
  });

  it("lists each source by hostname, with a link, its date and its quote", async () => {
    renderSection();
    await screen.findByText(FIRST);

    const link = within(rowOf(FIRST)).getByRole("link", { name: "news.example.com" });
    expect(link).toHaveAttribute("href", "https://news.example.com/breach");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(within(rowOf(FIRST)).getByText("12 Mar 2026")).toBeInTheDocument();
    expect(
      within(rowOf(FIRST)).getByText("The vendor confirmed the incident."),
    ).toBeInTheDocument();

    // A source without a date shows no date.
    expect(
      within(rowOf(SECOND)).getByRole("link", { name: "registry.example.org" }),
    ).toBeInTheDocument();
  });

  // Source addresses are text from the open web, through a model. Only a plain http or https
  // address becomes a link: scripts in any spelling, other schemes, and anything relative or
  // empty do not.
  const NOT_LINKS = [
    "javascript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "vbscript:msgbox(1)",
    "ftp://files.example.com/report",
    "data:text/html,<b>x</b>",
    "not a url",
    "//evil.example.com/x",
    "/x",
    "http://",
  ];

  it("links only http and https sources, and calls any other an unknown source", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        finding({
          sources: [
            ...NOT_LINKS.map((url, index) => ({
              url,
              title: "t",
              quote: `quote ${index}`,
              published_at: null,
            })),
            {
              url: "HTTPS://Upper.Example.com/x",
              title: "e",
              quote: "the link",
              published_at: null,
            },
          ],
        }),
      ],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    // The one safe address is the only anchor in the row, and it says its host.
    const row = within(rowOf(FIRST));
    expect(rowOf(FIRST).querySelectorAll("a")).toHaveLength(1);
    expect(row.getByRole("link", { name: "upper.example.com" })).toBeInTheDocument();
    // Every other source says so, has no anchor, and keeps its quote.
    expect(row.getAllByText("Unknown source")).toHaveLength(NOT_LINKS.length);
    NOT_LINKS.forEach((_url, index) => {
      const source = row.getByText(`quote ${index}`).parentElement as HTMLElement;
      expect(source.querySelector("a")).toBeNull();
      expect(within(source).getByText("Unknown source")).toBeInTheDocument();
    });
    expect(row.queryByText("example.com")).not.toBeInTheDocument();
    expect(row.queryByText("evil.example.com")).not.toBeInTheDocument();
  });

  it("renders a quote and the model's texts as plain text, never as markup", async () => {
    const quote = "<img src=x onerror=alert(1)>";
    // The action plan is copied into the register on accept: it is shown, and shown as text.
    const plan =
      '<img src=x onerror=alert(2)> javascript:alert(3) <a href="javascript:alert(4)">x</a>';
    const why = "<script>alert(5)</script> because <i>it</i> is likely";
    mocks.list.mockResolvedValue({
      rows: [
        finding({
          risk_description: "<b>Bold claim</b>",
          action_plan: plan,
          rationale: why,
          sources: [{ url: "https://news.example.com/a", title: "t", quote, published_at: null }],
        }),
      ],
      total: 1,
    });
    const { container } = renderSection();

    expect(await screen.findByText(quote)).toBeInTheDocument();
    expect(screen.getByText("<b>Bold claim</b>")).toBeInTheDocument();
    expect(screen.getByText(plan)).toBeInTheDocument();
    expect(screen.getByText(why)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(document.body.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("i")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    // The only link in the row is the source's own.
    const row = rowOf("<b>Bold claim</b>");
    expect(row.querySelectorAll("a")).toHaveLength(1);
    expect(row.querySelector("a")).toHaveAttribute("href", "https://news.example.com/a");
  });

  it("shows the action plan that accepting writes into the register, under its caption", async () => {
    mocks.list.mockResolvedValue({
      rows: [finding(), secondFinding({ action_plan: "Ask for the renewed certificate" })],
      total: 2,
    });
    renderSection();
    await screen.findByText(FIRST);

    const first = within(rowOf(FIRST));
    const caption = first.getByText("Action plan");
    const plan = first.getByText("Ask the vendor for its incident report");
    const follows = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    // The caption heads the plan, and both follow the texts that describe the risk.
    expect(follows(caption, plan)).toBe(true);
    expect(
      follows(first.getByText("Personal data of our customers could be exposed"), caption),
    ).toBe(true);
    // Each row has its own.
    const second = within(rowOf(SECOND));
    expect(second.getByText("Action plan")).toBeInTheDocument();
    expect(second.getByText("Ask for the renewed certificate")).toBeInTheDocument();
  });

  it("shows no caption for a finding that has no action plan", async () => {
    mocks.list.mockResolvedValue({ rows: [finding({ action_plan: "" })], total: 1 });
    renderSection();
    await screen.findByText(FIRST);

    expect(screen.queryByText("Action plan")).not.toBeInTheDocument();
  });

  it("shows why the finding was rated as it was, under the ratings and before the sources", async () => {
    mocks.list.mockResolvedValue({ rows: [finding(), secondFinding()], total: 2 });
    renderSection();
    await screen.findByText(FIRST);

    const first = within(rowOf(FIRST));
    const caption = first.getByText("Why this rating");
    const why = first.getByText("The vendor confirmed the breach, and customer data was involved.");
    const follows = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    // The ratings come first, then the reason for them, then where the finding comes from.
    expect(follows(first.getByText("Confidence"), caption)).toBe(true);
    expect(follows(caption, why)).toBe(true);
    expect(follows(why, first.getByText("Sources"))).toBe(true);
    // Each row has its own.
    const second = within(rowOf(SECOND));
    expect(second.getByText("Why this rating")).toBeInTheDocument();
    expect(
      second.getByText("A lapsed certificate is a gap in the audits, not an incident."),
    ).toBeInTheDocument();
  });

  it.each([null, "", "   "])(
    "shows no caption for a finding whose rationale is %j",
    async (rationale) => {
      mocks.list.mockResolvedValue({ rows: [finding({ rationale })], total: 1 });
      renderSection();
      await screen.findByText(FIRST);

      expect(screen.queryByText("Why this rating")).not.toBeInTheDocument();
    },
  );

  it("shows a finding that was stored before rationales existed", async () => {
    // The API sends null for the rows of older runs; the property can be absent in a cached list.
    const { rationale: _omitted, ...older } = finding();
    mocks.list.mockResolvedValue({ rows: [older as ReturnType<typeof finding>], total: 1 });
    renderSection();

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    expect(screen.queryByText("Why this rating")).not.toBeInTheDocument();
  });

  describe("a finding whose quotes no page confirmed", () => {
    const NOTICE = "Not confirmed on the page. The quotes come from search results.";

    it("says that the quotes come from search results, under the caption of the sources and before them", async () => {
      mocks.list.mockResolvedValue({
        rows: [finding({ snippet_only: true }), secondFinding()],
        total: 2,
      });
      renderSection();
      await screen.findByText(FIRST);

      const first = within(rowOf(FIRST));
      const follows = (a: HTMLElement, b: HTMLElement) =>
        Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      expect(follows(first.getByText("Sources"), first.getByText(NOTICE))).toBe(true);
      expect(
        follows(first.getByText(NOTICE), first.getByText("The vendor confirmed the incident.")),
      ).toBe(true);
      // The other finding rests on a page, or was not checked: it says nothing.
      expect(within(rowOf(SECOND)).queryByText(NOTICE)).not.toBeInTheDocument();
    });

    it.each([false, undefined])(
      "says nothing for a finding whose snippet_only is %s",
      async (snippetOnly) => {
        // The property can be absent in a list that was cached before it existed.
        mocks.list.mockResolvedValue({
          rows: [finding({ snippet_only: snippetOnly })],
          total: 1,
        });
        renderSection();
        await screen.findByText(FIRST);

        expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
      },
    );
  });

  it("says how many of the pending findings are shown when the server returned fewer", async () => {
    mocks.list.mockResolvedValue({ rows: [finding(), secondFinding()], total: 250 });
    renderSection();

    expect(
      await screen.findByText(
        "Showing 2 of 250 pending findings. Choose a vendor to see the rest.",
      ),
    ).toBeInTheDocument();
  });

  it("shows no such notice when everything pending is on screen", async () => {
    renderSection();
    await screen.findByText(FIRST);

    expect(screen.queryByText(/pending findings\. Choose a vendor/)).not.toBeInTheDocument();
  });

  it("asks the server for every pending finding it will send at once", async () => {
    renderSection();
    await screen.findByText(FIRST);

    expect(mocks.list).toHaveBeenCalledWith({ status: "pending", limit: 200 });
  });
});

describe("the credibility of a finding", () => {
  const follows = (a: HTMLElement, b: HTMLElement) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const KEV_LINE =
    "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-28001), as of 7 Oct 2026.";
  const NOTE = "Matched by name only: this may be another company.";
  /** A source the credibility rule put in a category, on a host of its own. */
  const sourceIn = (
    category: "official" | "trusted_press" | "vendor" | "unverified" | undefined,
    host: string,
    status?: "active" | "withdrawn" | "rejected" | "delisted",
  ) => ({
    url: `https://${host}/page`,
    title: host,
    quote: `A quote from ${host}`,
    published_at: null,
    ...(category === undefined ? {} : { category }),
    ...(status === undefined
      ? {}
      : {
          record: {
            source_id: "kev" as const,
            record_id: 41,
            status,
            match_strength: "strong" as const,
          },
        }),
  });

  it("shows the credibility chip, its rationale and no confidence chip", async () => {
    mocks.list.mockResolvedValue({ rows: [credibleFinding(), secondFinding()], total: 2 });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    const caption = row.getByText("Credibility");
    const chip = row.getByText("High");
    const line = row.getByText(KEV_LINE);
    expect(follows(caption, chip)).toBe(true);
    expect(follows(chip, line)).toBe(true);
    // The line comes before the model's reason for the likelihood and the severity.
    expect(follows(line, row.getByText("Why this rating"))).toBe(true);
    expect(row.queryByText("Confidence")).not.toBeInTheDocument();
    expect(row.queryByText("Medium")).not.toBeInTheDocument();
    // The screen words the line itself, in the person's language: the server's line is not shown.
    expect(row.queryByText("The server's own English line.")).not.toBeInTheDocument();
    // A finding of a run without the vendor risk database keeps its confidence.
    expect(within(rowOf(SECOND)).getByText("Confidence")).toBeInTheDocument();
    expect(within(rowOf(SECOND)).queryByText("Credibility")).not.toBeInTheDocument();
  });

  it("says when the copy of the list that a finding cites was out of date", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        credibleFinding({
          credibility_basis: {
            rule: "official_record",
            registry_version: "2026-10-29.1",
            name_only: false,
            sources: [{ ...KEV_RECORD, record: { ...KEV_RECORD.record!, stale: true } }],
          },
        }),
      ],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    expect(
      within(rowOf(FIRST)).getByText(
        `${KEV_LINE} The source has not been updated since 7 Oct 2026.`,
      ),
    ).toBeInTheDocument();
  });

  it("shows the name-only note when the basis says so", async () => {
    const ofac = {
      ...KEV_RECORD,
      url: "https://sanctionssearch.ofac.treas.gov/Details.aspx?id=29001",
      publisher: "ofac",
      record: {
        source: "ofac" as const,
        match: "weak" as const,
        status: "active" as const,
        source_record_id: "29001",
        as_of: "2026-10-10",
      },
    };
    mocks.list.mockResolvedValue({
      rows: [
        credibleFinding({
          credibility: "low",
          credibility_basis: {
            rule: "name_only",
            registry_version: "2026-10-29.1",
            name_only: true,
            sources: [ofac],
          },
        }),
        secondFinding({
          credibility: "high",
          credibility_basis: {
            rule: "official_record",
            registry_version: "2026-10-29.1",
            name_only: false,
            sources: [KEV_RECORD],
          },
        }),
      ],
      total: 2,
    });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    expect(row.getByText("Low")).toBeInTheDocument();
    const line = row.getByText("Low: the OFAC SDN list entry matches the vendor by name only.");
    const note = row.getByText(NOTE);
    expect(follows(line, note)).toBe(true);
    expect(within(rowOf(SECOND)).queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("a rejected CVE reads as rejected by the CVE Program", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        credibleFinding({
          credibility: "low",
          credibility_basis: {
            rule: "inactive",
            registry_version: "2026-10-29.1",
            name_only: false,
            sources: [
              {
                ...KEV_RECORD,
                record: {
                  ...KEV_RECORD.record!,
                  status: "rejected",
                  as_of: "2026-10-31",
                  rejected_by: "cve",
                },
              },
            ],
          },
        }),
      ],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    expect(row.getByText("Low")).toBeInTheDocument();
    expect(
      row.getByText("Low: the CVE Program rejected the record on 31 Oct 2026."),
    ).toBeInTheDocument();
    // The CISA catalog did not reject it: its entry only named a CVE the CVE Program rejected.
    expect(row.queryByText(/CISA Known Exploited Vulnerabilities/)).not.toBeInTheDocument();
  });

  it("an identifier match has no name-only note", async () => {
    // An entry of the UN list matched by the vendor's registration number: strong, not by name.
    const un = {
      ...KEV_RECORD,
      url: "https://records.example/un_sanctions/EXe.012",
      publisher: "un_sanctions",
      record: {
        source: "un_sanctions" as const,
        match: "strong" as const,
        status: "active" as const,
        source_record_id: "EXe.012",
        as_of: "2026-10-10",
      },
    };
    mocks.list.mockResolvedValue({
      rows: [
        credibleFinding({
          credibility_basis: {
            rule: "official_record",
            registry_version: "2026-10-29.1",
            name_only: false,
            sources: [un],
          },
        }),
      ],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    expect(row.getByText("High")).toBeInTheDocument();
    expect(
      row.getByText(
        "High: UN Security Council Consolidated List lists it (EXe.012), as of 10 Oct 2026.",
      ),
    ).toBeInTheDocument();
    expect(row.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("puts a badge before each source's host", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        credibleFinding({
          sources: [
            sourceIn("official", "sec.gov"),
            sourceIn("trusted_press", "reuters.com"),
            sourceIn("vendor", "status.acme.example"),
            sourceIn("unverified", "forum.example"),
            // A source the credibility rule did not see, as in a finding of an older run.
            sourceIn(undefined, "news.example.com"),
            sourceIn("mystery" as never, "odd.example"),
          ],
        }),
      ],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    for (const [badge, host] of [
      ["Official", "sec.gov"],
      ["Trusted press", "reuters.com"],
      ["Vendor", "status.acme.example"],
      ["Unverified", "forum.example"],
    ]) {
      // The badge is the element just before the host's link, in the line of the source.
      expect(row.getByText(badge).nextElementSibling).toContainElement(
        row.getByRole("link", { name: host }),
      );
    }
    for (const host of ["news.example.com", "odd.example"]) {
      const link = row.getByRole("link", { name: host });
      expect(link.closest("[data-vw-no-translate]")?.previousElementSibling ?? null).toBeNull();
    }
  });

  it("shows an inactive record's status", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        credibleFinding({
          sources: [
            sourceIn("official", "a.example", "withdrawn"),
            sourceIn("official", "b.example", "rejected"),
            sourceIn("official", "c.example", "delisted"),
            sourceIn("official", "d.example", "active"),
            sourceIn("official", "e.example", "revoked" as never),
          ],
        }),
      ],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    for (const [status, host] of [
      ["Withdrawn", "a.example"],
      ["Rejected", "b.example"],
      ["Delisted", "c.example"],
    ]) {
      expect(follows(row.getByRole("link", { name: host }), row.getByText(status))).toBe(true);
    }
    expect(row.queryByText("Active")).not.toBeInTheDocument();
    expect(row.queryByText("revoked")).not.toBeInTheDocument();
  });

  it("a finding without credibility keeps the confidence chip", async () => {
    mocks.list.mockResolvedValue({
      rows: [finding(), secondFinding({ credibility: null, credibility_basis: null })],
      total: 2,
    });
    renderSection();
    await screen.findByText(FIRST);

    for (const [text, confidence] of [
      [FIRST, "Medium"],
      [SECOND, "High"],
    ]) {
      const row = within(rowOf(text));
      expect(row.getByText("Confidence")).toBeInTheDocument();
      expect(row.getByText(confidence)).toBeInTheDocument();
      expect(row.queryByText("Credibility")).not.toBeInTheDocument();
    }
  });

  it("keeps the confidence chip for a label it does not know", async () => {
    mocks.list.mockResolvedValue({
      rows: [credibleFinding({ credibility: "certain" as never })],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    expect(row.getByText("Confidence")).toBeInTheDocument();
    expect(row.queryByText("Credibility")).not.toBeInTheDocument();
    expect(row.queryByText(KEV_LINE)).not.toBeInTheDocument();
  });

  it("shows the chip and no line for a rule it does not know", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        credibleFinding({
          credibility_basis: {
            rule: "mystery" as never,
            registry_version: "2026-10-29.1",
            name_only: false,
            sources: [KEV_RECORD],
          },
        }),
      ],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    expect(row.getByText("Credibility")).toBeInTheDocument();
    expect(row.getByText("High")).toBeInTheDocument();
    expect(row.queryByText(/^High:/)).not.toBeInTheDocument();
  });
});

describe("a label the backfill wrote (M3)", () => {
  it("a finding rated with the earlier confidence rule shows its label and the note, and no source badge", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        finding({
          status: "accepted",
          credibility: "medium",
          credibility_basis: { rule: "legacy_confidence" },
        }),
      ],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    expect(row.getByText("Credibility")).toBeInTheDocument();
    expect(row.getByText("Medium")).toBeInTheDocument();
    expect(row.getByText("Rated with the earlier confidence rule.")).toBeInTheDocument();
    expect(row.queryByText("Confidence")).not.toBeInTheDocument();
    // Its sources are those of a run before the rule: none has a category.
    for (const badge of ["Official", "Trusted press", "Vendor", "Unverified"]) {
      expect(row.queryByText(badge)).not.toBeInTheDocument();
    }
  });

  it("a finding the backfill rated again shows the rule's line, then the note", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        credibleFinding({
          credibility_basis: {
            rule: "backfill_official_record",
            registry_version: "2026-10-29.1",
            name_only: false,
            sources: [KEV_RECORD],
          },
        }),
      ],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    expect(
      within(rowOf(FIRST)).getByText(
        "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-28001), as of 7 Oct 2026. Rated again with the current rule.",
      ),
    ).toBeInTheDocument();
  });

  it("a finding the backfill rated again shows each source's badge from its basis", async () => {
    const NEWS = "https://www.reuters.com/technology/acme-breach";
    mocks.list.mockResolvedValue({
      rows: [
        credibleFinding({
          credibility_basis: {
            rule: "backfill_official_record",
            registry_version: "2026-10-29.1",
            name_only: false,
            sources: [
              KEV_RECORD,
              {
                url: NEWS,
                category: "trusted_press",
                publisher: "reuters",
                entry: "P1",
                reviewed: true,
                reading: "read",
              },
              {
                url: "https://other.example/notice",
                category: "official",
                publisher: "other",
                entry: null,
                reviewed: false,
                reading: "read",
              },
            ],
          },
          // The backfill writes the label and its basis only: the sources stay as the run stored them.
          sources: [
            {
              url: KEV_RECORD.url,
              title: "CVE-2026-28001",
              quote: "LarkOS contains a command injection vulnerability.",
              published_at: "2026-09-02",
            },
            { url: NEWS, title: "Acme breach", quote: "Acme was breached.", published_at: null },
            // The basis holds another address at this place: no badge.
            {
              url: "https://forum.example/thread",
              title: "A thread",
              quote: "Acme lost data.",
              published_at: null,
            },
          ],
        }),
      ],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    for (const [badge, host] of [
      ["Official", "www.cisa.gov"],
      ["Trusted press", "www.reuters.com"],
    ]) {
      expect(row.getByText(badge).nextElementSibling).toContainElement(
        row.getByRole("link", { name: host }),
      );
    }
    const forum = row.getByRole("link", { name: "forum.example" });
    expect(forum.closest("[data-vw-no-translate]")?.previousElementSibling ?? null).toBeNull();
  });
});

describe("a role that cannot edit risks", () => {
  it("sees the findings and the run, but no Preview, Dismiss or Research again", async () => {
    role.canEdit = false;
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    expect(await screen.findByText("Security incidents: risks found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Research again" })).not.toBeInTheDocument();
  });
});

describe("accepting a finding", () => {
  it("sends the finding's id with what the form saved, then says so and offers to open the risk", async () => {
    acceptsAndLeavesOnlyTheSecond();
    const { onNotify, onOpenRisk } = renderSection();
    await screen.findByText(FIRST);

    await accept(FIRST);

    // The form saved the finding as it opened: the owner is the person adding the risk (the
    // vendor has no assignee), the level is the form's own, and the vendor is not sent.
    await waitFor(() =>
      expect(mocks.accept).toHaveBeenCalledWith(1, {
        action_owner: 4,
        risk_description: "Customer data was exposed in a breach",
        impact_description: "Personal data of our customers could be exposed",
        action_plan: "Ask the vendor for its incident report",
        likelihood: "Likely",
        risk_severity: "Major",
        risk_level: "High risk",
        frameworks: [],
      }),
    );
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith({
        variant: "success",
        body: "Risk added to the register",
      }),
    );
    // The row is gone, and the notice that takes its place links to the new risk.
    await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
    const notice = noticeOf(await screen.findByText("Risk added to the register."));
    await userEvent.click(within(notice).getByRole("button", { name: "Open risk" }));
    expect(onOpenRisk).toHaveBeenCalledWith(77);
  });

  it("closes the notice with its close button", async () => {
    acceptsAndLeavesOnlyTheSecond();
    renderSection();
    await screen.findByText(FIRST);
    await accept(FIRST);
    const notice = noticeOf(await screen.findByText("Risk added to the register."));

    await userEvent.click(within(notice).getByRole("button", { name: "Close" }));

    expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument();
  });

  it("gives the buttons of the notice the house control height of 30px", async () => {
    acceptsAndLeavesOnlyTheSecond();
    renderSection();
    await screen.findByText(FIRST);
    await accept(FIRST);
    const notice = within(noticeOf(await screen.findByText("Risk added to the register.")));

    expect(notice.getByRole("button", { name: "Open risk" })).toHaveStyle({ height: "30px" });
    expect(notice.getByRole("button", { name: "Close" })).toHaveStyle({
      height: "30px",
      width: "30px",
    });
  });

  it("keeps the section and the notice open after the last pending finding is accepted", async () => {
    mocks.list.mockResolvedValue({ rows: [finding()], total: 1 });
    mocks.accept.mockImplementation(async () => {
      mocks.list.mockResolvedValue({ rows: [], total: 0 });
      return { finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() };
    });
    renderSection();
    await screen.findByText(FIRST);

    await accept(FIRST);

    expect(await screen.findByText("Risk added to the register.")).toBeInTheDocument();
    expect(header()).toHaveAttribute("aria-expanded", "true");
  });

  it("points the notice at the newest accepted risk", async () => {
    mocks.accept.mockImplementation(async (id) => {
      mocks.list.mockResolvedValue({
        rows: id === 1 ? [secondFinding()] : [],
        total: id === 1 ? 1 : 0,
      });
      return {
        finding: finding({ id, status: "accepted" }),
        vendorRisk: acceptedRisk({ id: id === 1 ? 77 : 78 }),
      };
    });
    const { onOpenRisk } = renderSection();
    await screen.findByText(FIRST);
    await accept(FIRST);
    await screen.findByText("Risk added to the register.");
    await accept(SECOND);
    await waitFor(() => expect(screen.queryByText(SECOND)).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Open risk" }));

    expect(onOpenRisk).toHaveBeenCalledTimes(1);
    expect(onOpenRisk).toHaveBeenCalledWith(78);
  });

  it("drops the notice when another vendor is chosen", async () => {
    acceptsAndLeavesOnlyTheSecond();
    renderSection();
    await screen.findByText(FIRST);
    await accept(FIRST);
    await screen.findByText("Risk added to the register.");

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Zeta Labs" }));

    await waitFor(() =>
      expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument(),
    );
  });

  it("drops the notice when a finding is dismissed", async () => {
    acceptsAndLeavesOnlyTheSecond();
    mocks.dismiss.mockResolvedValue(secondFinding({ status: "dismissed" }));
    renderSection();
    await screen.findByText(FIRST);
    await accept(FIRST);
    await screen.findByText("Risk added to the register.");

    await userEvent.click(within(rowOf(SECOND)).getByRole("button", { name: "Dismiss" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Other" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));

    await waitFor(() =>
      expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument(),
    );
  });

  it("drops the notice as the next accept starts, so a refused accept leaves no old notice", async () => {
    const second = deferred<{
      finding: ReturnType<typeof finding>;
      vendorRisk: ReturnType<typeof acceptedRisk>;
    }>();
    mocks.accept.mockImplementation(async (id) => {
      if (id !== 1) return second.promise;
      mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
      return { finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() };
    });
    renderSection();
    await screen.findByText(FIRST);
    await accept(FIRST);
    await screen.findByText("Risk added to the register.");

    await accept(SECOND);

    // Gone as the request leaves, while it is still on its way...
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument();
    // ...and it does not come back when that request is refused.
    await act(async () => {
      second.reject(refusal(409, "Finding already accepted"));
    });
    await waitFor(() =>
      expect(within(rowOf(SECOND)).getByRole("button", { name: "Preview" })).toBeEnabled(),
    );
    expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument();
  });

  it("drops the notice as the next dismissal is sent, so a refused one leaves no old notice", async () => {
    acceptsAndLeavesOnlyTheSecond();
    const pending = deferred<ReturnType<typeof finding>>();
    mocks.dismiss.mockReturnValue(pending.promise);
    renderSection();
    await screen.findByText(FIRST);
    await accept(FIRST);
    await screen.findByText("Risk added to the register.");
    await userEvent.click(within(rowOf(SECOND)).getByRole("button", { name: "Dismiss" }));
    const dialog = await screen.findByRole("dialog", { name: "Dismiss finding" });
    await userEvent.click(within(dialog).getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Other" }));

    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));

    // Gone as the request leaves, while it is still on its way...
    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument();
    // ...and it does not come back when that request is refused.
    await act(async () => {
      pending.reject(refusal(409, "Finding already dismissed"));
    });
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Dismiss" })).toBeEnabled(),
    );
    expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument();
  });

  it("says nothing more when the accept fails, since the global toast reports it", async () => {
    mocks.accept.mockRejectedValue(refusal(409, "Finding already accepted"));
    const { onNotify } = renderSection();
    await screen.findByText(FIRST);

    await accept(FIRST);

    await waitFor(() => expect(mocks.accept).toHaveBeenCalled());
    // The row is usable again, and no notice or alert was made up.
    await waitFor(() =>
      expect(within(rowOf(FIRST)).getByRole("button", { name: "Preview" })).toBeEnabled(),
    );
    expect(onNotify).not.toHaveBeenCalled();
    expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument();
  });

  it("shows which row is busy, disabling both of its buttons and no one else's", async () => {
    const pending = deferred<{
      finding: ReturnType<typeof finding>;
      vendorRisk: ReturnType<typeof acceptedRisk>;
    }>();
    mocks.accept.mockReturnValue(pending.promise);
    renderSection();
    await screen.findByText(FIRST);

    await accept(FIRST);

    await waitFor(() =>
      expect(within(rowOf(FIRST)).getByRole("button", { name: "Dismiss" })).toBeDisabled(),
    );
    expect(within(rowOf(FIRST)).getByRole("button", { name: "Preview" })).toBeDisabled();
    expect(within(rowOf(SECOND)).getByRole("button", { name: "Preview" })).toBeEnabled();
    expect(within(rowOf(SECOND)).getByRole("button", { name: "Dismiss" })).toBeEnabled();
  });

  it("keeps tracking a row while another is accepted at the same time", async () => {
    const first = deferred<{
      finding: ReturnType<typeof finding>;
      vendorRisk: ReturnType<typeof acceptedRisk>;
    }>();
    const second = deferred<{
      finding: ReturnType<typeof finding>;
      vendorRisk: ReturnType<typeof acceptedRisk>;
    }>();
    mocks.accept.mockImplementation((id) => (id === 1 ? first.promise : second.promise));
    renderSection();
    await screen.findByText(FIRST);

    // The form does not hold the person while the request is on its way: closing it leaves the
    // request running, and the next finding can be saved too.
    const firstForm = await openPreview(FIRST);
    await clickSave(firstForm);
    await closeForm(firstForm);
    await accept(SECOND);
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledTimes(2));

    mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
    await act(async () => {
      first.resolve({ finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() });
    });

    await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
    // The second accept is still in flight, so its row is still busy.
    expect(within(rowOf(SECOND)).getByRole("button", { name: "Preview" })).toBeDisabled();
    expect(within(rowOf(SECOND)).getByRole("button", { name: "Dismiss" })).toBeDisabled();
  });
});

describe("previewing a finding", () => {
  const valuesOf = (dialog: HTMLElement) =>
    JSON.parse(within(dialog).getByLabelText("Values of the draft").textContent ?? "{}");

  it("opens the vendor risk form on the finding and sends nothing until the form is saved", async () => {
    const { onNotify } = renderSection();
    await screen.findByText(FIRST);

    const dialog = await openPreview();

    expect(within(dialog).getByText("Review suggested risk")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Suggested by the research agent from web sources. Check the details, change what is not right, then save to add this risk to the vendor risk register.",
      ),
    ).toBeInTheDocument();
    expect(valuesOf(dialog)).toEqual({
      vendor_id: 7,
      risk_description: "Customer data was exposed in a breach",
      impact_description: "Personal data of our customers could be exposed",
      action_plan: "Ask the vendor for its incident report",
      likelihood: "Likely",
      risk_severity: "Major",
      action_owner: 4,
    });
    expect(mocks.accept).not.toHaveBeenCalled();
    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it("opens the form on the finding of the row that was clicked", async () => {
    mocks.list.mockResolvedValue({ rows: [finding(), secondFinding({ vendor_id: 8 })], total: 2 });
    renderSection();
    await screen.findByText(FIRST);

    const dialog = await openPreview(SECOND);

    expect(valuesOf(dialog)).toMatchObject({
      vendor_id: 8,
      risk_description: "The ISO 27001 certificate has lapsed",
      likelihood: "Possible",
      risk_severity: "Moderate",
    });
  });

  it("closes without adding anything, and the finding stays pending", async () => {
    const { onNotify } = renderSection();
    await screen.findByText(FIRST);
    const dialog = await openPreview();

    await closeForm(dialog);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.accept).not.toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalled();
    expect(screen.getByText(FIRST)).toBeInTheDocument();
    expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument();
    expect(within(rowOf(FIRST)).getByRole("button", { name: "Preview" })).toBeEnabled();
  });

  it("keeps the notice of an earlier risk when a preview is closed without saving", async () => {
    mocks.accept.mockImplementation(async () => {
      mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
      return { finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() };
    });
    renderSection();
    await screen.findByText(FIRST);
    await accept(FIRST);
    await screen.findByText("Risk added to the register.");

    await closeForm(await openPreview(SECOND));

    expect(screen.getByText("Risk added to the register.")).toBeInTheDocument();
  });

  describe("the owner the form starts on", () => {
    it("is the vendor's assignee when that user belongs to the organization", async () => {
      renderSection({ vendors: [{ id: 7, vendor_name: "Acme Cloud", assignee: 9 }] });
      await screen.findByText(FIRST);

      const dialog = await openPreview();

      expect(valuesOf(dialog).action_owner).toBe(9);
    });

    it("is the person adding the risk when the assignee is not a user of the organization", async () => {
      renderSection({ vendors: [{ id: 7, vendor_name: "Acme Cloud", assignee: 77 }] });
      await screen.findByText(FIRST);

      const dialog = await openPreview();

      expect(valuesOf(dialog).action_owner).toBe(4);
    });

    it("is the person adding the risk when the finding's vendor is not in the page's list", async () => {
      renderSection({ vendors: [{ id: 8, vendor_name: "Zeta Labs", assignee: 9 }] });
      await screen.findByText(FIRST);

      const dialog = await openPreview();

      expect(valuesOf(dialog).action_owner).toBe(4);
    });
  });

  describe("saving the form", () => {
    it("accepts the finding with the values the person left on screen", async () => {
      formEdits.current = {
        risk_description: "A breach exposed customer records",
        action_plan: "Review the vendor's controls every quarter",
        likelihood: "Almost certain",
        risk_severity: "Catastrophic",
        risk_level: "Very high risk",
        action_owner: "9",
        frameworks: [11, 12],
        // The form shows the vendor but does not change it; the server ignores it anyway.
        vendor_id: 99,
      };
      acceptsAndLeavesOnlyTheSecond();
      renderSection();
      await screen.findByText(FIRST);

      await accept(FIRST);

      await waitFor(() => expect(mocks.accept).toHaveBeenCalledTimes(1));
      expect(mocks.accept).toHaveBeenCalledWith(1, {
        action_owner: 9,
        risk_description: "A breach exposed customer records",
        impact_description: "Personal data of our customers could be exposed",
        action_plan: "Review the vendor's controls every quarter",
        likelihood: "Almost certain",
        risk_severity: "Catastrophic",
        risk_level: "Very high risk",
        frameworks: [11, 12],
      });
      expect(mocks.accept.mock.calls[0][1]).not.toHaveProperty("vendor_id");
    });

    it("closes the form, and the row is gone, once the risk is added", async () => {
      acceptsAndLeavesOnlyTheSecond();
      renderSection();
      await screen.findByText(FIRST);

      await accept(FIRST);

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
      expect(screen.getByText(SECOND)).toBeInTheDocument();
    });

    it("keeps the form open, with its values, when the request fails, and the row can be used again", async () => {
      mocks.accept.mockRejectedValueOnce(refusal(500));
      const { onNotify } = renderSection();
      await screen.findByText(FIRST);
      const dialog = await openPreview();

      await clickSave(dialog);

      await waitFor(() => expect(mocks.accept).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(
          within(rowOf(FIRST)).getByRole("button", { name: "Preview", hidden: true }),
        ).toBeEnabled(),
      );
      // The global toast reports a 500; the section adds nothing, and the form is still there.
      expect(onNotify).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Review suggested risk" })).toBeInTheDocument();
      expect(valuesOf(dialog).risk_description).toBe("Customer data was exposed in a breach");

      // The person can save again.
      acceptsAndLeavesOnlyTheSecond();
      await clickSave(dialog);
      await waitFor(() => expect(mocks.accept).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("warns, and closes the form, when the finding no longer exists (404)", async () => {
      mocks.accept.mockImplementation(async () => {
        mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
        throw refusal(404, "Finding not found");
      });
      const { onNotify } = renderSection();
      await screen.findByText(FIRST);

      await accept(FIRST);

      await waitFor(() =>
        expect(onNotify).toHaveBeenCalledWith({
          variant: "warning",
          body: "This finding no longer exists.",
        }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
      await waitFor(() => expect(document.activeElement).toBe(firstButtonOf(SECOND)));
    });

    it("closes the form when a 409 says the finding was decided elsewhere and it has left the list", async () => {
      mocks.accept.mockImplementation(async () => {
        mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
        throw refusal(409, "This finding has already been accepted or dismissed");
      });
      const { onNotify } = renderSection();
      await screen.findByText(FIRST);

      await accept(FIRST);

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      // The global toast explains a 409; the section adds no message of its own.
      expect(onNotify).not.toHaveBeenCalled();
    });

    it("keeps the form open when a 409 leaves the finding pending (another decision is in progress)", async () => {
      mocks.accept.mockRejectedValueOnce(refusal(409, "refused"));
      renderSection();
      await screen.findByText(FIRST);
      const dialog = await openPreview();

      await clickSave(dialog);

      await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(screen.getByRole("dialog", { name: "Review suggested risk" })).toBeInTheDocument();
      expect(screen.getByText(FIRST)).toBeInTheDocument();
    });

    it("disables both buttons of the row while the request is on its way", async () => {
      const pending = deferred<{
        finding: ReturnType<typeof finding>;
        vendorRisk: ReturnType<typeof acceptedRisk>;
      }>();
      mocks.accept.mockReturnValue(pending.promise);
      renderSection();
      await screen.findByText(FIRST);
      const dialog = await openPreview();
      await clickSave(dialog);

      await waitFor(() => expect(mocks.accept).toHaveBeenCalledTimes(1));
      // The form hides the rows from the accessibility tree while it is open.
      const row = within(rowOf(FIRST));
      expect(row.getByRole("button", { name: "Preview", hidden: true })).toBeDisabled();
      expect(row.getByRole("button", { name: "Dismiss", hidden: true })).toBeDisabled();
    });
  });
});

describe("keyboard and screen reader use of the rows", () => {
  /** The server's answer to a decision: the list from now on is these rows. */
  const listFromNowOn = (rows: Array<ReturnType<typeof finding>>) =>
    mocks.list.mockResolvedValue({ rows, total: rows.length });
  const accepts = (remaining: Array<ReturnType<typeof finding>>) =>
    mocks.accept.mockImplementation(async () => {
      listFromNowOn(remaining);
      return { finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() };
    });
  const dismisses = (remaining: Array<ReturnType<typeof finding>>) =>
    mocks.dismiss.mockImplementation(async () => {
      listFromNowOn(remaining);
      return finding({ status: "dismissed" });
    });
  const dismissWithReason = async (text: string) => {
    const dialog = await openDismissal(text);
    await choose(dialog, "Other");
    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
  };
  const heading = () => screen.getByText("Research findings");

  it("describes the Preview and Dismiss buttons of a row by the risk they decide on", async () => {
    renderSection();
    await screen.findByText(FIRST);

    const ids: string[] = [];
    for (const text of [FIRST, SECOND]) {
      for (const name of ["Dismiss", "Preview"]) {
        const button = within(rowOf(text)).getByRole("button", { name });
        // A screen reader reads the risk after the name of the button.
        expect(button).toHaveAccessibleDescription(text);
        ids.push(button.getAttribute("aria-describedby") as string);
      }
    }
    // Both buttons of a row point at one element, and no two rows share it.
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).toBe(ids[3]);
    expect(ids[0]).not.toBe(ids[2]);
    expect(document.getElementById(ids[0])).toHaveTextContent(FIRST);
    expect(document.getElementById(ids[2])).toHaveTextContent(SECOND);
  });

  it("moves focus to the next row after an accept", async () => {
    accepts([secondFinding()]);
    renderSection();
    await screen.findByText(FIRST);

    await accept(FIRST);

    await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(firstButtonOf(SECOND)));
  });

  it("moves focus to the previous row when the last row is accepted", async () => {
    accepts([finding()]);
    renderSection();
    await screen.findByText(SECOND);

    await accept(SECOND);

    await waitFor(() => expect(screen.queryByText(SECOND)).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(firstButtonOf(FIRST)));
  });

  it("moves focus to the heading of the section when the last pending finding is accepted", async () => {
    mocks.list.mockResolvedValue({ rows: [finding()], total: 1 });
    accepts([]);
    renderSection();
    await screen.findByText(FIRST);

    await accept(FIRST);

    await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    // Not a stop of the tab order, only a place focus can be sent to.
    expect(heading()).toHaveAttribute("tabindex", "-1");
  });

  it("moves focus to the next row after a dismissal, once the modal has given focus back", async () => {
    dismisses([secondFinding()]);
    renderSection();
    await screen.findByText(FIRST);

    await dismissWithReason(FIRST);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(firstButtonOf(SECOND)));
  });

  it("moves focus to the previous row after the last row is dismissed", async () => {
    dismisses([finding()]);
    renderSection();
    await screen.findByText(SECOND);

    await dismissWithReason(SECOND);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(firstButtonOf(FIRST)));
  });

  it("moves focus to the heading when the last pending finding is dismissed", async () => {
    mocks.list.mockResolvedValue({ rows: [finding()], total: 1 });
    dismisses([]);
    renderSection();
    await screen.findByText(FIRST);

    await dismissWithReason(FIRST);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(heading()));
  });

  it("leaves focus where the user has put it meanwhile", async () => {
    const pending = deferred<{
      finding: ReturnType<typeof finding>;
      vendorRisk: ReturnType<typeof acceptedRisk>;
    }>();
    mocks.accept.mockReturnValue(pending.promise);
    renderSection();
    await screen.findByText(FIRST);
    await accept(FIRST);
    // While the request is on its way the user goes to the vendor filter.
    const filter = screen.getByRole("combobox");
    act(() => filter.focus());

    listFromNowOn([secondFinding()]);
    await act(async () => {
      pending.resolve({ finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() });
    });

    await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
    expect(document.activeElement).toBe(filter);
  });

  it("does not move focus when the accept fails and the row stays", async () => {
    mocks.accept.mockRejectedValue(refusal(500));
    renderSection();
    await screen.findByText(FIRST);
    await accept(FIRST);

    await waitFor(() =>
      expect(within(rowOf(FIRST)).getByRole("button", { name: "Preview" })).toBeEnabled(),
    );

    expect(screen.getByText(FIRST)).toBeInTheDocument();
    expect(document.activeElement).not.toBe(firstButtonOf(SECOND));
  });
});

describe("dismissing a finding", () => {
  it("opens a modal that cannot be submitted until a reason is chosen", async () => {
    renderSection();
    await screen.findByText(FIRST);

    const dialog = await openDismissal();

    expect(within(dialog).getByRole("button", { name: "Dismiss" })).toBeDisabled();
    expect(within(dialog).getByText(FIRST)).toBeInTheDocument();
    await choose(dialog, "Inaccurate or not supported by the sources");
    expect(within(dialog).getByRole("button", { name: "Dismiss" })).toBeEnabled();
  });

  it("offers the seven reasons, the two that name what the agent got wrong among them", async () => {
    renderSection();
    await screen.findByText(FIRST);
    const dialog = await openDismissal();

    await userEvent.click(within(dialog).getByRole("combobox"));

    expect(await optionNames()).toEqual([
      "Not applicable to this vendor",
      "Already covered by an existing risk",
      "Inaccurate or not supported by the sources",
      "Accepted risk",
      "The sources are about another company",
      "The sources are out of date",
      "Other",
    ]);
  });

  it.each([
    ["The sources are about another company", "wrong_vendor"],
    ["The sources are out of date", "outdated"],
  ])("sends the reason of %s as %s", async (label, reason) => {
    mocks.dismiss.mockResolvedValue(finding({ status: "dismissed" }));
    renderSection();
    await screen.findByText(FIRST);
    const dialog = await openDismissal();

    await choose(dialog, label);
    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledWith(1, { reason }));
  });

  it("sends the reason and the trimmed note, and closes on success", async () => {
    mocks.dismiss.mockImplementation(async () => {
      mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
      return finding({ status: "dismissed" });
    });
    renderSection();
    await screen.findByText(FIRST);
    const dialog = await openDismissal();
    await choose(dialog, "Inaccurate or not supported by the sources");
    await userEvent.type(within(dialog).getByRole("textbox"), "  Not about this vendor  ");

    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));

    await waitFor(() =>
      expect(mocks.dismiss).toHaveBeenCalledWith(1, {
        reason: "inaccurate",
        note: "Not about this vendor",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
  });

  it("leaves the note out when it is empty", async () => {
    mocks.dismiss.mockResolvedValue(finding({ status: "dismissed" }));
    renderSection();
    await screen.findByText(FIRST);
    const dialog = await openDismissal();
    await choose(dialog, "Other");
    await userEvent.type(within(dialog).getByRole("textbox"), "   ");

    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledWith(1, { reason: "other" }));
  });

  it("limits the note to 500 characters", async () => {
    renderSection();
    await screen.findByText(FIRST);
    const dialog = await openDismissal();

    const note = within(dialog).getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "x".repeat(600) } });

    expect(note.value).toHaveLength(500);
    expect(within(dialog).getByText("Up to 500 characters.")).toBeInTheDocument();
  });

  it("stays open when the dismissal fails, with what was entered", async () => {
    mocks.dismiss.mockRejectedValue(refusal(409, "Finding already dismissed"));
    renderSection();
    await screen.findByText(FIRST);
    const dialog = await openDismissal();
    await choose(dialog, "Accepted risk");

    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalled());
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Dismiss" })).toBeEnabled(),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox")).toHaveTextContent("Accepted risk");
  });

  it("keeps the submit and the buttons of the row disabled while the dismissal is in flight", async () => {
    const pending = deferred<ReturnType<typeof finding>>();
    mocks.dismiss.mockReturnValue(pending.promise);
    renderSection();
    await screen.findByText(FIRST);
    // The modal shows the finding's text too, so the rows are taken before it opens.
    const first = within(rowOf(FIRST));
    const second = within(rowOf(SECOND));
    const dialog = await openDismissal();
    await choose(dialog, "Other");

    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));

    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Dismiss" })).toBeDisabled(),
    );
    // The modal hides the rows from the accessibility tree.
    expect(first.getByRole("button", { name: "Dismiss", hidden: true })).toBeDisabled();
    expect(first.getByRole("button", { name: "Preview", hidden: true })).toBeDisabled();
    expect(second.getByRole("button", { name: "Preview", hidden: true })).toBeEnabled();
  });

  it("leaves the modal of another finding open when an earlier dismissal finishes", async () => {
    const earlier = deferred<ReturnType<typeof finding>>();
    mocks.dismiss.mockReturnValueOnce(earlier.promise);
    renderSection();
    await screen.findByText(FIRST);
    let dialog = await openDismissal(FIRST);
    await choose(dialog, "Other");
    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledTimes(1));
    // The modal does not hold the user while the request is on its way.
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    dialog = await openDismissal(SECOND);

    mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
    await act(async () => {
      earlier.resolve(finding({ status: "dismissed" }));
    });

    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    const open = await screen.findByRole("dialog", { name: "Dismiss finding" });
    expect(within(open).getByText(SECOND)).toBeInTheDocument();
  });

  it("closes without sending anything on Cancel, and starts empty the next time", async () => {
    renderSection();
    await screen.findByText(FIRST);
    let dialog = await openDismissal();
    await choose(dialog, "Other");

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    dialog = await openDismissal();

    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Dismiss" })).toBeDisabled();
  });

  // The server counts characters (code points), not UTF-16 units, and a cut through the middle of
  // an emoji would leave half of it, which the server stores as a replacement character.
  it.each([
    ["emoji only", "😀".repeat(520)],
    ["an emoji that starts at the 500th UTF-16 unit", `a${"😀".repeat(519)}`],
  ])("limits the note to 500 characters, not 500 UTF-16 units (%s)", async (_case, pasted) => {
    renderSection();
    await screen.findByText(FIRST);
    const dialog = await openDismissal();
    const note = within(dialog).getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(note, { target: { value: pasted } });

    expect(Array.from(note.value)).toHaveLength(500);
    expect(note.value).toBe(Array.from(pasted).slice(0, 500).join(""));
    // No half of an emoji at the end, or anywhere.
    expect(note.value).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
    );
  });

  it("says so, on the channel of the accept, once a finding is dismissed", async () => {
    mocks.dismiss.mockImplementation(async () => {
      mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
      return finding({ status: "dismissed" });
    });
    const { onNotify } = renderSection();
    await screen.findByText(FIRST);
    const dialog = await openDismissal();
    await choose(dialog, "Other");

    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith({ variant: "success", body: "Finding dismissed." }),
    );
    expect(onNotify).toHaveBeenCalledTimes(1);
  });

  it("says nothing of its own when a dismissal fails and the finding stays", async () => {
    mocks.dismiss.mockRejectedValue(refusal(500));
    const { onNotify } = renderSection();
    await screen.findByText(FIRST);
    const dialog = await openDismissal();
    await choose(dialog, "Other");

    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalled());
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Dismiss" })).toBeEnabled(),
    );
    expect(onNotify).not.toHaveBeenCalled();
  });
});

// A finding can be gone or decided elsewhere by the time this user acts on it. The contract
// answers 404 for a finding that no longer exists (the global error toast skips a 404 on purpose)
// and 409 for one that was decided, or while another decision on it is in progress.
describe("a finding that is gone or was decided elsewhere", () => {
  const firstIsGone = () => mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });

  /** Lets the modal's request fail, and the list from then on be the given rows. */
  const dismissFails = (status: number, remaining: Array<ReturnType<typeof finding>>) =>
    mocks.dismiss.mockImplementation(async () => {
      mocks.list.mockResolvedValue({ rows: remaining, total: remaining.length });
      throw refusal(status, "refused");
    });
  const submitReason = async (reason: string) => {
    const dialog = await openDismissal();
    await choose(dialog, reason);
    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    return dialog;
  };
  /** Time for the list to be read again and the section to act on it. */
  const letTheListSettle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

  it("warns that the finding no longer exists when accepting it answers 404", async () => {
    mocks.accept.mockImplementation(async () => {
      firstIsGone();
      throw refusal(404, "Finding not found");
    });
    const { onNotify } = renderSection();
    await screen.findByText(FIRST);

    await accept(FIRST);

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith({
        variant: "warning",
        body: "This finding no longer exists.",
      }),
    );
    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
  });

  it("warns, and closes the modal, when dismissing a finding that no longer exists (404)", async () => {
    dismissFails(404, [secondFinding()]);
    const { onNotify } = renderSection();
    await screen.findByText(FIRST);

    await submitReason("Other");

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith({
        variant: "warning",
        body: "This finding no longer exists.",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
    // Keyboard focus is not left on the page behind: it goes to the row that took its place.
    await waitFor(() => expect(document.activeElement).toBe(firstButtonOf(SECOND)));
  });

  it("closes the modal when a 409 says the finding was decided elsewhere and it has left the list", async () => {
    dismissFails(409, [secondFinding()]);
    const { onNotify } = renderSection();
    await screen.findByText(FIRST);

    await submitReason("Other");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // The global toast explains a 409; the section adds no message of its own.
    expect(onNotify).not.toHaveBeenCalled();
  });

  it("keeps the modal open, with what was entered, when a 409 leaves the finding pending", async () => {
    // The 409 of the lock "another decision is in progress": a retry can succeed.
    dismissFails(409, [finding(), secondFinding()]);
    const { onNotify } = renderSection();
    await screen.findByText(FIRST);
    const dialog = await openDismissal();
    await choose(dialog, "Accepted risk");
    await userEvent.type(within(dialog).getByRole("textbox"), "Accepted by the board");

    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));

    // The list was read again after the failure, and the finding is still on it.
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Dismiss" })).toBeEnabled(),
    );
    await letTheListSettle();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox")).toHaveTextContent("Accepted risk");
    expect(within(dialog).getByRole("textbox")).toHaveValue("Accepted by the board");
    expect(onNotify).not.toHaveBeenCalled();

    // And the retry goes through.
    mocks.dismiss.mockResolvedValue(finding({ status: "dismissed" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledTimes(2));
  });

  it("does not close a modal that belongs to another finding", async () => {
    // The first dismissal fails and its finding is gone, but the user has opened the second one.
    const answer = deferred<ReturnType<typeof finding>>();
    mocks.dismiss.mockReturnValueOnce(answer.promise);
    renderSection();
    await screen.findByText(FIRST);
    const first = await openDismissal(FIRST);
    await choose(first, "Other");
    await userEvent.click(within(first).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledTimes(1));
    await userEvent.click(within(first).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await openDismissal(SECOND);

    firstIsGone();
    await act(async () => {
      answer.reject(refusal(404, "Finding not found"));
    });
    await letTheListSettle();

    const open = screen.getByRole("dialog", { name: "Dismiss finding" });
    expect(within(open).getByText(SECOND)).toBeInTheDocument();
  });

  // Two decisions can be answered while the list is being read again. The read that the second
  // answer starts cancels the first's, and both calls settle on the last read, in one flush: the
  // section sees both answers at once, and keeps a single marker of an answered decision.
  describe("two decisions answered while the list is being read again", () => {
    const THIRD = "The vendor does not publish a list of its sub-processors";
    const thirdFinding = () =>
      finding({ id: 3, category: "legal_regulatory", risk_description: THIRD });

    /**
     * Decides the first finding, its request held, and hands back what answers it. A dismissal
     * leaves no modal behind: the user cancels it while the request is on its way, as they may.
     */
    const decideFirst = async (kind: "dismissal" | "accept") => {
      if (kind === "accept") {
        const answer = deferred<{
          finding: ReturnType<typeof finding>;
          vendorRisk: ReturnType<typeof acceptedRisk>;
        }>();
        mocks.accept.mockReturnValueOnce(answer.promise);
        const saved = await openPreview(FIRST);
        await clickSave(saved);
        await waitFor(() => expect(mocks.accept).toHaveBeenCalledTimes(1));
        // As with a dismissal, the form is closed while the request is on its way.
        await closeForm(saved);
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        return () =>
          answer.resolve({ finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() });
      }
      const answer = deferred<ReturnType<typeof finding>>();
      mocks.dismiss.mockReturnValueOnce(answer.promise);
      const dialog = await openDismissal(FIRST);
      await choose(dialog, "Other");
      await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
      await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledTimes(1));
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      return () => answer.resolve(finding({ status: "dismissed" }));
    };

    it.each([
      {
        name: "a dismissal answered before the modal's refusal",
        kind: "dismissal",
        firstFirst: true,
      },
      {
        name: "a dismissal answered after the modal's refusal",
        kind: "dismissal",
        firstFirst: false,
      },
      { name: "an accept answered before the modal's refusal", kind: "accept", firstFirst: true },
      { name: "an accept answered after the modal's refusal", kind: "accept", firstFirst: false },
    ] as const)(
      "closes the modal of a finding that is gone, whichever answer lands last: $name",
      async ({ kind, firstFirst }) => {
        mocks.list.mockResolvedValue({
          rows: [finding(), secondFinding(), thirdFinding()],
          total: 3,
        });
        const { onNotify } = renderSection();
        await screen.findByText(FIRST);
        const answerFirst = await decideFirst(kind);
        // The second finding's modal is submitted, and its request is held too.
        const refusalOfSecond = deferred<ReturnType<typeof finding>>();
        mocks.dismiss.mockReturnValueOnce(refusalOfSecond.promise);
        const dialog = await openDismissal(SECOND);
        await choose(dialog, "Other");
        await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
        await waitFor(() =>
          expect(mocks.dismiss).toHaveBeenCalledTimes(kind === "dismissal" ? 2 : 1),
        );
        // From here on every read of the list waits for one answer, which has neither finding.
        const list = deferred<{ rows: Array<ReturnType<typeof finding>>; total: number }>();
        mocks.list.mockImplementation(() => list.promise);

        const answerSecond = () =>
          act(async () => {
            refusalOfSecond.reject(refusal(404, "Finding not found"));
          });
        if (firstFirst) {
          await act(async () => answerFirst());
          await answerSecond();
        } else {
          await answerSecond();
          await act(async () => answerFirst());
        }
        // Both answers wait for the list: the first read was cancelled by the second.
        await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(3));
        await act(async () => {
          list.resolve({ rows: [thirdFinding()], total: 1 });
        });
        await letTheListSettle();

        // The scene is as meant: the list was read again, and the refusal was announced.
        const rows = screen.getByRole("list", { name: "Pending research findings", hidden: true });
        expect(within(rows).getByText(THIRD)).toBeInTheDocument();
        expect(within(rows).queryByText(FIRST)).not.toBeInTheDocument();
        expect(within(rows).queryByText(SECOND)).not.toBeInTheDocument();
        expect(onNotify).toHaveBeenCalledWith({
          variant: "warning",
          body: "This finding no longer exists.",
        });
        // The second finding is gone, so the modal about it has nothing left to decide.
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        // And keyboard focus still goes to the row that is left.
        await waitFor(() => expect(document.activeElement).toBe(firstButtonOf(THIRD)));
      },
    );

    it("leaves the modal of a finding that is gone alone while its own request is on its way, then closes it", async () => {
      renderSection();
      await screen.findByText(FIRST);
      const answerFirst = await decideFirst("dismissal");
      const answerOfSecond = deferred<ReturnType<typeof finding>>();
      mocks.dismiss.mockReturnValueOnce(answerOfSecond.promise);
      const dialog = await openDismissal(SECOND);
      await choose(dialog, "Other");
      await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
      await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledTimes(2));
      // The first finding is dismissed, and the second was decided elsewhere meanwhile: the list
      // read after the first answer has neither.
      mocks.list.mockResolvedValue({ rows: [], total: 0 });

      await act(async () => answerFirst());
      await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
      await letTheListSettle();

      // The list says the second finding is gone, but the request about it has no answer yet:
      // the modal waits for that answer, which is the only one that can say what became of it.
      expect(screen.getByText("No pending research findings.")).toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "Dismiss finding" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Dismiss" })).toBeDisabled();

      await act(async () => {
        answerOfSecond.reject(refusal(409, "Finding already dismissed"));
      });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
  });
});

describe("the vendor filter", () => {
  it("lists all vendors first, then the vendors by name", async () => {
    renderSection();
    await screen.findByText(FIRST);

    await userEvent.click(screen.getByRole("combobox"));

    expect(await optionNames()).toEqual(["All vendors", "Acme Cloud", "Zeta Labs"]);
  });

  it("starts on all vendors", async () => {
    renderSection();
    await screen.findByText(FIRST);

    expect(screen.getByRole("combobox")).toHaveTextContent("All vendors");
    expect(screen.queryByText("Latest research")).not.toBeInTheDocument();
  });

  it("preselects the vendor named in the URL and asks for that vendor's findings", async () => {
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("Acme Cloud");
    expect(mocks.list).toHaveBeenCalledWith({ status: "pending", vendorId: 7, limit: 200 });
    expect(mocks.latest).toHaveBeenCalledWith(7);
  });

  it("treats a URL value that is not a vendor id as all vendors", async () => {
    renderSection({ route: "/vendors/risks?findingsVendorId=abc" });
    await screen.findByText(FIRST);

    expect(screen.getByRole("combobox")).toHaveTextContent("All vendors");
    expect(mocks.list).toHaveBeenCalledWith({ status: "pending", limit: 200 });
    expect(mocks.latest).not.toHaveBeenCalled();
  });

  it("still offers a vendor from the URL that the page's own list does not have", async () => {
    renderSection({ route: "/vendors/risks?findingsVendorId=99" });
    await screen.findByText(FIRST);

    expect(screen.getByRole("combobox")).toHaveTextContent("Vendor 99");
    expect(mocks.list).toHaveBeenCalledWith({ status: "pending", vendorId: 99, limit: 200 });
  });

  it("asks for the chosen vendor's findings, and for all of them again", async () => {
    renderSection();
    await screen.findByText(FIRST);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Zeta Labs" }));
    await waitFor(() =>
      expect(mocks.list).toHaveBeenLastCalledWith({ status: "pending", vendorId: 8, limit: 200 }),
    );
    expect(await screen.findByText("Latest research")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "All vendors" }));
    await waitFor(() =>
      expect(mocks.list).toHaveBeenLastCalledWith({ status: "pending", limit: 200 }),
    );
    await waitFor(() => expect(screen.queryByText("Latest research")).not.toBeInTheDocument());
  });
});

/**
 * What a notification link does when the section is already on screen: it changes the URL and
 * nothing else. This button stands in for the link.
 */
function FollowLink({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>Follow link</button>;
}

describe("a link that arrives while the section is on screen", () => {
  const renderWithLink = (route: string, to: string) =>
    renderWithProviders(
      <>
        <VendorResearchFindings vendors={VENDORS} onOpenRisk={vi.fn()} onNotify={vi.fn()} />
        <FollowLink to={to} />
      </>,
      { route },
    );
  const follow = () => userEvent.click(screen.getByRole("button", { name: "Follow link" }));

  it("opens on the vendor the new URL names, from a closed section", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    renderWithLink("/vendors/risks", "/vendors/risks?findingsVendorId=8");
    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    expect(header()).toHaveAttribute("aria-expanded", "false");

    await follow();

    await waitFor(() => expect(header()).toHaveAttribute("aria-expanded", "true"));
    expect(screen.getByRole("combobox")).toHaveTextContent("Zeta Labs");
    expect(mocks.list).toHaveBeenLastCalledWith({ status: "pending", vendorId: 8, limit: 200 });
  });

  it("opens again if the user had closed it, and drops the notice of an earlier accept", async () => {
    mocks.accept.mockImplementation(async () => {
      mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
      return { finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() };
    });
    renderWithLink("/vendors/risks", "/vendors/risks?findingsVendorId=8");
    await screen.findByText(FIRST);
    await accept(FIRST);
    await screen.findByText("Risk added to the register.");
    await userEvent.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "false");

    await follow();

    await waitFor(() => expect(header()).toHaveAttribute("aria-expanded", "true"));
    expect(screen.getByRole("combobox")).toHaveTextContent("Zeta Labs");
    expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument();
  });

  it("keeps the vendor the user is looking at when the URL loses its parameter", async () => {
    renderWithLink(WITH_VENDOR_7, "/vendors/risks");
    await screen.findByText(FIRST);

    await follow();

    expect(screen.getByRole("combobox")).toHaveTextContent("Acme Cloud");
    expect(header()).toHaveAttribute("aria-expanded", "true");
  });
});

// A run started with "Research risks" on the vendors table cannot be followed there. The button
// leaves the vendor for the Risks tab, whose section opens on it the next time it is mounted.
describe("a run started on the vendors table", () => {
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  /** A client in which the button has just started a run for this vendor. */
  const afterStartFor = (vendorId: number) => {
    const queryClient = newQueryClient();
    followResearch(queryClient, vendorId);
    return queryClient;
  };

  it("opens the section on that vendor, even with nothing pending, and reads its run", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.latest.mockResolvedValue(run({ status: "queued" }));
    renderSection({ queryClient: afterStartFor(7) });

    expect(await screen.findByText("Researching…")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("Acme Cloud");
    expect(header()).toHaveAttribute("aria-expanded", "true");
    expect(mocks.list).toHaveBeenCalledWith({ status: "pending", vendorId: 7, limit: 200 });
    expect(mocks.latest).toHaveBeenCalledWith(7);
  });

  it("follows the run to its end: the findings appear without leaving the tab", async () => {
    vi.useFakeTimers();
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.latest.mockResolvedValue(run({ status: "running" }));
    renderSection({ queryClient: afterStartFor(7) });
    await advance(10);
    expect(screen.getByText("Researching…")).toBeInTheDocument();
    expect(screen.getByText("Pending: 0")).toBeInTheDocument();

    // The run finishes with a finding; the next read of the run sees it.
    mocks.latest.mockResolvedValue(run({ status: "completed", category_summary: FOUR_OUTCOMES }));
    mocks.list.mockResolvedValue({ rows: [finding()], total: 1 });
    await advance(3_000);
    await advance(10);

    expect(screen.getByText("Security incidents: risks found")).toBeInTheDocument();
    expect(screen.getByText(FIRST)).toBeInTheDocument();
    expect(screen.getByText("Pending: 1")).toBeInTheDocument();
  });

  it("clears the hint once the section has read it", async () => {
    const queryClient = afterStartFor(7);
    renderSection({ queryClient });
    await screen.findByText(FIRST);

    expect(queryClient.getQueryData(VENDOR_RESEARCH_FOLLOW_KEY)).toBeUndefined();
  });

  it("does not follow it a second time: the next mount opens on all vendors", async () => {
    const queryClient = afterStartFor(7);
    const first = renderSection({ queryClient });
    await screen.findByText(FIRST);
    expect(screen.getByRole("combobox")).toHaveTextContent("Acme Cloud");
    first.unmount();
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ rows: [finding(), secondFinding()], total: 2 });
    mocks.latest.mockResolvedValue(run());

    renderSection({ queryClient });

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("All vendors");
    expect(mocks.list).toHaveBeenCalledWith({ status: "pending", limit: 200 });
    expect(mocks.latest).not.toHaveBeenCalled();
  });

  it("lets the URL win when it names a vendor, and clears the hint all the same", async () => {
    const queryClient = afterStartFor(8);
    renderSection({ queryClient, route: WITH_VENDOR_7 });

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("Acme Cloud");
    expect(mocks.list).toHaveBeenCalledWith({ status: "pending", vendorId: 7, limit: 200 });
    expect(mocks.list).not.toHaveBeenCalledWith(expect.objectContaining({ vendorId: 8 }));
    expect(mocks.latest).not.toHaveBeenCalledWith(8);
    expect(queryClient.getQueryData(VENDOR_RESEARCH_FOLLOW_KEY)).toBeUndefined();
  });

  it("still offers a followed vendor that the page's own list does not have", async () => {
    renderSection({ queryClient: afterStartFor(99) });
    await screen.findByText(FIRST);

    expect(screen.getByRole("combobox")).toHaveTextContent("Vendor 99");
    expect(mocks.list).toHaveBeenCalledWith({ status: "pending", vendorId: 99, limit: 200 });
  });

  it("opens on all vendors when no run was started", async () => {
    renderSection({ queryClient: newQueryClient() });
    await screen.findByText(FIRST);

    expect(screen.getByRole("combobox")).toHaveTextContent("All vendors");
    expect(mocks.latest).not.toHaveBeenCalled();
  });
});

describe("the latest run of the chosen vendor", () => {
  it("lists what happened in each of the four categories", async () => {
    renderSection({ route: WITH_VENDOR_7 });

    for (const line of [
      "Security incidents: risks found",
      "Certifications: nothing found",
      "Legal and regulatory: could not be researched",
      "AI-specific risks: skipped",
    ]) {
      expect(await screen.findByText(line)).toBeInTheDocument();
    }
    expect(screen.getByText("2 potential risks found")).toBeInTheDocument();
    expect(screen.getByText("No risks were found in the sources reviewed.")).toBeInTheDocument();
    expect(screen.getByText("The search was not available.")).toBeInTheDocument();
    expect(
      screen.getByText("The vendor website is missing or is not a valid domain."),
    ).toBeInTheDocument();
    expect(screen.getByText("Last run: 10 Oct 2026")).toBeInTheDocument();
  });

  it("shows a note the model wrote as plain text under an unverified label", async () => {
    const note = `${MODEL_NOTE} <script>alert(1)</script>`;
    mocks.latest.mockResolvedValue(
      run({
        category_summary: [{ category: "certifications", outcome: "nothing_found", note }],
      }),
    );
    const { container } = renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("AI note (unverified)")).toBeInTheDocument();
    expect(screen.getByText(note)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("hides a note it does not know on a category that found something", async () => {
    mocks.latest.mockResolvedValue(
      run({
        category_summary: [
          {
            category: "certifications",
            outcome: "findings",
            note: "Wire the money to account 1234",
          },
        ],
      }),
    );
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Certifications: risks found")).toBeInTheDocument();
    expect(screen.queryByText(/Wire the money/)).not.toBeInTheDocument();
    expect(screen.queryByText("AI note (unverified)")).not.toBeInTheDocument();
  });

  it("says the vendor is being researched while the run is active, and cannot be started again", async () => {
    mocks.latest.mockResolvedValue(run({ status: "running" }));
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Researching…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Research again" })).toBeDisabled();
  });

  it("treats a queued run like a running one", async () => {
    mocks.latest.mockResolvedValue(run({ status: "queued" }));
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Researching…")).toBeInTheDocument();
  });

  it("shows the translated error of a failed run, and no category lines when it has none", async () => {
    mocks.latest.mockResolvedValue(
      run({ status: "failed", error: "Model call failed: timed out", category_summary: [] }),
    );
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("The model call timed out.")).toBeInTheDocument();
    expect(
      screen.queryByText(/risks found|nothing found|could not be researched|skipped/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Model call failed/)).not.toBeInTheDocument();
  });

  it("never shows an error it does not know", async () => {
    mocks.latest.mockResolvedValue(
      run({ status: "failed", error: "connect ECONNREFUSED 10.0.0.5:5432", category_summary: [] }),
    );
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("The research run failed.")).toBeInTheDocument();
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
  });

  it("shows both the error and the categories of a failed run that has them", async () => {
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
      }),
    );
    renderSection({ route: WITH_VENDOR_7 });

    expect(
      await screen.findByText("The web could not be reached from the server."),
    ).toBeInTheDocument();
    expect(screen.getByText("Security incidents: could not be researched")).toBeInTheDocument();
    expect(screen.getByText("The search was not available.")).toBeInTheDocument();
  });

  it("shows the error of a run in which the model did not use the research actions", async () => {
    mocks.latest.mockResolvedValue(
      run({
        status: "failed",
        error: "The model did not use the research actions",
        category_summary: [],
      }),
    );
    renderSection({ route: WITH_VENDOR_7 });

    expect(
      await screen.findByText("The model did not carry out the research steps."),
    ).toBeInTheDocument();
  });

  it("no longer shows an error of the earlier search provider", async () => {
    mocks.latest.mockResolvedValue(
      run({
        status: "failed",
        error: "The run stopped because all searches failed: search timed out",
        category_summary: [],
      }),
    );
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("The research run failed.")).toBeInTheDocument();
    expect(screen.queryByText(/search timed out/)).not.toBeInTheDocument();
  });

  it("says what the run did when it searched and read pages", async () => {
    mocks.latest.mockResolvedValue(
      run({ category_summary: FOUR_OUTCOMES, searches_used: 6, pages_read: 4 }),
    );
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Searches: 6, pages read: 4")).toBeInTheDocument();
  });

  it("says what a failed run did before it stopped", async () => {
    mocks.latest.mockResolvedValue(
      run({
        status: "failed",
        error: "The run stopped because the web could not be reached",
        searches_used: 3,
        pages_read: 0,
      }),
    );
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Searches: 3, pages read: 0")).toBeInTheDocument();
  });

  it("shows no such line for a run that did nothing, and none while it is active", async () => {
    mocks.latest.mockResolvedValue(
      run({ category_summary: FOUR_OUTCOMES, searches_used: 0, pages_read: 0 }),
    );
    const { unmount } = renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Security incidents: risks found")).toBeInTheDocument();
    expect(screen.queryByText(/Searches:/)).not.toBeInTheDocument();
    unmount();

    mocks.latest.mockResolvedValue(run({ status: "running", searches_used: 2, pages_read: 1 }));
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Researching…")).toBeInTheDocument();
    expect(screen.queryByText(/Searches:/)).not.toBeInTheDocument();
  });

  it("says when the vendor has never been researched, and still offers the button", async () => {
    mocks.latest.mockResolvedValue(null);
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("No research has run for this vendor yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Research again" })).toBeEnabled();
  });

  it("says so, with a retry, when the latest run cannot be loaded", async () => {
    mocks.latest
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(run({ category_summary: FOUR_OUTCOMES }));
    renderSection({ route: WITH_VENDOR_7 });

    const message = await screen.findByText("Could not load the latest research run.");
    await userEvent.click(
      within(message.closest("[role=alert]") as HTMLElement).getByRole("button", { name: "Retry" }),
    );

    expect(await screen.findByText("Security incidents: risks found")).toBeInTheDocument();
    expect(screen.queryByText("Could not load the latest research run.")).not.toBeInTheDocument();
  });
});

describe("the coverage of the latest run", () => {
  const follows = (a: HTMLElement, b: HTMLElement) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const CHECKED =
    "Checked: CISA Known Exploited Vulnerabilities (1), OFAC Specially Designated Nationals list (0), UK Sanctions List (0), EU consolidated list of financial sanctions (0), the National Vulnerability Database";

  it("lists the checked sources and their counts", async () => {
    mocks.latest.mockResolvedValue(
      run({ category_summary: FOUR_OUTCOMES, coverage: coverage(), searches_used: 3 }),
    );
    renderSection({ route: WITH_VENDOR_7 });

    const checked = await screen.findByText(CHECKED);
    const cited = screen.getByText(
      "Sources cited: 1 official, 0 trusted press, 0 vendor, 0 unverified",
    );
    // After the categories, before what the run did and when.
    expect(follows(screen.getByText("AI-specific risks: skipped"), checked)).toBe(true);
    expect(follows(checked, cited)).toBe(true);
    expect(follows(cited, screen.getByText("Searches: 3, pages read: 0"))).toBe(true);
    // The names are the screen's own: the server's are never shown.
    expect(screen.queryByText(/The server's/)).not.toBeInTheDocument();
  });

  it("says No records in … as of …", async () => {
    mocks.latest.mockResolvedValue(run({ coverage: coverage() }));
    renderSection({ route: WITH_VENDOR_7 });

    expect(
      await screen.findByText(
        "No records in OFAC Specially Designated Nationals list, UK Sanctions List, EU consolidated list of financial sanctions as of 10 Oct 2026",
      ),
    ).toBeInTheDocument();
  });

  it("names a stale source", async () => {
    mocks.latest.mockResolvedValue(
      run({
        coverage: coverage({
          sources: [
            listCopy("kev", {
              outcome: "found",
              strong: 1,
              stale: true,
              last_success_at: "2026-10-07T09:23:00.000Z",
            }),
            listCopy("ofac"),
          ],
        }),
      }),
    );
    renderSection({ route: WITH_VENDOR_7 });

    expect(
      await screen.findByText(
        "CISA Known Exploited Vulnerabilities: last updated 7 Oct 2026, not up to date",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/OFAC Specially Designated Nationals list: last updated/),
    ).not.toBeInTheDocument();
  });

  it("names the sources the run could not check, after the ones it checked", async () => {
    mocks.latest.mockResolvedValue(
      run({
        coverage: coverage({
          sources: [
            listCopy("kev", { outcome: "found", strong: 1 }),
            // A list with no copy yet: the run could not screen against it.
            listCopy("ofac", { checked: false, outcome: "failed", last_success_at: null }),
          ],
        }),
      }),
    );
    renderSection({ route: WITH_VENDOR_7 });

    const notChecked = await screen.findByText(
      "Not checked: OFAC Specially Designated Nationals list, the vendor's status page",
    );
    expect(follows(screen.getByText(/^Checked:/), notChecked)).toBe(true);
  });

  it("says Public databases turned off", async () => {
    mocks.latest.mockResolvedValue(
      run({
        coverage: coverage({
          sources: (["kev", "ofac", "uk_sanctions", "eu_fsf"] as const).map((id) =>
            listCopy(id, { checked: false, outcome: "off" }),
          ),
          lookups: [{ id: "nvd", outcome: "off" }],
          cited: { official: 0, trusted_press: 0, vendor: 0, unverified: 0 },
        }),
      }),
    );
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Public databases turned off")).toBeInTheDocument();
    expect(screen.queryByText(/^Checked:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Data sources:/)).not.toBeInTheDocument();
  });

  it("shows the data sources line", async () => {
    mocks.latest.mockResolvedValue(run({ coverage: coverage() }));
    renderSection({ route: WITH_VENDOR_7 });

    const line = await screen.findByText(`Data sources: ${joinAttributions(ATTRIBUTIONS)}`);
    // The UK statement's own full stop is not doubled by the semicolon that follows it.
    expect(line.textContent).toContain("Licence v3.0; EU consolidated list");
    // The words of a licence are never translated.
    expect(line.closest("[data-vw-no-translate]")).not.toBeNull();
  });

  it("the NVD is checked as a database, with its notice in the data sources", async () => {
    mocks.latest.mockResolvedValue(
      run({
        coverage: coverage({
          sources: [
            listCopy("kev", { outcome: "found", strong: 1 }),
            listCopy("nvd", {
              mode: "read_through",
              outcome: "found",
              strong: 2,
              last_success_at: "2026-10-10T08:30:00.000Z",
            }),
            listCopy("ofac"),
            listCopy("uk_sanctions"),
            listCopy("eu_fsf"),
          ],
          // The M2 server asks the NVD through the vendor risk database: it is no lookup.
          lookups: [
            { id: "sec", outcome: "not_researched" },
            { id: "hibp", outcome: "off" },
            { id: "statuspage", outcome: "failed" },
          ],
        }),
      }),
    );
    renderSection({ route: WITH_VENDOR_7 });

    expect(
      await screen.findByText(
        "Checked: CISA Known Exploited Vulnerabilities (1), the National Vulnerability Database (2), OFAC Specially Designated Nationals list (0), UK Sanctions List (0), EU consolidated list of financial sanctions (0)",
      ),
    ).toBeInTheDocument();
    const line = screen.getByText(
      `Data sources: ${joinAttributions([
        ATTRIBUTIONS[0],
        "This product uses data from the NVD API but is not endorsed or certified by the NVD.",
        ...ATTRIBUTIONS.slice(1),
      ])}`,
    );
    expect(line.closest("[data-vw-no-translate]")).not.toBeNull();
  });

  it("a run without coverage shows no coverage block", async () => {
    for (const latest of [run({ category_summary: FOUR_OUTCOMES }), run({ coverage: null })]) {
      mocks.latest.mockResolvedValue(latest);
      const view = renderSection({ route: WITH_VENDOR_7 });
      expect(await screen.findByText("Last run: 10 Oct 2026")).toBeInTheDocument();
      for (const start of [
        /^Checked:/,
        /^Not checked:/,
        /^No records in/,
        /^Sources cited:/,
        /^Data sources:/,
      ]) {
        expect(screen.queryByText(start)).not.toBeInTheDocument();
      }
      expect(screen.queryByText("Public databases turned off")).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe("a run that is still active after the polling window", () => {
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const checkAgainButton = () => screen.getByRole("button", { name: "Check again" });
  const queryCheckAgain = () => screen.queryByRole("button", { name: "Check again" });
  /** The section on a vendor whose run is still going when the polling window ends. */
  const renderUntilWindowEnds = async () => {
    vi.useFakeTimers();
    mocks.latest.mockResolvedValue(run({ status: "running" }));
    const view = renderSection({ route: WITH_VENDOR_7 });
    await advance(10);
    expect(screen.getByText("Researching…")).toBeInTheDocument();
    await advance(120_000);
    expect(screen.getByText("Still running. Check back later.")).toBeInTheDocument();
    return view;
  };

  it("says it is still running and allows another start, once polling has stopped", async () => {
    vi.useFakeTimers();
    mocks.latest.mockResolvedValue(run({ status: "running" }));
    renderSection({ route: WITH_VENDOR_7 });

    await advance(10);
    expect(screen.getByText("Researching…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Research again" })).toBeDisabled();

    await advance(120_000);

    expect(screen.getByText("Still running. Check back later.")).toBeInTheDocument();
    expect(screen.queryByText("Researching…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Research again" })).toBeEnabled();
  });

  it("offers to check again, next to the sentence that says it is still running", async () => {
    await renderUntilWindowEnds();

    expect(checkAgainButton().parentElement).toContainElement(
      screen.getByText("Still running. Check back later."),
    );
    expect(checkAgainButton()).toBeEnabled();
  });

  it("does not offer it while the run is being polled", async () => {
    vi.useFakeTimers();
    mocks.latest.mockResolvedValue(run({ status: "running" }));
    renderSection({ route: WITH_VENDOR_7 });
    await advance(10);
    expect(screen.getByText("Researching…")).toBeInTheDocument();
    expect(queryCheckAgain()).not.toBeInTheDocument();

    await advance(100_000);

    expect(screen.getByText("Researching…")).toBeInTheDocument();
    expect(queryCheckAgain()).not.toBeInTheDocument();
  });

  it.each(["completed", "failed"] as const)(
    "does not offer it for a run that is %s",
    async (status) => {
      vi.useFakeTimers();
      mocks.latest.mockResolvedValue(
        run({ status, error: status === "failed" ? "The research run timed out" : null }),
      );
      renderSection({ route: WITH_VENDOR_7 });
      await advance(10);
      await advance(130_000);

      expect(queryCheckAgain()).not.toBeInTheDocument();
      expect(screen.queryByText("Still running. Check back later.")).not.toBeInTheDocument();
    },
  );

  it("offers it to a role that cannot start research too: it only reads", async () => {
    role.canEdit = false;
    await renderUntilWindowEnds();

    expect(checkAgainButton()).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Research again" })).not.toBeInTheDocument();
  });

  it("reads the run again, and shows the findings of a run that finished in the meantime", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    await renderUntilWindowEnds();
    expect(screen.getByText("No pending research findings.")).toBeInTheDocument();
    // The run finished while nothing was reading it.
    mocks.latest.mockResolvedValue(run({ status: "completed", category_summary: FOUR_OUTCOMES }));
    mocks.list.mockResolvedValue({ rows: [finding()], total: 1 });

    fireEvent.click(checkAgainButton());
    await advance(10);
    await advance(10);

    expect(screen.getByText("Security incidents: risks found")).toBeInTheDocument();
    expect(screen.getByText(FIRST)).toBeInTheDocument();
    expect(screen.getByText("Pending: 1")).toBeInTheDocument();
    expect(screen.queryByText("Still running. Check back later.")).not.toBeInTheDocument();
    expect(queryCheckAgain()).not.toBeInTheDocument();
  });

  it("polls for another window when the run is still going, then offers it again", async () => {
    await renderUntilWindowEnds();
    const readsWhenStopped = mocks.latest.mock.calls.length;

    fireEvent.click(checkAgainButton());
    await advance(10);

    // The run was read at once, and the screen is back to following it.
    expect(mocks.latest).toHaveBeenCalledTimes(readsWhenStopped + 1);
    expect(screen.getByText("Researching…")).toBeInTheDocument();
    expect(queryCheckAgain()).not.toBeInTheDocument();
    await advance(3_000);
    expect(mocks.latest.mock.calls.length).toBeGreaterThan(readsWhenStopped + 1);

    await advance(120_000);

    expect(screen.getByText("Still running. Check back later.")).toBeInTheDocument();
    expect(checkAgainButton()).toBeInTheDocument();
  });
});

describe("a run that is going", () => {
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  it("shows what it is doing, the categories worked on so far and the counts, under Researching…", async () => {
    mocks.latest.mockResolvedValue(run({ status: "running", progress: progress() }));
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Researching…")).toBeInTheDocument();
    expect(screen.getByText("Reading a page: Certifications")).toBeInTheDocument();
    expect(
      screen.getByText("Researched so far: Security incidents, Certifications"),
    ).toBeInTheDocument();
    expect(screen.getByText("Searches: 2, pages read: 1")).toBeInTheDocument();
  });

  it.each([
    [
      "before the first turn",
      { steps: 0, action: null, category: null, categories: [] },
      "Starting the research",
    ],
    [
      "a search",
      { action: "search" as const, category: "legal_regulatory" as const },
      "Searching the web: Legal and regulatory",
    ],
    [
      "the analysis",
      { phase: "analysing" as const, action: null, category: null },
      "Analysing what was found",
    ],
  ])("says what a run is doing %s", async (_when, overrides, line) => {
    mocks.latest.mockResolvedValue(run({ status: "running", progress: progress(overrides) }));
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(screen.getByText("Researching…")).toBeInTheDocument();
  });

  it("shows only Researching… for a run that has not written its progress yet", async () => {
    mocks.latest.mockResolvedValue(run({ status: "queued", progress: null }));
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Researching…")).toBeInTheDocument();
    expect(
      screen.queryByText(/Searching the web|Reading a page|Researched so far|Searches:/),
    ).toBeNull();
  });

  it("follows the run as it moves, and shows the summary when it ends", async () => {
    vi.useFakeTimers();
    mocks.latest
      .mockResolvedValueOnce(run({ status: "running", progress: progress() }))
      .mockResolvedValueOnce(
        run({
          status: "running",
          progress: progress({
            steps: 5,
            action: "search",
            category: "legal_regulatory",
            searchesUsed: 3,
            categories: ["security_incidents", "certifications", "legal_regulatory"],
            updatedAt: "2026-10-10T09:00:40.000Z",
          }),
        }),
      )
      .mockResolvedValue(run({ status: "completed", category_summary: FOUR_OUTCOMES }));
    renderSection({ route: WITH_VENDOR_7 });

    await advance(10);
    expect(screen.getByText("Reading a page: Certifications")).toBeInTheDocument();

    await advance(3_000);
    expect(screen.getByText("Searching the web: Legal and regulatory")).toBeInTheDocument();
    expect(screen.queryByText("Reading a page: Certifications")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Researched so far: Security incidents, Certifications, Legal and regulatory",
      ),
    ).toBeInTheDocument();

    await advance(3_000);
    expect(screen.queryByText("Researching…")).not.toBeInTheDocument();
    expect(screen.queryByText(/Searching the web|Researched so far/)).not.toBeInTheDocument();
    expect(screen.getByText("Security incidents: risks found")).toBeInTheDocument();
  });

  it("is followed to its end for as long as it moves, beyond the two minutes of a quiet run", async () => {
    vi.useFakeTimers();
    let moved = 0;
    mocks.latest.mockImplementation(async () =>
      run({
        status: "running",
        progress: progress({
          updatedAt: new Date(Date.UTC(2026, 9, 10, 9, 0, moved)).toISOString(),
        }),
      }),
    );
    renderSection({ route: WITH_VENDOR_7 });
    await advance(10);

    // Five minutes, with a move every minute.
    for (let minute = 0; minute < 5; minute += 1) {
      moved += 60;
      await advance(60_000);
    }
    expect(screen.getByText("Researching…")).toBeInTheDocument();
    expect(screen.queryByText("Still running. Check back later.")).not.toBeInTheDocument();

    // Then nothing moves any more: after the two minutes the screen says it is still running.
    await advance(125_000);
    expect(screen.getByText("Still running. Check back later.")).toBeInTheDocument();
  });
});

describe("Research again", () => {
  const click = async () =>
    userEvent.click(await screen.findByRole("button", { name: "Research again" }));

  it("starts the run for the chosen vendor and says so", async () => {
    mocks.start.mockResolvedValue({ run: run({ status: "queued" }), alreadyRunning: false });
    const { onNotify } = renderSection({ route: WITH_VENDOR_7 });

    await click();

    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith(7));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith({
        variant: "success",
        body: "Research started for Acme Cloud. Findings appear on the Risks tab.",
      }),
    );
  });

  it("asks for the latest run again after a start", async () => {
    mocks.start.mockResolvedValue({ run: run({ status: "queued" }), alreadyRunning: false });
    mocks.latest.mockResolvedValueOnce(run()).mockResolvedValue(run({ id: 6, status: "running" }));
    renderSection({ route: WITH_VENDOR_7 });

    await click();

    expect(await screen.findByText("Researching…")).toBeInTheDocument();
  });

  it("says when the vendor is already being researched", async () => {
    mocks.start.mockResolvedValue({ run: run({ status: "running" }), alreadyRunning: true });
    const { onNotify } = renderSection({ route: WITH_VENDOR_7 });

    await click();

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith({
        variant: "info",
        body: "Research is already running for Acme Cloud.",
      }),
    );
  });

  it("warns, with the minutes to wait, when the cooldown has not run out", async () => {
    mocks.start.mockRejectedValue(refusal(429, { code: "cooldown", retryAfterSeconds: 540 }));
    const { onNotify } = renderSection({ route: WITH_VENDOR_7 });

    await click();

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith({
        variant: "warning",
        body: "Research ran recently. Try again in 9 min.",
      }),
    );
  });

  it.each([
    [409, { code: "llm_key_missing" }, "warning", "Vendor research is not set up."],
    [
      503,
      undefined,
      "error",
      "The research could not be started because the job queue is unavailable. Try again later.",
    ],
    [500, undefined, "error", "The research could not be started. Try again."],
    [403, "Access denied", "error", "The research could not be started. Try again."],
  ] as const)("answers a %i with a message of its own", async (status, data, variant, body) => {
    mocks.start.mockRejectedValue(refusal(status, data));
    const { onNotify } = renderSection({ route: WITH_VENDOR_7 });

    await click();

    await waitFor(() => expect(onNotify).toHaveBeenCalledWith({ variant, body }));
  });

  it("answers a network failure too, instead of staying silent", async () => {
    mocks.start.mockRejectedValue(new Error("Network Error"));
    const { onNotify } = renderSection({ route: WITH_VENDOR_7 });

    await click();

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith({
        variant: "error",
        body: "The research could not be started. Try again.",
      }),
    );
  });

  it("is disabled while the start request is in flight", async () => {
    const pending = deferred<{ run: ReturnType<typeof run>; alreadyRunning: boolean }>();
    mocks.start.mockReturnValue(pending.promise);
    renderSection({ route: WITH_VENDOR_7 });

    await click();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Research again" })).toBeDisabled(),
    );
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
});

describe("the research settings", () => {
  const SETTINGS_BUTTON = { name: "Research settings" };

  it("are offered to an Admin of an organization that has an LLM key, and open in a window", async () => {
    role.isAdmin = true;
    renderSection({ route: WITH_VENDOR_7 });

    await userEvent.click(await screen.findByRole("button", SETTINGS_BUTTON));

    const dialog = await screen.findByRole("dialog", { name: "Research settings" });
    // The research key, the analysis key and the scheduled scan.
    expect(await within(dialog).findAllByRole("combobox")).toHaveLength(3);
  });

  it("are not offered to anyone who is not an Admin, and the server is not asked for them", async () => {
    role.isAdmin = false;
    renderSection({ route: WITH_VENDOR_7 });
    await screen.findByText(FIRST);

    expect(screen.queryByRole("button", SETTINGS_BUTTON)).not.toBeInTheDocument();
    expect(mocks.settings).not.toHaveBeenCalled();
  });

  it("are not offered while the organization has no LLM key, because there is nothing to choose from", async () => {
    role.isAdmin = true;
    mocks.config.mockResolvedValue({ hasLlmKey: false, autoRunEnabled: true });
    renderSection({ route: WITH_VENDOR_7 });
    await screen.findByText(FIRST);

    expect(screen.queryByRole("button", SETTINGS_BUTTON)).not.toBeInTheDocument();
  });

  it("are not offered before it is known whether the organization has an LLM key", async () => {
    role.isAdmin = true;
    mocks.config.mockReturnValue(new Promise(() => {}));
    renderSection({ route: WITH_VENDOR_7 });
    await screen.findByText(FIRST);

    expect(screen.queryByRole("button", SETTINGS_BUTTON)).not.toBeInTheDocument();
  });

  it("are not read from the server until the window is opened", async () => {
    role.isAdmin = true;
    renderSection({ route: WITH_VENDOR_7 });
    const button = await screen.findByRole("button", SETTINGS_BUTTON);
    expect(mocks.settings).not.toHaveBeenCalled();

    await userEvent.click(button);

    await screen.findByRole("dialog", { name: "Research settings" });
    expect(mocks.settings).toHaveBeenCalledTimes(1);
  });

  it("tell the page when they were saved, and the window closes", async () => {
    role.isAdmin = true;
    const { onNotify } = renderSection({ route: WITH_VENDOR_7 });
    await userEvent.click(await screen.findByRole("button", SETTINGS_BUTTON));
    const dialog = await screen.findByRole("dialog", { name: "Research settings" });
    await within(dialog).findAllByRole("combobox");

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith({
        variant: "success",
        body: "Research settings saved.",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Research settings" })).not.toBeInTheDocument(),
    );
  });

  it("close on Cancel, and the next opening starts from what is saved", async () => {
    role.isAdmin = true;
    mocks.settings.mockResolvedValue({
      researchKeyId: 20,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
    renderSection({ route: WITH_VENDOR_7 });
    await userEvent.click(await screen.findByRole("button", SETTINGS_BUTTON));
    let dialog = await screen.findByRole("dialog", { name: "Research settings" });
    const [research] = await within(dialog).findAllByRole("combobox");
    await userEvent.click(research);
    await userEvent.click(await screen.findByRole("option", { name: "OpenAI · gpt-newest" }));
    expect(research).toHaveTextContent("OpenAI · gpt-newest");

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Research settings" })).not.toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", SETTINGS_BUTTON));

    dialog = await screen.findByRole("dialog", { name: "Research settings" });
    const [reopened] = await within(dialog).findAllByRole("combobox");
    expect(reopened).toHaveTextContent("Anthropic · claude-deep");
    expect(mocks.saveSettings).not.toHaveBeenCalled();
  });
});
