import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import LaneSection, { LaneChip } from "../routing/LaneSection";
import { escalateSubmission } from "../../../../application/repository/intakeForm.repository";
import type { SubmissionRouting } from "../types";

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  escalateSubmission: vi.fn(),
}));

const routing = (overrides: Partial<SubmissionRouting> = {}): SubmissionRouting => ({
  lane: "standard",
  reason: "below_threshold",
  score: 20,
  threshold: 50,
  closeCallMargin: 10,
  routedAt: "2026-10-22T00:00:00.000Z",
  ...overrides,
});

const baseProps = {
  submissionId: 11,
  routing: routing(),
  canDecide: true,
  decideBlockedReason: null,
  laneReviewers: [],
  canEscalate: false,
  onEscalated: vi.fn(),
};

const renderLane = (props: Partial<React.ComponentProps<typeof LaneSection>> = {}) =>
  renderWithProviders(<LaneSection {...baseProps} {...props} />);

describe("LaneSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the chip for each lane", () => {
    const first = renderLane({ routing: routing({ lane: "senior" }) });
    expect(screen.getByText("Senior review")).toBeInTheDocument();
    first.unmount();
    const second = renderLane();
    expect(screen.getByText("Standard review")).toBeInTheDocument();
    second.unmount();
    renderLane({ routing: null });
    expect(screen.getByText("Not routed yet")).toBeInTheDocument();
  });

  it("shows Routing off instead of a lane when the form doesn't route", () => {
    renderWithProviders(<LaneChip routing={routing()} routingEnabled={false} />);
    expect(screen.getByText("Routing off")).toBeInTheDocument();
    expect(screen.queryByText("Standard review")).not.toBeInTheDocument();
  });

  it.each([
    [{ reason: "close_call", closeCallMargin: 10 }, "Within 10 points of the threshold"],
    [{ reason: "prohibited" }, "Prohibited practice"],
    [{ reason: "no_score", score: null }, "No usable score"],
    [{ reason: "at_or_above_threshold", score: 80 }, "Score 80, threshold 50"],
    [{ reason: "below_threshold", score: 20 }, "Score 20, below 50"],
    [{ reason: "override_raised" }, "Band raised by a reviewer"],
    [
      {
        reason: "escalated",
        escalation: { by: 2, at: "2026-10-22T01:00:00.000Z", reason: "Odd vendor" },
      },
      "Sent to senior review: Odd vendor",
    ],
  ] as Array<[Partial<SubmissionRouting>, string]>)("reason line for %j", (patch, text) => {
    renderLane({ routing: routing(patch) });
    expect(screen.getByTestId("lane-reason")).toHaveTextContent(text);
  });

  it("names the reviewers when the user can't decide", () => {
    renderLane({
      canDecide: false,
      laneReviewers: [
        { id: 1, name: "Sam Senior" },
        { id: 3, name: "Ana Lead" },
      ],
    });
    expect(screen.getByTestId("lane-blocked")).toHaveTextContent(
      "Only Sam Senior, Ana Lead can decide this submission.",
    );
  });

  it("falls back to the server's message when no reviewers are listed", () => {
    renderLane({
      canDecide: false,
      decideBlockedReason: "This submission is assigned to senior reviewers",
    });
    expect(screen.getByTestId("lane-blocked")).toHaveTextContent(
      "This submission is assigned to senior reviewers",
    );
  });

  it("says nothing about deciding when the user can", () => {
    renderLane();
    expect(screen.queryByTestId("lane-blocked")).not.toBeInTheDocument();
  });

  it("hides the escalate button unless the user can escalate", () => {
    renderLane();
    expect(screen.queryByText("Send to senior review")).not.toBeInTheDocument();
  });

  it("needs a reason before sending, then calls escalateSubmission with it", async () => {
    const next = routing({ lane: "senior", reason: "escalated" });
    vi.mocked(escalateSubmission).mockResolvedValue({ data: next });
    const onEscalated = vi.fn();
    renderLane({ canEscalate: true, onEscalated });

    fireEvent.click(screen.getByRole("button", { name: "Send to senior review" }));
    const submit = screen.getAllByRole("button", { name: "Send to senior review" }).pop()!;
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Why does this need a senior reviewer?"), {
      target: { value: "  Needs a closer look  " },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(escalateSubmission).toHaveBeenCalledWith(11, "Needs a closer look"));
    await waitFor(() => expect(onEscalated).toHaveBeenCalledWith(next));
  });
});
