import { vi, describe, it, expect, beforeAll, afterEach } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => (
    <input
      data-testid={`field-${props.id || "field"}`}
      value={props.value ?? ""}
      onChange={props.onChange ?? (() => {})}
    />
  ),
}));
// The date pickers show the day they hold.
vi.mock("../../../Inputs/Datepicker", () => ({
  default: (props: any) => (
    <span data-testid={`date-${props.label}`}>{props.date?.format("YYYY-MM-DD")}</span>
  ),
}));
// Selects as native selects, so options and picks can be checked.
vi.mock("../../../Inputs/Select", () => ({
  default: (props: any) => (
    <>
      <select
        data-testid={`select-${props.id}`}
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
  useProjects: () => ({ data: [], approvedProjects: [] }),
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));
vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn(async ({ routeUrl }: { routeUrl: string }) =>
    routeUrl === "/users"
      ? {
          data: [
            { id: 7, name: "Alex", surname: "Kim" },
            { id: 8, name: "Alex", surname: "Moreau" },
          ],
        }
      : { data: [] },
  ),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import SideDrawerIncident, { NewIncidentFormValues, STORED_REPORTER_OPTION } from "../index";

const originalTz = process.env.TZ;

const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const storedIncident = {
  incident_id: "INC-9",
  ai_project: "Chatbot",
  project_id: 1,
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
} as unknown as NewIncidentFormValues;

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("NewIncident dates and reporter", () => {
  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it.each(["UTC", "America/Los_Angeles", "Pacific/Kiritimati"])(
    "a new incident's dates default to the user's own today when the drawer opens (%s)",
    (tz) => {
      process.env.TZ = tz;
      vi.useFakeTimers({ toFake: ["Date"] });
      // 18:30 on 23 November in Los Angeles is already the 24th in UTC.
      vi.setSystemTime(new Date("2026-11-24T02:30:00.000Z"));
      const { rerender } = renderWithProviders(
        <SideDrawerIncident isOpen={false} setIsOpen={vi.fn()} />,
      );
      rerender(<SideDrawerIncident isOpen={true} setIsOpen={vi.fn()} />);

      const today = localDay(new Date());
      expect(screen.getByTestId("date-Occurred date")).toHaveTextContent(today);
      expect(screen.getByTestId("date-Detected date")).toHaveTextContent(today);
      if (tz === "America/Los_Angeles") expect(today).toBe("2026-11-23");

      // Opened again the next day: the defaults follow the clock, not the
      // time the page loaded.
      rerender(<SideDrawerIncident isOpen={false} setIsOpen={vi.fn()} />);
      vi.setSystemTime(new Date("2026-11-25T02:30:00.000Z"));
      rerender(<SideDrawerIncident isOpen={true} setIsOpen={vi.fn()} />);
      expect(screen.getByTestId("date-Occurred date")).toHaveTextContent(localDay(new Date()));
    },
  );

  it("offers users by id with full names, so two people called Alex stay apart", async () => {
    renderWithProviders(<SideDrawerIncident isOpen={true} setIsOpen={vi.fn()} />);
    const select = screen.getByTestId("select-reporter");
    await waitFor(() => expect(select).toHaveTextContent("Alex Kim"));
    expect(select).toHaveTextContent("Alex Moreau");
    expect(within(select).getByRole("option", { name: "Alex Moreau" })).toHaveValue("8");
  });

  it("sends the picked reporter's id and full name on create", async () => {
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <SideDrawerIncident
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={onSuccess}
        initialData={{ ...storedIncident, incident_id: undefined, reporter: "" }}
      />,
    );
    const select = screen.getByTestId("select-reporter");
    await waitFor(() => expect(select).toHaveTextContent("Alex Moreau"));
    fireEvent.change(select, { target: { value: "8" } });
    fireEvent.click(screen.getByText("Save incident"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const body = onSuccess.mock.calls[0][0];
    expect(body.reporter_id).toBe(8);
    expect(body.reporter).toBe("Alex Moreau");
    expect(body).not.toHaveProperty("reporter_name");
  });

  it("requires a reporter when neither a user nor a stored name is set", async () => {
    const onSuccess = vi.fn();
    renderWithProviders(
      <SideDrawerIncident
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={onSuccess}
        initialData={{ ...storedIncident, incident_id: undefined, reporter: "" }}
      />,
    );
    fireEvent.click(screen.getByText("Save incident"));
    await waitFor(() => expect(screen.getByText("Reporter is required.")).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("keeps an older incident's text-only reporter selected and does not send it back", async () => {
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <SideDrawerIncident
        isOpen={true}
        setIsOpen={vi.fn()}
        isEdit
        incidentId={9}
        onSuccess={onSuccess}
        initialData={storedIncident}
      />,
    );
    const select = screen.getByTestId("select-reporter") as HTMLSelectElement;
    await waitFor(() => expect(select).toHaveTextContent("Alex Kim"));
    expect(select.value).toBe(STORED_REPORTER_OPTION);
    expect(within(select).getByRole("option", { name: "Jane" })).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("field-model_version"), { target: { value: "v2" } });
    fireEvent.click(screen.getByText("Update incident"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const body = onSuccess.mock.calls[0][0];
    expect(body).toEqual({ model_system_version: "v2" });
  });

  it("shows a reporter who is no longer a listed user by their name", async () => {
    renderWithProviders(
      <SideDrawerIncident
        isOpen={true}
        setIsOpen={vi.fn()}
        isEdit
        incidentId={9}
        initialData={{
          ...storedIncident,
          reporter: "Sam Lee",
          reporter_id: 99,
          reporter_name: "Sam Lee",
        }}
      />,
    );
    const select = screen.getByTestId("select-reporter") as HTMLSelectElement;
    await waitFor(() => expect(select).toHaveTextContent("Alex Kim"));
    expect(select.value).toBe("99");
    expect(within(select).getByRole("option", { name: "Sam Lee" })).toBeInTheDocument();
  });

  it("keeps the text-only reporter as an option after picking someone else, and going back sends nothing", async () => {
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <SideDrawerIncident
        isOpen={true}
        setIsOpen={vi.fn()}
        isEdit
        incidentId={9}
        onSuccess={onSuccess}
        initialData={storedIncident}
      />,
    );
    const select = screen.getByTestId("select-reporter") as HTMLSelectElement;
    await waitFor(() => expect(select).toHaveTextContent("Alex Kim"));

    fireEvent.change(select, { target: { value: "7" } });
    expect(select.value).toBe("7");
    expect(within(select).getByRole("option", { name: "Jane" })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: STORED_REPORTER_OPTION } });
    expect(select.value).toBe(STORED_REPORTER_OPTION);

    fireEvent.change(screen.getByTestId("field-model_version"), { target: { value: "v2" } });
    fireEvent.click(screen.getByText("Update incident"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0]).toEqual({ model_system_version: "v2" });
  });

  it("keeps a departed reporter as an option after picking someone else", async () => {
    renderWithProviders(
      <SideDrawerIncident
        isOpen={true}
        setIsOpen={vi.fn()}
        isEdit
        incidentId={9}
        initialData={{
          ...storedIncident,
          reporter: "Sam Lee",
          reporter_id: 99,
          reporter_name: "Sam Lee",
        }}
      />,
    );
    const select = screen.getByTestId("select-reporter") as HTMLSelectElement;
    await waitFor(() => expect(select).toHaveTextContent("Alex Kim"));
    fireEvent.change(select, { target: { value: "8" } });
    expect(select.value).toBe("8");
    expect(within(select).getByRole("option", { name: "Sam Lee" })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "99" } });
    expect(select.value).toBe("99");
  });

  it("sends the reporter id with the reporter text whenever the reporter changed", async () => {
    // Stored under the user's old name: re-picking them changes only the
    // text, which must still go with the id so the server keeps the user.
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <SideDrawerIncident
        isOpen={true}
        setIsOpen={vi.fn()}
        isEdit
        incidentId={9}
        onSuccess={onSuccess}
        initialData={{
          ...storedIncident,
          reporter: "Alex K.",
          reporter_id: 7,
          reporter_name: "Alex Kim",
        }}
      />,
    );
    const select = screen.getByTestId("select-reporter") as HTMLSelectElement;
    await waitFor(() => expect(select).toHaveTextContent("Alex Moreau"));
    fireEvent.change(select, { target: { value: "8" } });
    fireEvent.change(select, { target: { value: "7" } });
    fireEvent.click(screen.getByText("Update incident"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const body = onSuccess.mock.calls[0][0];
    expect(body.reporter_id).toBe(7);
    expect(body.reporter).toBe("Alex Kim");
  });
});
