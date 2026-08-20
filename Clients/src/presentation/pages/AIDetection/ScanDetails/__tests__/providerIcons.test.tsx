import { render } from "@testing-library/react";
import { getProviderIcon } from "../providerIcons";

describe("getProviderIcon", () => {
  it("renders a fallback package icon when no provider is given", () => {
    const { container } = render(<>{getProviderIcon(undefined)}</>);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders a known SVGR icon component for a cloud provider", () => {
    const { container } = render(<>{getProviderIcon("OpenAI")}</>);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders an image logo for providers with SVG/PNG logos", () => {
    const { container } = render(<>{getProviderIcon("NumPy")}</>);
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("alt", "NumPy");
  });

  it("renders a fallback icon for an unknown provider", () => {
    const { container } = render(<>{getProviderIcon("SomeUnknownProvider")}</>);
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("applies a custom size", () => {
    const { container } = render(<>{getProviderIcon("NumPy", 32)}</>);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("width", "32");
    expect(img).toHaveAttribute("height", "32");
  });
});
