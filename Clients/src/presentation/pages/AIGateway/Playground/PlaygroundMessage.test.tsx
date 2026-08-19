import { render, screen } from "@testing-library/react";

vi.mock("@assistant-ui/react", () => ({
  MessagePrimitive: {
    Root: ({ children }: any) => <div data-testid="message-root">{children}</div>,
    // The real MessagePrimitive.If reads the current message's role from
    // context to decide which branch to render. Standalone in a test there's
    // no such context, so render both branches unconditionally — this still
    // exercises both the user (Typography) and assistant (ReactMarkdown)
    // rendering paths, which is what we're covering here.
    If: ({ children }: any) => <>{children}</>,
    Content: ({ components }: any) => <>{components.Text({ text: "Hello world" })}</>,
  },
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: any) => <div data-testid="markdown">{children}</div>,
}));

import { PlaygroundMessage } from "./PlaygroundMessage";

describe("PlaygroundMessage", () => {
  it("renders both the user and assistant message branches", () => {
    render(<PlaygroundMessage />);

    expect(screen.getByTestId("message-root")).toBeInTheDocument();
    // User branch renders plain text via Typography.
    expect(screen.getAllByText("Hello world").length).toBeGreaterThan(0);
    // Assistant branch renders through ReactMarkdown.
    expect(screen.getByTestId("markdown")).toHaveTextContent("Hello world");
  });
});
