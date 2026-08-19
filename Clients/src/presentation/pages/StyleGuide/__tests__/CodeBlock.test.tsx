import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import CodeBlock from "../components/CodeBlock";

describe("CodeBlock", () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.useRealTimers();
  });

  it("renders the provided code", () => {
    // Prism syntax highlighting splits the code into multiple <span> tokens,
    // so assert on the <code> element's overall text content instead of an
    // exact text match.
    const { container } = renderWithProviders(<CodeBlock code="const x = 1;" />);
    const codeEl = container.querySelector("code");
    expect(codeEl).not.toBeNull();
    expect(codeEl?.textContent).toBe("const x = 1;");
  });

  it("shows a Copy affordance by default", () => {
    renderWithProviders(<CodeBlock code="const x = 1;" />);
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });

  it("copies the code to the clipboard, calls onCopy, and shows Copied feedback", async () => {
    const onCopy = vi.fn();
    renderWithProviders(<CodeBlock code="const x = 1;" onCopy={onCopy} />);

    fireEvent.click(screen.getByText("Copy"));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("const x = 1;");
    });
    await waitFor(() => {
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
    expect(onCopy).toHaveBeenCalledWith("const x = 1;");
  });

  it("defaults the language to tsx when none is provided", () => {
    const { container } = renderWithProviders(<CodeBlock code="const x = 1;" />);
    const codeEl = container.querySelector("code");
    expect(codeEl?.className).toContain("language-tsx");
  });

  it("applies a custom language class when provided", () => {
    const { container } = renderWithProviders(<CodeBlock code="print('hi')" language="python" />);
    const codeEl = container.querySelector("code");
    expect(codeEl?.className).toContain("language-python");
  });
});
