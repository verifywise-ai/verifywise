import { useState } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import type { ResearchAlert } from "../../../../application/utils/vendorResearchAlerts";
import { acceptedRisk, finding, refusal, run } from "../VendorResearchFindings/__tests__/fixtures";

let mockVendorsLoading = false;
let mockVendorsError: Error | null = null;
let mockVendorsData: Array<Record<string, unknown>> = [];
/** The vendors of each use case: what GET /vendors/project-id/:id answers. None unless a test sets it. */
let mockVendorsByProject: Record<string, Array<Record<string, unknown>>> = {};
let mockUsers: Array<Record<string, unknown>> = [];
/** When set, GET /vendors for every use case has no data: it is loading, or it failed. */
let mockAllVendorsUnavailable = false;
const mockUseVendors = vi.fn();

// Mock hooks used by Vendors page
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: mockUsers }),
}));

vi.mock("../../../../application/hooks/useVendors", () => ({
  useVendors: (...args: unknown[]) => {
    mockUseVendors(...args);
    const projectId = (args[0] as { projectId?: string | number } | undefined)?.projectId;
    const filtered = projectId !== undefined && projectId !== "all";
    return {
      data: filtered
        ? (mockVendorsByProject[String(projectId)] ?? [])
        : mockAllVendorsUnavailable
          ? undefined
          : mockVendorsData,
      isLoading: mockVendorsLoading,
      error: mockVendorsError,
      refetch: vi.fn(),
    };
  },
  useDeleteVendor: () => ({ mutateAsync: vi.fn() }),
}));

type RegisterRead = { projectId?: string | null; vendorId?: string | null; filter?: string };

// Whether the register of vendor risks is still loading; a test that needs it to load sets it.
// The page reads the register twice: narrowed by the use case and "Risk status" of the Risks tab,
// and as a whole for the insights. `reads` holds the arguments of every read, in order, and
// `answer` lets a test make the two reads give different rows (it must return the same array for
// the same read, as the real hook does between renders).
const registerState = vi.hoisted(() => ({
  loading: false,
  /** When set, which of the two reads are loading (told apart by their arguments), in place of `loading`. */
  loadingWhen: null as null | ((read: RegisterRead) => boolean),
  risks: [] as Array<Record<string, unknown>>,
  answer: null as null | ((read: RegisterRead) => Array<Record<string, unknown>>),
  reads: [] as RegisterRead[],
}));

vi.mock("../../../../application/hooks/useVendorRisks", () => ({
  // Accepting a research finding refreshes the vendor risks by this key.
  vendorRiskQueryKeys: { all: ["vendor-risks"] },
  default: (read: RegisterRead) => {
    registerState.reads.push(read);
    return {
      vendorRisksSummary: {
        total: 0,
        veryHighRisks: 0,
        highRisks: 0,
        mediumRisks: 0,
        lowRisks: 0,
        veryLowRisks: 0,
      },
      refetchVendorRisks: vi.fn(),
      vendorRisks: registerState.answer ? registerState.answer(read) : registerState.risks,
      loadingVendorRisks: registerState.loadingWhen
        ? registerState.loadingWhen(read)
        : registerState.loading,
    };
  },
}));

// The organization's use cases; none unless a test sets them ("Add new risk" needs one).
const projectsState = vi.hoisted(() => ({ data: [] as Array<Record<string, unknown>> }));

vi.mock("../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: projectsState.data }),
}));

// What deleting a vendor risk answers: a test that deletes one sets it.
const deleteVendorRisk = vi.hoisted(() => vi.fn());

vi.mock("../../../../application/hooks/useVendorRiskMutations", () => ({
  useDeleteVendorRisk: () => ({ mutateAsync: deleteVendorRisk }),
  useRestoreVendorRisk: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../../../application/hooks/useMultipleOnScreen", () => ({
  default: () => ({
    refs: [{ current: null }],
    allVisible: false,
  }),
}));

// What the filter hooks of the page hold, and the handlers the page calls on them. The page has two
// of them: the vendors tab's (the first of the two in the page's source) and the risks tab's (the
// second), and each toolbar is handed what ITS hook holds. So there are two slots, each with its own
// state and its own spy, and an instance of the hook takes its slot when it first renders: the
// first instance the page makes is the vendors', the next the risks', and so on in turns, which
// holds while a test renders the page once (the counters are reset before each test). A handler
// writes what it was given back into the state, as the real one does through useState, and the page
// reads it on its next render.
type FilterConditionStub = { columnId: string; operator: string; value: string };
const toolbar = vi.hoisted(() => {
  const slot = () => {
    const state = {
      conditions: [] as FilterConditionStub[],
      logic: "and" as "and" | "or",
    };
    return {
      state,
      handleFilterChange: vi.fn((conditions: FilterConditionStub[], logic: "and" | "or") => {
        state.conditions = conditions;
        state.logic = logic;
      }),
    };
  };
  return { vendors: slot(), risks: slot(), filterInstances: 0 };
});
const resetToolbars = () => {
  for (const slot of [toolbar.vendors, toolbar.risks]) {
    slot.state.conditions = [];
    slot.state.logic = "and";
  }
  toolbar.filterInstances = 0;
};

const FOR_VENDORS: FilterConditionStub[] = [
  { columnId: "vendor_name", operator: "contains", value: "acme" },
];
const FOR_RISKS: FilterConditionStub[] = [
  { columnId: "risk_description", operator: "contains", value: "leak" },
];
/** The two lists hold different things, so that a toolbar given the other's state shows it. */
const holdDifferentStates = () => {
  Object.assign(toolbar.vendors.state, { conditions: FOR_VENDORS, logic: "or" });
  Object.assign(toolbar.risks.state, { conditions: FOR_RISKS, logic: "and" });
};

vi.mock("../../../../application/hooks/useFilterBy", () => ({
  useFilterBy: () => {
    const [slot] = useState(() =>
      toolbar.filterInstances++ % 2 === 0 ? toolbar.vendors : toolbar.risks,
    );
    return {
      filterData: (data: unknown[]) => data,
      conditions: slot.state.conditions,
      logic: slot.state.logic,
      handleFilterChange: slot.handleFilterChange,
    };
  },
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

vi.mock("../../../../application/hooks/useCan", () => ({
  useCan: (key: string) => key === "vendor.edit",
  useCanCheck: () => (key: string) => key === "vendor.edit",
}));

vi.mock("../../../../application/hooks/useRiskLinks", () => ({
  useVendorExposure: () => ({ data: undefined }),
  VENDOR_INSIGHTS_KEY: ["vendor-insights"],
}));

// Two buttons stand in for choosing a heat map cell and choosing it again.
vi.mock("../VendorRiskInsights", () => ({
  default: ({
    risks,
    loading,
    selectedCell,
    onSelectCell,
  }: {
    risks: Array<{ risk_id?: number }>;
    loading?: boolean;
    selectedCell: { likelihood: number; severity: number } | null;
    onSelectCell: (cell: { likelihood: number; severity: number } | null) => void;
  }) => (
    <div
      data-testid="vendor-risk-insights"
      data-loading={String(loading)}
      data-risks={risks.map((risk) => risk.risk_id).join(",")}
      data-selected={JSON.stringify(selectedCell)}
    >
      <button onClick={() => onSelectCell({ likelihood: 2, severity: 3 })}>Select heat cell</button>
      <button onClick={() => onSelectCell(null)}>Clear heat cell</button>
    </div>
  ),
}));

// Mock complex child components
vi.mock("../../../components/Modals/NewVendor", () => ({
  // What the page gave it, as attributes, so that a test can see which vendor it opened on.
  default: ({
    isOpen,
    existingVendor,
  }: {
    isOpen?: boolean;
    existingVendor?: { id?: number } | null;
  }) => (
    <div
      data-testid="add-new-vendor-modal"
      data-open={String(Boolean(isOpen))}
      data-vendor-id={existingVendor?.id ?? ""}
    />
  ),
}));

// The vendors the page's own editor (the form without a preview) was last given while open, so a
// test can see which vendors its Vendor field can show.
const pageRiskEditor = vi.hoisted(() => ({
  vendors: null as Array<{ id?: number; vendor_name?: string }> | null,
  /** The risk it was opened on, if any; null for a new risk. */
  existingRisk: null as { id?: number } | null,
}));
// Read through a function: after `pageRiskEditor.vendors = null` the compiler narrows the property
// to null for the rest of the test, although the stand-in editor sets it while the page renders.
const vendorsOfThePageEditor = () => pageRiskEditor.vendors;

// The page's own editor is never shown here; the form the research section opens on a finding is
// the stand-in that saves what it was opened with.
vi.mock("../../../components/Modals/NewRisk", async () => {
  const { VendorRiskFormStub } =
    await import("../VendorResearchFindings/__tests__/vendorRiskFormStub");
  return {
    default: (props: Parameters<typeof VendorRiskFormStub>[0] & { vendors?: unknown }) => {
      if (props.isOpen && !props.preview) {
        pageRiskEditor.vendors = props.vendors as typeof pageRiskEditor.vendors;
        pageRiskEditor.existingRisk =
          (props as { existingRisk?: { id?: number } | null }).existingRisk ?? null;
      }
      return VendorRiskFormStub(props);
    },
  };
});

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
  default: ({
    vendorRisks,
    onDelete,
  }: {
    vendorRisks: Array<{ risk_id?: number }>;
    onDelete?: (riskId: number) => void;
  }) => (
    <div
      data-testid="risk-table"
      data-rows={vendorRisks.length}
      data-ids={vendorRisks.map((risk) => risk.risk_id).join(",")}
    >
      {/* Stands in for the delete button of the row of risk 1. */}
      <button onClick={() => onDelete?.(1)}>Delete risk 1</button>
    </div>
  ),
}));

vi.mock("../../../components/Table/ExportMenu", () => ({
  ExportMenu: () => <div data-testid="export-menu" />,
}));

vi.mock("../../../components/Table/ColumnSelector", () => ({
  ColumnSelector: () => <div data-testid="column-selector" />,
}));

vi.mock("../../../components/Table/TableFilter", () => ({
  // A button stands in for choosing "Use case is 3" in the filter of the Risks tab.
  // Like the real one, it reads its defaults once, when it mounts, and shows what it started with.
  TableFilter: ({
    onFilterChange,
    defaultConditions,
    defaultLogic,
  }: {
    onFilterChange?: (conditions: FilterConditionStub[], logic: "and" | "or") => void;
    defaultConditions?: FilterConditionStub[];
    defaultLogic?: "and" | "or";
  }) => {
    const [started] = useState(() => ({
      conditions: defaultConditions ?? null,
      logic: defaultLogic ?? null,
    }));
    return (
      <div
        data-testid="filter-by"
        data-started-conditions={JSON.stringify(started.conditions)}
        data-started-logic={JSON.stringify(started.logic)}
      >
        {onFilterChange && (
          <button
            onClick={() =>
              onFilterChange([{ columnId: "project_id", operator: "is", value: "3" }], "and")
            }
          >
            Filter by use case 3
          </button>
        )}
      </div>
    );
  },
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
import { getVendorById } from "../../../../application/repository/vendor.repository";
import Vendors from "../index";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import {
  followResearch,
  VENDOR_RESEARCH_FOLLOW_KEY,
  VENDOR_RESEARCH_KEY,
} from "../../../../application/hooks/useVendorResearch";

/**
 * Shows where the router is, so that a test can see a tab change the URL, and how it got there
 * (POP for the first location, PUSH for a new entry, REPLACE for one that took the place of the
 * last, which is what a redirect must be).
 */
const LocationProbe = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <>
      <div data-testid="location">{location.pathname + location.search}</div>
      <div data-testid="navigation-type">{navigationType}</div>
    </>
  );
};

/** A link followed while the page is open, as Wise Search does: it only changes the URL. */
const FollowLink = ({ to }: { to: string }) => {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>{`Follow ${to}`}</button>;
};

const renderPage = (route: string, queryClient?: QueryClient, links: string[] = []) =>
  renderWithProviders(
    <>
      <Vendors />
      <LocationProbe />
      {links.map((to) => (
        <FollowLink key={to} to={to} />
      ))}
    </>,
    { route, queryClient },
  );
const currentLocation = () => screen.getByTestId("location").textContent;
const navigationType = () => screen.getByTestId("navigation-type").textContent;
const tab = (name: RegExp | string) => screen.getByRole("tab", { name });

// The vendors the page lists, and whether that request loads or fails, are state every describe
// below shares: a test sets what it needs and the next one finds it clean again.
afterEach(() => {
  mockVendorsLoading = false;
  mockVendorsError = null;
  mockVendorsData = [];
  mockVendorsByProject = {};
  mockAllVendorsUnavailable = false;
  mockUsers = [];
});

// Every tab of the page asks how many findings are pending, for the count of its tab. Unless a
// test says otherwise, none are.
beforeEach(() => {
  vi.mocked(researchRepository.listVendorRiskFindings).mockResolvedValue({ rows: [], total: 0 });
  registerState.answer = null;
  registerState.loadingWhen = null;
  registerState.reads.length = 0;
  pageRiskEditor.vendors = null;
  pageRiskEditor.existingRisk = null;
  resetToolbars();
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
    expect(screen.getByTestId("vendor-table")).toBeInTheDocument();
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
      ["success", "Research started for Acme Cloud. Findings appear on the Research findings tab."],
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

describe("Vendors, research findings on their own tab", () => {
  const research = {
    config: vi.mocked(researchRepository.getVendorResearchConfig),
    list: vi.mocked(researchRepository.listVendorRiskFindings),
    latest: vi.mocked(researchRepository.getLatestVendorResearch),
    start: vi.mocked(researchRepository.startVendorResearch),
    accept: vi.mocked(researchRepository.acceptVendorRiskFinding),
  };
  /** The link the server puts in the notification of the vendor's assignee. */
  const NOTIFICATION_LINK = "/vendors/research-findings?findingsVendorId=7";
  const FIRST = finding().risk_description;

  /** Opens the vendor risk form on the finding of a row and saves it: the way a finding is accepted. */
  const addThroughTheForm = async (row: HTMLElement) => {
    await userEvent.click(within(row).getByRole("button", { name: "Preview suggested risk" }));
    const dialog = await screen.findByRole("dialog", { name: "Review suggested risk" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVendorsData = [{ id: 7, vendor_name: "Acme Cloud" }];
    research.config.mockResolvedValue({
      hasLlmKey: true,
      autoRunAllowed: true,
      autoRunEnabled: true,
    });
    research.list.mockResolvedValue({ rows: [finding()], total: 1 });
    research.latest.mockResolvedValue(run());
  });

  afterEach(() => {
    registerState.loading = false;
    projectsState.data = [];
  });

  it("lands on the tab, on the vendor the notification link names", async () => {
    renderPage(NOTIFICATION_LINK);

    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    expect(tab(/^Research findings/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("combobox")).toHaveTextContent("Acme Cloud");
    expect(research.list).toHaveBeenCalledWith({ status: "pending", vendorId: 7, limit: 200 });
    expect(research.latest).toHaveBeenCalledWith(7);
    // The register and the insights have tabs of their own.
    expect(screen.queryByTestId("vendor-risk-insights")).not.toBeInTheDocument();
    expect(screen.queryByTestId("risk-table")).not.toBeInTheDocument();
  });

  // Switching "Risk status" or the project filter loads the register again. The findings have
  // their own data and their own state (the vendor, the notice of an accept), and are not made of
  // the register, so the register loading again does not touch them.
  describe("while the register of vendor risks is loading", () => {
    it("still shows the findings", async () => {
      registerState.loading = true;
      renderPage(NOTIFICATION_LINK);

      expect(await screen.findByText(FIRST)).toBeInTheDocument();
    });

    it("keeps the very same findings on screen when the register loads again", async () => {
      const { rerender } = renderPage(NOTIFICATION_LINK);
      const row = (await screen.findByText(FIRST)).closest("li");
      const reads = research.list.mock.calls.length;

      registerState.loading = true;
      rerender(
        <>
          <Vendors />
          <LocationProbe />
        </>,
      );

      expect((await screen.findByText(FIRST)).closest("li")).toBe(row);
      registerState.loading = false;
      rerender(
        <>
          <Vendors />
          <LocationProbe />
        </>,
      );
      expect((await screen.findByText(FIRST)).closest("li")).toBe(row);
      expect(research.list.mock.calls.length).toBe(reads);
    });

    it("puts a skeleton in place of the register on the Risks tab", async () => {
      registerState.loading = true;
      const { container } = renderPage("/vendors/risks");
      await screen.findByTestId("filter-by");

      expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
      expect(screen.queryByTestId("risk-table")).not.toBeInTheDocument();
    });

    it("tells the insights that the risks are loading, and keeps them mounted", async () => {
      registerState.loading = true;
      renderPage("/vendors/insights");

      const insights = await screen.findByTestId("vendor-risk-insights");
      expect(insights).toHaveAttribute("data-loading", "true");

      registerState.loading = false;
      await userEvent.click(tab(/^Risks/));
      await userEvent.click(tab(/^Insights/));

      expect(screen.getByTestId("vendor-risk-insights")).toHaveAttribute("data-loading", "false");
    });
  });

  it("is not part of the Vendors tab", async () => {
    renderPage("/vendors");

    expect(await screen.findByTestId("vendor-table")).toBeInTheDocument();
    expect(screen.queryByText(FIRST)).not.toBeInTheDocument();
    // The tab only asks how many findings are pending: one row, never the list.
    await waitFor(() => expect(research.list).toHaveBeenCalled());
    expect(research.list.mock.calls.every(([filter]) => filter.limit === 1)).toBe(true);
    expect(research.latest).not.toHaveBeenCalled();
  });

  it("opens the risk that accepting a finding created in the page's own risk editor", async () => {
    research.accept.mockResolvedValue({
      finding: finding({ status: "accepted" }),
      vendorRisk: acceptedRisk(),
    });
    vi.mocked(getVendorRiskById).mockResolvedValue({ data: { id: 77 } } as never);
    renderPage(NOTIFICATION_LINK);
    const row = (await screen.findByText(FIRST)).closest("li") as HTMLElement;

    await addThroughTheForm(row);
    await userEvent.click(await screen.findByRole("button", { name: "Open risk" }));

    await waitFor(() => expect(getVendorRiskById).toHaveBeenCalledWith({ id: 77 }));
    // The risk opens in place: the person is not taken to the register.
    expect(currentLocation()).toBe(NOTIFICATION_LINK);
  });

  // The risk an accept created belongs to the finding's vendor, which the "Use case" filter of the
  // register may leave out. The editor of an existing risk must still be able to show that vendor
  // in its Vendor field, or it reads "Select vendor" and the user may save the risk onto another.
  it("gives the editor of the accepted risk its vendor when a use case filter leaves the vendor out", async () => {
    mockVendorsData = [
      { id: 7, vendor_name: "Acme Cloud" },
      { id: 8, vendor_name: "Other vendor" },
    ];
    mockVendorsByProject = { "3": [{ id: 8, vendor_name: "Other vendor" }] };
    pageRiskEditor.vendors = null;
    research.accept.mockResolvedValue({
      finding: finding({ status: "accepted" }),
      vendorRisk: acceptedRisk(),
    });
    vi.mocked(getVendorRiskById).mockResolvedValue({ data: acceptedRisk() } as never);
    renderPage("/vendors/risks");
    await userEvent.click(await screen.findByRole("button", { name: "Filter by use case 3" }));
    // The Risks tab has its own use case filter: it narrows the register, not the vendor list.
    await waitFor(() =>
      expect(registerState.reads).toContainEqual(expect.objectContaining({ projectId: "3" })),
    );
    // The filter is kept when the person goes on to the findings.
    await userEvent.click(tab(/^Research findings/));
    const row = (await screen.findByText(FIRST)).closest("li") as HTMLElement;

    await addThroughTheForm(row);
    await userEvent.click(await screen.findByRole("button", { name: "Open risk" }));

    await waitFor(() => expect(pageRiskEditor.vendors).not.toBeNull());
    expect(vendorsOfThePageEditor()?.map((v) => v.id)).toContain(7);
  });

  // A new risk is offered every vendor, whatever the use case filter of the Risks tab narrows
  // the register to: each risk belongs to a vendor, and the filter narrows risks, not vendors.
  it("gives a new risk every vendor, whatever the use case filter", async () => {
    mockVendorsData = [
      { id: 7, vendor_name: "Acme Cloud" },
      { id: 8, vendor_name: "Other vendor" },
    ];
    mockVendorsByProject = { "3": [{ id: 8, vendor_name: "Other vendor" }] };
    projectsState.data = [{ id: 3, project_title: "Use case 3" }];
    pageRiskEditor.vendors = null;
    renderPage("/vendors/risks");
    await userEvent.click(await screen.findByRole("button", { name: "Filter by use case 3" }));
    // The Risks tab has its own use case filter: it narrows the register, not the vendor list.
    await waitFor(() =>
      expect(registerState.reads).toContainEqual(expect.objectContaining({ projectId: "3" })),
    );

    await userEvent.click(screen.getByRole("button", { name: "Add new risk" }));

    await waitFor(() => expect(pageRiskEditor.vendors).not.toBeNull());
    expect(vendorsOfThePageEditor()?.map((v) => v.id)).toEqual([7, 8]);
  });

  // The findings are not filtered by use case, so the section shows a finding of a vendor the
  // "Use case" filter of the register leaves out. Its preview still starts on that vendor and on
  // the vendor's assignee: the section reads the organization's whole vendor list.
  it("starts the preview on the vendor and its assignee when a use case filter leaves the vendor out", async () => {
    mockVendorsData = [{ id: 7, vendor_name: "Acme Cloud", assignee: 5 }];
    mockVendorsByProject = { "3": [{ id: 8, vendor_name: "Other vendor", assignee: 6 }] };
    mockUsers = [
      { id: 5, name: "Ada", surname: "Lovelace" },
      { id: 6, name: "Alan", surname: "Turing" },
    ];
    renderPage("/vendors/risks");

    await userEvent.click(await screen.findByRole("button", { name: "Filter by use case 3" }));
    // The Risks tab has its own use case filter: it narrows the register, not the vendor list.
    await waitFor(() =>
      expect(registerState.reads).toContainEqual(expect.objectContaining({ projectId: "3" })),
    );
    await userEvent.click(tab(/^Research findings/));
    const row = (await screen.findByText(FIRST)).closest("li") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "Preview suggested risk" }));
    const dialog = await screen.findByRole("dialog", { name: "Review suggested risk" });

    const values = JSON.parse(
      within(dialog).getByRole("status", { name: "Values of the draft" }).textContent ?? "{}",
    );
    expect(values).toMatchObject({ vendor_id: 7, action_owner: 5 });
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

describe("Vendors, the tabs", () => {
  const research = {
    config: vi.mocked(researchRepository.getVendorResearchConfig),
    list: vi.mocked(researchRepository.listVendorRiskFindings),
    latest: vi.mocked(researchRepository.getLatestVendorResearch),
  };
  /** What the register says while a heat map cell filters it. */
  const NOTICE = "The table shows only the risks in the selected heat map cell.";
  /** Two vendor risks, in two cells of the heat map: likelihood 2 × severity 3, and 1 × 2. */
  const RISKS = [
    {
      risk_id: 1,
      risk_description: "Data leak",
      likelihood: "Unlikely",
      risk_severity: "Moderate",
      risk_level: "Medium risk",
    },
    {
      risk_id: 2,
      risk_description: "Outage",
      likelihood: "Rare",
      risk_severity: "Minor",
      risk_level: "Low risk",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockVendorsData = [{ id: 7, vendor_name: "Acme Cloud" }];
    research.config.mockResolvedValue({
      hasLlmKey: true,
      autoRunAllowed: true,
      autoRunEnabled: true,
    });
    research.list.mockResolvedValue({ rows: [finding()], total: 1 });
    research.latest.mockResolvedValue(run());
  });

  afterEach(() => {
    registerState.loading = false;
    registerState.risks = [];
  });

  it("lists the four tabs, in order", async () => {
    renderPage("/vendors");

    await screen.findByTestId("vendor-table");
    expect(screen.getAllByRole("tab").map((node) => node.textContent?.replace(/\d+$/, ""))).toEqual(
      ["Vendors", "Risks", "Research findings", "Insights"],
    );
  });

  it.each([
    ["/vendors", /^Vendors/],
    ["/vendors/risks", /^Risks/],
    ["/vendors/research-findings", /^Research findings/],
    ["/vendors/insights", /^Insights/],
  ])("opens %s on its own tab", async (route, name) => {
    renderPage(route);

    await waitFor(() => expect(tab(name)).toHaveAttribute("aria-selected", "true"));
    expect(screen.getAllByRole("tab").filter((node) => node.ariaSelected === "true")).toHaveLength(
      1,
    );
  });

  it("goes to the route of a tab when it is clicked, and back", async () => {
    renderPage("/vendors");
    await screen.findByTestId("vendor-table");

    await userEvent.click(tab(/^Research findings/));
    expect(currentLocation()).toBe("/vendors/research-findings");

    await userEvent.click(tab(/^Insights/));
    expect(currentLocation()).toBe("/vendors/insights");

    await userEvent.click(tab(/^Risks/));
    expect(currentLocation()).toBe("/vendors/risks");

    await userEvent.click(tab(/^Vendors/));
    expect(currentLocation()).toBe("/vendors");
  });

  it("puts each tab's own content on screen, and nothing of the others", async () => {
    registerState.risks = RISKS;
    renderPage("/vendors/risks");
    expect(await screen.findByTestId("risk-table")).toBeInTheDocument();
    expect(screen.queryByTestId("vendor-risk-insights")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vendor-table")).not.toBeInTheDocument();
    expect(screen.queryByText(finding().risk_description)).not.toBeInTheDocument();

    await userEvent.click(tab(/^Research findings/));
    expect(await screen.findByText(finding().risk_description)).toBeInTheDocument();
    expect(screen.queryByTestId("risk-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vendor-risk-insights")).not.toBeInTheDocument();

    await userEvent.click(tab(/^Insights/));
    expect(await screen.findByTestId("vendor-risk-insights")).toBeInTheDocument();
    expect(screen.queryByTestId("risk-table")).not.toBeInTheDocument();
    expect(screen.queryByText(finding().risk_description)).not.toBeInTheDocument();
  });

  it("keeps the toolbar of each list, and the summary cards, to its own tab", async () => {
    renderPage("/vendors");
    expect(await screen.findByRole("button", { name: "Add new vendor" })).toBeInTheDocument();

    // [tab, which toolbar is on screen]
    const tabs = [
      [/^Risks/, "risks"],
      [/^Research findings/, "none"],
      [/^Insights/, "none"],
      [/^Vendors/, "vendors"],
    ] as const;
    for (const [name, toolbar] of tabs) {
      await userEvent.click(tab(name));

      const has = {
        vendors: screen.queryByRole("button", { name: "Add new vendor" }) !== null,
        vendorSearch: screen.queryByPlaceholderText("Search vendors...") !== null,
        risks: screen.queryByRole("button", { name: "Add new risk" }) !== null,
        riskSearch: screen.queryByRole("textbox", { name: "Search risks" }) !== null,
        cards: screen.queryByText("Very high") !== null,
        notice: screen.queryByText(NOTICE) !== null,
      };
      expect(has).toEqual({
        vendors: toolbar === "vendors",
        vendorSearch: toolbar === "vendors",
        risks: toolbar === "risks",
        riskSearch: toolbar === "risks",
        cards: toolbar === "risks",
        // No cell is chosen, so nothing says that one filters the register.
        notice: false,
      });
    }
  });

  it("says on each tab what it is about, under the title of the tab", async () => {
    const title = (name: string) => screen.getByRole("heading", { level: 5, name });
    renderPage("/vendors");
    expect(await screen.findByTestId("vendor-table")).toBeInTheDocument();
    expect(title("Vendor list")).toBeInTheDocument();
    expect(
      screen.getByText(/This table includes a list of external entities that provide AI-related/),
    ).toBeInTheDocument();

    await userEvent.click(tab(/^Risks/));
    expect(title("Vendor risks list")).toBeInTheDocument();
    expect(
      screen.getByText(/This table includes a list of risks related to a vendor/),
    ).toBeInTheDocument();

    await userEvent.click(tab(/^Research findings/));
    expect(title("Research findings")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Risks that the research agent suggested for your vendors. Review each finding, then add it to the vendor risk register or dismiss it.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(tab(/^Insights/));
    expect(title("Vendor risk insights")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Heat map, blast radius, duplicates and framework coverage of vendor risks.",
      ),
    ).toBeInTheDocument();
    // Only the title of the tab that is open.
    expect(
      screen.queryByRole("heading", { level: 5, name: "Vendor list" }),
    ).not.toBeInTheDocument();
  });

  // The descriptions differ in length, so the page lays them in one place and shows the open one:
  // the tab bar under them stays where it is when the tab changes (see TabDescription).
  it("shows only the description of the open tab, and keeps the others out of sight", async () => {
    const descriptions = {
      vendors: /This table includes a list of external entities that provide AI-related/,
      risks: /This table includes a list of risks related to a vendor/,
      findings: /Risks that the research agent suggested for your vendors\./,
      insights: /Heat map, blast radius, duplicates and framework coverage of vendor risks\./,
    };
    const onlyThisOneIsSeen = (open: keyof typeof descriptions) => {
      for (const [name, text] of Object.entries(descriptions)) {
        const element = screen.getByText(text);
        if (name === open) {
          expect(element).toBeVisible();
          expect(element).not.toHaveAttribute("aria-hidden");
        } else {
          expect(element).not.toBeVisible();
          expect(element).toHaveAttribute("aria-hidden", "true");
        }
      }
    };
    renderPage("/vendors");
    await screen.findByTestId("vendor-table");
    onlyThisOneIsSeen("vendors");

    await userEvent.click(tab(/^Risks/));
    onlyThisOneIsSeen("risks");

    await userEvent.click(tab(/^Research findings/));
    await screen.findByRole("heading", { level: 5, name: "Research findings" });
    onlyThisOneIsSeen("findings");

    await userEvent.click(tab(/^Insights/));
    await screen.findByRole("heading", { level: 5, name: "Vendor risk insights" });
    onlyThisOneIsSeen("insights");
  });

  it("explains the two new tabs when the pointer is on them", async () => {
    renderPage("/vendors");
    await screen.findByTestId("vendor-table");

    await userEvent.hover(within(tab(/^Research findings/)).getByText("Research findings"));
    expect(
      await screen.findByText("Risks the research agent suggested, waiting for your decision"),
    ).toBeInTheDocument();

    await userEvent.hover(within(tab(/^Insights/)).getByText("Insights"));
    expect(
      await screen.findByText(
        "Heat map, blast radius, duplicates and framework coverage of vendor risks",
      ),
    ).toBeInTheDocument();
  });

  describe("the count of the Research findings tab", () => {
    it("is the number of findings pending over every vendor, asked for with one row", async () => {
      research.list.mockResolvedValue({ rows: [finding()], total: 4 });
      renderPage("/vendors");

      await waitFor(() =>
        expect(within(tab(/^Research findings/)).getByText("4")).toBeInTheDocument(),
      );
      expect(research.list).toHaveBeenCalledWith(
        { status: "pending", limit: 1 },
        { suppressGlobalErrorToast: true },
      );
    });

    // What this pins is the page's part: a failed read leaves the tab without a number, raises no
    // notice of the page's own (its `Alert`, which is a `role="alert"`), and breaks nothing else.
    // That the global error toast is off for this read is pinned where it is decided, in the
    // repository's test (the call is made with `suppressGlobalErrorToast`); the repository is a
    // stand-in here, so no toast could appear in this file either way.
    it("is not shown when it cannot be read, and the page stays usable", async () => {
      research.list.mockRejectedValue(new Error("network error"));
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      renderPage("/vendors", queryClient);

      expect(await screen.findByTestId("vendor-table")).toBeInTheDocument();
      // The rejection has reached the query: the read is settled as failed, not still on its way.
      await waitFor(() => {
        const count = queryClient
          .getQueryCache()
          .findAll({ queryKey: VENDOR_RESEARCH_KEY })
          .find((query) => query.queryKey.includes("pendingCount"));
        expect(count?.state.status).toBe("error");
      });
      expect(within(tab(/^Research findings/)).queryByText(/^\d+$/)).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      // The tabs, with and without a count, still work.
      await userEvent.click(tab(/^Risks/));
      expect(tab(/^Risks/)).toHaveAttribute("aria-selected", "true");
      expect(within(tab(/^Research findings/)).queryByText(/^\d+$/)).not.toBeInTheDocument();
    });

    it("is 0 when nothing is pending", async () => {
      research.list.mockResolvedValue({ rows: [], total: 0 });
      renderPage("/vendors");

      await waitFor(() =>
        expect(within(tab(/^Research findings/)).getByText("0")).toBeInTheDocument(),
      );
    });

    it("is never on the Insights tab, whatever is pending", async () => {
      research.list.mockResolvedValue({ rows: [finding()], total: 4 });
      renderPage("/vendors");

      await waitFor(() =>
        expect(within(tab(/^Research findings/)).getByText("4")).toBeInTheDocument(),
      );
      expect(within(tab(/^Insights/)).queryByText(/^\d+$/)).not.toBeInTheDocument();
    });

    // A run can end while nothing on screen watches it (one that started by itself, or by schedule,
    // or from the vendors table), so the count is read again when the tab changes.
    it("is read again when the tab changes", async () => {
      research.list.mockResolvedValue({ rows: [finding()], total: 4 });
      renderPage("/vendors");
      await waitFor(() =>
        expect(within(tab(/^Research findings/)).getByText("4")).toBeInTheDocument(),
      );
      const countReads = () =>
        research.list.mock.calls.filter(([filter]) => filter.limit === 1).length;
      const before = countReads();

      research.list.mockResolvedValue({ rows: [finding()], total: 7 });
      await userEvent.click(tab(/^Risks/));

      await waitFor(() =>
        expect(within(tab(/^Research findings/)).getByText("7")).toBeInTheDocument(),
      );
      expect(countReads()).toBeGreaterThan(before);
      expect(research.list).toHaveBeenLastCalledWith(
        { status: "pending", limit: 1 },
        { suppressGlobalErrorToast: true },
      );
    });

    it("is not read again while the tab stays where it is", async () => {
      research.list.mockResolvedValue({ rows: [finding()], total: 4 });
      renderPage("/vendors");
      await waitFor(() =>
        expect(within(tab(/^Research findings/)).getByText("4")).toBeInTheDocument(),
      );
      const reads = research.list.mock.calls.length;

      await userEvent.click(tab(/^Vendors/));

      expect(research.list.mock.calls.length).toBe(reads);
    });

    // Whichever tab is left for whichever other, not only the one that was tried first: a count that
    // went stale on, say, the move from the findings to the insights would not be seen otherwise.
    const ROUTES = {
      "Vendors": "/vendors",
      "Risks": "/vendors/risks",
      "Research findings": "/vendors/research-findings",
      "Insights": "/vendors/insights",
    } as const;
    type TabName = keyof typeof ROUTES;
    const MOVES = (Object.keys(ROUTES) as TabName[]).flatMap((from) =>
      (Object.keys(ROUTES) as TabName[])
        .filter((to) => to !== from)
        .map((to) => [from, to] as const),
    );
    /** The reads of the count: the findings section asks for 200 rows, only the tab asks for one. */
    const countReads = () =>
      research.list.mock.calls.filter(([filter]) => filter.limit === 1).length;
    /** Lets a read that nothing waits for, if one was started, start and land. */
    const settle = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
      });

    it.each(MOVES)("is read again, once, going from the %s tab to the %s tab", async (from, to) => {
      research.list.mockResolvedValue({ rows: [finding()], total: 4 });
      renderPage(ROUTES[from]);
      await waitFor(() =>
        expect(within(tab(/^Research findings/)).getByText("4")).toBeInTheDocument(),
      );
      await settle();
      const before = countReads();
      research.list.mockResolvedValue({ rows: [finding()], total: 7 });

      await userEvent.click(tab(new RegExp(`^${to}`)));

      await waitFor(() =>
        expect(within(tab(/^Research findings/)).getByText("7")).toBeInTheDocument(),
      );
      await settle();
      expect(countReads()).toBe(before + 1);
    });

    it("is not read again when the page renders again on the tab it is on", async () => {
      research.list.mockResolvedValue({ rows: [finding()], total: 4 });
      const { rerender } = renderPage("/vendors");
      await waitFor(() =>
        expect(within(tab(/^Research findings/)).getByText("4")).toBeInTheDocument(),
      );
      await settle();
      const before = countReads();

      rerender(
        <>
          <Vendors />
          <LocationProbe />
        </>,
      );
      await settle();

      expect(countReads()).toBe(before);
    });
  });

  describe("choosing a cell of the heat map", () => {
    const choose = async () => {
      registerState.risks = RISKS;
      renderPage("/vendors/insights");
      await userEvent.click(await screen.findByRole("button", { name: "Select heat cell" }));
    };

    it("takes the reader to the Risks tab, where only the risks of the cell are listed", async () => {
      await choose();

      expect(currentLocation()).toBe("/vendors/risks");
      expect(tab(/^Risks/)).toHaveAttribute("aria-selected", "true");
      expect(await screen.findByTestId("risk-table")).toHaveAttribute("data-rows", "1");
    });

    it("says there that a cell filters the register, with the way back", async () => {
      await choose();

      expect(
        await screen.findByText("The table shows only the risks in the selected heat map cell."),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByText("Show all risks"));

      expect(
        screen.queryByText("The table shows only the risks in the selected heat map cell."),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("risk-table")).toHaveAttribute("data-rows", "2");
      // The reader is not moved again.
      expect(currentLocation()).toBe("/vendors/risks");
    });

    it("keeps the cell selected on the Insights tab, and does not filter the register without one", async () => {
      registerState.risks = RISKS;
      renderPage("/vendors/risks");
      expect(await screen.findByTestId("risk-table")).toHaveAttribute("data-rows", "2");
      expect(
        screen.queryByText("The table shows only the risks in the selected heat map cell."),
      ).not.toBeInTheDocument();

      await userEvent.click(tab(/^Insights/));
      expect(screen.getByTestId("vendor-risk-insights")).toHaveAttribute("data-selected", "null");
      await userEvent.click(screen.getByRole("button", { name: "Select heat cell" }));
      await userEvent.click(tab(/^Insights/));

      expect(screen.getByTestId("vendor-risk-insights")).toHaveAttribute(
        "data-selected",
        JSON.stringify({ likelihood: 2, severity: 3 }),
      );
    });

    it("says so on the Risks tab only", async () => {
      await choose();
      expect(await screen.findByText(NOTICE)).toBeInTheDocument();

      for (const name of [/^Vendors/, /^Research findings/, /^Insights/]) {
        await userEvent.click(tab(name));
        expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
      }

      await userEvent.click(tab(/^Risks/));
      expect(screen.getByText(NOTICE)).toBeInTheDocument();
    });

    it("moves the focus to that notice, since the cell that was chosen is gone", async () => {
      await choose();

      const notice = (await screen.findByText(NOTICE)).closest('[role="status"]');
      expect(notice).not.toBeNull();
      await waitFor(() => expect(notice).toHaveFocus());
    });

    it("leaves the focus alone when the Risks tab is opened by hand with a cell still chosen", async () => {
      await choose();
      await waitFor(() =>
        expect(screen.getByText(NOTICE).closest('[role="status"]')).toHaveFocus(),
      );
      await userEvent.click(tab(/^Insights/));

      await userEvent.click(tab(/^Risks/));

      expect(screen.getByText(NOTICE).closest('[role="status"]')).not.toHaveFocus();
      expect(tab(/^Risks/)).toHaveFocus();
    });

    // The link that dismisses the notice is removed with it, and the focus would fall to the page.
    it("moves the focus to the register when the notice is dismissed with its own link", async () => {
      await choose();
      await waitFor(() =>
        expect(screen.getByText(NOTICE).closest('[role="status"]')).toHaveFocus(),
      );

      await userEvent.click(screen.getByText("Show all risks"));

      const region = screen.getByRole("region", { name: "Vendor risks list" });
      await waitFor(() => expect(region).toHaveFocus());
      expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
      expect(currentLocation()).toBe("/vendors/risks");
      expect(within(region).getByTestId("risk-table")).toHaveAttribute("data-rows", "2");
    });

    // The register can be reading again by then: the region is the same one, and the focus is in it.
    it("keeps the focus in the register when it is loading again as the notice goes", async () => {
      await choose();
      await waitFor(() =>
        expect(screen.getByText(NOTICE).closest('[role="status"]')).toHaveFocus(),
      );
      const region = screen.getByRole("region", { name: "Vendor risks list" });
      registerState.loading = true;

      await userEvent.click(screen.getByText("Show all risks"));

      await waitFor(() => expect(region).toHaveFocus());
      expect(screen.getByRole("region", { name: "Vendor risks list" })).toBe(region);
      expect(region.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
      expect(within(region).queryByTestId("risk-table")).not.toBeInTheDocument();
    });

    // On the Insights tab the register is not mounted: the heat map's own button keeps the focus,
    // and choosing or clearing a cell there reaches for no element that is not there. An error in a
    // handler is reported to the window by React, so it is collected and checked.
    it("does not move the focus when the cell is chosen again to clear it on the Insights tab", async () => {
      const errors: unknown[] = [];
      const collect = (event: ErrorEvent) => {
        event.preventDefault();
        errors.push(event.error ?? event.message);
      };
      window.addEventListener("error", collect);
      try {
        await choose();
        await userEvent.click(tab(/^Insights/));
        const clear = screen.getByRole("button", { name: "Clear heat cell" });

        await userEvent.click(clear);

        expect(currentLocation()).toBe("/vendors/insights");
        expect(clear).toHaveFocus();
        expect(screen.queryByRole("region", { name: "Vendor risks list" })).not.toBeInTheDocument();
      } finally {
        window.removeEventListener("error", collect);
      }
      expect(errors).toEqual([]);
    });

    it("stays on the Insights tab when the cell is chosen again to clear it", async () => {
      await choose();
      await userEvent.click(tab(/^Insights/));

      await userEvent.click(screen.getByRole("button", { name: "Clear heat cell" }));

      expect(currentLocation()).toBe("/vendors/insights");
      await userEvent.click(tab(/^Risks/));
      expect(screen.getByTestId("risk-table")).toHaveAttribute("data-rows", "2");
      expect(
        screen.queryByText("The table shows only the risks in the selected heat map cell."),
      ).not.toBeInTheDocument();
    });
  });

  // The heat map is of every active risk, so a cell is listed with nothing else narrowing the
  // register. Each thing the Risks tab can narrow it by is let go of on its own, and the tests say
  // which: through the handler the page calls for it, and by what the toolbar opens with.
  describe("choosing a cell of the heat map, what it lets go of", () => {
    const FILTERED: FilterConditionStub[] = [
      { columnId: "risk_description", operator: "contains", value: "leak" },
    ];
    const holdAFilter = () => {
      toolbar.risks.state.conditions = FILTERED;
      toolbar.risks.state.logic = "or";
    };
    const chooseOnInsights = async () => {
      registerState.risks = RISKS;
      renderPage("/vendors/insights");
      await userEvent.click(await screen.findByRole("button", { name: "Select heat cell" }));
      await screen.findByTestId("risk-table");
    };

    it("empties the filter of the register, with the logic it starts from", async () => {
      holdAFilter();
      await chooseOnInsights();

      expect(toolbar.risks.handleFilterChange).toHaveBeenLastCalledWith([], "and");
    });

    // The reset is of the register's filter, not of the vendor list's: they are two hooks, and the
    // vendors' own stays as it was, to be shown when the Vendors tab is opened.
    it("lets go of the Risks list's filter alone, and leaves the Vendors list's as it was", async () => {
      holdDifferentStates();
      await chooseOnInsights();

      expect(toolbar.risks.handleFilterChange).toHaveBeenLastCalledWith([], "and");
      expect(toolbar.vendors.handleFilterChange).not.toHaveBeenCalled();

      await userEvent.click(tab(/^Vendors/));
      const filter = await screen.findByTestId("filter-by");
      expect(filter).toHaveAttribute("data-started-conditions", JSON.stringify(FOR_VENDORS));
      expect(filter).toHaveAttribute("data-started-logic", '"or"');
    });

    it("opens the toolbar of the Risks tab blank, since what it held is gone", async () => {
      holdAFilter();
      await chooseOnInsights();

      const filter = screen.getByTestId("filter-by");
      expect(filter).toHaveAttribute("data-started-conditions", "[]");
      expect(filter).toHaveAttribute("data-started-logic", '"and"');
    });

    it("lets go of a risk level that a summary card chose, which would hide the risks of the cell", async () => {
      registerState.risks = RISKS;
      renderPage("/vendors/risks");
      // "Low" is risk 2 only; the cell holds risk 1, which a card for "Low" would leave out.
      await userEvent.click(await screen.findByText("Low"));
      expect(screen.getByTestId("risk-table")).toHaveAttribute("data-ids", "2");

      await userEvent.click(tab(/^Insights/));
      await userEvent.click(screen.getByRole("button", { name: "Select heat cell" }));

      await waitFor(() =>
        expect(screen.getByTestId("risk-table")).toHaveAttribute("data-ids", "1"),
      );
    });
  });

  // The toolbar of the Risks tab is mounted only while that tab is open, and what its filter shows
  // is read when it mounts. The page keeps the state, so it hands it to them.
  describe("opening the Risks tab, what its toolbar starts with", () => {
    const FILTERED: FilterConditionStub[] = [
      { columnId: "risk_description", operator: "contains", value: "leak" },
    ];

    it.each(["/vendors", "/vendors/research-findings", "/vendors/insights"])(
      "from %s: the filter the page holds",
      async (route) => {
        toolbar.risks.state.conditions = FILTERED;
        toolbar.risks.state.logic = "or";
        renderPage(route);
        await userEvent.click(await screen.findByRole("tab", { name: /^Risks/ }));
        await waitFor(() => expect(tab(/^Risks/)).toHaveAttribute("aria-selected", "true"));

        const filter = screen.getByTestId("filter-by");
        expect(filter).toHaveAttribute("data-started-conditions", JSON.stringify(FILTERED));
        expect(filter).toHaveAttribute("data-started-logic", '"or"');
      },
    );

    it("starts on the filter the reader chose before leaving the tab", async () => {
      renderPage("/vendors/risks");
      expect(await screen.findByTestId("filter-by")).toHaveAttribute(
        "data-started-conditions",
        "[]",
      );
      await userEvent.click(screen.getByRole("button", { name: "Filter by use case 3" }));

      await userEvent.click(tab(/^Insights/));
      await userEvent.click(tab(/^Risks/));

      expect(await screen.findByTestId("filter-by")).toHaveAttribute(
        "data-started-conditions",
        JSON.stringify([{ columnId: "project_id", operator: "is", value: "3" }]),
      );
    });
  });

  // The page has a filter for each list, and each toolbar is mounted only while its tab is open and
  // reads its defaults when it mounts, so it opens on what ITS list's hook holds: not blank, and not
  // what the other list holds.
  describe("each toolbar starts on the state of its own list", () => {
    const expectStartedOn = (conditions: FilterConditionStub[], logic: string) => {
      const filter = screen.getByTestId("filter-by");
      expect(filter).toHaveAttribute("data-started-conditions", JSON.stringify(conditions));
      expect(filter).toHaveAttribute("data-started-logic", JSON.stringify(logic));
    };

    it("opens the Vendors toolbar on the filter of the vendors, on the first render", async () => {
      holdDifferentStates();
      renderPage("/vendors");
      await screen.findByTestId("vendor-table");

      expectStartedOn(FOR_VENDORS, "or");
    });

    it.each(["/vendors/risks", "/vendors/research-findings", "/vendors/insights"])(
      "opens the Vendors toolbar, from %s, on the vendors' filter, not the risks'",
      async (route) => {
        holdDifferentStates();
        renderPage(route);
        await userEvent.click(await screen.findByRole("tab", { name: /^Vendors/ }));
        await waitFor(() => expect(tab(/^Vendors/)).toHaveAttribute("aria-selected", "true"));

        expectStartedOn(FOR_VENDORS, "or");
      },
    );

    it.each(["/vendors", "/vendors/research-findings", "/vendors/insights"])(
      "opens the Risks toolbar, from %s, on the risks' filter, not the vendors'",
      async (route) => {
        holdDifferentStates();
        renderPage(route);
        await userEvent.click(await screen.findByRole("tab", { name: /^Risks/ }));
        await waitFor(() => expect(tab(/^Risks/)).toHaveAttribute("aria-selected", "true"));

        expectStartedOn(FOR_RISKS, "and");
      },
    );

    it("changes the state of the list whose toolbar was used, and of no other", async () => {
      renderPage("/vendors");
      await userEvent.click(await screen.findByRole("button", { name: "Filter by use case 3" }));

      expect(toolbar.vendors.handleFilterChange).toHaveBeenCalledTimes(1);
      expect(toolbar.risks.handleFilterChange).not.toHaveBeenCalled();

      await userEvent.click(tab(/^Risks/));
      await userEvent.click(await screen.findByRole("button", { name: "Filter by use case 3" }));

      expect(toolbar.vendors.handleFilterChange).toHaveBeenCalledTimes(1);
      expect(toolbar.risks.handleFilterChange).toHaveBeenCalledTimes(1);
    });
  });

  // The register is narrowed on the Risks tab (a use case, "Risk status", a search), and the
  // controls that do it are not on the Insights tab, so the insights are not.
  describe("the insights and the register, when the register is narrowed", () => {
    const DELETED = [
      {
        risk_id: 9,
        risk_description: "Old data leak",
        likelihood: "Likely",
        risk_severity: "Major",
        risk_level: "High risk",
      },
    ];

    beforeEach(() => {
      registerState.answer = (read) => (read.filter === "deleted" ? DELETED : RISKS);
    });

    /** Narrows the register on the Risks tab three ways: a use case, a search and "Deleted only". */
    const narrowTheRegister = async () => {
      renderPage("/vendors/risks");
      await userEvent.click(await screen.findByRole("button", { name: "Filter by use case 3" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Search risks" }), "leak");
      await userEvent.click(screen.getByRole("combobox", { name: "Risk status" }));
      await userEvent.click(await screen.findByRole("option", { name: "Deleted only" }));
    };

    // Each render of the page reads the register twice, in this order: the read the Risks tab shows
    // (narrowed by its use case and "Risk status"), then the read the insights plot.
    const NARROWED = { projectId: "3", vendorId: "all", filter: "deleted" };
    const EVERYTHING = { projectId: "all", vendorId: "all", filter: "active" };

    it("plots every active risk on the Insights tab, whatever the register is narrowed to", async () => {
      await narrowTheRegister();
      expect(registerState.reads.slice(-2)).toEqual([NARROWED, EVERYTHING]);
      expect(screen.getByTestId("risk-table")).toHaveAttribute("data-ids", "9");

      await userEvent.click(tab(/^Insights/));

      expect(screen.getByTestId("vendor-risk-insights")).toHaveAttribute("data-risks", "1,2");
      // The register is still narrowed (the controls are on the other tab), and the insights still
      // read their own: the last two reads are not the same read twice.
      expect(registerState.reads.slice(-2)).toEqual([NARROWED, EVERYTHING]);
    });

    // The register of one use case holds a risk fewer than the whole: only the insights' own read
    // can show both.
    describe("when a use case holds fewer risks than the organization", () => {
      const OF_USE_CASE_3 = [RISKS[0]];

      beforeEach(() => {
        registerState.answer = (read) => (read.projectId === "3" ? OF_USE_CASE_3 : RISKS);
      });

      it("plots the risks of every use case, though the register lists those of one", async () => {
        renderPage("/vendors/risks");
        await userEvent.click(await screen.findByRole("button", { name: "Filter by use case 3" }));
        await waitFor(() =>
          expect(screen.getByTestId("risk-table")).toHaveAttribute("data-ids", "1"),
        );

        await userEvent.click(tab(/^Insights/));

        expect(screen.getByTestId("vendor-risk-insights")).toHaveAttribute("data-risks", "1,2");
      });

      it("lists the register of the use case again when the Risks tab is opened", async () => {
        renderPage("/vendors/risks");
        await userEvent.click(await screen.findByRole("button", { name: "Filter by use case 3" }));
        await userEvent.click(tab(/^Insights/));

        await userEvent.click(tab(/^Risks/));

        expect(screen.getByTestId("risk-table")).toHaveAttribute("data-ids", "1");
      });
    });

    // The two reads load on their own: the skeleton of the register follows its read, and the
    // insights follow theirs. With one flag for both, either could be wired to the other.
    describe("while only one of the two reads is loading", () => {
      const narrowToUseCase3 = async () => {
        const view = renderPage("/vendors/risks");
        await userEvent.click(await screen.findByRole("button", { name: "Filter by use case 3" }));
        return view;
      };

      it("tells the insights that the risks are not loading while only the register is", async () => {
        const { container } = await narrowToUseCase3();
        registerState.loadingWhen = (read) => read.projectId === "3";

        await userEvent.click(tab(/^Insights/));
        expect(screen.getByTestId("vendor-risk-insights")).toHaveAttribute("data-loading", "false");

        // The register is what shows the skeleton.
        await userEvent.click(tab(/^Risks/));
        expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
        expect(screen.queryByTestId("risk-table")).not.toBeInTheDocument();
      });

      it("tells the insights that the risks are loading while only their own read is", async () => {
        const { container } = await narrowToUseCase3();
        registerState.loadingWhen = (read) => read.projectId === "all";

        await userEvent.click(tab(/^Insights/));
        expect(screen.getByTestId("vendor-risk-insights")).toHaveAttribute("data-loading", "true");

        // The register is not waiting for it.
        await userEvent.click(tab(/^Risks/));
        expect(container.querySelector(".MuiSkeleton-root")).not.toBeInTheDocument();
        expect(screen.getByTestId("risk-table")).toBeInTheDocument();
      });
    });

    it("lists the risks of a chosen cell with nothing else narrowing the register", async () => {
      await narrowTheRegister();
      await userEvent.click(tab(/^Insights/));

      await userEvent.click(screen.getByRole("button", { name: "Select heat cell" }));

      expect(currentLocation()).toBe("/vendors/risks");
      expect(screen.getByRole("textbox", { name: "Search risks" })).toHaveValue("");
      expect(screen.getByRole("combobox", { name: "Risk status" })).toHaveTextContent(
        "Active only",
      );
      // Each render reads the register twice, scoped and then unscoped: both are on the defaults now.
      const everything = { projectId: "all", vendorId: "all", filter: "active" };
      expect(registerState.reads.slice(-2)).toEqual([everything, everything]);
      // Of the two active risks, the one in the cell.
      expect(screen.getByTestId("risk-table")).toHaveAttribute("data-ids", "1");
    });
  });

  // Deleting a vendor risk changes what the register lists and what the insights plot, so both of
  // the reads of the register are refreshed: the register's, then the insights' own (and the reports
  // beside the heat map, which have their own key).
  describe("deleting a vendor risk", () => {
    const renderWithSpy = () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      registerState.risks = RISKS;
      renderPage("/vendors/risks", queryClient);
      return invalidate;
    };
    const invalidated = (spy: ReturnType<typeof renderWithSpy>) =>
      spy.mock.calls.map(([filters]) => filters);

    it("refreshes the register of vendor risks, then the insights", async () => {
      deleteVendorRisk.mockResolvedValue({ status: 202 });
      const invalidate = renderWithSpy();

      await userEvent.click(await screen.findByRole("button", { name: "Delete risk 1" }));

      await waitFor(() =>
        expect(invalidated(invalidate)).toEqual([
          { queryKey: ["vendor-risks"] },
          { queryKey: ["vendor-insights"] },
        ]),
      );
      expect(deleteVendorRisk).toHaveBeenCalledWith(1);
    });

    it("refreshes neither when the risk was not found", async () => {
      // A failed delete rejects, with the status of the answer.
      deleteVendorRisk.mockRejectedValue(Object.assign(new Error("Not found"), { status: 404 }));
      const invalidate = renderWithSpy();

      await userEvent.click(await screen.findByRole("button", { name: "Delete risk 1" }));

      expect(await screen.findByText("Risk not found.")).toBeInTheDocument();
      expect(invalidated(invalidate)).toEqual([]);
    });
  });

  describe("a notification written before the findings had a tab", () => {
    it("is taken from the Risks tab to the findings, on the vendor it names, in place of the old entry", async () => {
      renderPage("/vendors/risks?findingsVendorId=7");

      await waitFor(() =>
        expect(currentLocation()).toBe("/vendors/research-findings?findingsVendorId=7"),
      );
      expect(await screen.findByText(finding().risk_description)).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toHaveTextContent("Acme Cloud");
      expect(tab(/^Research findings/)).toHaveAttribute("aria-selected", "true");
      // A replacement, so that Back does not return to the old link and send the person on again.
      expect(navigationType()).toBe("REPLACE");
    });

    it("keeps the rest of the query", async () => {
      renderPage("/vendors/risks?findingsVendorId=7&x=1");

      await waitFor(() =>
        expect(currentLocation()).toBe("/vendors/research-findings?findingsVendorId=7&x=1"),
      );
    });

    it("leaves the link of the Risks tab alone when it names no vendor of findings", async () => {
      renderPage("/vendors/risks");

      expect(await screen.findByTestId("risk-table")).toBeInTheDocument();
      expect(currentLocation()).toBe("/vendors/risks");
      expect(navigationType()).toBe("POP");
    });

    it.each([
      ["/vendors?findingsVendorId=7", "vendor-table"],
      ["/vendors/insights?findingsVendorId=7", "vendor-risk-insights"],
    ])("leaves %s alone", async (route, content) => {
      renderPage(route);

      expect(await screen.findByTestId(content)).toBeInTheDocument();
      expect(currentLocation()).toBe(route);
      expect(navigationType()).toBe("POP");
    });
  });

  describe("the link of a vendor, ?vendorId=", () => {
    const vendorModal = () => screen.getByTestId("add-new-vendor-modal");
    const follow = (to: string) =>
      userEvent.click(screen.getByRole("button", { name: `Follow ${to}` }));

    beforeEach(() => {
      vi.mocked(getVendorById).mockReset();
      vi.mocked(getVendorById).mockImplementation((({ id }: { id: number }) =>
        Promise.resolve({ data: { id } })) as never);
    });

    it("opens the vendor, and clears the query in place of the entry of the link", async () => {
      renderPage("/vendors?vendorId=5");

      await waitFor(() => expect(vendorModal()).toHaveAttribute("data-open", "true"));
      expect(vendorModal()).toHaveAttribute("data-vendor-id", "5");
      expect(getVendorById).toHaveBeenCalledTimes(1);
      expect(getVendorById).toHaveBeenCalledWith({ id: 5 });
      await waitFor(() => expect(currentLocation()).toBe("/vendors"));
      expect(navigationType()).toBe("REPLACE");
    });

    // Wise Search leads to the same vendor again: the page is open, the query is gone, and the link
    // is a new one. It used to do nothing, because the first link had used the page up.
    it("opens the vendor again when the same link is followed a second time", async () => {
      renderPage("/vendors?vendorId=5", undefined, ["/vendors?vendorId=5"]);
      await waitFor(() => expect(currentLocation()).toBe("/vendors"));
      await waitFor(() => expect(getVendorById).toHaveBeenCalledTimes(1));

      await follow("/vendors?vendorId=5");

      await waitFor(() => expect(getVendorById).toHaveBeenCalledTimes(2));
      expect(getVendorById).toHaveBeenLastCalledWith({ id: 5 });
      await waitFor(() => expect(currentLocation()).toBe("/vendors"));
      expect(vendorModal()).toHaveAttribute("data-open", "true");
    });

    it("opens another vendor when a link for it follows the first", async () => {
      renderPage("/vendors?vendorId=5", undefined, ["/vendors?vendorId=6"]);
      await waitFor(() => expect(vendorModal()).toHaveAttribute("data-vendor-id", "5"));
      await waitFor(() => expect(currentLocation()).toBe("/vendors"));

      await follow("/vendors?vendorId=6");

      await waitFor(() => expect(vendorModal()).toHaveAttribute("data-vendor-id", "6"));
      expect(getVendorById).toHaveBeenLastCalledWith({ id: 6 });
      await waitFor(() => expect(currentLocation()).toBe("/vendors"));
    });

    // The effect runs again for every change of the URL while the vendor is being read. The link
    // that is on its way is not read a second time.
    it("reads a link once while it is on its way, whatever else changes in the URL", async () => {
      let answer: (response: unknown) => void = () => {};
      vi.mocked(getVendorById).mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }) as never,
      );

      renderPage("/vendors?vendorId=5", undefined, ["/vendors?vendorId=5&x=1"]);
      await waitFor(() => expect(getVendorById).toHaveBeenCalledTimes(1));

      await follow("/vendors?vendorId=5&x=1");
      await act(async () => {});
      expect(getVendorById).toHaveBeenCalledTimes(1);

      await act(async () => answer({ data: { id: 5 } }));
      await waitFor(() => expect(vendorModal()).toHaveAttribute("data-open", "true"));
      await waitFor(() => expect(currentLocation()).toBe("/vendors"));
    });

    // The reads are not answered in the order they were asked. A link that a later one has replaced
    // must not open its vendor over the later link's.
    describe("when a link is followed while the one before it is still being read", () => {
      const slowVendors = () => {
        const answers = new Map<number, (response: unknown) => void>();
        vi.mocked(getVendorById).mockImplementation(
          ((query: { id: number }) =>
            new Promise((resolve) => {
              answers.set(query.id, resolve);
            })) as never,
        );
        return answers;
      };

      it("keeps the vendor of the later link when the earlier one is answered last", async () => {
        const answers = slowVendors();
        renderPage("/vendors?vendorId=5", undefined, ["/vendors?vendorId=6"]);
        await waitFor(() => expect(getVendorById).toHaveBeenCalledWith({ id: 5 }));

        await follow("/vendors?vendorId=6");
        await waitFor(() => expect(getVendorById).toHaveBeenCalledWith({ id: 6 }));
        await act(async () => answers.get(6)?.({ data: { id: 6 } }));
        await waitFor(() => expect(vendorModal()).toHaveAttribute("data-vendor-id", "6"));
        await waitFor(() => expect(currentLocation()).toBe("/vendors"));

        await act(async () => answers.get(5)?.({ data: { id: 5 } }));

        expect(vendorModal()).toHaveAttribute("data-vendor-id", "6");
      });

      it("keeps the Risks tab of a risk link when the vendor link before it is answered last", async () => {
        const answers = slowVendors();
        vi.mocked(getVendorRiskById).mockResolvedValue({ data: { id: 9 } } as never);
        renderPage("/vendors?vendorId=5", undefined, ["/vendors/risks?riskId=9"]);
        await waitFor(() => expect(getVendorById).toHaveBeenCalledWith({ id: 5 }));

        await follow("/vendors/risks?riskId=9");
        await waitFor(() => expect(pageRiskEditor.existingRisk).toMatchObject({ id: 9 }));
        await waitFor(() => expect(currentLocation()).toBe("/vendors/risks"));

        await act(async () => answers.get(5)?.({ data: { id: 5 } }));

        // The vendor is not opened, and the reader is not taken back to the Vendors tab.
        expect(vendorModal()).toHaveAttribute("data-open", "false");
        expect(currentLocation()).toBe("/vendors/risks");
        expect(tab(/^Risks/)).toHaveAttribute("aria-selected", "true");
      });

      // The risk read answers late too. Its answer opens the risk editor and takes the reader back to
      // the Risks tab, which the vendor link that replaced it must not have happen to it.
      describe("a risk link that a vendor link replaced", () => {
        const slowRisks = () => {
          const answers = new Map<number, (response: unknown) => void>();
          const failures = new Map<number, (error: Error) => void>();
          vi.mocked(getVendorRiskById).mockImplementation(
            ((query: { id: number }) =>
              new Promise((resolve, reject) => {
                answers.set(query.id, resolve);
                failures.set(query.id, reject);
              })) as never,
          );
          return { answers, failures };
        };

        it.each(["/vendors/risks?riskId=9", "/vendors?riskId=9"])(
          "%s: keeps the vendor of the later link when the risk is answered last",
          async (first) => {
            const { answers } = slowRisks();
            renderPage(first, undefined, ["/vendors?vendorId=6"]);
            await waitFor(() => expect(getVendorRiskById).toHaveBeenCalledWith({ id: 9 }));

            await follow("/vendors?vendorId=6");
            await waitFor(() => expect(vendorModal()).toHaveAttribute("data-vendor-id", "6"));
            await waitFor(() => expect(currentLocation()).toBe("/vendors"));

            await act(async () => answers.get(9)?.({ data: { id: 9 } }));

            expect(pageRiskEditor.existingRisk).toBeNull();
            expect(vendorModal()).toHaveAttribute("data-vendor-id", "6");
            expect(currentLocation()).toBe("/vendors");
          },
        );

        it.each(["/vendors/risks?riskId=9", "/vendors?riskId=9"])(
          "%s: does not take the reader back to the Risks tab when the risk fails last",
          async (first) => {
            const log = vi.spyOn(console, "error").mockImplementation(() => {});
            const { failures } = slowRisks();
            renderPage(first, undefined, ["/vendors?vendorId=6"]);
            await waitFor(() => expect(getVendorRiskById).toHaveBeenCalledWith({ id: 9 }));
            await follow("/vendors?vendorId=6");
            await waitFor(() => expect(vendorModal()).toHaveAttribute("data-vendor-id", "6"));
            await waitFor(() => expect(currentLocation()).toBe("/vendors"));

            await act(async () => failures.get(9)?.(new Error("late failure")));

            expect(currentLocation()).toBe("/vendors");
            expect(vendorModal()).toHaveAttribute("data-vendor-id", "6");
            log.mockRestore();
          },
        );
      });

      it("drops a read that fails after a later link replaced it, and still answers the later one", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const failures = new Map<number, (error: Error) => void>();
        const answers = new Map<number, (response: unknown) => void>();
        vi.mocked(getVendorById).mockImplementation(
          ((query: { id: number }) =>
            new Promise((resolve, reject) => {
              answers.set(query.id, resolve);
              failures.set(query.id, reject);
            })) as never,
        );
        renderPage("/vendors?vendorId=5", undefined, ["/vendors?vendorId=6"]);
        await waitFor(() => expect(getVendorById).toHaveBeenCalledWith({ id: 5 }));
        await follow("/vendors?vendorId=6");
        await waitFor(() => expect(getVendorById).toHaveBeenCalledWith({ id: 6 }));

        await act(async () => failures.get(5)?.(new Error("late failure")));
        // The failed one is not the link in the URL any more: nothing is cleared on its account.
        expect(currentLocation()).toBe("/vendors?vendorId=6");
        await act(async () => answers.get(6)?.({ data: { id: 6 } }));

        await waitFor(() => expect(vendorModal()).toHaveAttribute("data-vendor-id", "6"));
        await waitFor(() => expect(currentLocation()).toBe("/vendors"));
        log.mockRestore();
      });
    });

    it("waits for the vendors to load before it reads the link", async () => {
      mockVendorsLoading = true;
      const view = renderPage("/vendors?vendorId=5");
      await act(async () => {});
      expect(getVendorById).not.toHaveBeenCalled();

      mockVendorsLoading = false;
      view.rerender(
        <>
          <Vendors />
          <LocationProbe />
        </>,
      );

      await waitFor(() => expect(getVendorById).toHaveBeenCalledWith({ id: 5 }));
    });

    // The query is what names the link, so it goes whatever the read answered: left in the URL, it
    // would hold back the next link, and open the vendor again on a reload.
    it("clears the query when no vendor comes back", async () => {
      vi.mocked(getVendorById).mockResolvedValue({} as never);

      renderPage("/vendors?vendorId=5");

      await waitFor(() => expect(getVendorById).toHaveBeenCalledWith({ id: 5 }));
      await waitFor(() => expect(currentLocation()).toBe("/vendors"));
      expect(vendorModal()).toHaveAttribute("data-open", "false");
    });

    it("clears the query when the vendor cannot be read, and the next link still opens", async () => {
      vi.mocked(getVendorById).mockRejectedValueOnce(new Error("not found"));
      const log = vi.spyOn(console, "error").mockImplementation(() => {});

      renderPage("/vendors?vendorId=5", undefined, ["/vendors?vendorId=6"]);
      await waitFor(() => expect(log).toHaveBeenCalled());
      await waitFor(() => expect(currentLocation()).toBe("/vendors"));

      await follow("/vendors?vendorId=6");

      await waitFor(() => expect(vendorModal()).toHaveAttribute("data-vendor-id", "6"));
      log.mockRestore();
    });
  });

  describe("the link of a vendor risk, ?riskId=", () => {
    beforeEach(() => {
      vi.mocked(getVendorRiskById).mockResolvedValue({ data: { id: 5 } } as never);
    });

    // The risk opens over the Risks tab, whichever tab the link names, and the query is gone.
    it.each([
      "/vendors?riskId=5",
      "/vendors/insights?riskId=5",
      "/vendors/research-findings?riskId=5",
      "/vendors/risks?riskId=5",
    ])("%s opens the risk on the Risks tab and clears the query", async (route) => {
      renderPage(route);

      await waitFor(() => expect(getVendorRiskById).toHaveBeenCalledWith({ id: 5 }));
      await waitFor(() => expect(pageRiskEditor.existingRisk).toMatchObject({ id: 5 }));
      // The router applies a navigation after the state that opens the risk (it may defer it under
      // load), so the location is waited for, like the editor.
      await waitFor(() => expect(currentLocation()).toBe("/vendors/risks"));
      expect(tab(/^Risks/)).toHaveAttribute("aria-selected", "true");
      // In place of the entry of the link, so that Back does not return to it and open the risk again.
      expect(navigationType()).toBe("REPLACE");
    });

    // The Risks route is there too: no tab is switched for it, so only the end of the read clears it.
    it.each(["/vendors/insights?riskId=5", "/vendors/risks?riskId=5"])(
      "%s: clears the query on the Risks tab when the risk cannot be read, in place of the entry",
      async (route) => {
        vi.mocked(getVendorRiskById).mockRejectedValue(new Error("not found"));
        const log = vi.spyOn(console, "error").mockImplementation(() => {});

        renderPage(route);

        await waitFor(() => expect(log).toHaveBeenCalled());
        await waitFor(() => expect(currentLocation()).toBe("/vendors/risks"));
        expect(navigationType()).toBe("REPLACE");
        expect(pageRiskEditor.existingRisk).toBeNull();
        log.mockRestore();
      },
    );

    // The tab a link names is not where the risk is, whether or not the risk comes back. On the
    // Risks route itself no tab is switched, so the end of the read is what clears the query.
    it.each([
      "/vendors?riskId=5",
      "/vendors/insights?riskId=5",
      "/vendors/research-findings?riskId=5",
      "/vendors/risks?riskId=5",
    ])("%s: ends on the Risks tab without the query when no risk comes back", async (route) => {
      vi.mocked(getVendorRiskById).mockResolvedValue({} as never);

      renderPage(route);

      await waitFor(() => expect(getVendorRiskById).toHaveBeenCalledWith({ id: 5 }));
      await waitFor(() => expect(currentLocation()).toBe("/vendors/risks"));
      expect(navigationType()).toBe("REPLACE");
      expect(tab(/^Risks/)).toHaveAttribute("aria-selected", "true");
      // No editor opened on nothing: it records the vendors it was given only while it is open.
      expect(pageRiskEditor.existingRisk).toBeNull();
      expect(vendorsOfThePageEditor()).toBeNull();
    });

    it("goes to the Risks tab as soon as the link is opened, before the risk is read", async () => {
      let answer: (response: unknown) => void = () => {};
      vi.mocked(getVendorRiskById).mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }) as never,
      );

      renderPage("/vendors/insights?riskId=5");

      await waitFor(() => expect(getVendorRiskById).toHaveBeenCalledWith({ id: 5 }));
      await waitFor(() => expect(tab(/^Risks/)).toHaveAttribute("aria-selected", "true"));
      // Nothing has been read yet: this is the tab switch alone, and it replaced the link's entry.
      expect(currentLocation()).toBe("/vendors/risks");
      expect(navigationType()).toBe("REPLACE");
      expect(pageRiskEditor.existingRisk).toBeNull();

      await act(async () => answer({ data: { id: 5 } }));

      await waitFor(() => expect(pageRiskEditor.existingRisk).toMatchObject({ id: 5 }));
      expect(currentLocation()).toBe("/vendors/risks");
    });
  });

  // A run started on the vendors table leaves the vendor for the findings to follow. That tab is
  // mounted only while it is open, so it picks the vendor up when it is opened, not before.
  it("opens the Research findings tab on the vendor a run was started for on the vendors table", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    followResearch(queryClient, 7);
    renderPage("/vendors", queryClient);
    await screen.findByTestId("vendor-table");

    await userEvent.click(tab(/^Research findings/));

    expect(await screen.findByRole("combobox")).toHaveTextContent("Acme Cloud");
    expect(research.latest).toHaveBeenCalledWith(7);
    expect(research.list).toHaveBeenCalledWith({ status: "pending", vendorId: 7, limit: 200 });
  });

  // The start is answered some time after the click. The person may have gone to the findings by
  // then, and the tab has to follow the run all the same, not leave the hint for a visit of its own.
  it("follows a run whose start was answered after the Research findings tab was opened", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderPage("/vendors", queryClient);
    await screen.findByTestId("vendor-table");
    await userEvent.click(tab(/^Research findings/));
    expect(await screen.findByRole("combobox")).toHaveTextContent("All vendors");

    act(() => followResearch(queryClient, 7));

    await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("Acme Cloud"));
    expect(research.latest).toHaveBeenCalledWith(7);
    expect(research.list).toHaveBeenCalledWith({ status: "pending", vendorId: 7, limit: 200 });
    expect(queryClient.getQueryData(VENDOR_RESEARCH_FOLLOW_KEY)).toBeUndefined();
  });
});
