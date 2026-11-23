import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material";
import { light } from "../../../themes";
import { RiskLink } from "../../../../domain/interfaces/i.riskLink";

/**
 * Which link actions each role sees in the project risk and vendor risk
 * panels. useCan answers from the real permission table (the copy of the
 * server's built-in matrix that permissions.test.ts keeps in step), so these
 * cases follow the server's rule: links are created and parent changes marked
 * reviewed with riskLinks.edit (Admin, Editor); a link's status changes with
 * riskLinks.review (Admin, Editor, Reviewer); scans and suggestions need
 * riskLinks.admin. An Auditor sees none of them.
 */
let mockRole = "Admin";
let mockPermissions: string[] | undefined;

vi.mock("../../../../application/hooks/useCan", async () => {
  const { canWithPermissions } = await vi.importActual<
    typeof import("../../../../application/constants/permissions")
  >("../../../../application/constants/permissions");
  const check = (key: any) => canWithPermissions(key, mockPermissions, mockRole);
  return {
    useCan: check,
    useCanCheck: () => check,
    usePermissionsSettled: () => true,
  };
});

const { mockLinks, mutation } = vi.hoisted(() => ({
  mockLinks: vi.fn(),
  mutation: () => ({
    mutate: () => undefined,
    isPending: false,
    error: null,
    reset: () => undefined,
  }),
}));

vi.mock("../../../../application/hooks/useRiskLinks", () => ({
  useRiskLinks: () => mockLinks(),
  useVendorRiskLinks: () => mockLinks(),
  useUpdateRiskLinkStatus: mutation,
  useUpdateVendorRiskLinkStatus: mutation,
  useAcknowledgeParentLevelChange: mutation,
  useRecomputeRiskLinks: mutation,
  useRecomputeVendorRiskLinks: mutation,
  useSuggestRiskHierarchy: mutation,
  useSuggestVendorRiskHierarchy: mutation,
  useCreateRiskLink: mutation,
  useCreateVendorRiskLink: mutation,
  useSharedProjects: () => ({ data: [] }),
  useVendorRiskSharedProjects: () => ({ data: [] }),
}));

vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisks: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../../../application/repository/vendorRisk.repository", () => ({
  getAllVendorRisks: vi.fn().mockResolvedValue({ data: [] }),
}));

import LinkedRisksPanel from "../index";
import VendorRiskLinksPanel from "../VendorRiskLinksPanel";

const base: RiskLink = {
  id: 1,
  status: "suggested",
  source: "derived",
  relationType: "related_to",
  score: 3,
  reasons: [],
  direction: "undirected",
  decidedAt: null,
  lastComputedAt: null,
  dismissReason: null,
  dismissNote: null,
  parentLevelChangedAt: null,
  relatedRisk: {
    id: 9,
    entityType: "risk",
    name: "Suggested pair",
    riskLevel: null,
    ownerId: null,
  },
};

/** A suggestion (Confirm, Dismiss) and a confirmed link (Remove link). */
const vendorLinks: RiskLink[] = [
  base,
  {
    ...base,
    id: 2,
    status: "confirmed",
    source: "user",
    relationType: "inherits_from",
    direction: "incoming",
    relatedRisk: { ...base.relatedRisk, id: 10, name: "Confirmed child" },
  },
];

/** Adds the child's own view of a parent whose level changed (Mark reviewed). */
const projectLinks: RiskLink[] = [
  ...vendorLinks,
  {
    ...base,
    id: 3,
    status: "confirmed",
    source: "user",
    relationType: "inherits_from",
    direction: "outgoing",
    parentLevelChangedAt: "2026-11-01T12:00:00.000Z",
    relatedRisk: { ...base.relatedRisk, id: 11, name: "Changed parent" },
  },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <ThemeProvider theme={light}>
      <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
    </ThemeProvider>,
  );

const button = (name: string) => screen.queryAllByRole("button", { name });

type Expectation = { link: boolean; review: boolean; admin: boolean };

const ROLES: Array<[string, Expectation]> = [
  ["Admin", { link: true, review: true, admin: true }],
  ["Editor", { link: true, review: true, admin: false }],
  ["Reviewer", { link: false, review: true, admin: false }],
  ["Auditor", { link: false, review: false, admin: false }],
];

beforeEach(() => {
  mockPermissions = undefined;
  mockLinks.mockReset();
});

describe("VendorRiskLinksPanel link actions by role", () => {
  it.each(ROLES)("%s", (role, expected) => {
    mockRole = role;
    mockLinks.mockReturnValue({ data: vendorLinks, isLoading: false, isError: false });
    renderWithProviders(<VendorRiskLinksPanel vendorRiskId={7} />);

    expect(button("Link a project risk")).toHaveLength(expected.link ? 1 : 0);
    expect(button("Relate a vendor risk")).toHaveLength(expected.link ? 1 : 0);
    expect(button("Confirm")).toHaveLength(expected.review ? 1 : 0);
    expect(button("Dismiss")).toHaveLength(expected.review ? 1 : 0);
    expect(button("Remove link")).toHaveLength(expected.review ? 1 : 0);
    expect(button("Suggest children")).toHaveLength(expected.admin ? 1 : 0);
    // Reading the links is open to every role.
    expect(screen.getByText("Suggested pair")).toBeInTheDocument();
    expect(button("Show dismissed")).toHaveLength(1);
  });

  it("hides the how-to-link caption from a role that cannot link", () => {
    const caption =
      "Link a project risk that this vendor risk applies to, or relate another vendor risk. Suggestions appear here too.";
    mockLinks.mockReturnValue({ data: [], isLoading: false, isError: false });

    mockRole = "Auditor";
    const auditor = renderWithProviders(<VendorRiskLinksPanel vendorRiskId={7} />);
    expect(screen.queryByText(caption)).toBeNull();
    auditor.unmount();

    mockRole = "Editor";
    renderWithProviders(<VendorRiskLinksPanel vendorRiskId={7} />);
    expect(screen.getByText(caption)).toBeInTheDocument();
  });

  it("follows a custom role's loaded permissions, not its name", () => {
    mockRole = "Vendor reviewer";
    mockPermissions = ["riskLinks.review"];
    mockLinks.mockReturnValue({ data: vendorLinks, isLoading: false, isError: false });
    renderWithProviders(<VendorRiskLinksPanel vendorRiskId={7} />);

    expect(button("Confirm")).toHaveLength(1);
    expect(button("Link a project risk")).toHaveLength(0);
  });
});

describe("LinkedRisksPanel link actions by role", () => {
  it.each(ROLES)("%s", (role, expected) => {
    mockRole = role;
    mockLinks.mockReturnValue({ data: projectLinks, isLoading: false, isError: false });
    renderWithProviders(<LinkedRisksPanel riskId={42} />);

    expect(button("Link a risk")).toHaveLength(expected.link ? 1 : 0);
    // Clearing the parent-level warning is POST .../acknowledge-parent-change,
    // which the server authorizes on riskLinks.edit.
    expect(button("Mark reviewed")).toHaveLength(expected.link ? 1 : 0);
    expect(button("Confirm")).toHaveLength(expected.review ? 1 : 0);
    expect(button("Dismiss")).toHaveLength(expected.review ? 1 : 0);
    expect(button("Remove link")).toHaveLength(expected.review ? 2 : 0);
    expect(button("Suggest hierarchy")).toHaveLength(expected.admin ? 1 : 0);
    // The warning itself stays visible to everyone.
    expect(screen.getByText("Parent level changed")).toBeInTheDocument();
    expect(button("Show dismissed")).toHaveLength(1);
  });

  it("offers Restore on a dismissed suggestion only to a role that may review", () => {
    const dismissed: RiskLink = { ...base, status: "dismissed", dismissReason: "not_related" };
    mockLinks.mockReturnValue({ data: [dismissed], isLoading: false, isError: false });

    mockRole = "Auditor";
    const auditor = renderWithProviders(<LinkedRisksPanel riskId={42} />);
    expect(button("Restore")).toHaveLength(0);
    auditor.unmount();

    mockRole = "Reviewer";
    renderWithProviders(<LinkedRisksPanel riskId={42} />);
    expect(button("Restore")).toHaveLength(1);
  });
});
