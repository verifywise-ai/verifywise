import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";

const projectsState = vi.hoisted(() => ({ list: [] as Record<string, unknown>[] }));

vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => (
    <input
      data-testid={`field-${props.id || "field"}`}
      value={props.value ?? ""}
      onChange={props.onChange ?? (() => {})}
    />
  ),
}));
vi.mock("../../../Inputs/Datepicker", () => ({
  default: (props: any) => <span data-testid={`date-${props.label}`} />,
}));
// Selects as native selects, so options and picks can be checked.
vi.mock("../../../Inputs/Select", () => ({
  default: (props: any) => (
    <>
      <select
        data-testid={`select-${props.id}`}
        aria-label={props.label}
        value={props.value ?? ""}
        onChange={props.onChange ?? (() => {})}
      >
        <option value="">-</option>
        {(props.items ?? []).map((item: any) => (
          <option key={String(item._id)} value={item._id}>
            {item.name}
          </option>
        ))}
      </select>
      {props.error && <span>{props.error}</span>}
    </>
  ),
}));
vi.mock("../../../HistorySidebar", () => ({
  HistorySidebar: () => null,
  default: () => null,
}));
vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: projectsState.list }),
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));
vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn(async () => ({ data: [] })),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import SideDrawerIncident, { NewIncidentFormValues, STORED_USE_CASE_OPTION } from "../index";

const PROJECTS = [
  { id: 1, uc_id: "UC-1", project_title: "Chatbot", approval_status: "approved" },
  // Not approved yet: the server accepts it, so the picker lists it.
  { id: 2, uc_id: "UC-2", project_title: "Fraud scoring", approval_status: "pending" },
  // Same title as id 1: told apart by the use case ID.
  { id: 5, uc_id: "UC-5", project_title: "Chatbot", approval_status: "approved" },
  // Rejected: left out of the picker.
  { id: 6, uc_id: "UC-6", project_title: "Rejected idea", approval_status: "rejected" },
];

const storedIncident = {
  incident_id: "INC-9",
  ai_project: "Fraud scoring",
  project_id: 2,
  type: "Malfunction",
  severity: "Minor",
  status: "Open",
  occurred_date: "2026-09-01",
  date_detected: "2026-09-01",
  reporter: "Jane",
  reporter_id: "",
  reporter_name: null,
  categories_of_harm: ["Health"],
  description: "The model ranked candidates unfairly.",
  interim_report: false,
  approval_status: "Pending",
  expected_updated_at: "2026-10-10T12:34:56.789Z",
} as unknown as NewIncidentFormValues;

const pickerSelect = () => screen.getByTestId("select-ai_project") as HTMLSelectElement;
const optionTexts = () =>
  within(pickerSelect())
    .getAllByRole("option")
    .map((o) => o.textContent);

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  projectsState.list = PROJECTS;
});

describe("NewIncident use case picker", () => {
  it("lists every use case by id but rejected ones, and tells equal titles apart", () => {
    renderWithProviders(<SideDrawerIncident isOpen={true} setIsOpen={vi.fn()} />);

    expect(optionTexts()).toEqual(["-", "Chatbot (UC-1)", "Fraud scoring", "Chatbot (UC-5)"]);
    expect(within(pickerSelect()).getByRole("option", { name: "Chatbot (UC-5)" })).toHaveValue("5");
  });

  it("shows the stored use case selected by its id", () => {
    renderWithProviders(
      <SideDrawerIncident
        isOpen={true}
        setIsOpen={vi.fn()}
        initialData={storedIncident}
        isEdit
        mode="edit"
      />,
    );
    expect(pickerSelect()).toHaveValue("2");
  });

  it("picking the second of two equal titles sends that use case's id and title", async () => {
    const onSuccess = vi.fn().mockResolvedValue(true);
    renderWithProviders(
      <SideDrawerIncident
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={onSuccess}
        initialData={storedIncident}
        isEdit
        mode="edit"
      />,
    );
    fireEvent.change(pickerSelect(), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Update incident"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0]).toEqual({
      project_id: 5,
      ai_project: "Chatbot",
      expected_updated_at: "2026-10-10T12:34:56.789Z",
    });
  });

  it("keeps showing a stored use case that is not in the list", () => {
    renderWithProviders(
      <SideDrawerIncident
        isOpen={true}
        setIsOpen={vi.fn()}
        initialData={{ ...storedIncident, project_id: 99, ai_project: "Retired bot" }}
        isEdit
        mode="edit"
      />,
    );
    expect(pickerSelect()).toHaveValue("99");
    expect(optionTexts()).toContain("Retired bot");
  });

  it("keeps showing a stored rejected use case as the selected extra option", () => {
    renderWithProviders(
      <SideDrawerIncident
        isOpen={true}
        setIsOpen={vi.fn()}
        initialData={{ ...storedIncident, project_id: 6, ai_project: "Rejected idea" }}
        isEdit
        mode="edit"
      />,
    );
    expect(pickerSelect()).toHaveValue("6");
    expect(optionTexts()).toEqual([
      "-",
      "Rejected idea",
      "Chatbot (UC-1)",
      "Fraud scoring",
      "Chatbot (UC-5)",
    ]);
  });

  it("keeps a use case stored as text only, and can go back to it after picking another", async () => {
    const onSuccess = vi.fn().mockResolvedValue(true);
    renderWithProviders(
      <SideDrawerIncident
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={onSuccess}
        initialData={{ ...storedIncident, project_id: null, ai_project: "Imported from Jira" }}
        isEdit
        mode="edit"
      />,
    );
    expect(pickerSelect()).toHaveValue(STORED_USE_CASE_OPTION);
    expect(optionTexts()).toContain("Imported from Jira");

    fireEvent.change(pickerSelect(), { target: { value: "1" } });
    expect(pickerSelect()).toHaveValue("1");
    fireEvent.change(pickerSelect(), { target: { value: STORED_USE_CASE_OPTION } });
    expect(pickerSelect()).toHaveValue(STORED_USE_CASE_OPTION);

    // Back where it started: nothing to send but the version.
    fireEvent.click(screen.getByText("Update incident"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0]).toEqual({
      expected_updated_at: "2026-10-10T12:34:56.789Z",
    });
  });

  it("requires a use case on a new incident", async () => {
    const onSuccess = vi.fn();
    renderWithProviders(
      <SideDrawerIncident isOpen={true} setIsOpen={vi.fn()} onSuccess={onSuccess} />,
    );
    fireEvent.click(screen.getByText("Save incident"));
    expect(await screen.findByText("Use case is required.")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("NewIncident header", () => {
  it("view mode has a header with the title, the incident ID and a labelled close button", () => {
    const setIsOpen = vi.fn();
    renderWithProviders(
      <SideDrawerIncident
        isOpen={true}
        setIsOpen={setIsOpen}
        initialData={storedIncident}
        isEdit
        mode="view"
      />,
    );
    expect(screen.getByRole("heading", { name: "View incident" })).toBeInTheDocument();
    expect(screen.getByText("(Incident ID: INC-9)")).toBeInTheDocument();
    // The drawer is a modal dialog named by its title.
    const dialog = screen.getByRole("dialog", { name: "View incident" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const close = screen.getByTestId("incident-drawer-close");
    expect(close.tagName).toBe("BUTTON");
    expect(close).toHaveAttribute("aria-label", "Close");
    close.focus();
    expect(close).toHaveFocus();
    fireEvent.click(close);
    expect(setIsOpen).toHaveBeenCalledWith(false);
  });

  it("shows sentence-case section headings and option labels", () => {
    renderWithProviders(<SideDrawerIncident isOpen={true} setIsOpen={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Create new incident" })).toBeInTheDocument();
    for (const heading of [
      "Incident information",
      "Impact assessment",
      "Response and actions",
      "Approval and reporting",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    expect(
      within(screen.getByTestId("select-severity")).getByRole("option", { name: "Very serious" }),
    ).toHaveValue("Very serious");
    expect(
      within(screen.getByTestId("select-approval_status")).getByRole("option", {
        name: "Not required",
      }),
    ).toHaveValue("Not required");
  });
});
