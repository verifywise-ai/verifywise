import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { LLM_KEY_CREATE_PATH } from "../../../../../application/constants/llmKeyDeepLink";
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

// `isAdmin` is the role name, which the page must not consult: what it shows rests on the
// permissions (`canManageKeys` is llmKeys.admin), which a custom role can hold too.
const role = vi.hoisted(() => ({ canEdit: true, canManageKeys: false, isAdmin: false }));
vi.mock("../../../../../application/hooks/useCan", () => ({
  useCan: (key: string) =>
    (key === "vendor.edit" && role.canEdit) || (key === "llmKeys.admin" && role.canManageKeys),
  useCanCheck: () => (key: string) => key === "vendor.edit" && role.canEdit,
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
  TURN_QUIET_MS,
  VENDOR_RESEARCH_FOLLOW_KEY,
  VENDOR_RESEARCH_KEY,
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
const WITH_VENDOR_7 = "/vendors/research-findings?findingsVendorId=7";

const renderSection = (
  options: { route?: string; vendors?: TestVendor[]; queryClient?: QueryClient } = {},
) => {
  const handlers = { onOpenRisk: vi.fn(), onNotify: vi.fn() };
  const view = renderWithProviders(
    <VendorResearchFindings vendors={options.vendors ?? VENDORS} {...handlers} />,
    { route: options.route ?? "/vendors/research-findings", queryClient: options.queryClient },
  );
  return { ...view, ...handlers };
};

/** A client like the test default, made here so that a test can leave something in its cache first. */
const newQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

/**
 * The row of the finding with this text, with its details open. A row shows its details on a click
 * of the risk, and most cases here are about what the details hold; what a row shows before the
 * click has its own cases in PlainLayout.test.tsx.
 */
const rowOf = (text: string) => {
  const risk = screen.getByText(text);
  const toggle = risk.closest("button");
  if (toggle?.getAttribute("aria-expanded") === "false") fireEvent.click(toggle);
  return risk.closest("li") as HTMLElement;
};
/** Opens what the latest run found and checked, which is behind one button of the summary. */
const openRunDetails = async () =>
  userEvent.click(await screen.findByRole("button", { name: "How it was researched" }));
/** Opens the names of every list the run asked that held nothing. */
const openAllLists = async () =>
  userEvent.click(await screen.findByRole("button", { name: "Show all lists" }));
/**
 * The line of the source with this host in an open row: the host, the date and the tags of the
 * source. Its quote is under the line.
 */
const sourceLineOf = (row: HTMLElement, host: string) => {
  const link = within(row).getByRole("link", { name: host });
  return { link, line: link.closest("[data-vw-no-translate]")?.parentElement as HTMLElement };
};
/** Says that the source carries this tag, on the line of its host and after it. */
const expectTag = (row: HTMLElement, host: string, tag: string) => {
  const { link, line } = sourceLineOf(row, host);
  expect(
    link.compareDocumentPosition(within(line).getByText(tag)) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
};
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
  await userEvent.click(
    within(rowOf(text)).getByRole("button", { name: "Preview suggested risk" }),
  );
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
  role.canManageKeys = false;
  role.isAdmin = false;
  formEdits.current = {};
  mocks.config.mockResolvedValue({ hasLlmKey: true, autoRunAllowed: true, autoRunEnabled: true });
  mocks.settings.mockResolvedValue({
    researchKeyId: null,
    analysisKeyId: null,
    scanIntervalDays: null,
    autoResearchOnCreate: true,
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
    mocks.config.mockResolvedValue({
      hasLlmKey: false,
      autoRunAllowed: true,
      autoRunEnabled: true,
    });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Vendor research is not set up.")).toBeInTheDocument();
    expect(screen.queryByText("No pending research findings.")).not.toBeInTheDocument();
  });

  it("offers no vendor filter before research is set up and nothing is pending", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.config.mockResolvedValue({
      hasLlmKey: false,
      autoRunAllowed: true,
      autoRunEnabled: true,
    });
    renderSection();

    expect(await screen.findByText("Vendor research is not set up.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Vendor")).not.toBeInTheDocument();
  });

  it("tells an Admin to add an LLM key", async () => {
    role.canManageKeys = true;
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.config.mockResolvedValue({
      hasLlmKey: false,
      autoRunAllowed: true,
      autoRunEnabled: true,
    });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Vendor research is not set up.")).toBeInTheDocument();
    expect(screen.getByText("Research needs an LLM key.", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add an LLM key" })).toBeInTheDocument();
  });

  it("takes whoever can add a key straight to the add-key form", async () => {
    role.canManageKeys = true;
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.config.mockResolvedValue({
      hasLlmKey: false,
      autoRunAllowed: true,
      autoRunEnabled: true,
    });
    const LocationProbe = () => {
      const location = useLocation();
      return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
    };
    renderWithProviders(
      <>
        <VendorResearchFindings vendors={VENDORS} onOpenRisk={vi.fn()} onNotify={vi.fn()} />
        <LocationProbe />
      </>,
      { route: WITH_VENDOR_7 },
    );

    await userEvent.click(await screen.findByRole("button", { name: "Add an LLM key" }));
    expect(screen.getByTestId("location")).toHaveTextContent(LLM_KEY_CREATE_PATH);
  });

  it("keeps the setup hint from everyone who is not an Admin", async () => {
    role.canManageKeys = false;
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.config.mockResolvedValue({
      hasLlmKey: false,
      autoRunAllowed: true,
      autoRunEnabled: true,
    });
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
    role.canManageKeys = true;
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.config.mockResolvedValue({
      hasLlmKey: true,
      autoRunAllowed: true,
      autoRunEnabled: false,
    });
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
      config.resolve({ hasLlmKey: true, autoRunAllowed: true, autoRunEnabled: true });
    });
    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
  });

  it("shows the rows even when the organization is not set up, and only disables Research again", async () => {
    mocks.config.mockResolvedValue({
      hasLlmKey: false,
      autoRunAllowed: true,
      autoRunEnabled: true,
    });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    // The button is rebuilt inside its tooltip once the settings say research is not set up.
    const againButton = () => screen.getByRole("button", { name: "Research again" });
    await waitFor(() => expect(againButton()).toBeDisabled());
    await userEvent.hover(againButton().parentElement as HTMLElement);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Vendor research is not set up.");
    // Adding what was found does not depend on the setup.
    expect(
      within(rowOf(FIRST)).getByRole("button", { name: "Preview suggested risk" }),
    ).toBeEnabled();
  });
});

describe("the section on its tab", () => {
  // The section is the content of the Research findings tab: it is not a panel that folds, so
  // nothing is behind a click and nothing of it can be closed.
  it("shows the findings, and how many are pending, without a click", async () => {
    renderSection();

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    expect(screen.getByText(SECOND)).toBeInTheDocument();
    expect(screen.getByText("2 possible risks to review. 1 is high risk.")).toBeInTheDocument();
    // The title and the count are the tab's; the section has no header of its own to open.
    expect(screen.queryByRole("button", { name: /^Research findings/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Pending: /)).not.toBeInTheDocument();
  });

  it("shows that nothing is pending without a click when there is nothing", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    renderSection();

    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByText(/possible risks? to review/)).not.toBeInTheDocument();
  });

  it("stays as it is when the user picks a vendor that has nothing pending", async () => {
    mocks.list.mockImplementation(async (filter) =>
      filter.vendorId === 8 ? { rows: [], total: 0 } : { rows: [finding()], total: 1 },
    );
    renderSection();
    await screen.findByText(FIRST);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Zeta Labs" }));

    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
    // The vendor filter is still there to pick another vendor from.
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("always says the findings are suggestions to verify, before the list has loaded and after", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    renderSection();

    const sentence = "AI-suggested from web sources. Verify before accepting.";
    expect(screen.getByText(sentence)).toBeInTheDocument();
    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
    expect(screen.getByText(sentence)).toBeInTheDocument();
  });
});

describe("a finding", () => {
  it("shows its category, texts, level, scales and credibility, under the name of its vendor", async () => {
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    expect(row.getByText("Security incidents")).toBeInTheDocument();
    expect(row.getByText("Personal data of our customers could be exposed")).toBeInTheDocument();
    expect(row.getByText("High Risk")).toBeInTheDocument();
    // The two scales the level is computed from are one quiet line, not a chip and a caption each.
    expect(row.getByText("Severity: Major · Likelihood: Likely")).toBeInTheDocument();
    expect(row.queryByText("Risk level")).not.toBeInTheDocument();
    expect(row.getByText("Credibility")).toBeInTheDocument();
    expect(row.getByText("Medium")).toBeInTheDocument();
    // The vendor heads its findings, so a row does not say it again.
    expect(screen.getByRole("list", { name: "Acme Cloud" })).toContainElement(rowOf(FIRST));
    expect(row.queryByText("Acme Cloud")).not.toBeInTheDocument();
    // A finding has no confidence: its label says how well the sources establish it.
    expect(row.queryByText("Confidence")).not.toBeInTheDocument();
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

  it("shows a source whose page could not be read by its host alone, with no quote and a caption", async () => {
    const WITHHELD = "Based on a search excerpt; the source page could not be read.";
    mocks.list.mockResolvedValue({
      rows: [
        finding({
          sources: [
            {
              url: "https://news.example.com/unread",
              title: "",
              quote: "",
              quote_withheld: true,
              published_at: null,
            },
            {
              url: "https://blog.example.org/read",
              title: "A page that was read",
              quote: "The vendor confirmed the incident.",
              published_at: null,
            },
            // An empty or blank quote of a source that was read is no quote either.
            { url: "https://empty.example.net/x", title: "", quote: "   ", published_at: null },
          ],
        }),
      ],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    const link = row.getByRole("link", { name: "news.example.com" });
    expect(link).toHaveAttribute("href", "https://news.example.com/unread");
    // One caption, for the withheld source only, and one quote, for the source that was read.
    expect(row.getAllByText(WITHHELD)).toHaveLength(1);
    expect(link.closest("div")?.parentElement).toHaveTextContent(WITHHELD);
    expect(rowOf(FIRST).querySelectorAll("blockquote")).toHaveLength(1);
    expect(row.getByText("The vendor confirmed the incident.").tagName).toBe("BLOCKQUOTE");
    expect(row.queryByText("A page that was read")).not.toBeInTheDocument();
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

    // The quote, the plan and the reason are in the details of the row, which a click opens.
    await screen.findByText("<b>Bold claim</b>");
    expect(within(rowOf("<b>Bold claim</b>")).getByText(quote)).toBeInTheDocument();
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
    const caption = first.getByText("What to do");
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
    expect(second.getByText("What to do")).toBeInTheDocument();
    expect(second.getByText("Ask for the renewed certificate")).toBeInTheDocument();
  });

  it("shows no caption for a finding that has no action plan", async () => {
    mocks.list.mockResolvedValue({ rows: [finding({ action_plan: "" })], total: 1 });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    // The row is open, with its other captions, and has none for a plan.
    expect(row.getByText("Why it matters to you")).toBeInTheDocument();
    expect(row.queryByText("What to do")).not.toBeInTheDocument();
  });

  it("shows why the finding has its risk level, after its credibility and before the sources", async () => {
    mocks.list.mockResolvedValue({ rows: [finding(), secondFinding()], total: 2 });
    renderSection();
    await screen.findByText(FIRST);

    const first = within(rowOf(FIRST));
    const caption = first.getByText("Why this risk level");
    const why = first.getByText("The vendor confirmed the breach, and customer data was involved.");
    const scales = first.getByText("Severity: Major · Likelihood: Likely");
    const follows = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    // How well it is established comes first, then the reason for the level with the two scales it
    // is computed from, then where the finding comes from.
    expect(follows(first.getByText("Credibility"), caption)).toBe(true);
    expect(follows(caption, why)).toBe(true);
    expect(follows(why, scales)).toBe(true);
    expect(follows(scales, first.getByText("Sources"))).toBe(true);
    // Each row has its own.
    const second = within(rowOf(SECOND));
    expect(second.getByText("Why this risk level")).toBeInTheDocument();
    expect(
      second.getByText("A lapsed certificate is a gap in the audits, not an incident."),
    ).toBeInTheDocument();
    expect(second.getByText("Severity: Moderate · Likelihood: Possible")).toBeInTheDocument();
  });

  it.each([null, "", "   "])(
    "shows the two scales, and no empty sentence above them, for a finding whose rationale is %j",
    async (rationale) => {
      mocks.list.mockResolvedValue({ rows: [finding({ rationale })], total: 1 });
      renderSection();
      await screen.findByText(FIRST);

      const caption = within(rowOf(FIRST)).getByText("Why this risk level");
      // The line of the scales is all that stands under the caption.
      expect(caption.parentElement?.children).toHaveLength(2);
      expect(caption.nextElementSibling).toHaveTextContent("Severity: Major · Likelihood: Likely");
    },
  );

  it("shows a finding that was stored before rationales existed", async () => {
    // The API sends null for the rows of older runs; the property can be absent in a cached list.
    const { rationale: _omitted, ...older } = finding();
    mocks.list.mockResolvedValue({ rows: [older as ReturnType<typeof finding>], total: 1 });
    renderSection();

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    // Its level still says what it is computed from, with no sentence of the model above it.
    const caption = within(rowOf(FIRST)).getByText("Why this risk level");
    expect(caption.parentElement?.children).toHaveLength(2);
    expect(caption.nextElementSibling).toHaveTextContent("Severity: Major · Likelihood: Likely");
  });

  describe("a finding whose quotes no page confirmed", () => {
    const NOTICE = "Based on search results only: it could not be confirmed on the source pages.";

    it("says that it rests on search results only, under its credibility and before its sources", async () => {
      mocks.list.mockResolvedValue({
        rows: [finding({ snippet_only: true }), secondFinding()],
        total: 2,
      });
      renderSection();
      await screen.findByText(FIRST);

      const first = within(rowOf(FIRST));
      const follows = (a: HTMLElement, b: HTMLElement) =>
        Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      expect(follows(first.getByText("Credibility"), first.getByText(NOTICE))).toBe(true);
      expect(follows(first.getByText(NOTICE), first.getByText("Sources"))).toBe(true);
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

  describe("for one vendor with more pending findings than one answer holds", () => {
    // 250 pending for vendor 7: the server sends 200 at once.
    const page = (first: number, count: number) =>
      Array.from({ length: count }, (_, index) =>
        finding({ id: first + index, risk_description: `Finding ${first + index}` }),
      );

    it("does not tell the user to choose the vendor that is chosen", async () => {
      mocks.list.mockResolvedValue({ rows: page(1, 200), total: 250 });
      renderSection({ route: WITH_VENDOR_7 });
      await screen.findByText("Finding 1");

      expect(screen.queryByText(/Choose a vendor to see the rest/)).not.toBeInTheDocument();
      expect(screen.getByText("250 possible risks to review.")).toBeInTheDocument();
    });

    it("reads the rest with Load more, from where the list ended, then offers no more", async () => {
      // By the offset asked for, so that nothing is left queued for the next test.
      mocks.list.mockImplementation(async ({ offset }) =>
        offset === 200 ? { rows: page(201, 50), total: 250 } : { rows: page(1, 200), total: 250 },
      );
      renderSection({ route: WITH_VENDOR_7 });
      await screen.findByText("Finding 1");
      expect(screen.queryByText("Finding 201")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Load more" }));

      expect(await screen.findByText("Finding 250")).toBeInTheDocument();
      expect(screen.getByText("Finding 1")).toBeInTheDocument();
      expect(mocks.list).toHaveBeenLastCalledWith({
        status: "pending",
        vendorId: 7,
        limit: 200,
        offset: 200,
      });
      expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    });

    it("keeps Load more busy while the list is read again, so a click cannot cut that read short", async () => {
      const queryClient = newQueryClient();
      mocks.list.mockImplementation(async ({ offset }) =>
        offset === 200 ? { rows: page(201, 50), total: 250 } : { rows: page(1, 200), total: 250 },
      );
      renderSection({ route: WITH_VENDOR_7, queryClient });
      await screen.findByText("Finding 1");
      expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();

      // A decision refreshes the list; its answer is held back for a moment.
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      mocks.list.mockImplementationOnce(async () => {
        await held;
        return { rows: page(1, 200), total: 250 };
      });
      act(() => {
        void queryClient.invalidateQueries({ queryKey: VENDOR_RESEARCH_KEY });
      });

      await waitFor(() => expect(screen.getByRole("button", { name: "Load more" })).toBeDisabled());
      const reads = mocks.list.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      expect(mocks.list).toHaveBeenCalledTimes(reads);

      release();
      await waitFor(() => expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled());
    });

    it("offers no Load more when everything pending is on screen", async () => {
      renderSection({ route: WITH_VENDOR_7 });
      await screen.findByText(FIRST);

      expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    });
  });

  it("offers no Load more with every vendor listed, where choosing a vendor narrows the list", async () => {
    mocks.list.mockResolvedValue({ rows: [finding(), secondFinding()], total: 250 });
    renderSection();
    await screen.findByText(FIRST);

    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
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

  it("shows the credibility as one line that starts with its label, and no confidence", async () => {
    mocks.list.mockResolvedValue({ rows: [credibleFinding(), secondFinding()], total: 2 });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    const caption = row.getByText("Credibility");
    const line = row.getByText(KEV_LINE);
    expect(follows(caption, line)).toBe(true);
    // The line starts with the label, so no chip says it a second time.
    expect(row.queryByText("High")).not.toBeInTheDocument();
    // The line comes before the model's reason for the likelihood and the severity.
    expect(follows(line, row.getByText("Why this risk level"))).toBe(true);
    expect(row.queryByText("Confidence")).not.toBeInTheDocument();
    expect(row.queryByText("Medium")).not.toBeInTheDocument();
    // The screen words the line itself, in the person's language: the server's line is not shown.
    expect(row.queryByText("The server's own English line.")).not.toBeInTheDocument();
    // Every finding has its label, and none a confidence. A label with no basis stands alone.
    const second = within(rowOf(SECOND));
    expect(second.getByText("Credibility")).toBeInTheDocument();
    expect(second.getByText("High")).toBeInTheDocument();
    expect(second.queryByText("Confidence")).not.toBeInTheDocument();
    expect(screen.queryByText("Confidence")).not.toBeInTheDocument();
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
    expect(
      row.getByText(
        "High: UN Security Council Consolidated List lists it (EXe.012), as of 10 Oct 2026.",
      ),
    ).toBeInTheDocument();
    expect(row.queryByText(NOTE)).not.toBeInTheDocument();
  });

  describe("with the AI-specific lists", () => {
    /**
     * One record of each AI-specific list as a finding cites it: matched by name, so weak, and in
     * the class of its list (the AI Incident Database is an aggregator, MITRE curates its case
     * studies, NHTSA and the FDA are regulators). The ids and the companies are invented.
     */
    const AI_RECORDS = [
      {
        id: "aiid",
        name: "AI Incident Database",
        category: "unverified",
        tag: "Unverified source",
        url: "https://incidentdatabase.ai/cite/9001",
        host: "incidentdatabase.ai",
        recordId: "9001",
      },
      {
        id: "atlas",
        name: "MITRE ATLAS case studies",
        category: "trusted_press",
        tag: "Trusted publisher",
        url: "https://atlas.mitre.org/studies/AML.CS9001",
        host: "atlas.mitre.org",
        recordId: "AML.CS9001",
      },
      {
        id: "nhtsa_sgo",
        name: "NHTSA Standing General Order crash reports",
        category: "official",
        tag: "Official source",
        url: "https://www.nhtsa.gov/laws-regulations/standing-general-order-crash-reporting?reportingEntity=acmecars&automation=ads",
        host: "www.nhtsa.gov",
        recordId: "acmecars:ads",
      },
      {
        id: "fda_ai_devices",
        name: "FDA list of AI-enabled medical devices",
        category: "official",
        tag: "Official source",
        url: "https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices?company=acmecloud",
        host: "www.fda.gov",
        recordId: "acmecloud",
      },
    ] as const;
    type AiRecord = (typeof AI_RECORDS)[number];
    const [, ATLAS_RECORD] = AI_RECORDS;

    /** The record as the finding cites it, and as the credibility rule saw it. */
    const citedRecord = (list: AiRecord, status: "active" | "withdrawn" = "active") => ({
      citation: {
        url: list.url,
        title: `Record ${list.recordId}`,
        quote: `A record of ${list.host}`,
        published_at: "2026-09-02",
        category: list.category,
        publisher: list.id,
        record: {
          source_id: list.id,
          record_id: 12,
          status,
          match_strength: "weak" as const,
        },
      },
      seen: {
        url: list.url,
        category: list.category,
        publisher: list.id,
        entry: null,
        reviewed: true,
        reading: "read" as const,
        record: {
          source: list.id,
          match: "weak" as const,
          status,
          source_record_id: list.recordId,
          as_of: "2026-10-09",
        },
      },
    });

    it.each(AI_RECORDS)(
      "a record of the $name matched by name shows the name-only line, the note and the tag of its class",
      async (list) => {
        const { citation, seen } = citedRecord(list);
        mocks.list.mockResolvedValue({
          rows: [
            credibleFinding({
              credibility: "low",
              credibility_basis: {
                rule: "name_only",
                registry_version: "2026-10-29.1",
                name_only: true,
                sources: [seen],
              },
              sources: [citation],
            }),
          ],
          total: 1,
        });
        renderSection();
        await screen.findByText(FIRST);

        const row = within(rowOf(FIRST));
        const line = row.getByText(`Low: the ${list.name} entry matches the vendor by name only.`);
        expect(follows(line, row.getByText(NOTE))).toBe(true);
        // The tag is the class of the list, on the line of the record's host.
        expectTag(rowOf(FIRST), list.host, list.tag);
      },
    );

    it.each(AI_RECORDS)(
      "a record the $name withdrew reads as withdrawn, with the day of the copy",
      async (list) => {
        const { citation, seen } = citedRecord(list, "withdrawn");
        mocks.list.mockResolvedValue({
          rows: [
            credibleFinding({
              credibility: "low",
              credibility_basis: {
                rule: "inactive",
                registry_version: "2026-10-29.1",
                name_only: true,
                sources: [seen],
              },
              sources: [citation],
            }),
          ],
          total: 1,
        });
        renderSection();
        await screen.findByText(FIRST);

        const row = within(rowOf(FIRST));
        const line = row.getByText(`Low: ${list.name} withdrew the record on 9 Oct 2026.`);
        // A record matched by name carries the note, whatever the rule that decided the label.
        expect(follows(line, row.getByText(NOTE))).toBe(true);
        expectTag(rowOf(FIRST), list.host, "Record withdrawn");
      },
    );

    it("the line of one trusted publisher does not name a weak record of MITRE ATLAS", async () => {
      // MITRE ATLAS is trusted press, but every match of it is by name: it gives only Low support,
      // so it is no publisher of Medium. It is still among the sources, and it still has its note.
      const NEWS = "https://www.reuters.com/technology/acme-breach";
      const { citation, seen } = citedRecord(ATLAS_RECORD);
      mocks.list.mockResolvedValue({
        rows: [
          credibleFinding({
            credibility: "medium",
            credibility_basis: {
              rule: "trusted_press_one",
              registry_version: "2026-10-29.1",
              name_only: true,
              sources: [
                {
                  url: NEWS,
                  category: "trusted_press",
                  publisher: "reuters",
                  publisher_name: "Reuters",
                  entry: "P1",
                  reviewed: true,
                  reading: "read",
                },
                seen,
              ],
            },
            sources: [
              {
                url: NEWS,
                title: "Acme breach",
                quote: "Acme was breached.",
                published_at: null,
                category: "trusted_press",
              },
              citation,
            ],
          }),
        ],
        total: 1,
      });
      renderSection();
      await screen.findByText(FIRST);

      const row = within(rowOf(FIRST));
      // The whole text of the element is the sentence: no second publisher in its brackets.
      expect(
        row.getByText(
          "Medium: one trusted publisher reports it (Reuters); no official source and no second independent publisher.",
        ),
      ).toBeInTheDocument();
      expect(row.getByText(NOTE)).toBeInTheDocument();
      expect(row.getByRole("link", { name: "atlas.mitre.org" })).toBeInTheDocument();
    });
  });

  describe("with the US Consolidated Screening List and the FDA recalls", () => {
    /**
     * One record of each list as a finding cites it: matched by name, so weak, and in the class of
     * its list (a government's own records are official). `dropped` is what the list does to a
     * record it no longer holds, with the line and the tag the screen then shows: the screening
     * list delists it, the recalls withdraw it. The ids and the companies are invented.
     */
    const LISTS = [
      {
        id: "csl",
        name: "US Consolidated Screening List",
        list: "US Consolidated Screening List",
        url: "https://www.trade.gov/consolidated-screening-list?list=el&entry=acmetradingco",
        host: "www.trade.gov",
        recordId: "el:acmetradingco",
        dropped: "delisted",
        droppedLine: "Low: US Consolidated Screening List removed the record on 9 Oct 2026.",
        droppedTag: "Removed from the list",
      },
      {
        id: "fda_device_recalls",
        name: "FDA recalls of AI-enabled medical devices",
        // "the {list} entry": a recall is an entry of the FDA's recall database.
        list: "FDA device recall database",
        url: "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?start_search=1&event_id=90001",
        host: "www.accessdata.fda.gov",
        recordId: "90001",
        dropped: "withdrawn",
        droppedLine:
          "Low: FDA recalls of AI-enabled medical devices withdrew the record on 9 Oct 2026.",
        droppedTag: "Record withdrawn",
      },
    ] as const;
    type ListUnderTest = (typeof LISTS)[number];
    const [CSL] = LISTS;

    /** The record as the finding cites it, and as the credibility rule saw it. */
    const citedRecord = (
      list: ListUnderTest,
      options: {
        status?: "active" | "withdrawn" | "delisted";
        match?: "weak" | "strong";
      } = {},
    ) => {
      const { status = "active", match = "weak" } = options;
      return {
        citation: {
          url: list.url,
          title: `Record ${list.recordId}`,
          quote: `A record of ${list.host}`,
          published_at: "2026-09-02",
          category: "official" as const,
          publisher: list.id,
          record: { source_id: list.id, record_id: 12, status, match_strength: match },
        },
        seen: {
          url: list.url,
          category: "official" as const,
          publisher: list.id,
          entry: null,
          reviewed: true,
          reading: "read" as const,
          record: {
            source: list.id,
            match,
            status,
            source_record_id: list.recordId,
            as_of: "2026-10-09",
          },
        },
      };
    };

    it.each(LISTS)(
      "a record of the $name matched by name shows the name-only line, the note and the official tag",
      async (list) => {
        const { citation, seen } = citedRecord(list);
        mocks.list.mockResolvedValue({
          rows: [
            credibleFinding({
              credibility: "low",
              credibility_basis: {
                rule: "name_only",
                registry_version: "2026-10-29.1",
                name_only: true,
                sources: [seen],
              },
              sources: [citation],
            }),
          ],
          total: 1,
        });
        renderSection();
        await screen.findByText(FIRST);

        const row = within(rowOf(FIRST));
        const line = row.getByText(`Low: the ${list.list} entry matches the vendor by name only.`);
        expect(follows(line, row.getByText(NOTE))).toBe(true);
        // The tag is the class of the list, on the line of the record's host.
        expectTag(rowOf(FIRST), list.host, "Official source");
      },
    );

    it.each(LISTS)(
      "a record the $name dropped is tagged $droppedTag, with the day of the copy in its line",
      async (list) => {
        const { citation, seen } = citedRecord(list, { status: list.dropped });
        mocks.list.mockResolvedValue({
          rows: [
            credibleFinding({
              credibility: "low",
              credibility_basis: {
                rule: "inactive",
                registry_version: "2026-10-29.1",
                name_only: true,
                sources: [seen],
              },
              sources: [citation],
            }),
          ],
          total: 1,
        });
        renderSection();
        await screen.findByText(FIRST);

        const row = within(rowOf(FIRST));
        const line = row.getByText(list.droppedLine);
        // A record matched by name carries the note, whatever the rule that decided the label.
        expect(follows(line, row.getByText(NOTE))).toBe(true);
        expectTag(rowOf(FIRST), list.host, list.droppedTag);
      },
    );

    it("a strong match of the US Consolidated Screening List reads as High, with no name-only note", async () => {
      // An entry that an OFAC list derives, matched by the vendor's website or its LEI.
      const { citation, seen } = citedRecord(CSL, { match: "strong" });
      mocks.list.mockResolvedValue({
        rows: [
          credibleFinding({
            credibility: "high",
            credibility_basis: {
              rule: "official_record",
              registry_version: "2026-10-29.1",
              name_only: false,
              sources: [seen],
            },
            sources: [citation],
          }),
        ],
        total: 1,
      });
      renderSection();
      await screen.findByText(FIRST);

      const row = within(rowOf(FIRST));
      expect(
        row.getByText(
          "High: US Consolidated Screening List lists it (el:acmetradingco), as of 9 Oct 2026.",
        ),
      ).toBeInTheDocument();
      expect(row.queryByText(NOTE)).not.toBeInTheDocument();
      expectTag(rowOf(FIRST), CSL.host, "Official source");
    });
  });

  it("tags each source with what kind of source it is, after its host", async () => {
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

    const row = rowOf(FIRST);
    for (const [tag, host] of [
      ["Official source", "sec.gov"],
      ["Trusted publisher", "reuters.com"],
      ["Vendor's own page", "status.acme.example"],
      ["Unverified source", "forum.example"],
    ]) {
      expectTag(row, host, tag);
    }
    // A source the rule did not see, or put in a class this screen does not know, has its host
    // alone on its line.
    for (const host of ["news.example.com", "odd.example"]) {
      expect(sourceLineOf(row, host).line.children).toHaveLength(1);
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

    const row = rowOf(FIRST);
    for (const [status, host] of [
      ["Record withdrawn", "a.example"],
      ["Record rejected", "b.example"],
      ["Removed from the list", "c.example"],
    ]) {
      expectTag(row, host, status);
    }
    // A record its source still stands by, and one in a state this screen does not know, say
    // nothing more than what kind of source it is.
    for (const host of ["d.example", "e.example"]) {
      expect(sourceLineOf(row, host).line.children).toHaveLength(2);
    }
    expect(within(row).queryByText("Active")).not.toBeInTheDocument();
    expect(within(row).queryByText("revoked")).not.toBeInTheDocument();
  });

  it("a finding without a label shows no credibility, and no confidence in its place", async () => {
    // The API sends a label for every finding; a list cached before the field existed has none.
    mocks.list.mockResolvedValue({
      rows: [
        finding({ credibility: null, credibility_basis: null }),
        secondFinding({ credibility: undefined, credibility_basis: undefined }),
      ],
      total: 2,
    });
    renderSection();
    await screen.findByText(FIRST);

    for (const [text, scales] of [
      [FIRST, "Severity: Major · Likelihood: Likely"],
      [SECOND, "Severity: Moderate · Likelihood: Possible"],
    ]) {
      const row = within(rowOf(text));
      expect(row.queryByText("Credibility")).not.toBeInTheDocument();
      expect(row.queryByText("Confidence")).not.toBeInTheDocument();
      // The scales of the register are still there.
      expect(row.getByText(scales)).toBeInTheDocument();
    }
  });

  it("shows no credibility for a label it does not know, and no confidence in its place", async () => {
    mocks.list.mockResolvedValue({
      rows: [credibleFinding({ credibility: "certain" as never })],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    expect(row.queryByText("Credibility")).not.toBeInTheDocument();
    expect(row.queryByText("Confidence")).not.toBeInTheDocument();
    expect(row.queryByText(KEV_LINE)).not.toBeInTheDocument();
  });

  it("shows the label alone, with no sentence, for a rule it does not know", async () => {
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
  /** What the server says of a label that is the earlier confidence of a finding. */
  const EARLIER_LINE =
    "Rated before the source rules; this is the earlier confidence level until the label is recomputed.";
  /** What the server says of it once the finding was accepted or dismissed. */
  const DECIDED_EARLIER_LINE = "Rated with the earlier confidence rule.";
  /** What the screen says of it: once, above the list, for every row that carries the asterisk. */
  const LEGEND =
    "* Earlier estimate: 1 of these findings was rated before the current rules for rating sources.";
  const follows = (a: HTMLElement, b: HTMLElement) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("a finding rated by its earlier confidence shows its label with an asterisk and its sources, the legend once above the list, and no source tag", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        finding({
          credibility: "medium",
          credibility_basis: { rule: "legacy_confidence" },
          credibility_rationale: EARLIER_LINE,
        }),
      ],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    const row = within(rowOf(FIRST));
    const line = row.getByText("Medium*: one source reports it (news.example.com).");
    // The label and what it rests on, then the reason for the level.
    expect(follows(row.getByText("Credibility"), line)).toBe(true);
    expect(follows(line, row.getByText("Why this risk level"))).toBe(true);
    // What the asterisk stands for is said once, above the list, and not in the row.
    const legend = screen.getByText(LEGEND);
    expect(follows(legend, screen.getByRole("list", { name: "Pending research findings" }))).toBe(
      true,
    );
    expect(rowOf(FIRST)).not.toContainElement(legend);
    // The screen words the line itself: the server's line is not shown.
    expect(screen.queryByText(EARLIER_LINE)).not.toBeInTheDocument();
    expect(screen.queryByText(DECIDED_EARLIER_LINE)).not.toBeInTheDocument();
    // It is the label that was shown, and no confidence.
    expect(row.queryByText("Confidence")).not.toBeInTheDocument();
    // Its sources are those of a run before the rule: none has a category, so none has a tag.
    for (const tag of [
      "Official source",
      "Trusted publisher",
      "Vendor's own page",
      "Unverified source",
    ]) {
      expect(row.queryByText(tag)).not.toBeInTheDocument();
    }
  });

  it.each(["low", "medium", "high"] as const)(
    "a finding whose earlier confidence was %s shows that label",
    async (level) => {
      mocks.list.mockResolvedValue({
        rows: [finding({ credibility: level, credibility_basis: { rule: "legacy_confidence" } })],
        total: 1,
      });
      renderSection();
      await screen.findByText(FIRST);

      const label = level[0].toUpperCase() + level.slice(1);
      expect(
        within(rowOf(FIRST)).getByText(`${label}*: one source reports it (news.example.com).`),
      ).toBeInTheDocument();
      expect(screen.getByText(LEGEND)).toBeInTheDocument();
    },
  );

  it("a finding with a label a rule decided has no asterisk, and the list no legend", async () => {
    mocks.list.mockResolvedValue({ rows: [credibleFinding(), secondFinding()], total: 2 });
    renderSection();
    await screen.findByText(FIRST);

    for (const text of [FIRST, SECOND]) {
      expect(within(rowOf(text)).queryByText(/\*/)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/^\* Earlier estimate/)).not.toBeInTheDocument();
    expect(screen.queryByText(EARLIER_LINE)).not.toBeInTheDocument();
    expect(screen.queryByText(DECIDED_EARLIER_LINE)).not.toBeInTheDocument();
  });

  it("a finding whose server line says it keeps the earlier rating is worded by the screen too", async () => {
    mocks.list.mockResolvedValue({
      rows: [
        finding({
          credibility: "high",
          credibility_basis: { rule: "legacy_confidence" },
          credibility_rationale: DECIDED_EARLIER_LINE,
        }),
      ],
      total: 1,
    });
    renderSection();
    await screen.findByText(FIRST);

    expect(
      within(rowOf(FIRST)).getByText("High*: one source reports it (news.example.com)."),
    ).toBeInTheDocument();
    expect(screen.getByText(LEGEND)).toBeInTheDocument();
    expect(screen.queryByText(DECIDED_EARLIER_LINE)).not.toBeInTheDocument();
    expect(screen.queryByText(EARLIER_LINE)).not.toBeInTheDocument();
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
    // It was rated by a rule, only again: it is no earlier estimate, so it has no asterisk.
    expect(within(rowOf(FIRST)).queryByText(/\*/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\* Earlier estimate/)).not.toBeInTheDocument();
  });

  it("a finding the backfill rated again shows each source's tag from its basis", async () => {
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
            // The basis holds another address at this place: no tag.
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

    const row = rowOf(FIRST);
    for (const [tag, host] of [
      ["Official source", "www.cisa.gov"],
      ["Trusted publisher", "www.reuters.com"],
    ]) {
      expectTag(row, host, tag);
    }
    expect(sourceLineOf(row, "forum.example").line.children).toHaveLength(1);
  });
});

describe("a role that cannot edit vendors", () => {
  it("sees the findings and the run, but no Preview, Dismiss or Research again", async () => {
    role.canEdit = false;
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    await openRunDetails();
    expect(screen.getByText("Security incidents: risks found")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview suggested risk" }),
    ).not.toBeInTheDocument();
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

  it("gives the buttons of the notice the small button height of 28px", async () => {
    acceptsAndLeavesOnlyTheSecond();
    renderSection();
    await screen.findByText(FIRST);
    await accept(FIRST);
    const notice = within(noticeOf(await screen.findByText("Risk added to the register.")));

    expect(notice.getByRole("button", { name: "Open risk" })).toHaveStyle({ height: "28px" });
    expect(notice.getByRole("button", { name: "Close" })).toHaveStyle({
      height: "28px",
      width: "28px",
    });
  });

  it("keeps the notice on screen, above the empty list, after the last pending finding is accepted", async () => {
    mocks.list.mockResolvedValue({ rows: [finding()], total: 1 });
    mocks.accept.mockImplementation(async () => {
      mocks.list.mockResolvedValue({ rows: [], total: 0 });
      return { finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() };
    });
    renderSection();
    await screen.findByText(FIRST);

    await accept(FIRST);

    expect(await screen.findByText("Risk added to the register.")).toBeInTheDocument();
    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
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
      expect(
        within(rowOf(SECOND)).getByRole("button", { name: "Preview suggested risk" }),
      ).toBeEnabled(),
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
      expect(
        within(rowOf(FIRST)).getByRole("button", { name: "Preview suggested risk" }),
      ).toBeEnabled(),
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
    expect(
      within(rowOf(FIRST)).getByRole("button", { name: "Preview suggested risk" }),
    ).toBeDisabled();
    expect(
      within(rowOf(SECOND)).getByRole("button", { name: "Preview suggested risk" }),
    ).toBeEnabled();
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
    expect(
      within(rowOf(SECOND)).getByRole("button", { name: "Preview suggested risk" }),
    ).toBeDisabled();
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
    expect(
      within(rowOf(FIRST)).getByRole("button", { name: "Preview suggested risk" }),
    ).toBeEnabled();
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
          within(rowOf(FIRST)).getByRole("button", {
            name: "Preview suggested risk",
            hidden: true,
          }),
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
      expect(
        row.getByRole("button", { name: "Preview suggested risk", hidden: true }),
      ).toBeDisabled();
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
  // Once nothing is left to decide, focus goes to the line that says so. The note at the top of the
  // section is the last resort, for a decision that leaves neither a row beside it nor that line:
  // the list read again after it holds only findings that were not on screen before (a run added
  // them meanwhile and every row that was beside the decided one is gone too), so there is no
  // neighbour to take the focus and the list is not empty. See "falls back to the note".
  const topNote = () => screen.getByText("AI-suggested from web sources. Verify before accepting.");
  const NEWCOMER = "The vendor does not publish a list of its sub-processors";
  const newcomer = () =>
    finding({ id: 3, category: "legal_regulatory", risk_description: NEWCOMER });
  const emptyLine = () => screen.getByText("No pending research findings.");
  const notSetUpLine = () => screen.getByText("Vendor research is not set up.");

  it("describes the Preview and Dismiss buttons of a row by the risk they decide on", async () => {
    renderSection();
    await screen.findByText(FIRST);

    const ids: string[] = [];
    for (const text of [FIRST, SECOND]) {
      for (const name of ["Dismiss", "Preview suggested risk"]) {
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

  it("moves focus to the line that says nothing is pending when the last pending finding is accepted", async () => {
    mocks.list.mockResolvedValue({ rows: [finding()], total: 1 });
    accepts([]);
    renderSection();
    await screen.findByText(FIRST);

    await accept(FIRST);

    await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(emptyLine()));
    // Not a stop of the tab order, only a place focus can be sent to.
    expect(emptyLine()).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).not.toBe(topNote());
  });

  it("moves focus to the line that says research is not set up when that is what the empty list says", async () => {
    mocks.config.mockResolvedValue({
      hasLlmKey: false,
      autoRunAllowed: true,
      autoRunEnabled: true,
    });
    mocks.list.mockResolvedValue({ rows: [finding()], total: 1 });
    accepts([]);
    renderSection();
    await screen.findByText(FIRST);

    await accept(FIRST);

    await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(notSetUpLine()));
    expect(notSetUpLine()).toHaveAttribute("tabindex", "-1");
    expect(screen.queryByText("No pending research findings.")).not.toBeInTheDocument();
  });

  // The list read again after the decision holds a finding that was not on screen before and none
  // of the rows beside the decided one: there is no neighbour to take the focus, and the empty
  // line is not shown because the list is not empty. The focus must still land somewhere on the
  // section, not stay on the page body, so it goes to the note at the top.
  it("falls back to the note at the top when the decided row leaves no neighbour and the list is not empty", async () => {
    mocks.list.mockResolvedValue({ rows: [finding()], total: 1 });
    accepts([newcomer()]);
    renderSection();
    await screen.findByText(FIRST);

    await accept(FIRST);

    await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
    expect(screen.getByText(NEWCOMER)).toBeInTheDocument();
    expect(screen.queryByText("No pending research findings.")).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(topNote()));
    // Like the empty line, a place focus can be sent to and not a stop of the tab order, and not
    // the newcomer's button either: that row was not beside the decision.
    expect(topNote()).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).not.toBe(firstButtonOf(NEWCOMER));
  });

  it("falls back to the note at the top after a dismissal in the same case", async () => {
    mocks.list.mockResolvedValue({ rows: [finding()], total: 1 });
    dismisses([newcomer()]);
    renderSection();
    await screen.findByText(FIRST);

    await dismissWithReason(FIRST);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
    expect(screen.getByText(NEWCOMER)).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(topNote()));
  });

  // A focus ring is the only thing that tells a keyboard user where the focus went. These two
  // elements take the focus from a script and are not stops of the tab order, so the browser shows
  // the ring for them only if nothing hides it: neither may carry an outline of "none".
  it("does not hide the focus ring of the two places the focus is sent to", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    const { unmount } = renderSection();
    await screen.findByText("No pending research findings.");
    // jsdom reports `outline-style: none` for an element nothing styles (it has no user-agent
    // sheet), so the declared shorthand is what tells: "" when nobody wrote one, "none" when a
    // style rule did.
    const hidesRing = (element: HTMLElement) =>
      window.getComputedStyle(element).outline.trim() === "none";

    expect(hidesRing(emptyLine())).toBe(false);
    expect(hidesRing(topNote())).toBe(false);
    unmount();
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

  it("moves focus to the line that says nothing is pending when the last pending finding is dismissed", async () => {
    mocks.list.mockResolvedValue({ rows: [finding()], total: 1 });
    dismisses([]);
    renderSection();
    await screen.findByText(FIRST);

    await dismissWithReason(FIRST);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(emptyLine()));
    expect(document.activeElement).not.toBe(topNote());
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
      expect(
        within(rowOf(FIRST)).getByRole("button", { name: "Preview suggested risk" }),
      ).toBeEnabled(),
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
    expect(
      first.getByRole("button", { name: "Preview suggested risk", hidden: true }),
    ).toBeDisabled();
    expect(
      second.getByRole("button", { name: "Preview suggested risk", hidden: true }),
    ).toBeEnabled();
  });

  it("leaves the modal of another finding open when an earlier dismissal finishes", async () => {
    const earlier = deferred<ReturnType<typeof finding>>();
    mocks.dismiss.mockReturnValueOnce(earlier.promise);
    renderSection();
    await screen.findByText(FIRST);
    const dialog = await openDismissal(FIRST);
    await choose(dialog, "Other");
    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledTimes(1));
    // The modal does not hold the user while the request is on its way.
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await openDismissal(SECOND);

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
    // The research of one vendor has no place among the findings of all of them.
    expect(screen.queryByText(/^Last researched:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Research again" })).not.toBeInTheDocument();
  });

  it("preselects the vendor named in the URL and asks for that vendor's findings", async () => {
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("Acme Cloud");
    expect(mocks.list).toHaveBeenCalledWith({ status: "pending", vendorId: 7, limit: 200 });
    expect(mocks.latest).toHaveBeenCalledWith(7);
  });

  it("treats a URL value that is not a vendor id as all vendors", async () => {
    renderSection({ route: "/vendors/research-findings?findingsVendorId=abc" });
    await screen.findByText(FIRST);

    expect(screen.getByRole("combobox")).toHaveTextContent("All vendors");
    expect(mocks.list).toHaveBeenCalledWith({ status: "pending", limit: 200 });
    expect(mocks.latest).not.toHaveBeenCalled();
  });

  it("still offers a vendor from the URL that the page's own list does not have", async () => {
    renderSection({ route: "/vendors/research-findings?findingsVendorId=99" });
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
    expect(await screen.findByText("Last researched: 10 Oct 2026")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "All vendors" }));
    await waitFor(() =>
      expect(mocks.list).toHaveBeenLastCalledWith({ status: "pending", limit: 200 }),
    );
    await waitFor(() => expect(screen.queryByText(/^Last researched:/)).not.toBeInTheDocument());
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

  it("moves to the vendor the new URL names, from a list with nothing pending", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    renderWithLink("/vendors/research-findings", "/vendors/research-findings?findingsVendorId=8");
    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("All vendors");

    await follow();

    await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("Zeta Labs"));
    expect(mocks.list).toHaveBeenLastCalledWith({ status: "pending", vendorId: 8, limit: 200 });
  });

  it("drops the notice of an earlier accept when it moves to the vendor of the new URL", async () => {
    mocks.accept.mockImplementation(async () => {
      mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
      return { finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() };
    });
    renderWithLink("/vendors/research-findings", "/vendors/research-findings?findingsVendorId=8");
    await screen.findByText(FIRST);
    await accept(FIRST);
    await screen.findByText("Risk added to the register.");

    await follow();

    await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("Zeta Labs"));
    expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument();
  });

  it("keeps the vendor the user is looking at when the URL loses its parameter", async () => {
    renderWithLink(WITH_VENDOR_7, "/vendors/research-findings");
    await screen.findByText(FIRST);

    await follow();

    expect(screen.getByRole("combobox")).toHaveTextContent("Acme Cloud");
    expect(screen.getByText(FIRST)).toBeInTheDocument();
  });
});

// A run started with "Research risks" on the vendors table cannot be followed there. The button
// leaves the vendor for the Research findings tab, whose section starts on it the next time it is
// mounted.
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

  it("starts on that vendor, even with nothing pending, and reads its run", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.latest.mockResolvedValue(run({ status: "queued" }));
    renderSection({ queryClient: afterStartFor(7) });

    expect(await screen.findByText("Researching…")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("Acme Cloud");
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
    expect(screen.getByText("No pending research findings.")).toBeInTheDocument();

    // The run finishes with a finding; the next read of the run sees it.
    mocks.latest.mockResolvedValue(run({ status: "completed", category_summary: FOUR_OUTCOMES }));
    mocks.list.mockResolvedValue({ rows: [finding()], total: 1 });
    await advance(3_000);
    await advance(10);

    expect(screen.getByText("Last researched: 10 Oct 2026")).toBeInTheDocument();
    expect(screen.getByText(FIRST)).toBeInTheDocument();
    expect(screen.getByText("1 possible risk to review. It is high risk.")).toBeInTheDocument();
    expect(screen.queryByText("No pending research findings.")).not.toBeInTheDocument();
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

  // The button on the vendors table is answered when the server has queued the run, which can be
  // after the person has opened this tab: the section is mounted, and read its hint (none) then.
  describe("a start that is answered after the section was opened", () => {
    it("moves to the vendor and reads its run", async () => {
      const queryClient = newQueryClient();
      renderSection({ queryClient });
      await screen.findByText(FIRST);
      expect(screen.getByRole("combobox")).toHaveTextContent("All vendors");
      expect(mocks.latest).not.toHaveBeenCalled();

      mocks.list.mockResolvedValue({ rows: [], total: 0 });
      mocks.latest.mockResolvedValue(run({ status: "queued" }));
      act(() => followResearch(queryClient, 7));

      expect(await screen.findByText("Researching…")).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toHaveTextContent("Acme Cloud");
      expect(mocks.list).toHaveBeenCalledWith({ status: "pending", vendorId: 7, limit: 200 });
      expect(mocks.latest).toHaveBeenCalledWith(7);
    });

    it("uses the hint up, so that the next visit opens on all vendors", async () => {
      const queryClient = newQueryClient();
      const first = renderSection({ queryClient });
      await screen.findByText(FIRST);
      mocks.latest.mockResolvedValue(run({ status: "queued" }));
      act(() => followResearch(queryClient, 7));
      await screen.findByText("Researching…");
      expect(queryClient.getQueryData(VENDOR_RESEARCH_FOLLOW_KEY)).toBeUndefined();
      first.unmount();
      vi.clearAllMocks();
      mocks.list.mockResolvedValue({ rows: [finding(), secondFinding()], total: 2 });
      mocks.latest.mockResolvedValue(run());

      renderSection({ queryClient });

      expect(await screen.findByText(FIRST)).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toHaveTextContent("All vendors");
      expect(mocks.latest).not.toHaveBeenCalled();
    });

    // A start is something the person has just done, and a vendor picked by hand is older.
    it("takes the place of a vendor that was picked by hand", async () => {
      const queryClient = newQueryClient();
      renderSection({ queryClient, route: WITH_VENDOR_7 });
      await screen.findByText(FIRST);
      expect(screen.getByRole("combobox")).toHaveTextContent("Acme Cloud");

      act(() => followResearch(queryClient, 8));

      await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("Zeta Labs"));
      expect(mocks.list).toHaveBeenCalledWith({ status: "pending", vendorId: 8, limit: 200 });
      expect(mocks.latest).toHaveBeenCalledWith(8);
    });

    it("forgets the finding that was just accepted, as choosing another vendor does", async () => {
      acceptsAndLeavesOnlyTheSecond();
      const queryClient = newQueryClient();
      renderSection({ queryClient });
      await screen.findByText(FIRST);
      await accept(FIRST);
      await screen.findByText("Risk added to the register.");

      act(() => followResearch(queryClient, 8));

      await waitFor(() =>
        expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument(),
      );
    });
  });
});

describe("the latest run of the chosen vendor", () => {
  it("lists what happened in each of the four categories", async () => {
    renderSection({ route: WITH_VENDOR_7 });
    await openRunDetails();

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
    expect(screen.getByText("Last researched: 10 Oct 2026")).toBeInTheDocument();
  });

  it("shows a note the model wrote as plain text under an unverified label", async () => {
    const note = `${MODEL_NOTE} <script>alert(1)</script>`;
    mocks.latest.mockResolvedValue(
      run({
        category_summary: [{ category: "certifications", outcome: "nothing_found", note }],
      }),
    );
    const { container } = renderSection({ route: WITH_VENDOR_7 });
    await openRunDetails();

    expect(screen.getByText("AI note (unverified)")).toBeInTheDocument();
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
    await openRunDetails();

    expect(screen.getByText("Certifications: risks found")).toBeInTheDocument();
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
    // A run that found and checked nothing has nothing to open either.
    expect(screen.queryByRole("button", { name: "How it was researched" })).not.toBeInTheDocument();
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
    await openRunDetails();
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
    await openRunDetails();

    expect(screen.getByText("Searches: 6, pages read: 4")).toBeInTheDocument();
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
    await openRunDetails();

    expect(screen.getByText("Searches: 3, pages read: 0")).toBeInTheDocument();
  });

  it("shows no such line for a run that did nothing, and none while it is active", async () => {
    mocks.latest.mockResolvedValue(
      run({ category_summary: FOUR_OUTCOMES, searches_used: 0, pages_read: 0 }),
    );
    const { unmount } = renderSection({ route: WITH_VENDOR_7 });
    await openRunDetails();

    expect(screen.getByText("Security incidents: risks found")).toBeInTheDocument();
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

    expect(await screen.findByText("Last researched: 10 Oct 2026")).toBeInTheDocument();
    expect(screen.queryByText("Could not load the latest research run.")).not.toBeInTheDocument();
  });
});

describe("the coverage of the latest run", () => {
  const follows = (a: HTMLElement, b: HTMLElement) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const CHECKED =
    "Checked 4 public lists and registers. 1 had a record: CISA Known Exploited Vulnerabilities.";

  it("lists the checked sources and their counts", async () => {
    mocks.latest.mockResolvedValue(
      run({ category_summary: FOUR_OUTCOMES, coverage: coverage(), searches_used: 3 }),
    );
    renderSection({ route: WITH_VENDOR_7 });
    await openRunDetails();

    const checked = screen.getByText(CHECKED);
    expect(
      screen.getByText("Also checked: the National Vulnerability Database."),
    ).toBeInTheDocument();
    expect(screen.getByText("Data as of 10 Oct 2026.")).toBeInTheDocument();
    const cited = screen.getByText(
      "Sources cited: 1 official, 0 trusted press, 0 vendor, 0 unverified",
    );
    // After the categories, before what the run did.
    expect(follows(screen.getByText("AI-specific risks: skipped"), checked)).toBe(true);
    expect(follows(checked, cited)).toBe(true);
    expect(follows(cited, screen.getByText("Searches: 3, pages read: 0"))).toBe(true);
    // The names are the screen's own: the server's are never shown.
    expect(screen.queryByText(/The server's/)).not.toBeInTheDocument();
  });

  it("names the lists that held nothing only behind Show all lists, and never twice", async () => {
    mocks.latest.mockResolvedValue(run({ coverage: coverage() }));
    renderSection({ route: WITH_VENDOR_7 });
    await openRunDetails();

    const ALL =
      "No records: OFAC Specially Designated Nationals list, UK Sanctions List, EU consolidated list of financial sanctions.";
    // The coverage lines name it nowhere else; the credits under the findings carry the list's
    // own words, which name it, and stay on screen as its licence asks.
    const named = () =>
      screen.queryAllByText(
        (text) => text.includes("UK Sanctions List") && !text.startsWith("Data sources:"),
      );
    expect(screen.getByText(/^Data sources:.*UK Sanctions List, FCDO/)).toBeInTheDocument();
    expect(screen.queryByText(ALL)).not.toBeInTheDocument();
    expect(named()).toHaveLength(0);
    const toggle = screen.getByRole("button", { name: "Show all lists" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await openAllLists();
    expect(screen.getByText(ALL)).toBeInTheDocument();
    expect(named()).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Hide the lists" }));
    expect(screen.queryByText(ALL)).not.toBeInTheDocument();
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
    await openRunDetails();

    const notChecked = screen.getByText(
      "Not checked: OFAC Specially Designated Nationals list, the vendor's status page",
    );
    expect(follows(screen.getByText(/^Checked \d/), notChecked)).toBe(true);
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
    await openRunDetails();
    expect(screen.queryByText(/^Checked/)).not.toBeInTheDocument();
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

  // A finding on screen can come from an earlier run than the latest: its list is credited from
  // the finding, whatever the latest run did.
  describe("of the lists the findings on screen cite", () => {
    const KEV_LINE = `Data sources: ${ATTRIBUTIONS[0]}`;

    it.each([
      ["failed with no coverage", run({ status: "failed", coverage: null, error: "x" })],
      ["still going", run({ status: "running", coverage: null, progress: progress() })],
      [
        "did not ask the list",
        run({
          coverage: coverage({
            sources: [listCopy("ofac")],
            lookups: [],
          }),
        }),
      ],
    ])("credits the list of a finding when the latest run %s", async (_name, latest) => {
      mocks.list.mockResolvedValue({ rows: [credibleFinding()], total: 1 });
      mocks.latest.mockResolvedValue(latest);
      renderSection({ route: WITH_VENDOR_7 });
      await screen.findByText(FIRST);

      const expected =
        latest.status === "completed"
          ? `Data sources: ${joinAttributions([ATTRIBUTIONS[1], ATTRIBUTIONS[0]])}`
          : KEV_LINE;
      const line = await screen.findByText(expected);
      expect(line.closest("[data-vw-no-translate]")).not.toBeNull();
      expect(screen.getAllByText(/^Data sources:/)).toHaveLength(1);
    });

    it("credits a list once when both the run and a finding name it", async () => {
      mocks.list.mockResolvedValue({ rows: [credibleFinding()], total: 1 });
      mocks.latest.mockResolvedValue(run({ coverage: coverage() }));
      renderSection({ route: WITH_VENDOR_7 });

      expect(
        await screen.findByText(`Data sources: ${joinAttributions(ATTRIBUTIONS)}`),
      ).toBeInTheDocument();
    });

    it("credits the lists the findings cite with every vendor listed", async () => {
      mocks.list.mockResolvedValue({ rows: [credibleFinding(), secondFinding()], total: 2 });
      renderSection();

      expect(await screen.findByText(KEV_LINE)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "GDELT Project" })).not.toBeInTheDocument();
    });

    it("credits nothing for findings that cite no list", async () => {
      mocks.latest.mockResolvedValue(run({ status: "failed", coverage: null, error: "x" }));
      renderSection({ route: WITH_VENDOR_7 });
      await screen.findByText(FIRST);

      expect(screen.queryByText(/^Data sources:/)).not.toBeInTheDocument();
    });
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
    await openRunDetails();

    expect(
      screen.getByText(
        "Checked 5 public lists and registers. 2 had records: CISA Known Exploited Vulnerabilities, the National Vulnerability Database.",
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

  it("lists the AI-specific lists the run checked, with their notices as their owners wrote them", async () => {
    // The notice of the ATLAS case studies names the year of the day: stand the clock still at 2026.
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    mocks.latest.mockResolvedValue(
      run({
        coverage: coverage({
          sources: [
            listCopy("aiid", { outcome: "found", weak: 2 }),
            listCopy("atlas", { outcome: "found", weak: 1 }),
            listCopy("nhtsa_sgo"),
            listCopy("fda_ai_devices", { stale: true }),
          ],
          lookups: [],
          cited: { official: 0, trusted_press: 1, vendor: 0, unverified: 2 },
        }),
      }),
    );
    renderSection({ route: WITH_VENDOR_7 });
    await openRunDetails();

    expect(
      screen.getByText(
        "Checked 4 public lists and registers. 2 had records: AI Incident Database, MITRE ATLAS case studies.",
      ),
    ).toBeInTheDocument();
    await openAllLists();
    expect(
      screen.getByText(
        "No records: NHTSA Standing General Order crash reports, FDA list of AI-enabled medical devices.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "FDA list of AI-enabled medical devices: last updated 10 Oct 2026, not up to date",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sources cited: 0 official, 1 trusted press, 0 vendor, 2 unverified"),
    ).toBeInTheDocument();
    const line = screen.getByText(
      `Data sources: ${joinAttributions([
        "AI Incident Database, Responsible AI Collaborative (incidentdatabase.ai), CC BY-SA 4.0. Adapted by VerifyWise; the adapted records are shared under CC BY-SA 4.0.",
        "MITRE ATLAS™ case studies, Copyright 2021-2026 The MITRE Corporation, under the Apache License 2.0. Adapted by VerifyWise.",
        "NHTSA Standing General Order crash reports, US Department of Transportation. Counted by VerifyWise; NHTSA states the data may be incomplete or unverified.",
        "FDA list of AI-enabled medical devices, US Food and Drug Administration",
      ])}`,
    );
    // The share-alike notice is never translated: it is a condition of the licence.
    expect(line.closest("[data-vw-no-translate]")).not.toBeNull();
  });

  it("names the AI-specific lists the run could not check, and says nothing of the ones it did not ask", async () => {
    mocks.latest.mockResolvedValue(
      run({
        coverage: coverage({
          sources: [
            listCopy("atlas", { checked: false, outcome: "failed", last_success_at: null }),
            listCopy("nhtsa_sgo", { checked: false, outcome: "not_researched" }),
            listCopy("fda_ai_devices", { outcome: "found", weak: 3 }),
          ],
          lookups: [],
        }),
      }),
    );
    renderSection({ route: WITH_VENDOR_7 });
    await openRunDetails();

    expect(screen.getByText("Not checked: MITRE ATLAS case studies")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Checked 1 public list or register. 1 had a record: FDA list of AI-enabled medical devices.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Data sources: FDA list of AI-enabled medical devices,/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/NHTSA Standing General Order crash reports/),
    ).not.toBeInTheDocument();
  });

  describe("with the US Consolidated Screening List and the FDA recalls of AI-enabled devices", () => {
    /** What the terms of the two lists ask a screen to say, as the server stores it (vrdb/sources.ts). */
    const CSL_NOTICE =
      "This product uses data from the International Trade Administration's Consolidated Screening List but is not endorsed or certified by the International Trade Administration. Entries adapted by VerifyWise.";
    const RECALLS_NOTICE =
      "FDA medical device recalls and enforcement reports through openFDA, US Food and Drug Administration (CC0 1.0), joined by VerifyWise to the FDA list of AI-enabled medical devices. Data provided by the U.S. Food and Drug Administration (https://open.fda.gov).";

    it("lists the two lists the run checked, with their notices as their owners wrote them", async () => {
      mocks.latest.mockResolvedValue(
        run({
          coverage: coverage({
            sources: [
              listCopy("csl", { outcome: "found", weak: 2 }),
              listCopy("fda_device_recalls", { stale: true }),
            ],
            lookups: [],
            cited: { official: 2, trusted_press: 0, vendor: 0, unverified: 0 },
          }),
        }),
      );
      renderSection({ route: WITH_VENDOR_7 });
      await openRunDetails();

      expect(
        screen.getByText(
          "Checked 2 public lists and registers. 1 had a record: US Consolidated Screening List.",
        ),
      ).toBeInTheDocument();
      await openAllLists();
      expect(
        screen.getByText("No records: FDA recalls of AI-enabled medical devices."),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "FDA recalls of AI-enabled medical devices: last updated 10 Oct 2026, not up to date",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Sources cited: 2 official, 0 trusted press, 0 vendor, 0 unverified"),
      ).toBeInTheDocument();
      const line = screen.getByText(
        `Data sources: ${joinAttributions([CSL_NOTICE, RECALLS_NOTICE])}`,
      );
      // The words of a notice are never translated, and the full stop of the first is not doubled.
      expect(line.closest("[data-vw-no-translate]")).not.toBeNull();
      expect(line.textContent).toContain(
        "Entries adapted by VerifyWise; FDA medical device recalls",
      );
      expect(line.textContent).not.toContain("Data API");
    });

    it("names the screening list when the run could not check it, and says nothing of the recalls it did not ask", async () => {
      mocks.latest.mockResolvedValue(
        run({
          coverage: coverage({
            sources: [
              listCopy("csl", { checked: false, outcome: "failed", last_success_at: null }),
              listCopy("fda_device_recalls", { checked: false, outcome: "not_researched" }),
              listCopy("kev", { outcome: "found", strong: 1 }),
            ],
            lookups: [],
          }),
        }),
      );
      renderSection({ route: WITH_VENDOR_7 });
      await openRunDetails();

      expect(screen.getByText("Not checked: US Consolidated Screening List")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Checked 1 public list or register. 1 had a record: CISA Known Exploited Vulnerabilities.",
        ),
      ).toBeInTheDocument();
      // Neither notice is shown: nothing of the two lists is in the findings.
      expect(screen.queryByText(/Consolidated Screening List but is not endorsed/)).toBeNull();
      expect(screen.queryByText(/FDA recalls of AI-enabled medical devices/)).toBeNull();
      expect(screen.queryByText(/openFDA/)).toBeNull();
    });

    it("turned off, they are off with the other lists", async () => {
      mocks.latest.mockResolvedValue(
        run({
          coverage: coverage({
            sources: (["kev", "csl", "fda_device_recalls"] as const).map((id) =>
              listCopy(id, { checked: false, outcome: "off" }),
            ),
            lookups: [],
            cited: { official: 0, trusted_press: 0, vendor: 0, unverified: 0 },
          }),
        }),
      );
      renderSection({ route: WITH_VENDOR_7 });

      expect(await screen.findByText("Public databases turned off")).toBeInTheDocument();
      await openRunDetails();
      expect(screen.queryByText(/^Checked/)).not.toBeInTheDocument();
      expect(screen.queryByText(/^Data sources:/)).not.toBeInTheDocument();
    });
  });

  describe("with the lists added on 2026-11-10", () => {
    /** The notice of the UK OFSI list, as the server stores it (vrdb/sources.ts). */
    const OFSI_NOTICE =
      "UK Office of Financial Sanctions Implementation (HM Treasury) enforcement notices, published on GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0. Adapted by VerifyWise; no endorsement by HM Treasury is implied.";

    it("names the lists that held a record, the others only behind Show all lists, and credits only the first", async () => {
      mocks.latest.mockResolvedValue(
        run({
          coverage: coverage({
            sources: [
              listCopy("kev", { outcome: "found", strong: 1 }),
              listCopy("uk_ofsi", { outcome: "found", weak: 1 }),
              listCopy("charlotin"),
              listCopy("epoch_ai"),
              listCopy("gleif", {
                mode: "read_through",
                checked: false,
                outcome: "failed",
                last_success_at: null,
              }),
            ],
            lookups: [],
          }),
        }),
      );
      renderSection({ route: WITH_VENDOR_7 });
      await openRunDetails();

      expect(
        await screen.findByText(
          "Checked 4 public lists and registers. 2 had records: CISA Known Exploited Vulnerabilities, UK OFSI financial sanctions enforcement notices.",
        ),
      ).toBeInTheDocument();
      // A list that could not be checked is always named: a silent gap would read as a clean check.
      // The summary says so without a click, and the line is behind the button with the others.
      expect(
        screen.getByText(
          "One source could not be checked, so results may be incomplete: GLEIF LEI records.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Not checked: GLEIF LEI records")).toBeInTheDocument();
      // The lists that held nothing are named only on request, and owe no credit.
      expect(screen.queryByText(/AI Hallucination Cases/)).toBeNull();
      expect(screen.queryByText(/Epoch AI/)).toBeNull();
      await openAllLists();
      expect(
        screen.getByText(
          "No records: AI Hallucination Cases database, Epoch AI Data on AI Models.",
        ),
      ).toBeInTheDocument();
      const line = screen.getByText(
        `Data sources: ${joinAttributions([ATTRIBUTIONS[0], OFSI_NOTICE])}`,
      );
      expect(line.closest("[data-vw-no-translate]")).not.toBeNull();
    });

    it("counts the lists a run asked when none of them held a record, and credits none", async () => {
      mocks.latest.mockResolvedValue(
        run({
          coverage: coverage({
            sources: [listCopy("charlotin"), listCopy("epoch_ai"), listCopy("gleif")],
            lookups: [],
            cited: { official: 0, trusted_press: 0, vendor: 0, unverified: 0 },
          }),
        }),
      );
      renderSection({ route: WITH_VENDOR_7 });
      await openRunDetails();

      expect(
        await screen.findByText("Checked 3 public lists and registers. None had a record."),
      ).toBeInTheDocument();
      expect(screen.queryByText(/^Data sources:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/^Not checked:/)).not.toBeInTheDocument();
    });
  });

  it("a run without coverage shows no coverage block", async () => {
    for (const latest of [run({ category_summary: FOUR_OUTCOMES }), run({ coverage: null })]) {
      mocks.latest.mockResolvedValue(latest);
      const view = renderSection({ route: WITH_VENDOR_7 });
      expect(await screen.findByText("Last researched: 10 Oct 2026")).toBeInTheDocument();
      // A run with categories keeps them behind its button; a run with nothing has no button.
      // Either way, nothing on screen or behind the button says what was checked.
      const details = screen.queryByRole("button", { name: "How it was researched" });
      if (details !== null) await userEvent.click(details);
      expect(screen.queryByText("What it checked")).not.toBeInTheDocument();
      for (const start of [
        /^Checked/,
        /^Not checked:/,
        /^No records:/,
        /^Data as of/,
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
  /**
   * The section on a vendor whose run is still going when the polling window ends: a run in its
   * research loop, which writes its progress after every search or read, so a turn of the model
   * and the action after it without a move is long (TURN_QUIET_MS).
   */
  const renderUntilWindowEnds = async () => {
    vi.useFakeTimers();
    mocks.latest.mockResolvedValue(run({ status: "running", progress: progress() }));
    const view = renderSection({ route: WITH_VENDOR_7 });
    await advance(10);
    expect(screen.getByText("Researching…")).toBeInTheDocument();
    await advance(TURN_QUIET_MS);
    expect(screen.getByText("Still running. Check back later.")).toBeInTheDocument();
    return view;
  };

  it("says it is still running and allows another start, once polling has stopped", async () => {
    vi.useFakeTimers();
    mocks.latest.mockResolvedValue(run({ status: "running", progress: progress() }));
    renderSection({ route: WITH_VENDOR_7 });

    await advance(10);
    expect(screen.getByText("Researching…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Research again" })).toBeDisabled();

    await advance(TURN_QUIET_MS);

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

  // The analysis writes no progress for minutes (its model call, then the checks of the quotes and
  // the SEC filers), and neither do the website check and the gathering before the first turn.
  it.each([
    ["analysing what was found", progress({ phase: "analysing" }), "Analysing what was found"],
    ["starting the research", progress({ steps: 0, action: null, category: null }), null],
  ] as const)(
    "keeps following a run that is %s past 2 minutes without a move",
    async (_name, silent, line) => {
      vi.useFakeTimers();
      mocks.latest.mockResolvedValue(run({ status: "running", progress: silent }));
      renderSection({ route: WITH_VENDOR_7 });
      await advance(10);
      if (line !== null) expect(screen.getByText(line)).toBeInTheDocument();

      await advance(240_000);

      expect(screen.getByText("Researching…")).toBeInTheDocument();
      expect(screen.queryByText("Still running. Check back later.")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Research again" })).toBeDisabled();
    },
  );

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

    expect(screen.getByText("Last researched: 10 Oct 2026")).toBeInTheDocument();
    expect(screen.getByText(FIRST)).toBeInTheDocument();
    expect(screen.getByText("1 possible risk to review. It is high risk.")).toBeInTheDocument();
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

    await advance(TURN_QUIET_MS);

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
    expect(screen.getByText("Last researched: 10 Oct 2026")).toBeInTheDocument();
  });

  it("is followed to its end for as long as it moves, beyond the window of a quiet run", async () => {
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

    // Eight minutes, longer than the window, with a move every minute.
    for (let minute = 0; minute < 8; minute += 1) {
      moved += 60;
      await advance(60_000);
    }
    expect(screen.getByText("Researching…")).toBeInTheDocument();
    expect(screen.queryByText("Still running. Check back later.")).not.toBeInTheDocument();

    // Then nothing moves any more: after the window the screen says it is still running.
    await advance(TURN_QUIET_MS + 5_000);
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
        body: "Research started for Acme Cloud. Findings appear on the Research findings tab.",
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

  it("are offered to a role that manages the LLM keys when the organization has one, and open in a window", async () => {
    role.canManageKeys = true;
    renderSection({ route: WITH_VENDOR_7 });

    await userEvent.click(await screen.findByRole("button", SETTINGS_BUTTON));

    const dialog = await screen.findByRole("dialog", { name: "Research settings" });
    // The research key, the analysis key and the scheduled scan.
    expect(await within(dialog).findAllByRole("combobox")).toHaveLength(3);
  });

  it("are offered to a custom role that manages the LLM keys, though it is not Admin", async () => {
    role.canManageKeys = true;
    role.isAdmin = false;
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByRole("button", SETTINGS_BUTTON)).toBeInTheDocument();
  });

  it("are not offered to an Admin role that does not manage the LLM keys", async () => {
    role.canManageKeys = false;
    role.isAdmin = true;
    renderSection({ route: WITH_VENDOR_7 });
    await screen.findByText(FIRST);

    expect(screen.queryByRole("button", SETTINGS_BUTTON)).not.toBeInTheDocument();
  });

  it("are not offered to anyone who does not manage the LLM keys, and the server is not asked for them", async () => {
    role.canManageKeys = false;
    renderSection({ route: WITH_VENDOR_7 });
    await screen.findByText(FIRST);

    expect(screen.queryByRole("button", SETTINGS_BUTTON)).not.toBeInTheDocument();
    expect(mocks.settings).not.toHaveBeenCalled();
  });

  it("are not offered while the organization has no LLM key, because there is nothing to choose from", async () => {
    role.canManageKeys = true;
    mocks.config.mockResolvedValue({
      hasLlmKey: false,
      autoRunAllowed: true,
      autoRunEnabled: true,
    });
    renderSection({ route: WITH_VENDOR_7 });
    await screen.findByText(FIRST);

    expect(screen.queryByRole("button", SETTINGS_BUTTON)).not.toBeInTheDocument();
  });

  it("are not offered before it is known whether the organization has an LLM key", async () => {
    role.canManageKeys = true;
    mocks.config.mockReturnValue(new Promise(() => {}));
    renderSection({ route: WITH_VENDOR_7 });
    await screen.findByText(FIRST);

    expect(screen.queryByRole("button", SETTINGS_BUTTON)).not.toBeInTheDocument();
  });

  it("are not read from the server until the window is opened", async () => {
    role.canManageKeys = true;
    renderSection({ route: WITH_VENDOR_7 });
    const button = await screen.findByRole("button", SETTINGS_BUTTON);
    expect(mocks.settings).not.toHaveBeenCalled();

    await userEvent.click(button);

    await screen.findByRole("dialog", { name: "Research settings" });
    expect(mocks.settings).toHaveBeenCalledTimes(1);
  });

  it("tell the page when they were saved, and the window closes", async () => {
    role.canManageKeys = true;
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
    role.canManageKeys = true;
    mocks.settings.mockResolvedValue({
      researchKeyId: 20,
      analysisKeyId: null,
      scanIntervalDays: null,
      autoResearchOnCreate: true,
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
