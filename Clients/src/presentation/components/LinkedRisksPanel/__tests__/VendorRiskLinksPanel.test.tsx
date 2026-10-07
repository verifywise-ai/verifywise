import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material";
import { light } from "../../../themes";
import { RiskLink } from "../../../../domain/interfaces/i.riskLink";

const mockUseVendorRiskLinks = vi.fn();
const mockMutateStatus = vi.fn();
const mockCreate = vi.fn();
const mockUseShared = vi.fn();
const mockSuggest = vi.fn();
const mockIsAdmin = vi.fn();
const mockScan = vi.fn();

vi.mock("../../../../application/hooks/useRiskLinks", () => ({
  useVendorRiskLinks: (vendorRiskId: number, status?: string) =>
    mockUseVendorRiskLinks(vendorRiskId, status),
  useUpdateVendorRiskLinkStatus: () => ({ mutate: mockMutateStatus, isPending: false }),
  useCreateVendorRiskLink: () => ({ mutate: mockCreate, isPending: false }),
  useVendorRiskSharedProjects: (...args: unknown[]) => mockUseShared(...args),
  useSuggestVendorRiskHierarchy: () => ({ mutate: mockSuggest, isPending: false }),
  useRecomputeVendorRiskLinks: () => ({ mutate: mockScan, isPending: false }),
}));

vi.mock("../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => mockIsAdmin(),
}));

const mockGetAllProjectRisks = vi.fn();

vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisks: (...args: unknown[]) => mockGetAllProjectRisks(...args),
}));

const mockGetAllVendorRisks = vi.fn();

vi.mock("../../../../application/repository/vendorRisk.repository", () => ({
  getAllVendorRisks: (...args: unknown[]) => mockGetAllVendorRisks(...args),
}));

import VendorRiskLinksPanel from "../VendorRiskLinksPanel";

const VENDOR_RISK_ID = 7;

const child = (overrides: Partial<RiskLink> = {}): RiskLink => ({
  id: 1,
  status: "confirmed",
  source: "user",
  relationType: "inherits_from",
  score: 0,
  reasons: [],
  direction: "incoming",
  decidedAt: null,
  lastComputedAt: null,
  dismissReason: null,
  dismissNote: null,
  parentLevelChangedAt: null,
  relatedRisk: {
    id: 9,
    entityType: "risk",
    name: "Loan model bias",
    riskLevel: "High risk",
    ownerId: 2,
  },
  ...overrides,
});

const queryResult = (links: RiskLink[], extra: any = {}) => ({
  data: links,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  ...extra,
});

const renderPanel = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={light}>
      <QueryClientProvider client={client}>
        <VendorRiskLinksPanel vendorRiskId={VENDOR_RISK_ID} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseShared.mockReturnValue({ data: [] });
  mockGetAllProjectRisks.mockResolvedValue({ data: [] });
  mockGetAllVendorRisks.mockResolvedValue({ data: [] });
  mockIsAdmin.mockReturnValue(false);
});

describe("VendorRiskLinksPanel list", () => {
  it("lists the inheriting project risks under Child risks, and nothing else", () => {
    mockUseVendorRiskLinks.mockReturnValue(
      queryResult([
        child(),
        child({
          id: 2,
          status: "suggested",
          source: "agent",
          relatedRisk: {
            id: 10,
            entityType: "risk",
            name: "Onboarding data leak",
            riskLevel: null,
            ownerId: null,
          },
        }),
      ]),
    );
    renderPanel();

    expect(mockUseVendorRiskLinks).toHaveBeenLastCalledWith(VENDOR_RISK_ID, undefined);
    expect(screen.getByText("Child risks")).toBeInTheDocument();
    expect(screen.getByText("Loan model bias")).toBeInTheDocument();
    expect(screen.getByText("Onboarding data leak")).toBeInTheDocument();
    expect(
      screen.getByText("When the level of this risk changes, each child is flagged for review."),
    ).toBeInTheDocument();
    // A vendor risk is never a child, and with no related pair there is no
    // related group either.
    expect(screen.queryByText("Parent risk")).not.toBeInTheDocument();
    expect(screen.queryByText("Related vendor risks")).not.toBeInTheDocument();
    // Spends the org's LLM key, so admins only.
    expect(screen.queryByRole("button", { name: "Suggest children" })).toBeNull();
  });

  // The warning is about the child. On the parent's side it would read as a
  // statement about the vendor risk itself.
  it("never shows the stale-parent warning on the parent's side", () => {
    mockUseVendorRiskLinks.mockReturnValue(
      queryResult([child({ parentLevelChangedAt: "2026-10-01T10:00:00Z" })]),
    );
    renderPanel();

    expect(screen.queryByText("Parent level changed")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark reviewed" })).toBeNull();
  });

  it("explains the empty list, and who can scan", () => {
    mockUseVendorRiskLinks.mockReturnValue(queryResult([]));
    renderPanel();

    expect(screen.getByText("No linked risks yet.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Link a project risk that this vendor risk applies to, or relate another vendor risk. Suggestions appear here too.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Related vendor risks appear as vendor risks are saved, or after an administrator runs a scan.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scan for related vendor risks" })).toBeNull();
    expect(screen.queryByText("Child risks")).not.toBeInTheDocument();
  });

  it("offers a retry when the list fails to load", async () => {
    const refetch = vi.fn();
    mockUseVendorRiskLinks.mockReturnValue(queryResult([], { isError: true, refetch }));
    renderPanel();

    expect(screen.getByText("Failed to load linked risks.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("re-queries with the dismissed status", async () => {
    mockUseVendorRiskLinks.mockReturnValue(queryResult([child()]));
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Show dismissed" }));

    await waitFor(() =>
      expect(mockUseVendorRiskLinks).toHaveBeenLastCalledWith(VENDOR_RISK_ID, "dismissed"),
    );
  });
});

describe("VendorRiskLinksPanel decisions", () => {
  it("confirms a suggested child", async () => {
    mockUseVendorRiskLinks.mockReturnValue(
      queryResult([child({ id: 31, status: "suggested", source: "agent" })]),
    );
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(mockMutateStatus).toHaveBeenCalledWith(
      { id: 31, status: "confirmed" },
      expect.anything(),
    );
  });

  it("asks why before dismissing a suggestion, offering the inheritance reasons", async () => {
    mockUseVendorRiskLinks.mockReturnValue(
      queryResult([child({ id: 32, status: "suggested", source: "agent" })]),
    );
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(mockMutateStatus).not.toHaveBeenCalled();
    expect(screen.getAllByRole("radio")).toHaveLength(4);

    await userEvent.click(
      screen.getByRole("radio", { name: "Right that it's a child, wrong parent" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(mockMutateStatus).toHaveBeenCalledWith(
      { id: 32, status: "dismissed", dismissal: { dismissReason: "wrong_parent" } },
      expect.anything(),
    );
  });

  it("un-links a confirmed child without asking", async () => {
    mockUseVendorRiskLinks.mockReturnValue(queryResult([child({ id: 33 })]));
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Remove link" }));

    expect(mockMutateStatus).toHaveBeenCalledWith(
      { id: 33, status: "dismissed" },
      expect.anything(),
    );
  });

  it("shows the server's message when a decision fails", async () => {
    mockUseVendorRiskLinks.mockReturnValue(
      queryResult([child({ id: 34, status: "suggested", source: "agent" })]),
    );
    mockMutateStatus.mockImplementation((_vars, { onError }) =>
      onError({ status: 409, message: "This risk already has a parent. Remove it first." }),
    );
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText("This risk already has a parent. Remove it first."),
    ).toBeInTheDocument();
  });
});

describe("VendorRiskLinksPanel link form", () => {
  const openPicker = async () => {
    await userEvent.click(screen.getByRole("button", { name: "Link a project risk" }));
    await userEvent.click(screen.getByPlaceholderText("Search risks"));
    return screen.findByRole("listbox");
  };

  it("lists risks in the vendor's projects first and leaves out current children", async () => {
    mockUseVendorRiskLinks.mockReturnValue(queryResult([child()]));
    mockGetAllProjectRisks.mockResolvedValue({
      data: [
        { id: 9, risk_name: "Loan model bias" },
        { id: 11, risk_name: "Unrelated risk" },
        { id: 12, risk_name: "Shared risk" },
      ],
    });
    mockUseShared.mockReturnValue({ data: [{ id: 12, projects: ["Lending", "Onboarding"] }] });
    renderPanel();

    const listbox = await openPicker();
    const options = await within(listbox).findAllByRole("option");

    expect(mockUseShared).toHaveBeenCalledWith(VENDOR_RISK_ID, true);
    expect(options.map((o) => o.textContent)).toEqual([
      "Shared riskSame project: Lending +1",
      "Unrelated risk",
    ]);
  });

  it("links the chosen project risk as a child of this vendor risk", async () => {
    mockUseVendorRiskLinks.mockReturnValue(queryResult([]));
    mockGetAllProjectRisks.mockResolvedValue({ data: [{ id: 12, risk_name: "Shared risk" }] });
    renderPanel();

    const listbox = await openPicker();
    await userEvent.click(await within(listbox).findByText("Shared risk"));
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(mockCreate).toHaveBeenCalledWith(
      { sourceRiskId: 12, targetVendorRiskId: VENDOR_RISK_ID, relationType: "inherits_from" },
      expect.anything(),
    );
  });

  it("shows why the server refused the link", async () => {
    mockUseVendorRiskLinks.mockReturnValue(queryResult([]));
    mockGetAllProjectRisks.mockResolvedValue({ data: [{ id: 12, risk_name: "Shared risk" }] });
    mockCreate.mockImplementation((_input, { onError }) =>
      onError({ status: 409, message: "This risk already has a parent. Remove it first." }),
    );
    renderPanel();

    const listbox = await openPicker();
    await userEvent.click(await within(listbox).findByText("Shared risk"));
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(
      await screen.findByText("This risk already has a parent. Remove it first."),
    ).toBeInTheDocument();
  });
});

describe("VendorRiskLinksPanel suggest children", () => {
  it("runs the vendor-scoped hierarchy pass for an admin and says it is working", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockUseVendorRiskLinks.mockReturnValue(queryResult([child()]));
    mockSuggest.mockImplementation((_vars, { onSuccess }) =>
      onSuccess({ enqueued: 2, skipped: 1 }),
    );
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Suggest children" }));

    expect(mockSuggest).toHaveBeenCalled();
    expect(
      await screen.findByText(
        "Grouping 2 clusters of related risks. Suggestions appear here as they finish. 1 clusters were too large to group in one pass.",
      ),
    ).toBeInTheDocument();
    // Disabled while the pass is being watched, so it cannot be queued twice.
    expect(screen.getByRole("button", { name: "Suggest children" })).toBeDisabled();
  });

  it("explains why nothing was queued", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockUseVendorRiskLinks.mockReturnValue(queryResult([]));
    mockSuggest.mockImplementation((_vars, { onSuccess }) =>
      onSuccess({ enqueued: 0, skipped: 0 }),
    );
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Suggest children" }));

    expect(
      await screen.findByText(
        "No clusters of related risks in the use cases of this vendor yet. Related risks are grouped once a scan has linked them.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggest children" })).not.toBeDisabled();
  });

  it("shows the server's message when the pass cannot start", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockUseVendorRiskLinks.mockReturnValue(queryResult([]));
    mockSuggest.mockImplementation((_vars, { onError }) =>
      onError({ message: "No LLM key is configured for this organization." }),
    );
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Suggest children" }));

    expect(
      await screen.findByText("No LLM key is configured for this organization."),
    ).toBeInTheDocument();
  });
});

const related = (overrides: Partial<RiskLink> = {}): RiskLink =>
  child({
    id: 50,
    status: "suggested",
    source: "derived",
    relationType: "related_to",
    score: 4,
    reasons: [
      { signal: "similar_wording", weight: 3, detail: "customer, exposed, records" },
      { signal: "same_vendor", weight: 1 },
    ],
    direction: "outgoing",
    relatedRisk: {
      id: 12,
      entityType: "vendor_risk",
      name: "Customer records exposed",
      riskLevel: "High risk",
      ownerId: null,
      vendorName: "Acme Cloud",
    },
    ...overrides,
  });

describe("VendorRiskLinksPanel related vendor risks", () => {
  it("groups related vendor risks apart from children, with their vendor", () => {
    mockUseVendorRiskLinks.mockReturnValue(queryResult([child(), related()]));
    renderPanel();

    expect(screen.getByText("Child risks")).toBeInTheDocument();
    expect(screen.getByText("Related vendor risks")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Vendor risks that describe the same exposure, at this vendor or another one.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Customer records exposed")).toBeInTheDocument();
    expect(screen.getByText("Acme Cloud")).toBeInTheDocument();
  });

  it("asks why before dismissing a related suggestion, offering the related reasons", async () => {
    mockUseVendorRiskLinks.mockReturnValue(queryResult([related()]));
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await userEvent.click(screen.getByRole("radio", { name: "These aren't actually related" }));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(mockMutateStatus).toHaveBeenCalledWith(
      { id: 50, status: "dismissed", dismissal: { dismissReason: "not_related" } },
      expect.anything(),
    );
  });

  it("lets an admin scan from the empty list and says what it queued", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockUseVendorRiskLinks.mockReturnValue(queryResult([]));
    mockScan.mockImplementation((_vars, { onSuccess }) => onSuccess({ enqueued: 3 }));
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Scan for related vendor risks" }));

    expect(mockScan).toHaveBeenCalled();
    expect(
      await screen.findByText(
        "Scanning 3 vendor risks. Related vendor risks appear here as the scan completes.",
      ),
    ).toBeInTheDocument();
    // Watched until the result lands, so it cannot be queued twice.
    expect(screen.getByRole("button", { name: "Scan for related vendor risks" })).toBeDisabled();
  });

  it("shows the server's message when the scan cannot start", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockUseVendorRiskLinks.mockReturnValue(queryResult([]));
    mockScan.mockImplementation((_vars, { onError }) => onError({ message: "Forbidden" }));
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Scan for related vendor risks" }));

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
  });
});

describe("VendorRiskLinksPanel relate form", () => {
  const vendorRiskRows = [
    // One row per (vendor risk, use case): the picker shows each risk once.
    { risk_id: VENDOR_RISK_ID, risk_description: "This risk", vendor_id: 1, vendor_name: "Acme" },
    { risk_id: 20, risk_description: "Other vendor risk", vendor_id: 2, vendor_name: "Globex" },
    { risk_id: 21, risk_description: "Same vendor risk", vendor_id: 1, vendor_name: "Acme" },
    { risk_id: 21, risk_description: "Same vendor risk", vendor_id: 1, vendor_name: "Acme" },
    { risk_id: 12, risk_description: "Already related", vendor_id: 2, vendor_name: "Globex" },
    { risk_id: 22, risk_description: "", vendor_id: 3, vendor_name: null },
  ];

  const openPicker = async () => {
    await userEvent.click(screen.getByRole("button", { name: "Relate a vendor risk" }));
    await userEvent.click(screen.getByPlaceholderText("Search vendor risks"));
    return screen.findByRole("listbox");
  };

  it("lists this vendor's risks first, once each, without itself or current pairs", async () => {
    mockUseVendorRiskLinks.mockReturnValue(queryResult([related()]));
    mockGetAllVendorRisks.mockResolvedValue({ data: vendorRiskRows });
    renderPanel();

    const listbox = await openPicker();
    const options = await within(listbox).findAllByRole("option");

    expect(mockGetAllVendorRisks).toHaveBeenCalledWith({ filter: "active" });
    expect(options.map((o) => o.textContent)).toEqual([
      "Same vendor riskAcme",
      "Other vendor riskGlobex",
      "Vendor risk 22",
    ]);
  });

  it("relates the chosen vendor risk to this one", async () => {
    mockUseVendorRiskLinks.mockReturnValue(queryResult([]));
    mockGetAllVendorRisks.mockResolvedValue({ data: vendorRiskRows });
    mockCreate.mockImplementation((_input, { onSuccess }) => onSuccess());
    renderPanel();

    const listbox = await openPicker();
    await userEvent.click(await within(listbox).findByText("Other vendor risk"));
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(mockCreate).toHaveBeenCalledWith(
      { sourceVendorRiskId: VENDOR_RISK_ID, targetVendorRiskId: 20, relationType: "related_to" },
      expect.anything(),
    );
    // The form closes once the pair exists.
    expect(screen.queryByPlaceholderText("Search vendor risks")).toBeNull();
  });

  it("shows why the server refused the pair", async () => {
    mockUseVendorRiskLinks.mockReturnValue(queryResult([]));
    mockGetAllVendorRisks.mockResolvedValue({ data: vendorRiskRows });
    mockCreate.mockImplementation((_input, { onError }) => onError({ status: 404 }));
    renderPanel();

    const listbox = await openPicker();
    await userEvent.click(await within(listbox).findByText("Other vendor risk"));
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(await screen.findByText("One of these risks no longer exists")).toBeInTheDocument();
  });

  it("opens one form at a time", async () => {
    mockUseVendorRiskLinks.mockReturnValue(queryResult([]));
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Link a project risk" }));
    await userEvent.click(screen.getByRole("button", { name: "Relate a vendor risk" }));

    expect(screen.getByPlaceholderText("Search vendor risks")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search risks")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Cancel" }).length).toBeGreaterThan(0);
  });
});
