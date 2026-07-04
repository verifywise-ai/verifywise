import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ChunkErrorBoundary from "../index";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function ProblemChild({ shouldThrow, errorType }: { shouldThrow?: boolean; errorType?: string }) {
  if (shouldThrow) {
    if (errorType === "chunk") {
      const error = new Error("Failed to fetch dynamically imported module");
      error.name = "ChunkLoadError";
      throw error;
    }
    throw new Error("Regular runtime error");
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
        <ProblemChild shouldThrow errorType="chunk" />
      </ChunkErrorBoundary>,
    );

    expect(screen.getByText("A new version is available")).toBeInTheDocument();
    expect(screen.getByText(/The application has been updated/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reload now/i })).toBeInTheDocument();
  });

  it("does not render children after a chunk error", () => {
    renderWithProviders(
      <ChunkErrorBoundary>
        <ProblemChild shouldThrow errorType="chunk" />
      </ChunkErrorBoundary>,
    );

    expect(screen.queryByText("Child content")).not.toBeInTheDocument();
  });

  it("does not catch non-chunk errors (error propagates)", () => {
    const NonChunkChild = () => {
      throw new Error("Regular runtime error");
    };

    expect(() => {
      renderWithProviders(
        <ChunkErrorBoundary>
          <NonChunkChild />
        </ChunkErrorBoundary>,
      );
    }).toThrow("Regular runtime error");
  });

  it("does not show chunk error UI for non-chunk errors", () => {
    const NonChunkChild = () => {
      throw new Error("Regular runtime error");
    };

    try {
      renderWithProviders(
        <ChunkErrorBoundary>
          <NonChunkChild />
        </ChunkErrorBoundary>,
      );
    } catch {
      // error re-thrown by componentDidCatch, expected
    }

    expect(screen.queryByText("A new version is available")).not.toBeInTheDocument();
  });
});
