import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import type { AuditLedgerEntry } from "../../../../../application/repository/auditLedger.repository";

let mockIsSuperAdmin = false;
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ isSuperAdmin: mockIsSuperAdmin }),
}));

const mockUpdateFeature = vi.fn();
let mockFeatureLoading = false;
let mockAuditLedgerEnabled: boolean | undefined = true;
vi.mock("../../../../../application/hooks/useFeatureSettings", () => ({
  useFeatureSettings: () => ({
    settings: { audit_ledger_enabled: mockAuditLedgerEnabled },
    isLoading: mockFeatureLoading,
    update: mockUpdateFeature,
  }),
}));

const mockUpdateFilters = vi.fn();
const mockHandleChangePage = vi.fn();
const mockHandleChangeRowsPerPage = vi.fn();
const mockVerify = vi.fn();

let mockHookState: any;

vi.mock("../hooks/useAuditLedger", () => ({
  useAuditLedger: () => mockHookState,
}));

import AuditLedger from "../index";

const buildEntry = (overrides: Partial<AuditLedgerEntry> = {}): AuditLedgerEntry => ({
  id: 1,
  entry_type: "event_log",
  user_id: 1,
  user_name: "Jane",
  user_surname: "Doe",
  occurred_at: "2025-01-01T00:00:00Z",
  event_type: "create",
  entity_type: "vendor",
  entity_id: 1,
  action: "create",
  field_name: null,
  old_value: null,
  new_value: null,
  description: null,
  entry_hash: "abcdefghijklmnop",
  prev_hash: "prevhash",
  ...overrides,
});

const defaultHookState = {
  entries: [buildEntry()],
  total: 1,
  isLoading: false,
  filters: { entity_type: "", entry_type: "", searchUser: "" },
  updateFilters: mockUpdateFilters,
  page: 0,
  rowsPerPage: 10,
  handleChangePage: mockHandleChangePage,
  handleChangeRowsPerPage: mockHandleChangeRowsPerPage,
  verify: mockVerify,
  verifyResult: null,
  isVerifying: false,
};

describe("AuditLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSuperAdmin = false;
    mockFeatureLoading = false;
    mockAuditLedgerEnabled = true;
    mockHookState = { ...defaultHookState };
  });

  it("renders the enable/disable toggle and info box when enabled", async () => {
    renderWithProviders(<AuditLedger />);
    expect(screen.getByText("Audit ledger")).toBeInTheDocument();
    expect(screen.getByText("Tamper-proof audit ledger")).toBeInTheDocument();
  });

  it("shows the disabled message and hides ledger content when disabled", () => {
    mockAuditLedgerEnabled = false;
    renderWithProviders(<AuditLedger />);
    expect(screen.getByText(/The audit ledger is currently disabled/)).toBeInTheDocument();
    expect(screen.queryByText("Verify chain")).not.toBeInTheDocument();
  });

  it("calls updateFeature when the toggle is clicked", async () => {
    mockUpdateFeature.mockResolvedValue(undefined);
    renderWithProviders(<AuditLedger />);
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateFeature).toHaveBeenCalledWith({ audit_ledger_enabled: false });
    });
  });

  it("swallows errors from the toggle update", async () => {
    mockUpdateFeature.mockRejectedValue(new Error("fail"));
    renderWithProviders(<AuditLedger />);
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateFeature).toHaveBeenCalled();
    });
  });

  it("shows a loading spinner while entries are loading", () => {
    mockHookState = { ...defaultHookState, isLoading: true };
    renderWithProviders(<AuditLedger />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows an empty state when there are no entries", () => {
    mockHookState = { ...defaultHookState, entries: [], total: 0 };
    renderWithProviders(<AuditLedger />);
    expect(screen.getByText("No audit ledger entries found.")).toBeInTheDocument();
  });

  it("renders a table row for each entry", () => {
    renderWithProviders(<AuditLedger />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("vendor")).toBeInTheDocument();
  });

  it("shows the unverified banner by default", () => {
    renderWithProviders(<AuditLedger />);
    expect(screen.getByText(/Chain not yet verified/)).toBeInTheDocument();
  });

  it("shows an intact banner when verifyResult status is intact", () => {
    mockHookState = {
      ...defaultHookState,
      verifyResult: { status: "intact", totalEntries: 5 },
    };
    renderWithProviders(<AuditLedger />);
    expect(screen.getByText(/All entries verified/)).toBeInTheDocument();
  });

  it("shows an empty ledger banner when verifyResult status is empty", () => {
    mockHookState = {
      ...defaultHookState,
      verifyResult: { status: "empty", totalEntries: 0 },
    };
    renderWithProviders(<AuditLedger />);
    expect(screen.getByText("Ledger is empty")).toBeInTheDocument();
  });

  it("shows a tampering banner with brokenAtId when compromised", () => {
    mockHookState = {
      ...defaultHookState,
      verifyResult: { status: "compromised", totalEntries: 5, brokenAtId: 42 },
    };
    renderWithProviders(<AuditLedger />);
    expect(screen.getByText(/hash chain broken at entry #42/)).toBeInTheDocument();
  });

  it("shows a generic tampering banner when compromised without brokenAtId", () => {
    mockHookState = {
      ...defaultHookState,
      verifyResult: { status: "compromised", totalEntries: 5 },
    };
    renderWithProviders(<AuditLedger />);
    expect(screen.getByText(/hash chain integrity check failed/)).toBeInTheDocument();
  });

  it("calls verify when the Verify chain button is clicked", () => {
    renderWithProviders(<AuditLedger />);
    fireEvent.click(screen.getByText("Verify chain"));
    expect(mockVerify).toHaveBeenCalled();
  });

  it("disables the verify button for super admins", () => {
    mockIsSuperAdmin = true;
    renderWithProviders(<AuditLedger />);
    expect(screen.getByText("Verify chain").closest("button")).toBeDisabled();
  });

  it("shows Verifying... label while verification is in progress", () => {
    mockHookState = { ...defaultHookState, isVerifying: true };
    renderWithProviders(<AuditLedger />);
    expect(screen.getByText("Verifying...")).toBeInTheDocument();
  });
});
