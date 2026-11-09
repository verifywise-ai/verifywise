import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SecondReviewPanel from "../routing/SecondReviewPanel";
import {
  recordSecondReview,
  resolveSecondReviewMiss,
} from "../../../../application/repository/intakeForm.repository";
import type { SecondReview, SubmissionRouting } from "../types";

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  recordSecondReview: vi.fn(),
  resolveSecondReviewMiss: vi.fn(),
}));

const updated = {
  lane: "standard",
  reason: "below_threshold",
  score: 20,
  threshold: 50,
  closeCallMargin: 10,
  routedAt: "x",
} as SubmissionRouting;

const open: SecondReview = { status: "open", selectedAt: "2026-10-22T00:00:00.000Z" };
const missed: SecondReview = { ...open, status: "missed", note: "Skipped the vendor check" };

const renderPanel = (secondReview: SecondReview, canReview = true, onChange = vi.fn()) =>
  renderWithProviders(
    <SecondReviewPanel
      submissionId={11}
      secondReview={secondReview}
      canReview={canReview}
      onChange={onChange}
    />,
  );

describe("SecondReviewPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(recordSecondReview).mockResolvedValue({ data: updated });
    vi.mocked(resolveSecondReviewMiss).mockResolvedValue({ data: updated });
  });

  it("agrees without a note", async () => {
    const onChange = vi.fn();
    renderPanel(open, true, onChange);
    fireEvent.click(screen.getByRole("button", { name: "Agree" }));
    await waitFor(() => expect(recordSecondReview).toHaveBeenCalledWith(11, "agreed", undefined));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(updated));
  });

  it("keeps Missed something disabled until there is a note", async () => {
    renderPanel(open);
    const miss = screen.getByRole("button", { name: "Missed something" });
    expect(miss).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Required when something was missed"), {
      target: { value: " Skipped the vendor check " },
    });
    expect(miss).toBeEnabled();
    fireEvent.click(miss);
    await waitFor(() =>
      expect(recordSecondReview).toHaveBeenCalledWith(11, "missed", "Skipped the vendor check"),
    );
  });

  it("resolves a miss with a required note", async () => {
    renderPanel(missed);
    expect(screen.getByText("Skipped the vendor check")).toBeInTheDocument();
    const resolve = screen.getByRole("button", { name: "Mark resolved" });
    expect(resolve).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("What was done about it?"), {
      target: { value: "Vendor checked" },
    });
    fireEvent.click(resolve);
    await waitFor(() => expect(resolveSecondReviewMiss).toHaveBeenCalledWith(11, "Vendor checked"));
  });

  it("is read-only for someone who can't review", () => {
    renderPanel(missed, false);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Something was missed")).toBeInTheDocument();
  });

  it("summarises a resolved miss and an agreement without buttons", () => {
    const { unmount } = renderPanel({
      ...missed,
      resolvedAt: "2026-10-23T00:00:00.000Z",
      resolutionNote: "Vendor checked",
    });
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();
    renderPanel({ ...open, status: "agreed" });
    expect(screen.getByText("Agreed with the approval")).toBeInTheDocument();
  });
});
