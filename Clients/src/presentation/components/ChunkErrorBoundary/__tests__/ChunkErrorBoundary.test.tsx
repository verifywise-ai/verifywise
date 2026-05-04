import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ChunkErrorBoundary from "../index";

// Suppress console.error for error boundary tests
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function ProblemChild({ shouldThrow }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    const error = new Error("Failed to fetch dynamically imported module");
    error.name = "ChunkLoadError";
    throw error;
  }
  return <div>Child content</div>;
}

describe("ChunkErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    renderWithProviders(
      <ChunkErrorBoundary>
        <div>Hello World</div>
      </ChunkErrorBoundary>,
    );
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("shows error UI when a chunk load error occurs", () => {
    renderWithProviders(
      <ChunkErrorBoundary>
        <ProblemChild shouldThrow />
      </ChunkErrorBoundary>,
    );

    expect(screen.getByText("A new version is available")).toBeInTheDocument();
    expect(screen.getByText(/The application has been updated/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reload now/i })).toBeInTheDocument();
  });

  it("does not render children after a chunk error", () => {
    renderWithProviders(
      <ChunkErrorBoundary>
        <ProblemChild shouldThrow />
      </ChunkErrorBoundary>,
    );

    expect(screen.queryByText("Child content")).not.toBeInTheDocument();
  });
});
