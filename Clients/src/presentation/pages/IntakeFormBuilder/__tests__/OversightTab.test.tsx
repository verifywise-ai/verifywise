import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { OversightTab } from "../oversight/OversightTab";
import { getIntakeOversight } from "../../../../application/repository/intakeForm.repository";
import type { IntakeOversight } from "../types";

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getIntakeOversight: vi.fn(),
}));

// recharts needs a measured container, which jsdom can't give it
vi.mock("recharts", async (orig) => {
  const actual = await orig<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <div data-testid="chart">{children}</div>
    ),
  };
});

const FIXTURE: IntakeOversight = {
  weeks: 8,
  totals: { submissions: 40, senior: 12, standard: 20, closeCalls: 4, notRouted: 2, routingOff: 6 },
  medianDecisionHours: { all: 21.6, senior: 30, standard: 12 },
  redlines: { prohibited: 2, highRisk: 5 },
  secondReviews: { completed: 12, missed: 3, open: 2 },
  byWeek: [
    {
      weekStart: "2026-10-05T00:00:00.000Z",
      senior: 3,
      closeCall: 1,
      standard: 5,
      notRouted: 0,
      routingOff: 1,
    },
    {
      weekStart: "2026-10-12T00:00:00.000Z",
      senior: 0,
      closeCall: 0,
      standard: 0,
      notRouted: 0,
      routingOff: 0,
    },
  ],
  reviewers: [
    {
      userId: 1,
      name: "Alice Auditor",
      decisions: 24,
      bandChanged: 4,
      medianDecisionHours: 20,
      check: false,
    },
    {
      userId: 2,
      name: "Rubber Stamp",
      decisions: 15,
      bandChanged: 0,
      medianDecisionHours: null,
      check: true,
    },
  ],
  bandKept: { kept: 30, decided: 36, seniorKept: 8, seniorDecided: 10 },
  suggestions: { accepted: 9, suggested: 18 },
  needsAttention: [
    {
      kind: "second_review_open",
      submissionId: 77,
      formId: 3,
      title: "Vendor chatbot",
      at: "2026-10-10T00:00:00.000Z",
    },
    {
      kind: "lane_empty",
      submissionId: null,
      formId: 3,
      title: "HR screening intake",
      at: "2026-10-11T00:00:00.000Z",
    },
  ],
};

const EMPTY: IntakeOversight = {
  weeks: 8,
  totals: { submissions: 0, senior: 0, standard: 0, closeCalls: 0, notRouted: 0, routingOff: 0 },
  medianDecisionHours: { all: null, senior: null, standard: null },
  redlines: { prohibited: 0, highRisk: 0 },
  secondReviews: { completed: 0, missed: 0, open: 0 },
  byWeek: [],
  reviewers: [],
  bandKept: { kept: 0, decided: 0, seniorKept: 0, seniorDecided: 0 },
  suggestions: { accepted: 0, suggested: 0 },
  needsAttention: [],
};

const FORMS = [{ id: 3, name: "AI intake" }] as never;

const renderTab = (props: Partial<React.ComponentProps<typeof OversightTab>> = {}) =>
  renderWithProviders(
    <OversightTab forms={FORMS} onOpenSubmission={vi.fn()} onOpenForm={vi.fn()} {...props} />,
  );

describe("OversightTab", () => {
  beforeEach(() => {
    vi.mocked(getIntakeOversight).mockReset();
  });

  it("renders KPI values from the fixture", async () => {
    vi.mocked(getIntakeOversight).mockResolvedValue({ data: FIXTURE });
    renderTab();
    expect(await screen.findByTestId("kpi-submissions")).toHaveTextContent("40");
    expect(screen.getByTestId("kpi-median")).toHaveTextContent("0.9 days");
    expect(screen.getByTestId("kpi-redlines")).toHaveTextContent("7");
    expect(screen.getByTestId("kpi-second-reviews")).toHaveTextContent("3 of 12");
    expect(screen.getByTestId("band-kept")).toHaveTextContent("30 of 36 (83%)");
    expect(screen.getByTestId("suggestions-accepted")).toHaveTextContent("9 of 18 (50%)");
    expect(getIntakeOversight).toHaveBeenCalledWith(8, undefined, expect.anything());
  });

  it("shows the reviewer table and flags only the reviewer with the check", async () => {
    vi.mocked(getIntakeOversight).mockResolvedValue({ data: FIXTURE });
    renderTab();
    const alice = (await screen.findByText("Alice Auditor")).closest("tr") as HTMLElement;
    const stamp = screen.getByText("Rubber Stamp").closest("tr") as HTMLElement;
    expect(within(alice).getByText("4 (17%)")).toBeInTheDocument();
    expect(within(alice).queryByText("Check")).not.toBeInTheDocument();
    expect(within(stamp).getByText("Check")).toBeInTheDocument();
    expect(within(stamp).getByText("0 (0%)")).toBeInTheDocument();
    expect(screen.getAllByText("Check")).toHaveLength(1);
    expect(screen.getByText("Counts the band in force at decision")).toBeInTheDocument();
  });

  it("opens a submission from needs attention and a form when there is no submission", async () => {
    vi.mocked(getIntakeOversight).mockResolvedValue({ data: FIXTURE });
    const onOpenSubmission = vi.fn();
    const onOpenForm = vi.fn();
    renderTab({ onOpenSubmission, onOpenForm });
    fireEvent.click(await screen.findByText("Vendor chatbot"));
    expect(onOpenSubmission).toHaveBeenCalledWith(77);
    fireEvent.click(screen.getByText("HR screening intake"));
    expect(onOpenForm).toHaveBeenCalledWith(3);
  });

  it("shows the empty copy and no NaN for an empty period", async () => {
    vi.mocked(getIntakeOversight).mockResolvedValue({ data: EMPTY });
    const { container } = renderTab();
    expect(await screen.findByText("No submissions in this period.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN/);
  });

  it("guards the rates when decisions are zero but submissions exist", async () => {
    vi.mocked(getIntakeOversight).mockResolvedValue({
      data: {
        ...FIXTURE,
        bandKept: { kept: 0, decided: 0, seniorKept: 0, seniorDecided: 0 },
        suggestions: { accepted: 0, suggested: 0 },
      },
    });
    const { container } = renderTab();
    await screen.findByTestId("kpi-submissions");
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("refetches for the chosen period", async () => {
    vi.mocked(getIntakeOversight).mockResolvedValue({ data: FIXTURE });
    renderTab();
    await screen.findByTestId("kpi-submissions");
    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Last 12 weeks" }));
    await waitFor(() =>
      expect(getIntakeOversight).toHaveBeenLastCalledWith(12, undefined, expect.anything()),
    );
  });

  it("refetches for the chosen form", async () => {
    vi.mocked(getIntakeOversight).mockResolvedValue({ data: FIXTURE });
    renderTab();
    await screen.findByTestId("kpi-submissions");
    fireEvent.mouseDown(screen.getAllByRole("combobox")[1]);
    fireEvent.click(await screen.findByRole("option", { name: "AI intake" }));
    await waitFor(() =>
      expect(getIntakeOversight).toHaveBeenLastCalledWith(8, 3, expect.anything()),
    );
  });

  it("shows an error when the figures can't load", async () => {
    vi.mocked(getIntakeOversight).mockRejectedValue(new Error("boom"));
    renderTab();
    expect(await screen.findByText("Failed to load the oversight figures.")).toBeInTheDocument();
  });
});
