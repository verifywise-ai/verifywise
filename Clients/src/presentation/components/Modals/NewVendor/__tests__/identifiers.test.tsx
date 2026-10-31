/**
 * The identifiers of a vendor in its form (spec Q1, M2 Task 13): its country, company
 * registration number, LEI and SEC CIK, in a group of their own. Each is optional, is checked as
 * the server checks it, and is saved in the form the server stores it; an empty field saves null,
 * which clears it.
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, vi } from "vitest";

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
import { setLanguage, tr } from "../../../../../test/i18nHelpers";
import AddNewVendor from "../index";

/** A made-up LEI: 18 characters of no real entity and their check digits (MOD 97-10). */
const LEI = "TEST00ACMEANALYT0154";

type Identifiers = Partial<
  Pick<VendorModel, "country" | "registration_number" | "lei" | "sec_cik">
>;

const vendor = (identifiers: Identifiers = {}) =>
  new VendorModel({
    id: 7,
    vendor_name: "Pellmark Analytics Ltd",
    vendor_provides: "Supply chain analytics",
    assignee: 2,
    website: "https://pellmarkanalytics.example",
    vendor_contact_person: "Jane Doe",
    review_result: "",
    review_status: ReviewStatus.NotStarted,
    reviewer: 2,
    review_date: new Date("2031-04-20T12:00:00Z"),
    projects: [1],
    ...identifiers,
  });

const CAPTION = "Turns a match by name into a match by identifier.";

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

const group = (name = "Identifiers") => screen.getByRole("group", { name });
const field = (name: RegExp) => within(group()).getByLabelText(name);
const save = () => userEvent.click(screen.getByRole("button", { name: /^save$/i }));
const saved = () => updateVendor.mock.calls[0][0].data;

/** Opens the select with this label and picks the option. */
async function choose(label: string, option: string) {
  const wrapper = screen.getAllByText(label)[0].closest(".select-wrapper") as HTMLElement;
  await userEvent.click(within(wrapper).getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

async function retype(name: RegExp, text: string) {
  await userEvent.clear(field(name));
  if (text !== "") await userEvent.type(field(name), text);
}

describe("NewVendor: the identifiers of the vendor", () => {
  beforeEach(() => {
    updateVendor.mockReset().mockResolvedValue({ status: 202, data: { data: {} } });
    createVendor.mockReset().mockResolvedValue({ status: 201, data: { data: { id: 8 } } });
    // jsdom does not implement scrollIntoView, which a failed save calls on its way to the first
    // invalid field.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("shows them in a group of their own, each optional, with what they are for", () => {
    open(
      vendor({
        country: "DE",
        registration_number: "HRB 86891",
        lei: LEI,
        sec_cik: "0000098765",
      }),
    );

    expect(field(/^country/i)).toHaveValue("DE");
    expect(field(/^registration number/i)).toHaveValue("HRB 86891");
    expect(field(/^lei/i)).toHaveValue(LEI);
    expect(field(/^sec cik/i)).toHaveValue("0000098765");
    expect(within(group()).getAllByText("(optional)")).toHaveLength(4);
    expect(within(group()).getByText(CAPTION)).toBeInTheDocument();
  });

  it("shows empty fields for a vendor that has none", () => {
    open(vendor({ country: null, registration_number: null, lei: null, sec_cik: null }));

    for (const name of [/^country/i, /^registration number/i, /^lei/i, /^sec cik/i]) {
      expect(field(name)).toHaveValue("");
    }
  });

  it("the country shows its name", async () => {
    open(vendor());

    await userEvent.type(field(/^country/i), "ch");
    expect(within(group()).getByText("Switzerland")).toBeInTheDocument();

    // A code that is no country of ISO 3166-1 shows no name, though a browser may know one.
    await retype(/^country/i, "xk");
    expect(within(group()).queryByText("Kosovo")).not.toBeInTheDocument();
  });

  it("the payload carries the normalised identifiers", async () => {
    open(vendor());

    await userEvent.type(field(/^country/i), " de ");
    await userEvent.type(field(/^registration number/i), "  HRB   86891 ");
    await userEvent.type(
      field(/^lei/i),
      `${LEI.slice(0, 4)} ${LEI.slice(4, 10).toLowerCase()} ${LEI.slice(10)}`,
    );
    await userEvent.type(field(/^sec cik/i), "98765");
    await save();

    await waitFor(() => expect(updateVendor).toHaveBeenCalledTimes(1));
    expect(saved()).toMatchObject({
      country: "DE",
      registration_number: "HRB 86891",
      lei: LEI,
      sec_cik: "0000098765",
    });
  });

  it("a CIK is padded to ten digits", async () => {
    open(vendor());

    await userEvent.type(field(/^sec cik/i), "320");
    await save();

    await waitFor(() => expect(updateVendor).toHaveBeenCalledTimes(1));
    expect(saved().sec_cik).toBe("0000000320");
  });

  it("an empty field sends null", async () => {
    open(
      vendor({
        country: "DE",
        registration_number: "HRB 86891",
        lei: LEI,
        sec_cik: "0000098765",
      }),
    );

    for (const name of [/^country/i, /^registration number/i, /^lei/i, /^sec cik/i]) {
      await retype(name, "");
    }
    await save();

    await waitFor(() => expect(updateVendor).toHaveBeenCalledTimes(1));
    expect(saved()).toMatchObject({
      country: null,
      registration_number: null,
      lei: null,
      sec_cik: null,
    });
  });

  it("an LEI with wrong check digits is refused, says why, and saves nothing", async () => {
    open(vendor());

    const wrong = `${LEI.slice(0, 18)}${LEI.slice(18) === "00" ? "01" : "00"}`;
    await userEvent.type(field(/^lei/i), wrong);
    await save();

    expect(await screen.findByText("LEI check digits do not match")).toBeInTheDocument();
    expect(updateVendor).not.toHaveBeenCalled();
    // The field the person has to fix takes the focus, though it is far down the form.
    await waitFor(() => expect(field(/^lei/i)).toHaveFocus());
  });

  it("refuses a country, a CIK and a registration number the server would refuse", async () => {
    open(vendor());

    await userEvent.type(field(/^country/i), "uk");
    await userEvent.type(field(/^registration number/i), "x".repeat(65));
    await userEvent.type(field(/^sec cik/i), "12a");
    await save();

    expect(
      await screen.findByText("Country must be a two-letter ISO 3166-1 code, such as DE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Registration number must be at most 64 characters"),
    ).toBeInTheDocument();
    expect(screen.getByText("SEC CIK must be one to ten digits")).toBeInTheDocument();
    expect(updateVendor).not.toHaveBeenCalled();
  });

  it("a new vendor is saved with its identifiers, and null for those left empty", async () => {
    renderWithProviders(<AddNewVendor isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/^vendor name/i), "Pellmark Analytics Ltd");
    await userEvent.click(screen.getByPlaceholderText("Select use cases"));
    await userEvent.click(await screen.findByRole("option", { name: "Support bot" }));
    await userEvent.type(screen.getByLabelText(/^website/i), "pellmarkanalytics.example");
    await userEvent.type(screen.getByLabelText(/^vendor contact person/i), "Jane Doe");
    await choose("Assignee", "Ann Lee");
    await userEvent.type(
      screen.getByLabelText(/^what does the vendor provide/i),
      "Supply chain analytics",
    );
    await userEvent.type(field(/^country/i), "gb");
    await userEvent.type(field(/^registration number/i), "09876543");
    await save();

    await waitFor(() => expect(createVendor).toHaveBeenCalledTimes(1));
    expect(createVendor.mock.calls[0][0]).toMatchObject({
      vendor_name: "Pellmark Analytics Ltd",
      country: "GB",
      registration_number: "09876543",
      lei: null,
      sec_cik: null,
    });
  });

  describe("in the person's language", () => {
    afterAll(() => setLanguage("en"));

    it("the country shows its name in German, and the group speaks German", async () => {
      await setLanguage("de");
      open(vendor({ country: "CH" }));

      const german = await screen.findByRole("group", { name: tr("de", "Identifiers") });
      expect(within(german).getByText("Schweiz")).toBeInTheDocument();
      for (const text of [CAPTION, "Country", "Registration number", "SEC CIK"]) {
        expect(within(german).getByText(tr("de", text))).toBeInTheDocument();
      }
    });
  });
});
