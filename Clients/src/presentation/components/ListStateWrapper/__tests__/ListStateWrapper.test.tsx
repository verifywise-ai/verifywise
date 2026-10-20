import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ListStateWrapper from "../index";

const renderWrapper = ({
  items = [],
  isLoading = false,
  errorMessage,
}: {
  items?: readonly unknown[];
  isLoading?: boolean;
  errorMessage?: string;
} = {}) =>
  renderWithProviders(
    <ListStateWrapper
      items={items}
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyState={<div>Nothing here yet</div>}
    >
      <div>Populated list</div>
    </ListStateWrapper>,
  );

describe("ListStateWrapper", () => {
  it("renders the approved skeleton while loading", () => {
    const { container } = renderWrapper({ isLoading: true });

    expect(screen.getByRole("status", { name: "Loading list" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here yet")).not.toBeInTheDocument();
  });

  it("renders an inline error alert after loading fails", () => {
    renderWrapper({ errorMessage: "Failed to load models. Please try again." });

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load data");
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load models. Please try again.");
    expect(screen.queryByText("Nothing here yet")).not.toBeInTheDocument();
  });

  it("renders the contextual empty state for an empty array", () => {
    renderWrapper();

    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(screen.queryByText("Populated list")).not.toBeInTheDocument();
  });

  it("renders children when items are available", () => {
    renderWrapper({ items: [{ id: 1 }] });

    expect(screen.getByText("Populated list")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here yet")).not.toBeInTheDocument();
  });

  it("gives loading precedence over an existing error", () => {
    renderWrapper({ isLoading: true, errorMessage: "Old request failed" });

    expect(screen.getByRole("status", { name: "Loading list" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
