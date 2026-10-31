import type { ComponentProps } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { ReviewStatus } from "../../../../../domain/enums/status.enum";
import { VendorModel } from "../../../../../domain/models/Common/vendor/vendor.model";
import { deferred, run } from "../../../../pages/Vendors/VendorResearchFindings/__tests__/fixtures";

// The research action reads the settings and starts runs through the Task 9 repository.
vi.mock(
  "../../../../../application/repository/vendorResearch.repository",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../../../application/repository/vendorResearch.repository")
    >()),
    getVendorResearchConfig: vi.fn(),
    startVendorResearch: vi.fn(),
  }),
);

const role = vi.hoisted(() => ({ canEdit: true }));
vi.mock("../../../../../application/hooks/useMyPermissions", () => ({
  useHasPermission: (key: string) => key === "vendor.edit" && role.canEdit,
}));

// The table's custom columns are not what these tests are about.
vi.mock("../../../../../application/hooks/useCustomFields", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../application/hooks/useCustomFields")>()),
  useCustomFieldDefinitions: () => ({ data: [] }),
}));

// The relationship graph is a whole page; only its button matters here.
vi.mock("../../../EntityGraphModal", () => ({ EntityGraphModal: () => null }));

import * as repository from "../../../../../application/repository/vendorResearch.repository";
import TableWithPlaceholder from "..";

const mocks = {
  config: vi.mocked(repository.getVendorResearchConfig),
  start: vi.mocked(repository.startVendorResearch),
};

type StartResult = Awaited<ReturnType<typeof repository.startVendorResearch>>;

const vendor = (overrides: Partial<VendorModel>): VendorModel =>
  new VendorModel({
    id: 1,
    vendor_name: "Alpha Systems",
    vendor_provides: "Hosting",
    assignee: 0,
    website: "",
    vendor_contact_person: "Pat",
    review_result: "",
    review_status: ReviewStatus.NotStarted,
    reviewer: 0,
    // The API sends dates as ISO strings, whatever the model's type says, and the table reads one.
    review_date: "2026-01-15T00:00:00.000Z" as unknown as Date,
    ...overrides,
  } as VendorModel);

const ALPHA = vendor({ id: 1, vendor_name: "Alpha Systems" });
const BETA = vendor({ id: 2, vendor_name: "Beta Labs" });

const renderTable = (props: Partial<ComponentProps<typeof TableWithPlaceholder>> = {}) => {
  const handlers = { onEdit: vi.fn(), onDelete: vi.fn(), onNotify: vi.fn() };
  const view = renderWithProviders(
    <TableWithPlaceholder vendors={[ALPHA, BETA]} users={[]} {...handlers} {...props} />,
  );
  return { ...view, ...handlers };
};

const rowOf = (vendorName: string) => screen.getByText(vendorName).closest("tr") as HTMLElement;
/** What the row's action buttons are called, left to right. */
const actionsOf = (vendorName: string) =>
  within(rowOf(vendorName))
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label"));
const researchButtonOf = (vendorName: string) =>
  within(rowOf(vendorName)).getByRole("button", { name: "Research risks" });

beforeEach(() => {
  vi.clearAllMocks();
  role.canEdit = true;
  mocks.config.mockResolvedValue({ hasLlmKey: true, autoRunEnabled: true });
});

describe("the research action of a vendor row", () => {
  it("comes first among the row actions, on every row", async () => {
    renderTable();

    // The buttons ask for the research settings as soon as they are rendered: the control for
    // the tests below that expect no request.
    expect(mocks.config).toHaveBeenCalled();
    const actions = ["Research risks", "View relationships", "Vendor actions"];
    expect(actionsOf("Alpha Systems")).toEqual(actions);
    expect(actionsOf("Beta Labs")).toEqual(actions);
    await waitFor(() => expect(researchButtonOf("Alpha Systems")).toBeEnabled());
  });

  it("is left out when the page gives the table no way to show its messages", () => {
    renderTable({ onNotify: undefined });

    expect(actionsOf("Alpha Systems")).toEqual(["View relationships", "Vendor actions"]);
    expect(actionsOf("Beta Labs")).toEqual(["View relationships", "Vendor actions"]);
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("is left out for a user without vendor.edit", () => {
    role.canEdit = false;
    renderTable();

    expect(actionsOf("Alpha Systems")).toEqual(["View relationships", "Vendor actions"]);
  });

  it("is left out of a row that has no vendor id yet", async () => {
    renderTable({ vendors: [vendor({ id: undefined, vendor_name: "Draft Vendor" }), BETA] });

    expect(actionsOf("Draft Vendor")).toEqual(["View relationships", "Vendor actions"]);
    expect(actionsOf("Beta Labs")).toEqual([
      "Research risks",
      "View relationships",
      "Vendor actions",
    ]);
    await waitFor(() => expect(researchButtonOf("Beta Labs")).toBeEnabled());
  });

  it("starts the research of the vendor in its own row", async () => {
    mocks.start.mockResolvedValue({ run: run({ status: "queued" }), alreadyRunning: false });
    const { onNotify } = renderTable();
    await waitFor(() => expect(researchButtonOf("Beta Labs")).toBeEnabled());

    await userEvent.click(researchButtonOf("Beta Labs"));

    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledWith(2);
    expect(onNotify).toHaveBeenCalledWith({
      variant: "success",
      body: "Research started for Beta Labs. Findings appear on the Risks tab.",
    });
    await waitFor(() => expect(researchButtonOf("Beta Labs")).toBeEnabled());
  });

  // The rows are keyed by position, so a button's own state would otherwise stay in its place
  // while the vendor moves away from it.
  it("does not hand a request in flight to the vendor that takes its place when the table is sorted", async () => {
    const request = deferred<StartResult>();
    mocks.start.mockReturnValue(request.promise);
    const { onNotify } = renderTable();
    await waitFor(() => expect(researchButtonOf("Alpha Systems")).toBeEnabled());

    await userEvent.click(researchButtonOf("Alpha Systems"));
    await waitFor(() => expect(researchButtonOf("Alpha Systems")).toBeDisabled());
    expect(researchButtonOf("Beta Labs")).toBeEnabled();

    // Sorting by name, ascending and then descending, puts Beta Labs in the first row.
    await userEvent.click(screen.getByText("name"));
    await userEvent.click(screen.getByText("name"));
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Beta Labs")).toBeInTheDocument();

    expect(researchButtonOf("Beta Labs")).toBeEnabled();

    request.resolve({ run: run(), alreadyRunning: false });
    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    expect(onNotify).toHaveBeenCalledWith({
      variant: "success",
      body: "Research started for Alpha Systems. Findings appear on the Risks tab.",
    });
    await waitFor(() => expect(researchButtonOf("Alpha Systems")).toBeEnabled());
  });
});
