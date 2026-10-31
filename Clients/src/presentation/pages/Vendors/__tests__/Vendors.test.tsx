import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import type { ResearchAlert } from "../../../../application/utils/vendorResearchAlerts";
import { acceptedRisk, finding, refusal, run } from "../VendorResearchFindings/__tests__/fixtures";

let mockVendorsLoading = false;
let mockVendorsError: Error | null = null;
let mockVendorsData: Array<Record<string, unknown>> = [];
const mockUseVendors = vi.fn();

// Mock hooks used by Vendors page
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));

vi.mock("../../../../application/hooks/useVendors", () => ({
  useVendors: (...args: unknown[]) => {
    mockUseVendors(...args);
    return {
      data: mockVendorsData,
      isLoading: mockVendorsLoading,
      error: mockVendorsError,
      refetch: vi.fn(),
    };
  },
  useDeleteVendor: () => ({ mutateAsync: vi.fn() }),
}));

// Whether the register of vendor risks is still loading; a test that needs it to load sets it.
const registerState = vi.hoisted(() => ({ loading: false }));

vi.mock("../../../../application/hooks/useVendorRisks", () => ({
  // Accepting a research finding refreshes the vendor risks by this key.
  vendorRiskQueryKeys: { all: ["vendor-risks"] },
  default: () => ({
    vendorRisksSummary: {
      total: 0,
      veryHighRisks: 0,
      highRisks: 0,
      mediumRisks: 0,
      lowRisks: 0,
      veryLowRisks: 0,
    },
    refetchVendorRisks: vi.fn(),
    vendorRisks: [],
    loadingVendorRisks: registerState.loading,
  }),
}));

vi.mock("../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [] }),
}));

vi.mock("../../../../application/hooks/useVendorRiskMutations", () => ({
  useDeleteVendorRisk: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../../../application/hooks/useMultipleOnScreen", () => ({
  default: () => ({
    refs: [{ current: null }],
    allVisible: false,
  }),
}));

vi.mock("../../../../application/hooks/useTableGrouping", () => ({
  useTableGrouping: () => [],
  useGroupByState: () => ({
    groupBy: null,
    groupSortOrder: "asc",
    handleGroupChange: vi.fn(),
  }),
}));

vi.mock("../../../../application/hooks/useFilterBy", () => ({
  useFilterBy: () => ({
    filterData: (data: unknown[]) => data,
    handleFilterChange: vi.fn(),
  }),
}));

vi.mock("../../../../application/hooks/useColumnVisibility", () => ({
  useColumnVisibility: ({ columns }: { columns: { key: string }[] }) => ({
    visibleColumns: new Set(columns.map((c: { key: string }) => c.key)),
    allColumns: columns,
    toggleColumn: vi.fn(),
    resetToDefaults: vi.fn(),
  }),
}));

vi.mock("../../../../application/tools/extractToken", () => ({
  extractUserToken: () => ({ roleName: "Admin" }),
}));

vi.mock("../../../../application/repository/vendor.repository", () => ({
  getVendorById: vi.fn(),
}));

vi.mock("../../../../application/repository/vendorRisk.repository", () => ({
  getVendorRiskById: vi.fn(),
}));

// The research findings section reads its own data; the repository is the seam.
vi.mock("../../../../application/repository/vendorResearch.repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../../application/repository/vendorResearch.repository")
  >()),
  getVendorResearchConfig: vi.fn(),
  listVendorRiskFindings: vi.fn(),
  startVendorResearch: vi.fn(),
  getLatestVendorResearch: vi.fn(),
  acceptVendorRiskFinding: vi.fn(),
  dismissVendorRiskFinding: vi.fn(),
}));

vi.mock("../../../../application/hooks/useMyPermissions", () => ({
  useHasPermission: (key: string) => key === "risks.edit",
}));

vi.mock("../../../../application/hooks/useRiskLinks", () => ({
  useVendorExposure: () => ({ data: undefined }),
  VENDOR_INSIGHTS_KEY: ["vendor-insights"],
}));

vi.mock("../VendorRiskInsights", () => ({
  default: () => <div data-testid="vendor-risk-insights" />,
}));

// Mock complex child components
vi.mock("../../../components/Modals/NewVendor", () => ({
  default: () => <div data-testid="add-new-vendor-modal" />,
}));

// The page's own editor is never opened here; the form the research section opens on a finding is
// the stand-in that saves what it was opened with.
vi.mock("../../../components/Modals/NewRisk", async () => ({
  default: (await import("../VendorResearchFindings/__tests__/vendorRiskFormStub"))
    .VendorRiskFormStub,
}));

vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));

// What the page hands its vendors table, so that a test can use the table's side of the contract.
const vendorTable = vi.hoisted(() => ({
  props: undefined as undefined | { onNotify?: (alert: ResearchAlert) => void },
}));

vi.mock("../../../components/Table/WithPlaceholder/index", () => ({
  default: (props: { onNotify?: (alert: ResearchAlert) => void }) => {
    vendorTable.props = props;
    return <div data-testid="vendor-table" />;
  },
}));

vi.mock("../../../components/Table/RisksTable", () => ({
  default: () => <div data-testid="risk-table" />,
}));

vi.mock("../../../components/Table/GroupedTableView", () => ({
  GroupedTableView: ({ ungroupedData, renderTable }: any) => (
    <div data-testid="grouped-table-view">{renderTable(ungroupedData, {})}</div>
  ),
}));

vi.mock("../../../components/Table/GroupBy", () => ({
  GroupBy: () => <div data-testid="group-by" />,
}));

vi.mock("../../../components/Table/ExportMenu", () => ({
  ExportMenu: () => <div data-testid="export-menu" />,
}));

vi.mock("../../../components/Table/ColumnSelector", () => ({
  ColumnSelector: () => <div data-testid="column-selector" />,
}));

vi.mock("../../../components/Table/FilterBy", () => ({
  FilterBy: () => <div data-testid="filter-by" />,
  FilterColumn: {},
  FilterCondition: {},
}));

vi.mock("../VendorsSteps", () => ({
  default: [],
}));

vi.mock("../../../components/HelperIcon", () => ({
  default: () => null,
  HelperIcon: () => null,
}));

import * as researchRepository from "../../../../application/repository/vendorResearch.repository";
import { getVendorRiskById } from "../../../../application/repository/vendorRisk.repository";
import Vendors from "../index";

// The vendors the page lists, and whether that request loads or fails, are state every describe
// below shares: a test sets what it needs and the next one finds it clean again.
afterEach(() => {
  mockVendorsLoading = false;
  mockVendorsError = null;
  mockVendorsData = [];
});

describe("Vendors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVendorsLoading = false;
    mockVendorsError = null;
    mockVendorsData = [];
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<Vendors />, {
      route: "/vendors",
    });
    expect(container).toBeTruthy();
  });

  it("shows the standardized loading state", () => {
    mockVendorsLoading = true;
    renderWithProviders(<Vendors />, { route: "/vendors" });

    expect(screen.getByRole("status", { name: "Loading vendors" })).toBeInTheDocument();
  });

  it("shows the standardized error alert when vendors fail to load", () => {
    mockVendorsError = new Error("network error");
    renderWithProviders(<Vendors />, { route: "/vendors" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to load vendors. Please try again later.",
    );
    expect(screen.queryByTestId("vendor-table")).not.toBeInTheDocument();
  });

  it("asks for the vendor list without the global toast (the page shows the error inline)", () => {
    renderWithProviders(<Vendors />, { route: "/vendors" });

    expect(mockUseVendors).toHaveBeenCalledWith(expect.anything(), {
      suppressGlobalErrorToast: true,
    });
  });

  it("keeps cached vendors on screen when a background refetch fails", () => {
    mockVendorsError = new Error("network error");
    mockVendorsData = [
      {
        id: 1,
        vendor_name: "Acme AI",
        vendor_provides: "Models",
        vendor_contact_person: "Jane Doe",
      },
    ];
    renderWithProviders(<Vendors />, { route: "/vendors" });

    expect(screen.queryByText("Failed to load vendors. Please try again later.")).toBeNull();
    expect(screen.getByTestId("grouped-table-view")).toBeInTheDocument();
  });
});

describe("Vendors, messages from the vendors table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vendorTable.props = undefined;
  });

  // The research button on a row hands its message to the page through the table. The page's
  // own alert only opens for an info message, so the other kinds must go the same way the
  // research section's messages do.
  it("shows a message from a row as a toast that can be seen, whatever its kind", async () => {
    renderWithProviders(<Vendors />, { route: "/vendors" });
    await screen.findByTestId("vendor-table");
    const notify = vendorTable.props?.onNotify;
    expect(notify).toBeTypeOf("function");

    for (const [variant, body] of [
      ["success", "Research started for Acme Cloud. Findings appear on the Risks tab."],
      ["warning", "Research ran recently. Try again in 9 min."],
      ["error", "The research could not be started. Try again."],
      ["info", "Research is already running for Acme Cloud."],
    ] as const) {
      act(() => notify?.({ variant, body }));

      const toast = await screen.findByText(body);
      await waitFor(() => expect(toast).toBeVisible());
    }
  });
});

describe("Vendors, research findings on the Risks tab", () => {
  const research = {
    config: vi.mocked(researchRepository.getVendorResearchConfig),
    list: vi.mocked(researchRepository.listVendorRiskFindings),
    latest: vi.mocked(researchRepository.getLatestVendorResearch),
    start: vi.mocked(researchRepository.startVendorResearch),
    accept: vi.mocked(researchRepository.acceptVendorRiskFinding),
  };
  /** The link the server puts in the notification of the vendor's assignee. */
  const NOTIFICATION_LINK = "/vendors/risks?findingsVendorId=7";
  const FIRST = finding().risk_description;

  /** Opens the vendor risk form on the finding of a row and saves it: the way a finding is accepted. */
  const addThroughTheForm = async (row: HTMLElement) => {
    await userEvent.click(within(row).getByRole("button", { name: "Preview" }));
    const dialog = await screen.findByRole("dialog", { name: "Review suggested risk" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVendorsData = [{ id: 7, vendor_name: "Acme Cloud" }];
    research.config.mockResolvedValue({ hasLlmKey: true, autoRunEnabled: true });
    research.list.mockResolvedValue({ rows: [finding()], total: 1 });
    research.latest.mockResolvedValue(run());
  });

  afterEach(() => {
    registerState.loading = false;
  });

  it("lands on the section, open on the vendor the notification link names, above the insights", async () => {
    renderWithProviders(<Vendors />, { route: NOTIFICATION_LINK });

    const header = await screen.findByRole("button", { name: /^Research findings/ });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    const section = header.closest(".MuiAccordion-root") as HTMLElement;
    expect(within(section).getByRole("combobox")).toHaveTextContent("Acme Cloud");
    expect(research.list).toHaveBeenCalledWith({ status: "pending", vendorId: 7, limit: 200 });
    expect(research.latest).toHaveBeenCalledWith(7);
    const insights = screen.getByTestId("vendor-risk-insights");
    expect(
      header.compareDocumentPosition(insights) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // Switching "Risk status" or the project filter loads the register again. The section has its
  // own data and its own state (the vendor, an open or closed choice, the notice of an accept),
  // so only what is made of the register may give way to the skeleton.
  describe("while the register of vendor risks is loading", () => {
    it("still shows the section, with its findings, and the skeleton in place of the register", async () => {
      registerState.loading = true;
      renderWithProviders(<Vendors />, { route: NOTIFICATION_LINK });

      const header = await screen.findByRole("button", { name: /^Research findings/ });
      expect(header).toHaveAttribute("aria-expanded", "true");
      expect(await screen.findByText(FIRST)).toBeInTheDocument();
      // What is made of the register waits for it.
      expect(screen.queryByTestId("vendor-risk-insights")).not.toBeInTheDocument();
      expect(screen.queryByTestId("risk-table")).not.toBeInTheDocument();
    });

    it("keeps the section mounted, and what the user did in it, when the register loads again", async () => {
      const { rerender } = renderWithProviders(<Vendors />, { route: NOTIFICATION_LINK });
      const header = await screen.findByRole("button", { name: /^Research findings/ });
      await screen.findByText(FIRST);
      // The user closes the section.
      await userEvent.click(header);
      expect(header).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByTestId("vendor-risk-insights")).toBeInTheDocument();

      registerState.loading = true;
      rerender(<Vendors />);

      expect(screen.queryByTestId("vendor-risk-insights")).not.toBeInTheDocument();
      // The very same section is still on screen, still closed.
      expect(screen.getByRole("button", { name: /^Research findings/ })).toBe(header);
      expect(header).toHaveAttribute("aria-expanded", "false");

      registerState.loading = false;
      rerender(<Vendors />);

      expect(screen.getByTestId("vendor-risk-insights")).toBeInTheDocument();
      expect(screen.getByTestId("risk-table")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Research findings/ })).toBe(header);
      expect(header).toHaveAttribute("aria-expanded", "false");
    });
  });

  it("is not part of the Vendors tab", async () => {
    renderWithProviders(<Vendors />, { route: "/vendors" });

    expect(await screen.findByTestId("vendor-table")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Research findings/ })).not.toBeInTheDocument();
    expect(research.list).not.toHaveBeenCalled();
  });

  it("opens the risk that accepting a finding created in the page's own risk editor", async () => {
    research.accept.mockResolvedValue({
      finding: finding({ status: "accepted" }),
      vendorRisk: acceptedRisk(),
    });
    vi.mocked(getVendorRiskById).mockResolvedValue({ data: { id: 77 } } as never);
    renderWithProviders(<Vendors />, { route: NOTIFICATION_LINK });
    const row = (await screen.findByText(FIRST)).closest("li") as HTMLElement;

    await addThroughTheForm(row);
    await userEvent.click(await screen.findByRole("button", { name: "Open risk" }));

    await waitFor(() => expect(getVendorRiskById).toHaveBeenCalledWith({ id: 77 }));
  });

  describe("what the section tells the page", () => {
    const startAndRefuse = async () => {
      research.start.mockRejectedValue(refusal(429, { code: "cooldown", retryAfterSeconds: 540 }));
      renderWithProviders(<Vendors />, { route: NOTIFICATION_LINK });
      await userEvent.click(await screen.findByRole("button", { name: "Research again" }));
    };

    it("shows a warning as a toast that can be seen", async () => {
      await startAndRefuse();

      const toast = await screen.findByText("Research ran recently. Try again in 9 min.");
      await waitFor(() => expect(toast).toBeVisible());
    });

    it("shows an info message the same way", async () => {
      research.start.mockResolvedValue({ run: run({ status: "running" }), alreadyRunning: true });
      renderWithProviders(<Vendors />, { route: NOTIFICATION_LINK });

      await userEvent.click(await screen.findByRole("button", { name: "Research again" }));

      const toast = await screen.findByText("Research is already running for Acme Cloud.");
      await waitFor(() => expect(toast).toBeVisible());
    });

    it("shows the toast of an accepted finding too", async () => {
      research.accept.mockResolvedValue({
        finding: finding({ status: "accepted" }),
        vendorRisk: acceptedRisk(),
      });
      renderWithProviders(<Vendors />, { route: NOTIFICATION_LINK });
      const row = (await screen.findByText(FIRST)).closest("li") as HTMLElement;

      await addThroughTheForm(row);

      const toast = await screen.findByText("Risk added to the register");
      await waitFor(() => expect(toast).toBeVisible());
    });

    it("takes the toast down again after a few seconds", async () => {
      vi.useFakeTimers();
      research.start.mockRejectedValue(refusal(429, { code: "cooldown", retryAfterSeconds: 540 }));
      renderWithProviders(<Vendors />, { route: NOTIFICATION_LINK });
      const advance = (ms: number) =>
        act(async () => {
          await vi.advanceTimersByTimeAsync(ms);
        });
      await advance(10);
      fireEvent.click(screen.getByRole("button", { name: "Research again" }));
      await advance(10);
      expect(screen.getByText("Research ran recently. Try again in 9 min.")).toBeVisible();

      await advance(3500);

      expect(
        screen.queryByText("Research ran recently. Try again in 9 min."),
      ).not.toBeInTheDocument();
    });
  });
});
