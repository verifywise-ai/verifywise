import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ActivityItem from "../index";

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
});
