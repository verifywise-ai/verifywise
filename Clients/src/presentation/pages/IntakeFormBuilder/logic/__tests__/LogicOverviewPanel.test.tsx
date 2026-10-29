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
    expect(rule).toHaveTextContent("Shown when all of these match");
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
    expect(screen.getByTestId("logic-row-annual")).toHaveTextContent(
      'Field "Annual cost": the formula is broken',
    );
  });

  it("summarises routing with its numbers and reviewers", () => {
    renderPanel();
    expect(screen.getByText(/Scores within/).closest("li")).toHaveTextContent(
      "Scores within 5 points of 60 go to senior reviewers.",
    );
    expect(screen.getByText("Sam Senior")).toBeInTheDocument();
    expect(screen.getByText("Pat Standard")).toBeInTheDocument();
    expect(screen.getByText(/of approvals get a second review/).parentElement).toHaveTextContent(
      "20% of approvals get a second review by another senior reviewer.",
    );
  });

  it("says when routing is off and when nothing is set up yet", () => {
    renderPanel({ fields: [COST], routing: null });
    expect(screen.getByText("Routing is off. Turn it on in Form settings.")).toBeInTheDocument();
    expect(
      screen.getByText("No calculations yet. Add a calculated field from the Advanced section."),
    ).toBeInTheDocument();
    expect(screen.getByText("No show/hide rules yet.")).toBeInTheDocument();
  });
});
