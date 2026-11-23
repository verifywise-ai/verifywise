import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders as render } from "../../../../test/renderWithProviders";
import type { ReportParameterField } from "../../../../domain/interfaces/i.reporting";

// The real picker is MUI's sectioned date field, which jsdom cannot type into.
// A plain input with the same label and error keeps the step's own logic under test.
vi.mock("../../../components/Inputs/Datepicker", async () => {
  const dayjs = (await import("dayjs")).default;
  return {
    default: ({ id, label, date, handleDateChange, error }: any) => (
      <div>
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          value={date ? date.format("YYYY-MM-DD") : ""}
          onChange={(e) => handleDateChange(e.target.value ? dayjs(e.target.value) : null)}
        />
        {error && <span>{error}</span>}
      </div>
    ),
  };
});

import ReportDetailsStep from "../ReportDetailsStep";
import {
  buildParameterPrefill,
  toRequestParameters,
  validateParameters,
} from "../reportParameters";

// Same shape as E23_PARAMETER_FIELDS on the server, trimmed to one of each type.
const FIELDS: ReportParameterField[] = [
  { key: "periodStart", label: "Period start", type: "date", required: true },
  { key: "periodEnd", label: "Period end", type: "date", required: true },
  {
    key: "institutionName",
    label: "Institution name",
    type: "text",
    required: true,
    maxLength: 200,
  },
  {
    key: "preparedByName",
    label: "Prepared by name",
    type: "text",
    required: true,
    maxLength: 200,
  },
  {
    key: "audience",
    label: "Audience",
    type: "select",
    required: true,
    options: [
      { value: "osfi", label: "OSFI supervisory review" },
      { value: "board", label: "Board of directors" },
    ],
  },
  { key: "scopeNote", label: "Scope note", type: "textarea", required: false, maxLength: 1000 },
  { key: "isFinal", label: "Final version", type: "boolean", required: false },
];

const VALUES = {
  periodStart: "2026-07-01",
  periodEnd: "2026-09-30",
  institutionName: "Acme Bank",
  preparedByName: "Pat Lee",
  audience: "osfi",
  scopeNote: "",
  isFinal: false,
};

describe("ReportDetailsStep", () => {
  it("renders every declared field, with the final-version checkbox and its hint", () => {
    render(
      <ReportDetailsStep
        fields={FIELDS}
        values={VALUES}
        errors={{}}
        onChange={vi.fn()}
        mode="run-now"
        frequency="monthly"
      />,
    );
    expect(screen.getByLabelText("Period start")).toHaveValue("2026-07-01");
    expect(screen.getByLabelText("Period end")).toHaveValue("2026-09-30");
    expect(screen.getByLabelText(/Institution name/)).toHaveValue("Acme Bank");
    expect(screen.getByLabelText(/Scope note/)).toBeInTheDocument();
    expect(screen.getByText("OSFI supervisory review")).toBeInTheDocument();
    expect(screen.getByLabelText("Final version")).not.toBeChecked();
    expect(screen.getByText("Unticked, every page is marked as a draft")).toBeInTheDocument();
  });

  it("hides the period in schedule mode and says what each run covers", () => {
    render(
      <ReportDetailsStep
        fields={FIELDS}
        values={VALUES}
        errors={{}}
        onChange={vi.fn()}
        mode="schedule"
        frequency="quarterly"
      />,
    );
    expect(screen.queryByLabelText("Period start")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Period end")).not.toBeInTheDocument();
    expect(
      screen.getByText("The reporting period is the quarter ending the day before each run"),
    ).toBeInTheDocument();
  });

  it("shows the error under its field and reports edits by key", () => {
    const onChange = vi.fn();
    render(
      <ReportDetailsStep
        fields={FIELDS}
        values={{ ...VALUES, institutionName: "" }}
        errors={{ institutionName: "Institution name is required" }}
        onChange={onChange}
        mode="run-now"
        frequency="monthly"
      />,
    );
    expect(screen.getByText("Institution name is required")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Institution name/), { target: { value: "B" } });
    expect(onChange).toHaveBeenCalledWith("institutionName", "B");
    fireEvent.click(screen.getByLabelText("Final version"));
    expect(onChange).toHaveBeenCalledWith("isFinal", true);
  });
});

describe("report parameter helpers", () => {
  const today = "2026-11-22";

  it("prefills from the last run, then the defaults", () => {
    const prefill = buildParameterPrefill(FIELDS, {
      last: {
        parameters: { preparedByName: "Sam Roe", scopeNote: "All models" },
        periodEnd: "2026-09-30",
      },
      organizationName: "Acme Bank",
      userFullName: "Pat Lee",
      today,
    });
    expect(prefill).toEqual({
      periodStart: "2026-10-01",
      periodEnd: today,
      institutionName: "Acme Bank",
      preparedByName: "Sam Roe",
      audience: "osfi",
      scopeNote: "All models",
      isFinal: false,
    });
  });

  it("starts the period three months before the end when there is no previous run", () => {
    const prefill = buildParameterPrefill(FIELDS, {
      last: null,
      organizationName: "",
      userFullName: "Pat Lee",
      today,
    });
    expect(prefill.periodStart).toBe("2026-08-23");
    expect(prefill.preparedByName).toBe("Pat Lee");
  });

  it("mirrors the server rules", () => {
    const errors = validateParameters(
      FIELDS,
      {
        ...VALUES,
        institutionName: "  ",
        periodEnd: "2026-11-23",
        preparedByName: "x".repeat(201),
      },
      { today, requirePeriod: true },
    );
    expect(errors).toEqual({
      institutionName: "Institution name is required",
      periodEnd: "Period end cannot be in the future",
      preparedByName: "Prepared by name must be at most 200 characters",
    });
    expect(
      validateParameters(
        FIELDS,
        { ...VALUES, periodEnd: "2026-06-30" },
        { today, requirePeriod: true },
      ),
    ).toEqual({ periodEnd: "Period end must be on or after the period start" });
    // A schedule derives its period, so missing dates are not an error there.
    expect(
      validateParameters(
        FIELDS,
        { ...VALUES, periodStart: "", periodEnd: "" },
        { today, requirePeriod: false },
      ),
    ).toEqual({});
  });

  it("sends trimmed answers, and no period for a schedule", () => {
    const values = { ...VALUES, institutionName: " Acme Bank ", stale: "x" };
    expect(toRequestParameters(FIELDS, values, true)).toEqual({
      ...VALUES,
      institutionName: "Acme Bank",
    });
    const scheduled = toRequestParameters(FIELDS, values, false);
    expect(scheduled).not.toHaveProperty("periodStart");
    expect(scheduled).not.toHaveProperty("periodEnd");
    expect(scheduled).not.toHaveProperty("stale");
  });
});
