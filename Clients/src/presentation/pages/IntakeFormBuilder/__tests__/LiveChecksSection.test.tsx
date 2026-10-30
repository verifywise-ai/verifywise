import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { AnswerLiveChecks, LiveChecksSection } from "../LiveChecksSection";
import LiveChecksToggle from "../LiveChecksToggle";
import type { ILiveChecks, LiveCheckHint } from "../../../../domain/types/intakeLiveChecks";

const hint = (over: Partial<LiveCheckHint>): LiveCheckHint => ({
  id: `${over.kind}:${over.questionId}`,
  kind: "vague",
  source: "rule",
  questionId: "purpose",
  title: "Needs more detail",
  text: "Describe the task.",
  ...over,
});

const checks = (over: Partial<ILiveChecks> = {}): ILiveChecks => ({
  version: 1,
  rules: [
    hint({ kind: "prohibited", questionId: "purpose", ref: "EU AI Act, Article 5(1)(f)" }),
    hint({ kind: "vague", questionId: "name" }),
  ],
  ai: {
    status: "done",
    hints: [
      hint({
        id: "ai:1",
        kind: "contradiction",
        source: "ai",
        questionId: "data",
        alsoQuestionId: "purpose",
        title: "Answers conflict",
      }),
    ],
  },
  prefill: {
    vendor: { fileName: "vendor.pdf", location: "page 2", excerpt: "Acme Corp", confirmed: true },
    hosting: { fileName: "vendor.pdf", location: "", excerpt: "EU hosting", confirmed: false },
  },
  ...over,
});

describe("LiveChecksSection", () => {
  it("renders nothing when the submission has no live checks", () => {
    const { container } = renderWithProviders(<LiveChecksSection liveChecks={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("counts hints by kind across rule and AI hints", () => {
    renderWithProviders(<LiveChecksSection liveChecks={checks()} />);
    expect(screen.getByText("Intake checks")).toBeInTheDocument();
    expect(screen.getByTestId("live-checks-count-prohibited")).toHaveTextContent("1");
    expect(screen.getByTestId("live-checks-count-contradiction")).toHaveTextContent("1");
    expect(screen.getByTestId("live-checks-count-vague")).toHaveTextContent("1");
    expect(screen.queryByTestId("live-checks-count-regulation")).not.toBeInTheDocument();
  });

  it("says when AI checks are still running or unavailable", () => {
    const { rerender } = renderWithProviders(
      <LiveChecksSection liveChecks={checks({ ai: { status: "pending", hints: [] } })} />,
    );
    expect(screen.getByText("AI checks still running")).toBeInTheDocument();
    rerender(<LiveChecksSection liveChecks={checks({ ai: { status: "failed", hints: [] } })} />);
    expect(screen.getByText("AI checks unavailable")).toBeInTheDocument();
    expect(screen.queryByText("AI checks still running")).not.toBeInTheDocument();
  });
});

describe("AnswerLiveChecks", () => {
  it("puts a hint chip next to the answer it concerns", () => {
    renderWithProviders(<AnswerLiveChecks liveChecks={checks()} questionId="name" />);
    expect(screen.getByTestId("live-check-chip-vague")).toHaveTextContent("Needs more detail");
    expect(screen.queryByTestId("live-check-chip-prohibited")).not.toBeInTheDocument();
  });

  it("shows a contradiction chip on both answers", () => {
    const { unmount } = renderWithProviders(
      <AnswerLiveChecks liveChecks={checks()} questionId="data" />,
    );
    expect(screen.getByTestId("live-check-chip-contradiction")).toBeInTheDocument();
    unmount();
    renderWithProviders(<AnswerLiveChecks liveChecks={checks()} questionId="purpose" />);
    expect(screen.getByTestId("live-check-chip-contradiction")).toBeInTheDocument();
    expect(screen.getByTestId("live-check-chip-prohibited")).toHaveTextContent(
      "EU AI Act, Article 5(1)(f)",
    );
  });

  it("labels prefilled answers as confirmed or not confirmed", () => {
    const { unmount } = renderWithProviders(
      <AnswerLiveChecks liveChecks={checks()} questionId="vendor" />,
    );
    const confirmed = screen.getByTestId("prefill-provenance");
    expect(within(confirmed).getByText("AI-suggested from")).toBeInTheDocument();
    expect(within(confirmed).getByText("vendor.pdf")).toBeInTheDocument();
    expect(within(confirmed).getByText("page 2")).toBeInTheDocument();
    expect(within(confirmed).getByText("Confirmed by submitter")).toBeInTheDocument();
    unmount();
    renderWithProviders(<AnswerLiveChecks liveChecks={checks()} questionId="hosting" />);
    expect(screen.getByText("Not confirmed")).toBeInTheDocument();
  });

  it("renders nothing for an answer with no hints and no prefill", () => {
    const { container } = renderWithProviders(
      <AnswerLiveChecks liveChecks={checks()} questionId="other" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("LiveChecksToggle", () => {
  it("turns live checks off for the form", () => {
    const onToggle = vi.fn();
    renderWithProviders(<LiveChecksToggle enabled onToggle={onToggle} />);
    fireEvent.click(screen.getByText("Check answers while the submitter types"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(
      screen.getByText(
        "AI checks and vendor document prefill need the form's LLM key. Rule checks match English answers.",
      ),
    ).toBeInTheDocument();
  });
});
