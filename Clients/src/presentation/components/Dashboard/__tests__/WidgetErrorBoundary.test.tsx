import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import WidgetErrorBoundary from "../WidgetErrorBoundary";

// Suppress console.error output from the error boundary during tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = vi.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

function GoodChild() {
  return <div>Widget loaded successfully</div>;
}

function BadChild(): React.ReactElement {
  throw new Error("Widget crashed!");
}

describe("WidgetErrorBoundary Component", () => {
  it("renders children when no error occurs", () => {
    renderWithProviders(
      <WidgetErrorBoundary widgetId="test-widget">
        <GoodChild />
      </WidgetErrorBoundary>,
    );

    expect(screen.getByText("Widget loaded successfully")).toBeInTheDocument();
  });

  it("shows error UI when a child throws", () => {
    renderWithProviders(
      <WidgetErrorBoundary widgetId="broken-widget" widgetTitle="Dashboard">
        <BadChild />
      </WidgetErrorBoundary>,
    );

    expect(screen.getByText("Dashboard Error")).toBeInTheDocument();
    expect(screen.getByText("This widget failed to load properly.")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("uses default widget title when widgetTitle is not provided", () => {
    renderWithProviders(
      <WidgetErrorBoundary widgetId="broken-widget">
        <BadChild />
      </WidgetErrorBoundary>,
    );

    expect(screen.getByText("Widget Error")).toBeInTheDocument();
  });

  it("recovers after clicking retry", async () => {
    const user = userEvent.setup();
    let shouldThrow = true;

    function ConditionalChild() {
      if (shouldThrow) {
        throw new Error("Temporary error");
      }
      return <div>Recovered</div>;
    }

    renderWithProviders(
      <WidgetErrorBoundary widgetId="retry-widget">
        <ConditionalChild />
      </WidgetErrorBoundary>,
    );

    // Error state should be shown
    expect(screen.getByText("Widget Error")).toBeInTheDocument();

    // Fix the error condition before clicking retry
    shouldThrow = false;

    await user.click(screen.getByText("Retry"));

    // After retry, child should render successfully
    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });
});
