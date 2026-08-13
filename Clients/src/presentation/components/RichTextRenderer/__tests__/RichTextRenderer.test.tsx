import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RichTextRenderer from "../index";

describe("RichTextRenderer", () => {
  it("renders sanitized HTML in a div by default", () => {
    render(<RichTextRenderer html="<p><strong>safe</strong></p>" />);
    const container = screen.getByText("safe").closest("div");
    expect(container).toBeInTheDocument();
    expect(container?.innerHTML).toContain("<strong>safe</strong>");
  });

  it("strips scripts from rendered HTML", () => {
    render(<RichTextRenderer html="<p>safe</p><script>alert(1)</script>" />);
    expect(screen.getByText("safe")).toBeInTheDocument();
    expect(screen.queryByText("alert(1)")).not.toBeInTheDocument();
  });

  it("renders a sandboxed iframe when sandbox=true", () => {
    render(<RichTextRenderer html="<p>safe</p>" sandbox />);
    const iframe = screen.getByTitle("Rich text content");
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe).toHaveAttribute("sandbox", "allow-same-origin");
    expect(iframe).toHaveAttribute("srcDoc", "<p>safe</p>");
  });

  it("applies the provided className", () => {
    render(<RichTextRenderer html="<p>safe</p>" className="my-rich-text" />);
    expect(screen.getByText("safe").closest("div")).toHaveClass("my-rich-text");
  });

  it("applies className to the iframe when sandboxed", () => {
    render(<RichTextRenderer html="<p>safe</p>" sandbox className="my-rich-text" />);
    expect(screen.getByTitle("Rich text content")).toHaveClass("my-rich-text");
  });

  it("calls onStripped when dangerous content is removed", () => {
    const onStripped = vi.fn();
    render(
      // Intentional script tag used to test that RichTextRenderer strips dangerous content.
      // nosemgrep: javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag
      <RichTextRenderer html="<p>safe</p><script>alert(1)</script>" onStripped={onStripped} />,
    );
    expect(onStripped).toHaveBeenCalledTimes(1);
  });

  it("does not call onStripped when content is already clean", () => {
    const onStripped = vi.fn();
    render(<RichTextRenderer html="<p>safe</p>" onStripped={onStripped} />);
    expect(onStripped).not.toHaveBeenCalled();
  });

  it("returns null when there is no sanitized content", () => {
    const { container } = render(<RichTextRenderer html="" />);
    expect(container.firstChild).toBeNull();
  });
});
