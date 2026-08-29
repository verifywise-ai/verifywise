import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material";
import { light } from "../../../themes";
import { RiskLink } from "../../../../domain/interfaces/i.riskLink";

const mockUseRiskLinks = vi.fn();
const mockMutateStatus = vi.fn();
const mockMutateRecompute = vi.fn();
const mockMutateSuggest = vi.fn();
const mockIsAdmin = vi.fn();

vi.mock("../../../../application/hooks/useRiskLinks", () => ({
  useRiskLinks: (riskId: number, status?: string) => mockUseRiskLinks(riskId, status),
  useUpdateRiskLinkStatus: () => ({ mutate: mockMutateStatus, isPending: false }),
  useRecomputeRiskLinks: () => ({ mutate: mockMutateRecompute, isPending: false }),
  useCreateRiskLink: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
  useSuggestRiskHierarchy: () => ({ mutate: mockMutateSuggest, isPending: false }),
}));

vi.mock("../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => mockIsAdmin(),
}));

const mockGetAllProjectRisks = vi.fn();

vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisks: (...args: unknown[]) => mockGetAllProjectRisks(...args),
}));

import LinkedRisksPanel from "../index";

const link = (overrides: Partial<RiskLink> = {}): RiskLink => ({
  id: 1,
  status: "suggested",
  source: "derived",
  relationType: "related_to",
  score: 4.2,
  reasons: [{ signal: "shared_category", weight: 3 }],
  direction: "undirected",
  decidedAt: null,
  lastComputedAt: null,
  relatedRisk: { id: 9, name: "Model drift", riskLevel: "High risk", ownerId: 2 },
  ...overrides,
});

const queryResult = (links: RiskLink[], extra: any = {}) => ({
  data: links,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAdmin.mockReturnValue(false);
  mockGetAllProjectRisks.mockResolvedValue({
    data: [
      { id: 42, risk_name: "Subject risk" },
      { id: 9, risk_name: "Model drift" },
    ],
  });
});

describe("LinkedRisksPanel grouping", () => {
  it("puts each relation and direction under its own heading", () => {
    mockUseRiskLinks.mockReturnValue(
      queryResult([
        link({ id: 1, relationType: "inherits_from", direction: "outgoing",
               relatedRisk: { id: 9, name: "Upstream risk", riskLevel: null, ownerId: null } }),
        link({ id: 2, relationType: "inherits_from", direction: "incoming",
               relatedRisk: { id: 10, name: "Downstream risk", riskLevel: null, ownerId: null } }),
        link({ id: 3, relationType: "related_to", direction: "undirected",
               relatedRisk: { id: 11, name: "Sibling risk", riskLevel: null, ownerId: null } }),
      ]),
    );
    render(<LinkedRisksPanel riskId={42} />);

    // Headings name a position in the grouping, not a relation. The fixtures are
    // named Upstream/Downstream on purpose: a risk called "Parent risk" would
    // collide with the heading and make getByText ambiguous.
    expect(screen.getByText("Parent risk")).toBeInTheDocument();
    expect(screen.getByText("Child risks")).toBeInTheDocument();
    expect(screen.getByText("Relates to")).toBeInTheDocument();
    expect(screen.queryByText("Inherits from")).not.toBeInTheDocument();
    expect(screen.queryByText("Inherited by")).not.toBeInTheDocument();
    expect(screen.getByText("Upstream risk")).toBeInTheDocument();
  });

  it("hides a group with no links", () => {
    mockUseRiskLinks.mockReturnValue(queryResult([link()]));
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByText("Relates to")).toBeInTheDocument();
    expect(screen.queryByText("Parent risk")).not.toBeInTheDocument();
    expect(screen.queryByText("Child risks")).not.toBeInTheDocument();
  });

  it("hides the score on a user-created link but shows it on a derived one", () => {
    mockUseRiskLinks.mockReturnValue(
      queryResult([
        link({ id: 1, source: "derived", score: 4.2 }),
        link({ id: 2, source: "user", score: 0,
               relatedRisk: { id: 10, name: "Hand-linked", riskLevel: null, ownerId: null } }),
      ]),
    );
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByText("4.2")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("offers an admin the hierarchy pass even when links already exist", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockUseRiskLinks.mockReturnValue(
      queryResult([link()]),
    );

    render(<LinkedRisksPanel riskId={42} />);

    // Not in the empty state: hierarchy needs existing related_to links, so a
    // button that only appears when there are none would be unreachable exactly
    // when it is useful.
    await userEvent.click(screen.getByRole("button", { name: /suggest hierarchy/i }));
    expect(mockMutateSuggest).toHaveBeenCalled();
  });

  it("hides the hierarchy pass from a non-admin", () => {
    mockIsAdmin.mockReturnValue(false);
    mockUseRiskLinks.mockReturnValue(
      queryResult([link()]),
    );

    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.queryByRole("button", { name: /suggest hierarchy/i })).toBeNull();
  });

  // score is 0 by column default on an agent row and means nothing there, the
  // same way it means nothing on a user row.
  it("does not show a score on an agent suggestion", () => {
    mockIsAdmin.mockReturnValue(false);
    mockUseRiskLinks.mockReturnValue(
      queryResult([
        link({
          source: "agent",
          relationType: "inherits_from",
          direction: "outgoing",
          score: 0,
          reasons: [{ signal: "hierarchy", weight: 0, detail: "Same deployed model." }],
        }),
      ]),
    );

    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByText(/same deployed model/i)).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("LinkedRisksPanel actions", () => {
  it("offers Confirm and Dismiss on a suggestion", () => {
    mockUseRiskLinks.mockReturnValue(queryResult([link({ status: "suggested" })]));
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });

  it("offers only Dismiss on a confirmed link", () => {
    mockUseRiskLinks.mockReturnValue(queryResult([link({ status: "confirmed" })]));
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });

  it("offers Restore and Confirm on a dismissed derived link", () => {
    mockUseRiskLinks.mockReturnValue(
      queryResult([link({ status: "dismissed", source: "derived" })]),
    );
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  // Restoring a user link to `suggested` achieves nothing — the recompute prune
  // requires source = 'derived' — and misdescribes it as a machine suggestion.
  it("offers Confirm but not Restore on a dismissed user link", () => {
    mockUseRiskLinks.mockReturnValue(
      queryResult([link({ status: "dismissed", source: "user" })]),
    );
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });

  it("sends the target status to the mutation", async () => {
    mockUseRiskLinks.mockReturnValue(queryResult([link({ id: 55, status: "suggested" })]));
    render(<LinkedRisksPanel riskId={42} />);

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(mockMutateStatus).toHaveBeenCalledWith(
      { id: 55, status: "dismissed" },
      expect.anything(),
    );
  });
});

describe("LinkedRisksPanel dismissed toggle", () => {
  it("re-queries with the dismissed status", async () => {
    mockUseRiskLinks.mockReturnValue(queryResult([link()]));
    render(<LinkedRisksPanel riskId={42} />);
    expect(mockUseRiskLinks).toHaveBeenLastCalledWith(42, undefined);

    await userEvent.click(screen.getByRole("button", { name: "Show dismissed" }));

    await waitFor(() => expect(mockUseRiskLinks).toHaveBeenLastCalledWith(42, "dismissed"));
    expect(screen.getByRole("button", { name: "Hide dismissed" })).toBeInTheDocument();
  });
});

describe("LinkedRisksPanel empty state", () => {
  it("shows a scan button to admins and starts the scan", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockUseRiskLinks.mockReturnValue(queryResult([]));
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByText("No linked risks yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Scan for related risks" }));

    expect(mockMutateRecompute).toHaveBeenCalled();
  });

  it("shows no scan button to a non-admin", () => {
    mockIsAdmin.mockReturnValue(false);
    mockUseRiskLinks.mockReturnValue(queryResult([]));
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByText("No linked risks yet.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Scan for related risks" }),
    ).not.toBeInTheDocument();
  });
});

describe("LinkedRisksPanel link form", () => {
  it("opens the form for a non-admin with no links", async () => {
    mockIsAdmin.mockReturnValue(false);
    mockUseRiskLinks.mockReturnValue(queryResult([]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider theme={light}>
        <QueryClientProvider client={client}>
          <LinkedRisksPanel riskId={42} />
        </QueryClientProvider>
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Link a risk" }));

    expect(screen.getByRole("radio", { name: "Relates to" })).toBeInTheDocument();
  });

  // The form's exclusions are defined over suggested + confirmed. With the
  // dismissed view open the panel holds dismissed rows instead, so passing them
  // down would invert the rule and hide exactly the partners §6.4 keeps
  // selectable. Queried inside the listbox because the panel's own list shows
  // the same name.
  it("keeps a dismissed partner selectable while the dismissed view is open", async () => {
    mockUseRiskLinks.mockReturnValue(
      queryResult([
        link({
          status: "dismissed",
          relationType: "related_to",
          relatedRisk: { id: 9, name: "Model drift", riskLevel: null, ownerId: null },
        }),
      ]),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider theme={light}>
        <QueryClientProvider client={client}>
          <LinkedRisksPanel riskId={42} />
        </QueryClientProvider>
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Show dismissed" }));
    await userEvent.click(screen.getByRole("button", { name: "Link a risk" }));
    await userEvent.click(screen.getByPlaceholderText("Search risks"));

    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("Model drift")).toBeInTheDocument();
  });
});

describe("LinkedRisksPanel failures", () => {
  it("shows a retry in place of the list", async () => {
    const refetch = vi.fn();
    mockUseRiskLinks.mockReturnValue(queryResult([], { isError: true, refetch }));
    render(<LinkedRisksPanel riskId={42} />);

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
    expect(screen.queryByText("No linked risks yet.")).not.toBeInTheDocument();
  });
});
