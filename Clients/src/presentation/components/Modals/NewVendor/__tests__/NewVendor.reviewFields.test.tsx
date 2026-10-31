/**
 * The review fields of a vendor in its form: its review status, date and result. A vendor without
 * them (an import or the API can store one) saves null for them, never an empty text the database
 * refuses, and shows no review date it does not have. A save that fails keeps what the person
 * typed.
 */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Dayjs } from "dayjs";
import { vi } from "vitest";

const updateVendor = vi.fn();
const createVendor = vi.fn();

vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Admin" }),
}));
vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ approvedProjects: [{ id: 1, project_title: "Support bot" }] }),
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 2, name: "Ann", surname: "Lee" }] }),
}));
vi.mock("../../../../../application/hooks/useVendors", () => ({
  useCreateVendor: () => ({ mutateAsync: createVendor }),
  useUpdateVendor: () => ({ mutateAsync: updateVendor }),
}));
vi.mock("../../../../../application/hooks/useEntityChangeHistory", () => ({
  useEntityChangeHistory: () => ({ history: [], loading: false }),
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));
vi.mock("../../../CustomFieldsSection", async () => {
  const { forwardRef } = await import("react");
  return { default: forwardRef(() => null) };
});
vi.mock("../../../CustomFieldsSection/RequiredCustomFieldsGate", () => ({
  useRequiredCustomFieldsGate: () => ({ blocked: false, onPendingChange: vi.fn() }),
}));
vi.mock("../../../Common/HistorySidebar", () => ({ HistorySidebar: () => null }));
// The picker shows the date it is given, which is the date the person sees.
vi.mock("../../../Inputs/Datepicker", () => ({
  default: ({ date }: { date: Dayjs | null }) => (
    <div data-testid="review-date">{date ? date.toISOString() : ""}</div>
  ),
}));

import { ReviewStatus } from "../../../../../domain/enums/status.enum";
import { VendorModel } from "../../../../../domain/models/Common/vendor/vendor.model";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AddNewVendor from "../index";

const REVIEW_DATE = "2031-04-20T12:00:00.000Z";
const SERVER_ERROR = "Request failed with status code 500";

const vendor = () =>
  new VendorModel({
    id: 7,
    vendor_name: "Pellmark Analytics Ltd",
    vendor_provides: "Supply chain analytics",
    assignee: 2,
    website: "https://pellmarkanalytics.example",
    vendor_contact_person: "Jane Doe",
    review_result: "Approved for a pilot",
    review_status: ReviewStatus.InReview,
    reviewer: 2,
    review_date: new Date(REVIEW_DATE),
    projects: [1],
  });

/** A vendor without a review, as the server sends it: null, though the client's type has none. */
const unreviewed = () =>
  Object.assign(vendor(), { review_status: null, review_date: null, review_result: null });

function open(existing?: VendorModel) {
  renderWithProviders(
    <AddNewVendor
      isOpen={true}
      setIsOpen={vi.fn()}
      onSuccess={vi.fn()}
      existingVendor={existing}
    />,
  );
}

const save = () => userEvent.click(screen.getByRole("button", { name: /^save$/i }));
const saved = () => updateVendor.mock.calls[0][0].data;
const vendorName = () => screen.getByLabelText(/^vendor name/i);

/**
 * Sets a text field in one change, as a paste does. The text of a field that the test does not
 * check goes in this way: typing it key by key re-renders the whole modal for every character,
 * which is most of what these tests cost and what made them slow on a loaded machine. userEvent
 * stays for the fields and the keystrokes the test is about.
 */
const setText = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

/** Opens the select with this label and picks the option. */
async function choose(label: string, option: string) {
  const wrapper = screen.getAllByText(label)[0].closest(".select-wrapper") as HTMLElement;
  await userEvent.click(within(wrapper).getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

describe("NewVendor: the review fields", () => {
  beforeEach(() => {
    updateVendor.mockReset().mockResolvedValue({ status: 202, data: { data: {} } });
    createVendor.mockReset().mockResolvedValue({ status: 201, data: { data: { id: 8 } } });
  });

  it("a vendor without a review status or date saves null for both, not an empty text", async () => {
    open(unreviewed());

    await save();

    await waitFor(() => expect(updateVendor).toHaveBeenCalledTimes(1));
    expect(saved().review_status).toBeNull();
    expect(saved().review_date).toBeNull();
  });

  it("shows no review date for a vendor that has none, as the list of vendors does", () => {
    open(unreviewed());

    expect(screen.getByTestId("review-date")).toBeEmptyDOMElement();
  });

  it("saves a review status and date as the vendor has them", async () => {
    open(vendor());
    expect(screen.getByTestId("review-date")).toHaveTextContent(REVIEW_DATE);

    await save();

    await waitFor(() => expect(updateVendor).toHaveBeenCalledTimes(1));
    expect(saved()).toMatchObject({ review_status: "In review", review_date: REVIEW_DATE });
  });

  // A null value would leave the field uncontrolled, which React warns about (once per run, so the
  // test reads what the form holds instead of the warning).
  it("holds an empty review result for a vendor that has none, not null", async () => {
    open(unreviewed());
    expect(screen.getByLabelText(/^review result/i)).toHaveValue("");

    await save();

    await waitFor(() => expect(updateVendor).toHaveBeenCalledTimes(1));
    expect(saved().review_result).toBe("");
  });

  it("a failed save keeps what the person typed, and says the save failed", async () => {
    updateVendor.mockRejectedValue(new Error(SERVER_ERROR));
    open(vendor());

    await userEvent.clear(vendorName());
    await userEvent.type(vendorName(), "Pellmark Analytics GmbH");
    await save();

    expect(await screen.findByText(new RegExp(SERVER_ERROR))).toBeInTheDocument();
    expect(vendorName()).toHaveValue("Pellmark Analytics GmbH");
  });

  it("a new vendor whose save fails keeps what the person typed", async () => {
    createVendor.mockRejectedValue(new Error(SERVER_ERROR));
    open();

    setText(/^vendor name/i, "Pellmark Analytics Ltd");
    await userEvent.click(screen.getByPlaceholderText("Select use cases"));
    await userEvent.click(await screen.findByRole("option", { name: "Support bot" }));
    setText(/^website/i, "pellmarkanalytics.example");
    setText(/^vendor contact person/i, "Jane Doe");
    await choose("Assignee", "Ann Lee");
    setText(/^what does the vendor provide/i, "Supply chain analytics");
    await save();

    expect(await screen.findByText(new RegExp(SERVER_ERROR))).toBeInTheDocument();
    expect(vendorName()).toHaveValue("Pellmark Analytics Ltd");
    expect(screen.getByLabelText(/^website/i)).toHaveValue("pellmarkanalytics.example");
  });

  it("a saved vendor clears the form", async () => {
    open(vendor());

    await save();

    await waitFor(() => expect(updateVendor).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(vendorName()).toHaveValue(""));
  });
});
