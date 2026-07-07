import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { AsyncBoundary } from "../index";
import { Database } from "lucide-react";

describe("AsyncBoundary", () => {
  it("renders children when not loading, empty, or errored", () => {
    renderWithProviders(
      <AsyncBoundary isLoading={false}>
        <div data-testid="content">Loaded content</div>
      </AsyncBoundary>,
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("renders the loading skeleton when isLoading is true", () => {
    renderWithProviders(
      <AsyncBoundary isLoading={true}>
        <div>Loaded content</div>
      </AsyncBoundary>,
    );

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("Loaded content")).not.toBeInTheDocument();
  });

  it("renders custom loading fallback when provided", () => {
    renderWithProviders(
      <AsyncBoundary isLoading={true} loadingFallback={<div data-testid="custom-loading">Custom loading</div>}>
        <div>Loaded content</div>
      </AsyncBoundary>,
    );

    expect(screen.getByTestId("custom-loading")).toBeInTheDocument();
  });

  it("renders the empty state when isEmpty is true", () => {
    renderWithProviders(
      <AsyncBoundary isLoading={false} isEmpty={true} emptyMessage="No models found.">
        <div>Loaded content</div>
      </AsyncBoundary>,
    );

    expect(screen.getByText("No models found.")).toBeInTheDocument();
    expect(screen.queryByText("Loaded content")).not.toBeInTheDocument();
  });

  it("renders custom empty icon and children", () => {
    renderWithProviders(
      <AsyncBoundary
        isLoading={false}
        isEmpty={true}
        emptyIcon={Database}
        emptyMessage="No datasets found."
        emptyChildren={<div data-testid="empty-tip">Add a dataset</div>}
      >
        <div>Loaded content</div>
      </AsyncBoundary>,
    );

    expect(screen.getByText("No datasets found.")).toBeInTheDocument();
    expect(screen.getByTestId("empty-tip")).toBeInTheDocument();
  });

  it("renders the error state from an Error object", () => {
    renderWithProviders(
      <AsyncBoundary isLoading={false} error={new Error("Network request failed")}>
        <div>Loaded content</div>
      </AsyncBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Network request failed")).toBeInTheDocument();
  });

  it("renders the error state from a string", () => {
    renderWithProviders(
      <AsyncBoundary isLoading={false} error="Something went wrong.">
        <div>Loaded content</div>
      </AsyncBoundary>,
    );

    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
  });

  it("renders custom error fallback when provided", () => {
    renderWithProviders(
      <AsyncBoundary
        isLoading={false}
        error={new Error("Failed")}
        errorFallback={<div data-testid="custom-error">Custom error UI</div>}
      >
        <div>Loaded content</div>
      </AsyncBoundary>,
    );

    expect(screen.getByTestId("custom-error")).toBeInTheDocument();
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
  });

  it("calls onRetry when the retry button is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    renderWithProviders(
      <AsyncBoundary isLoading={false} error={new Error("Failed")} onRetry={onRetry}>
        <div>Loaded content</div>
      </AsyncBoundary>,
    );

    const retryButton = screen.getByRole("button", { name: "Retry loading data" });
    await user.click(retryButton);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("gives error state precedence over loading", () => {
    renderWithProviders(
      <AsyncBoundary isLoading={true} error={new Error("Failed")}>
        <div>Loaded content</div>
      </AsyncBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("gives loading state precedence over empty", () => {
    renderWithProviders(
      <AsyncBoundary isLoading={true} isEmpty={true}>
        <div>Loaded content</div>
      </AsyncBoundary>,
    );

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("There is currently no data in this table.")).not.toBeInTheDocument();
  });
});
