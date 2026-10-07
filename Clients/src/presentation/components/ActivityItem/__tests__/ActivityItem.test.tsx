import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ActivityItem from "../index";
import { getActivityLink } from "../activityRoutes";

describe("ActivityItem", () => {
  const defaultProps = {
    title: "Risk assessment updated",
    timestamp: "2 hours ago",
    type: "Risk",
  };

  it("renders the title", () => {
    renderWithProviders(<ActivityItem {...defaultProps} />);
    expect(screen.getByText("Risk assessment updated")).toBeInTheDocument();
  });

  it("renders the timestamp", () => {
    renderWithProviders(<ActivityItem {...defaultProps} />);
    expect(screen.getByText("2 hours ago")).toBeInTheDocument();
  });

  it("renders the type", () => {
    renderWithProviders(<ActivityItem {...defaultProps} />);
    expect(screen.getByText("Risk")).toBeInTheDocument();
  });

  it("has an accessible aria-label combining type, title, and timestamp", () => {
    renderWithProviders(<ActivityItem {...defaultProps} />);
    expect(
      screen.getByRole("listitem", {
        name: "Risk: Risk assessment updated at 2 hours ago",
      }),
    ).toBeInTheDocument();
  });

  it("renders without bottom border when isLast is true", () => {
    renderWithProviders(<ActivityItem {...defaultProps} isLast />);
    expect(screen.getByRole("listitem")).toBeInTheDocument();
  });

  it("stays a plain row when no entity is provided", () => {
    renderWithProviders(<ActivityItem {...defaultProps} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links a use case and a risk to the page that opens that record", () => {
    const { unmount } = renderWithProviders(
      <ActivityItem {...defaultProps} type="Use case" entityType="useCase" entityId={12} />,
    );
    expect(screen.getByRole("link", { name: /Use case/ })).toHaveAttribute(
      "href",
      "/project-view?projectId=12",
    );
    unmount();

    renderWithProviders(
      <ActivityItem {...defaultProps} type="Risk" entityType="risk" entityId={4} />,
    );
    expect(screen.getByRole("link", { name: /Risk/ })).toHaveAttribute(
      "href",
      "/risk-management?riskId=4",
    );
  });

  it.each([
    ["task", 9, "/tasks?taskId=9"],
    ["policy", "15", "/policies/15/edit"],
    ["incident", 3, "/ai-incident-managements?incidentId=3"],
    ["vendor", 8, "/vendors?vendorId=8"],
    ["vendorRisk", 2, "/vendors/risks?riskId=2"],
    ["training", 6, "/training?trainingId=6"],
    ["modelRisk", 11, "/model-inventory/model-risks?modelRiskId=11"],
    ["evidence", 20, "/file-manager"],
  ] as const)("maps %s %s to %s", (entityType, entityId, href) => {
    expect(getActivityLink(entityType, entityId)?.to).toBe(href);
  });

  it("does not link a placeholder policy id", () => {
    expect(getActivityLink("policy", "unknown")).toBeNull();
    expect(getActivityLink("note", 1)).toBeNull();
  });

  it("opens an evidence file in the file manager preview", () => {
    expect(getActivityLink("evidence", 20)?.state).toEqual({ previewFileId: 20 });
  });
});
