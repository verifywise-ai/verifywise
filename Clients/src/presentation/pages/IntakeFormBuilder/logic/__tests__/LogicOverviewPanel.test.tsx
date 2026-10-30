import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { LogicOverviewPanel } from "../LogicOverviewPanel";
import type { FormField, FormRouting } from "../../types";

const COST: FormField = { id: "cost", type: "number", label: "Monthly cost", order: 0 };
const ANNUAL: FormField = {
  id: "annual",
  type: "calculated",
  label: "Annual cost",
  order: 1,
  formula: "{cost} * 12",
};
const NOTE: FormField = {
  id: "note",
  type: "text",
  label: "Budget note",
  order: 2,
  visibility: { match: "all", conditions: [{ fieldId: "annual", operator: "gt", value: 500 }] },
};
const ROUTING: FormRouting = {
  enabled: true,
  seniorReviewerIds: [1],
  standardReviewerIds: [2],
  threshold: 60,
  closeCallMargin: 5,
  secondReviewRate: 20,
};
const REVIEWERS = [
  { _id: 1, name: "Sam Senior", email: "sam@example.com" },
  { _id: 2, name: "Pat Standard", email: "pat@example.com" },
];

const renderPanel = (props: Partial<React.ComponentProps<typeof LogicOverviewPanel>> = {}) => {
  const onSelectField = vi.fn();
  renderWithProviders(
    <LogicOverviewPanel
      fields={[COST, ANNUAL, NOTE]}
      logicErrors={[]}
      routing={ROUTING}
      reviewers={REVIEWERS}
      reviewersLoaded
      onSelectField={onSelectField}
      {...props}
    />,
  );
  return onSelectField;
};

describe("LogicOverviewPanel", () => {
  it("shows every calculation and rule with what triggers it", () => {
    renderPanel();
    expect(screen.getByTestId("logic-row-annual")).toHaveTextContent("= Monthly cost × 12");
    const rule = screen.getByTestId("logic-row-note");
    expect(rule).toHaveTextContent("Shown when all conditions match");
    expect(rule).toHaveTextContent("Annual cost > 500");
  });

  it("opens the field when its row is clicked", () => {
    const onSelectField = renderPanel();
    fireEvent.click(screen.getByTestId("logic-row-note"));
    expect(onSelectField).toHaveBeenCalledWith("note");
  });

  it("flags rows with logic errors", () => {
    renderPanel({
      logicErrors: [{ fieldId: "annual", message: 'Field "Annual cost": the formula is broken' }],
    });
    expect(screen.getByTestId("logic-row-annual")).toHaveTextContent("the formula is broken");
  });

  it("summarises routing with its numbers and reviewers", () => {
    renderPanel();
    expect(screen.getByText(/Scores less than/).closest("li")).toHaveTextContent(
      "Scores less than 5 points from 60 go to expert reviewers.",
    );
    expect(screen.getByText("Sam Senior")).toBeInTheDocument();
    expect(screen.getByText("Pat Standard")).toBeInTheDocument();
    expect(screen.getByText(/are picked at random/).parentElement).toHaveTextContent(
      "20% of regular review approvals by reviewers who are not expert reviewers are picked at random for a second review by an expert reviewer.",
    );
  });

  it("opens the field from its name button", () => {
    const onSelectField = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Annual cost" }));
    expect(onSelectField).toHaveBeenCalledTimes(1);
    expect(onSelectField).toHaveBeenCalledWith("annual");
  });

  it("names saved reviewers who can no longer review as former users", () => {
    renderPanel({ routing: { ...ROUTING, seniorReviewerIds: [1, 9] } });
    expect(screen.getByText("Expert reviewers:").parentElement).toHaveTextContent(
      "Expert reviewers: Sam Senior, Former user",
    );
  });

  it("leaves out the close call line when the margin is 0", () => {
    renderPanel({ routing: { ...ROUTING, closeCallMargin: 0 } });
    expect(screen.queryByText(/Scores less than/)).not.toBeInTheDocument();
  });

  it("says when routing is off and when nothing is set up yet", () => {
    renderPanel({ fields: [COST], routing: null });
    expect(
      screen.getByText("Reviewer assignment is off. Turn it on in Form settings."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No calculations yet. Add a calculated field from the Advanced section."),
    ).toBeInTheDocument();
    expect(screen.getByText("No conditional fields yet.")).toBeInTheDocument();
  });
});
