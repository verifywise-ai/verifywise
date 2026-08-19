import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock the assistant-ui primitives used by PlaygroundComposer. The Radix-style
// `asChild` prop clones its single child and merges the remaining props onto
// it — replicate that here so placeholder/disabled reach the real inner
// elements (ComposerInput / IconButton) instead of being swallowed.
vi.mock("@assistant-ui/react", () => ({
  ComposerPrimitive: {
    Root: ({ children, style }: any) => <div style={style}>{children}</div>,
    Input: ({ children, asChild, ...rest }: any) =>
      asChild ? { ...children, props: { ...children.props, ...rest } } : <input {...rest} />,
    Send: ({ children, asChild, ...rest }: any) =>
      asChild ? { ...children, props: { ...children.props, ...rest } } : <button {...rest} />,
  },
}));

import { PlaygroundComposer } from "./PlaygroundComposer";

describe("PlaygroundComposer", () => {
  it("renders the message textarea with the default placeholder when enabled", () => {
    renderWithProviders(<PlaygroundComposer />);

    const textarea = screen.getByLabelText("Type your message");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute(
      "placeholder",
      "Type a message... (Enter to send, Shift+Enter for new line)",
    );
    expect(textarea).not.toBeDisabled();
  });

  it("shows the disabled placeholder and disables the textarea when disabled", () => {
    renderWithProviders(<PlaygroundComposer disabled />);

    const textarea = screen.getByLabelText("Type your message");
    expect(textarea).toHaveAttribute("placeholder", "Select an endpoint first");
    expect(textarea).toBeDisabled();
  });

  it("disables the send button when disabled", () => {
    renderWithProviders(<PlaygroundComposer disabled />);

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("enables the send button when not disabled", () => {
    renderWithProviders(<PlaygroundComposer disabled={false} />);

    expect(screen.getByRole("button")).not.toBeDisabled();
  });
});
