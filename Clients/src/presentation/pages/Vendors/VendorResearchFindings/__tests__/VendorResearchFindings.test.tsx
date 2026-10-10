import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useNavigate } from "react-router";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import {
  acceptedRisk,
  deferred,
  finding,
  FOUR_OUTCOMES,
  MODEL_NOTE,
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

const VENDORS = [
  { id: 8, vendor_name: "Zeta Labs" },
  { id: 7, vendor_name: "Acme Cloud" },
];
const WITH_VENDOR_7 = "/vendors/risks?findingsVendorId=7";

const renderSection = (options: { route?: string; vendors?: typeof VENDORS } = {}) => {
  const handlers = { onOpenRisk: vi.fn(), onNotify: vi.fn() };
  const view = renderWithProviders(
    <VendorResearchFindings vendors={options.vendors ?? VENDORS} {...handlers} />,
    { route: options.route ?? "/vendors/risks" },
  );
  return { ...view, ...handlers };
};

const header = () => screen.getByRole("button", { name: /^Research findings/ });
const rowOf = (text: string) => screen.getByText(text).closest("li") as HTMLElement;
const noticeOf = (text: HTMLElement) => text.closest("[role='status']") as HTMLElement;
/** The options of the open select, by name. The shared Select writes a space after each name. */
const optionNames = async () =>
  (await screen.findAllByRole("option")).map((option) => option.textContent?.trim());
const FIRST = "Customer data was exposed in a breach";
const SECOND = "The ISO 27001 certificate has lapsed";

beforeEach(() => {
  vi.clearAllMocks();
  role.canEdit = true;
  role.isAdmin = false;
  mocks.config.mockResolvedValue({ searchConfigured: true, hasLlmKey: true, autoRunEnabled: true });
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

    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Accept" }));

    expect(await screen.findByText("Could not load research findings.")).toBeInTheDocument();
    expect(screen.queryByText(SECOND)).not.toBeInTheDocument();
  });

  it.each([
    ["there is no search provider", { searchConfigured: false, hasLlmKey: true }],
    ["the organization has no LLM key", { searchConfigured: true, hasLlmKey: false }],
  ])("says research is not set up when nothing is pending and %s", async (_case, setup) => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.config.mockResolvedValue({ ...setup, autoRunEnabled: true });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Vendor research is not set up.")).toBeInTheDocument();
    expect(screen.queryByText("No pending research findings.")).not.toBeInTheDocument();
  });

  it("tells an Admin which settings are missing", async () => {
    role.isAdmin = true;
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.config.mockResolvedValue({
      searchConfigured: false,
      hasLlmKey: false,
      autoRunEnabled: true,
    });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Vendor research is not set up.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Set VENDOR_RESEARCH_SEARCH_PROVIDER and TAVILY_API_KEY in the server environment, and add an LLM key for your organization.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the setup hint from everyone who is not an Admin", async () => {
    role.isAdmin = false;
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    mocks.config.mockResolvedValue({
      searchConfigured: false,
      hasLlmKey: false,
      autoRunEnabled: true,
    });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("Vendor research is not set up.")).toBeInTheDocument();
    expect(screen.queryByText(/VENDOR_RESEARCH_SEARCH_PROVIDER/)).not.toBeInTheDocument();
    expect(screen.queryByText(/TAVILY_API_KEY/)).not.toBeInTheDocument();
  });

  it("says nothing is pending when the setup is complete and the list is empty", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
    expect(screen.queryByText("Vendor research is not set up.")).not.toBeInTheDocument();
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
      config.resolve({ searchConfigured: true, hasLlmKey: true, autoRunEnabled: true });
    });
    expect(await screen.findByText("No pending research findings.")).toBeInTheDocument();
  });

  it("shows the rows even when the organization is not set up, and only disables Research again", async () => {
    mocks.config.mockResolvedValue({
      searchConfigured: false,
      hasLlmKey: true,
      autoRunEnabled: true,
    });
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    // The button is rebuilt inside its tooltip once the settings say research is not set up.
    const againButton = () => screen.getByRole("button", { name: "Research again" });
    await waitFor(() => expect(againButton()).toBeDisabled());
    await userEvent.hover(againButton().parentElement as HTMLElement);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Vendor research is not set up.");
    // Accepting what was found does not depend on the setup.
    expect(within(rowOf(FIRST)).getByRole("button", { name: "Accept" })).toBeEnabled();
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

  it("renders a quote as plain text, never as markup", async () => {
    const quote = "<img src=x onerror=alert(1)>";
    mocks.list.mockResolvedValue({
      rows: [
        finding({
          risk_description: "<b>Bold claim</b>",
          sources: [{ url: "https://news.example.com/a", title: "t", quote, published_at: null }],
        }),
      ],
      total: 1,
    });
    const { container } = renderSection();

    expect(await screen.findByText(quote)).toBeInTheDocument();
    expect(screen.getByText("<b>Bold claim</b>")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(document.body.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
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

describe("a role that cannot edit risks", () => {
  it("sees the findings and the run, but no Accept, Dismiss or Research again", async () => {
    role.canEdit = false;
    renderSection({ route: WITH_VENDOR_7 });

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    expect(await screen.findByText("Security incidents: risks found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Research again" })).not.toBeInTheDocument();
  });
});

describe("accepting a finding", () => {
  const acceptsAndLeavesOnlyTheSecond = () =>
    mocks.accept.mockImplementation(async () => {
      mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
      return { finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() };
    });

  it("sends the finding's id with an empty body, then says so and offers to open the risk", async () => {
    acceptsAndLeavesOnlyTheSecond();
    const { onNotify, onOpenRisk } = renderSection();
    await screen.findByText(FIRST);

    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith(1, {}));
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
    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Accept" }));
    const notice = noticeOf(await screen.findByText("Risk added to the register."));

    await userEvent.click(within(notice).getByRole("button", { name: "Close" }));

    expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument();
  });

  it("gives the buttons of the notice the house control height of 30px", async () => {
    acceptsAndLeavesOnlyTheSecond();
    renderSection();
    await screen.findByText(FIRST);
    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Accept" }));
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

    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Accept" }));

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
    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Accept" }));
    await screen.findByText("Risk added to the register.");
    await userEvent.click(within(rowOf(SECOND)).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(screen.queryByText(SECOND)).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Open risk" }));

    expect(onOpenRisk).toHaveBeenCalledTimes(1);
    expect(onOpenRisk).toHaveBeenCalledWith(78);
  });

  it("drops the notice when another vendor is chosen", async () => {
    acceptsAndLeavesOnlyTheSecond();
    renderSection();
    await screen.findByText(FIRST);
    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Accept" }));
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
    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Accept" }));
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
    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Accept" }));
    await screen.findByText("Risk added to the register.");

    await userEvent.click(within(rowOf(SECOND)).getByRole("button", { name: "Accept" }));

    // Gone as the request leaves, while it is still on its way...
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument();
    // ...and it does not come back when that request is refused.
    await act(async () => {
      second.reject(refusal(409, "Finding already accepted"));
    });
    await waitFor(() =>
      expect(within(rowOf(SECOND)).getByRole("button", { name: "Accept" })).toBeEnabled(),
    );
    expect(screen.queryByText("Risk added to the register.")).not.toBeInTheDocument();
  });

  it("drops the notice as the next dismissal is sent, so a refused one leaves no old notice", async () => {
    acceptsAndLeavesOnlyTheSecond();
    const pending = deferred<ReturnType<typeof finding>>();
    mocks.dismiss.mockReturnValue(pending.promise);
    renderSection();
    await screen.findByText(FIRST);
    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Accept" }));
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

    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(mocks.accept).toHaveBeenCalled());
    // The row is usable again, and no notice or alert was made up.
    await waitFor(() =>
      expect(within(rowOf(FIRST)).getByRole("button", { name: "Accept" })).toBeEnabled(),
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

    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Accept" }));

    await waitFor(() =>
      expect(within(rowOf(FIRST)).getByRole("button", { name: "Dismiss" })).toBeDisabled(),
    );
    expect(within(rowOf(FIRST)).getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(within(rowOf(SECOND)).getByRole("button", { name: "Accept" })).toBeEnabled();
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

    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Accept" }));
    await userEvent.click(within(rowOf(SECOND)).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledTimes(2));

    mocks.list.mockResolvedValue({ rows: [secondFinding()], total: 1 });
    await act(async () => {
      first.resolve({ finding: finding({ status: "accepted" }), vendorRisk: acceptedRisk() });
    });

    await waitFor(() => expect(screen.queryByText(FIRST)).not.toBeInTheDocument());
    // The second accept is still in flight, so its row is still busy.
    expect(within(rowOf(SECOND)).getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(within(rowOf(SECOND)).getByRole("button", { name: "Dismiss" })).toBeDisabled();
  });
});

describe("dismissing a finding", () => {
  const openDismissal = async (text = FIRST) => {
    await userEvent.click(within(rowOf(text)).getByRole("button", { name: "Dismiss" }));
    return screen.findByRole("dialog", { name: "Dismiss finding" });
  };
  const choose = async (dialog: HTMLElement, reason: string) => {
    await userEvent.click(within(dialog).getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: reason }));
  };

  it("opens a modal that cannot be submitted until a reason is chosen", async () => {
    renderSection();
    await screen.findByText(FIRST);

    const dialog = await openDismissal();

    expect(within(dialog).getByRole("button", { name: "Dismiss" })).toBeDisabled();
    expect(within(dialog).getByText(FIRST)).toBeInTheDocument();
    await choose(dialog, "Inaccurate or not supported by the sources");
    expect(within(dialog).getByRole("button", { name: "Dismiss" })).toBeEnabled();
  });

  it("offers the five reasons", async () => {
    renderSection();
    await screen.findByText(FIRST);
    const dialog = await openDismissal();

    await userEvent.click(within(dialog).getByRole("combobox"));

    expect(await optionNames()).toEqual([
      "Not applicable to this vendor",
      "Already covered by an existing risk",
      "Inaccurate or not supported by the sources",
      "Accepted risk",
      "Other",
    ]);
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
    expect(first.getByRole("button", { name: "Accept", hidden: true })).toBeDisabled();
    expect(second.getByRole("button", { name: "Accept", hidden: true })).toBeEnabled();
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
    await userEvent.click(within(rowOf(FIRST)).getByRole("button", { name: "Accept" }));
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

describe("the latest run of the chosen vendor", () => {
  it("lists what happened in each of the four categories", async () => {
    renderSection({ route: WITH_VENDOR_7 });

    for (const line of [
      "Security incidents: risks found",
      "Certifications: nothing found",
      "Legal and regulatory: search failed",
      "AI-specific risks: skipped",
    ]) {
      expect(await screen.findByText(line)).toBeInTheDocument();
    }
    expect(screen.getByText("2 potential risks found")).toBeInTheDocument();
    expect(screen.getByText("No risks were found in the search results.")).toBeInTheDocument();
    expect(screen.getByText("The search timed out.")).toBeInTheDocument();
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
      screen.queryByText(/risks found|nothing found|search failed|skipped/),
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
        error: "The run stopped because all searches failed: search timed out",
        category_summary: [
          { category: "security_incidents", outcome: "search_failed", note: "search timed out" },
        ],
      }),
    );
    renderSection({ route: WITH_VENDOR_7 });

    expect(
      await screen.findByText("All web searches failed. (search timed out)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Security incidents: search failed")).toBeInTheDocument();
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

describe("a run that is still active after the polling window", () => {
  it("says it is still running and allows another start, once polling has stopped", async () => {
    vi.useFakeTimers();
    mocks.latest.mockResolvedValue(run({ status: "running" }));
    renderSection({ route: WITH_VENDOR_7 });
    const advance = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });

    await advance(10);
    expect(screen.getByText("Researching…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Research again" })).toBeDisabled();

    await advance(120_000);

    expect(screen.getByText("Still running. Check back later.")).toBeInTheDocument();
    expect(screen.queryByText("Researching…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Research again" })).toBeEnabled();
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
