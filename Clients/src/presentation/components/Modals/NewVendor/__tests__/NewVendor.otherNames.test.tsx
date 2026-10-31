import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
vi.mock("../../../Inputs/Datepicker", () => ({ default: () => <div /> }));

import { ReviewStatus } from "../../../../../domain/enums/status.enum";
import { VendorModel } from "../../../../../domain/models/Common/vendor/vendor.model";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AddNewVendor from "../index";

const vendor = (otherNames: string | null | undefined) =>
  new VendorModel({
    id: 7,
    vendor_name: "Meta Platforms",
    vendor_provides: "Social media",
    assignee: 2,
    website: "https://facebook.com",
    vendor_contact_person: "Jane Doe",
    review_result: "",
    review_status: ReviewStatus.NotStarted,
    reviewer: 2,
    review_date: new Date("2031-04-20T12:00:00Z"),
    projects: [1],
    other_names: otherNames,
  });

const HELPER =
  "Other names this vendor is known by, separated by commas. The research looks for them too.";

function open(existing: VendorModel) {
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

describe("NewVendor: the other names of the vendor", () => {
  beforeEach(() => {
    updateVendor.mockReset().mockResolvedValue({ status: 202, data: { data: {} } });
    createVendor.mockReset().mockResolvedValue({ status: 201, data: { data: { id: 8 } } });
    // jsdom does not implement scrollIntoView, which a failed save calls on its way to the first
    // invalid field.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("shows them in an optional field, with a line that says what they are for", () => {
    open(vendor("Facebook, Instagram"));

    const field = screen.getByLabelText(/other names/i);
    expect(field).toHaveValue("Facebook, Instagram");
    expect(field).toHaveAttribute("placeholder", "e.g. Facebook, Instagram");
    expect(document.querySelector(`label[for="${field.id}"]`)).toHaveTextContent("(optional)");
    expect(screen.getByText(HELPER)).toBeInTheDocument();
  });

  it("shows an empty field for a vendor that has none", () => {
    open(vendor(null));

    expect(screen.getByLabelText(/other names/i)).toHaveValue("");
  });

  it("saves the names as they are typed", async () => {
    open(vendor("Facebook, Instagram"));

    const field = screen.getByLabelText(/other names/i);
    await userEvent.clear(field);
    await userEvent.type(field, "Threads, WhatsApp");
    await save();

    await waitFor(() => expect(updateVendor).toHaveBeenCalledTimes(1));
    expect(updateVendor).toHaveBeenCalledWith({
      id: 7,
      data: expect.objectContaining({ other_names: "Threads, WhatsApp" }),
    });
  });

  it("saves an empty text when the names are cleared, which clears them on the server", async () => {
    open(vendor("Facebook"));

    await userEvent.clear(screen.getByLabelText(/other names/i));
    await save();

    await waitFor(() => expect(updateVendor).toHaveBeenCalledTimes(1));
    expect(updateVendor.mock.calls[0][0].data.other_names).toBe("");
  });

  it("saves a vendor that never had them with an empty text too", async () => {
    open(vendor(undefined));

    await save();

    await waitFor(() => expect(updateVendor).toHaveBeenCalledTimes(1));
    expect(updateVendor.mock.calls[0][0].data.other_names).toBe("");
  });

  it("refuses names the server would refuse, says why, and saves nothing", async () => {
    open(vendor("Facebook"));

    const field = screen.getByLabelText(/other names/i);
    await userEvent.clear(field);
    await userEvent.type(field, "Facebook, A");
    await save();

    expect(
      await screen.findByText("Each of the other names must be between 2 and 80 characters"),
    ).toBeInTheDocument();
    expect(updateVendor).not.toHaveBeenCalled();
  });

  it("takes the message away once the names are fixed", async () => {
    open(vendor("Facebook"));

    const field = screen.getByLabelText(/other names/i);
    await userEvent.clear(field);
    await userEvent.type(field, "Facebook, A");
    await save();
    await screen.findByText("Each of the other names must be between 2 and 80 characters");

    await userEvent.type(field, "pple");

    expect(
      screen.queryByText("Each of the other names must be between 2 and 80 characters"),
    ).not.toBeInTheDocument();
  });
});
