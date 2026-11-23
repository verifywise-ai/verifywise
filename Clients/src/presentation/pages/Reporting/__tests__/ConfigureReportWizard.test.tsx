import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
// StepperModal and the design-system inputs read colours off the app theme.
import { renderWithProviders as render } from "../../../../test/renderWithProviders";

const runNowMutate = vi.fn();
const createMutate = vi.fn();
// What GET /api/v1/report-templates/:id/last-parameters answered; null = no prior run.
let lastParameters: any = null;

vi.mock("../../../../application/hooks/useReporting", () => ({
  useCreateScheduledReport: () => ({ mutate: createMutate, isPending: false }),
  useRunTemplateNow: () => ({ mutate: runNowMutate, isPending: false }),
  useLastReportParameters: () => ({ data: lastParameters, isLoading: false }),
  useOrganizationName: () => ({ data: "Acme Bank", isLoading: false }),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userToken: { name: "Pat", surname: "Lee" }, organizationId: 1 }),
}));

// The real picker is MUI's sectioned date field, which jsdom cannot type into.
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

vi.mock("../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [{ id: 1, project_title: "Project A" }], isLoading: false }),
}));

// Settled keyless org. The real hook reports hasKeys optimistically true
// while loading, so a mock without `loading: false` would not exercise the
// gate at all.
vi.mock("../../../../application/hooks/useLLMKeyStatus", () => ({
  useLLMKeyStatus: () => ({ hasKeys: false, loading: false, data: null, error: null }),
}));

// Mandatory, not a convenience: the real hook is a useQuery, so without a
// QueryClientProvider it throws on mount and every test in this file dies.
// The names matter — the wizard resolves "native:2" to a label through this
// list, and falls back to the raw id when it cannot.
vi.mock("../../../../application/hooks/useFrameworks", () => ({
  default: () => ({
    allFrameworks: [
      { id: 1, name: "EU AI Act" },
      { id: 2, name: "ISO 42001" },
      { id: 3, name: "ISO 27001" },
    ],
    filteredFrameworks: [],
    projectFrameworksMap: new Map(),
    loading: false,
    error: null,
    refreshAllFrameworks: vi.fn(),
    refreshFilteredFrameworks: vi.fn(),
  }),
}));

import ConfigureReportWizard from "../ConfigureReportWizard";

// canNext() blocks step 1 unless at least one section has
// defaultEnabled !== false, and sections come from
// latestVersion.sections_config.sections. A fixture without one can never
// reach step 2, so the AI assertions would fail on an empty Sections step
// rather than on anything this test is about.
const TEMPLATE_FIXTURE = {
  id: 1,
  name: "T",
  default_scope: "organization",
  latestVersion: {
    id: 5,
    sections_config: {
      sections: [
        {
          key: "projectRisks",
          reportSectionKey: "projectRisks",
          label: "Use case risks",
          defaultEnabled: true,
        },
      ],
    },
  },
};

describe("ConfigureReportWizard", () => {
  beforeEach(() => {
    runNowMutate.mockReset();
  });

  it("shows scope step and disables next when project scope has no project", () => {
    render(
      <ConfigureReportWizard
        template={{
          id: 1,
          name: "Daily",
          latestVersion: { sections_config: { sections: [] }, ai_blocks_config: {} },
        }}
        mode="schedule"
        onClose={() => {}}
      />,
    );
    // Exact string, not /Scope/i: the framework field's helper text ("...every
    // framework in scope.") also matches that regex, and getByText throws on
    // more than one hit. The stepper label is what this test is about.
    expect(screen.getByText("Scope")).toBeInTheDocument();
  });

  it("offers all seven AI blocks, not the legacy three", () => {
    render(
      <ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="schedule" onClose={() => {}} />,
    );
    // Step 0 (Scope, org scope so no project needed) -> 1 (Sections) -> 2 (AI)
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    for (const label of [
      "Per-section summaries",
      "Executive summary",
      "Key findings",
      "Recommended actions",
      "Risk analysis",
      "Compliance gap analysis",
      "Third-party risk analysis",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("offers the E-23 gap analysis only for an E-23 template, off by default", () => {
    const { unmount } = render(
      <ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="schedule" onClose={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.queryByLabelText("E-23 gap analysis")).not.toBeInTheDocument();
    unmount();

    render(
      <ConfigureReportWizard
        template={{
          ...TEMPLATE_FIXTURE,
          latestVersion: {
            ...TEMPLATE_FIXTURE.latestVersion,
            parameters_config: { kind: "osfi_e23", fields: [] },
          },
        }}
        mode="schedule"
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByLabelText("E-23 gap analysis")).not.toBeChecked();
  });

  it("no longer renders raw camelCase keys as labels", () => {
    render(
      <ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="schedule" onClose={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.queryByText("executiveSummary")).not.toBeInTheDocument();
  });

  // Format sits on the Scope step, which both modes keep. On the Schedule step
  // it was unreachable in run-now mode, so a run-now report was always a PDF.
  it.each(["schedule", "run-now"] as const)(
    "offers a format choice instead of silently forcing PDF in %s mode",
    (mode) => {
      render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} mode={mode} onClose={() => {}} />);
      expect(screen.getByLabelText(/format/i)).toBeInTheDocument();
    },
  );

  it("disables the AI blocks when the org has no LLM key", () => {
    render(
      <ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="schedule" onClose={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByLabelText("Executive summary")).toBeDisabled();
  });

  it("run-now mode skips Schedule and Delivery and goes straight to Review", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="run-now" onClose={() => {}} />);

    expect(screen.queryByText("Schedule")).not.toBeInTheDocument();
    expect(screen.queryByText("Delivery")).not.toBeInTheDocument();

    // Scope (org, no project needed) -> Sections -> AI Insights -> Review
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // The Review panel has no heading of its own — the stepper labels the step
    // — so assert on the summary it renders instead.
    expect(screen.getByText(/Template:/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run now/i })).toBeInTheDocument();

    // runTemplateNow hardcodes delivery_config to { saveToStorage: true }
    // server-side — no email link is ever sent, so Review must not claim one is.
    expect(screen.queryByText(/Delivery:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Schedule:/)).not.toBeInTheDocument();
  });

  it("runs the template now through useRunTemplateNow when mode is run-now", () => {
    const onClose = vi.fn();
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="run-now" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));

    expect(runNowMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: TEMPLATE_FIXTURE.id,
        body: expect.objectContaining({ templateVersionId: TEMPLATE_FIXTURE.latestVersion.id }),
      }),
      expect.anything(),
    );
  });
});

// TEMPLATE_FIXTURE is organization-scoped, so the Scope step needs no project
// and the three Next clicks below reach Review on their own.
const templateWithDefaultFramework = {
  ...TEMPLATE_FIXTURE,
  latestVersion: {
    ...TEMPLATE_FIXTURE.latestVersion,
    framework_config: { frameworkIds: ["native:2"] },
  },
};

const goToReview = () => {
  // Scope -> Sections -> AI Insights -> Review
  for (let i = 0; i < 3; i += 1) {
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
  }
};

describe("framework selection", () => {
  beforeEach(() => {
    runNowMutate.mockReset();
  });

  it("pre-selects the template's default frameworks", () => {
    render(
      <ConfigureReportWizard
        template={templateWithDefaultFramework}
        mode="run-now"
        onClose={vi.fn()}
      />,
    );

    // The chip carries the framework's name, not the raw namespaced id.
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
  });

  it("allows an empty selection to mean every framework", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="run-now" onClose={vi.fn()} />);

    // No framework picked, and Next is still enabled: empty is a real choice
    // (every framework in scope), so canNext must not gate on it.
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  it("sends frameworkIds on the run body", () => {
    render(
      <ConfigureReportWizard
        template={templateWithDefaultFramework}
        mode="run-now"
        onClose={vi.fn()}
      />,
    );

    goToReview();
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));

    expect(runNowMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ frameworkIds: ["native:2"] }),
      }),
      expect.anything(),
    );
  });

  it("sends an empty array when no framework is chosen", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="run-now" onClose={vi.fn()} />);

    goToReview();
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));

    expect(runNowMutate).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ frameworkIds: [] }) }),
      expect.anything(),
    );
  });

  it("namespaces what the user picks as native:<id>", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="run-now" onClose={vi.fn()} />);

    fireEvent.mouseDown(screen.getByRole("combobox", { name: /frameworks/i }));
    fireEvent.click(screen.getByRole("option", { name: "ISO 42001" }));
    // The menu stays open for a multi-select, and MUI aria-hides the rest of
    // the app while it is — Next would be unreachable by role until it closes.
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape", code: "Escape" });

    goToReview();
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));

    // A bare 2 or a mis-cased prefix is a 400 from the backend.
    expect(runNowMutate).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ frameworkIds: ["native:2"] }) }),
      expect.anything(),
    );
  });
});

// The E-23 template's declared fields (Servers e23Parameters.ts), as the
// template endpoint returns them in latestVersion.parameters_config.
const E23_FIELDS = [
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
    key: "accountableExecutiveName",
    label: "Accountable executive name",
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
  { key: "isFinal", label: "Final version", type: "boolean", required: false },
];

const E23_TEMPLATE = {
  ...TEMPLATE_FIXTURE,
  name: "OSFI E-23",
  default_scope: "project",
  latestVersion: {
    ...TEMPLATE_FIXTURE.latestVersion,
    parameters_config: { kind: "osfi_e23", fields: E23_FIELDS },
  },
};

const next = () => fireEvent.click(screen.getByRole("button", { name: /next/i }));
const isoDate = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describe("report details step", () => {
  beforeEach(() => {
    runNowMutate.mockReset();
    createMutate.mockReset();
    lastParameters = {
      parameters: { accountableExecutiveName: "Jane Doe" },
      periodEnd: "2026-06-30",
    };
  });

  it("is absent for a template that declares no fields", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="run-now" onClose={vi.fn()} />);
    expect(screen.queryByText("Report details")).not.toBeInTheDocument();
  });

  it("follows Scope and is prefilled from the last run and the defaults", () => {
    render(<ConfigureReportWizard template={E23_TEMPLATE} mode="run-now" onClose={vi.fn()} />);
    expect(screen.getByText("Report details")).toBeInTheDocument();
    next();
    expect(screen.getByLabelText("Period start")).toHaveValue("2026-07-01");
    expect(screen.getByLabelText("Period end")).toHaveValue(isoDate(0));
    expect(screen.getByLabelText(/Institution name/)).toHaveValue("Acme Bank");
    expect(screen.getByLabelText(/Accountable executive name/)).toHaveValue("Jane Doe");
    expect(screen.getByLabelText(/Prepared by name/)).toHaveValue("Pat Lee");
    expect(screen.getByText("OSFI supervisory review")).toBeInTheDocument();
    expect(screen.getByLabelText("Final version")).not.toBeChecked();
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  it("locks an E-23 report to organization scope", () => {
    render(<ConfigureReportWizard template={E23_TEMPLATE} mode="run-now" onClose={vi.fn()} />);
    expect(screen.queryByLabelText("Report level")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Project")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  it("blocks Next on a blank institution name and says why", () => {
    render(<ConfigureReportWizard template={E23_TEMPLATE} mode="run-now" onClose={vi.fn()} />);
    next();
    fireEvent.change(screen.getByLabelText(/Institution name/), { target: { value: "  " } });
    expect(screen.getByText("Institution name is required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("rejects a period end in the future", () => {
    render(<ConfigureReportWizard template={E23_TEMPLATE} mode="run-now" onClose={vi.fn()} />);
    next();
    fireEvent.change(screen.getByLabelText("Period end"), { target: { value: isoDate(2) } });
    expect(screen.getByText("Period end cannot be in the future")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("sends organization scope and the answers on run now", () => {
    render(<ConfigureReportWizard template={E23_TEMPLATE} mode="run-now" onClose={vi.fn()} />);
    // Scope -> Report details -> Sections -> AI Insights -> Review
    for (let i = 0; i < 4; i += 1) next();
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));
    const body = runNowMutate.mock.calls[0][0].body;
    expect(body.scope).toBe("organization");
    expect(body.projectId).toBeNull();
    expect(body.reportParameters).toEqual({
      periodStart: "2026-07-01",
      periodEnd: isoDate(0),
      institutionName: "Acme Bank",
      accountableExecutiveName: "Jane Doe",
      preparedByName: "Pat Lee",
      audience: "osfi",
      isFinal: false,
    });
  });

  it("hides the period in schedule mode and leaves it out of the schedule", () => {
    render(<ConfigureReportWizard template={E23_TEMPLATE} mode="schedule" onClose={vi.fn()} />);
    next();
    expect(screen.queryByLabelText("Period start")).not.toBeInTheDocument();
    expect(screen.getByText(/ending the day before each run/)).toBeInTheDocument();
    // Report details -> Sections -> AI Insights -> Schedule -> Delivery -> Review
    for (let i = 0; i < 5; i += 1) next();
    fireEvent.click(screen.getByRole("button", { name: /create scheduled report/i }));
    const body = createMutate.mock.calls[0][0];
    expect(body.reportParameters).not.toHaveProperty("periodStart");
    expect(body.reportParameters).not.toHaveProperty("periodEnd");
    expect(body.reportParameters.institutionName).toBe("Acme Bank");
  });
});

describe("quarterly schedules", () => {
  beforeEach(() => createMutate.mockReset());

  it("offers quarterly with a run-in month and sends anchorMonth", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="schedule" onClose={vi.fn()} />);
    // Scope -> Sections -> AI Insights -> Schedule
    for (let i = 0; i < 3; i += 1) next();
    expect(screen.queryByLabelText("Run in month")).not.toBeInTheDocument();

    // The shared Select ties its label to MUI's native input, which MUI also
    // listens to for changes (autofill), so this is the selection path.
    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "quarterly" } });
    const expectedDefault = ((new Date().getMonth() + 1) % 12) + 1;
    expect(screen.getByLabelText("Run in month")).toHaveValue(String(expectedDefault));

    fireEvent.change(screen.getByLabelText("Run in month"), { target: { value: "11" } });
    next(); // Delivery
    next(); // Review
    fireEvent.click(screen.getByRole("button", { name: /create scheduled report/i }));
    expect(createMutate.mock.calls[0][0].scheduleConfig).toEqual(
      expect.objectContaining({ frequency: "quarterly", anchorMonth: 11 }),
    );
  });
});
