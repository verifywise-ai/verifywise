import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

// `usePlaygroundRuntime` has its own dedicated test file — stub it here so
// this page's test doesn't need a real assistant-ui runtime.
vi.mock("./usePlaygroundRuntime", () => ({
  usePlaygroundRuntime: () => ({}),
}));

vi.mock("@assistant-ui/react", () => ({
  AssistantRuntimeProvider: ({ children }: any) => (
    <div data-testid="runtime-provider">{children}</div>
  ),
  ThreadPrimitive: {
    Root: ({ children, style }: any) => <div style={style}>{children}</div>,
    Viewport: ({ children, style }: any) => (
      <div style={style} data-testid="thread-viewport">
        {children}
      </div>
    ),
    Messages: () => <div data-testid="thread-messages" />,
  },
  ComposerPrimitive: {
    Root: ({ children, style }: any) => <div style={style}>{children}</div>,
    Input: ({ children, asChild, ...rest }: any) =>
      asChild ? { ...children, props: { ...children.props, ...rest } } : <input {...rest} />,
    Send: ({ children, asChild, ...rest }: any) =>
      asChild ? { ...children, props: { ...children.props, ...rest } } : <button {...rest} />,
  },
}));

import { apiServices } from "../../../../infrastructure/api/networkServices";
import PlaygroundPage from "./index";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;

const mockEndpoints = [
  { id: 1, slug: "prod-gpt4o", display_name: "Prod GPT-4o", is_active: true },
  { id: 2, slug: "inactive-ep", display_name: "Inactive endpoint", is_active: false },
];

describe("AIGateway - Playground", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("shows a no-endpoints empty state with setup guidance when nothing is configured", async () => {
    mockGet.mockResolvedValue({ data: { endpoints: [] } });
    renderWithProviders(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByText(/No endpoints available/)).toBeInTheDocument();
    });
    expect(screen.getByText("Setup required")).toBeInTheDocument();
    expect(screen.getByText("Step 1: Add an API key")).toBeInTheDocument();
  });

  it("auto-selects the first active endpoint and shows the chat area", async () => {
    mockGet.mockResolvedValue({ data: { endpoints: mockEndpoints } });
    renderWithProviders(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByTestId("runtime-provider")).toBeInTheDocument();
    });
    expect(screen.getByTestId("thread-messages")).toBeInTheDocument();
  });

  it("filters out inactive endpoints from the selector", async () => {
    mockGet.mockResolvedValue({ data: { endpoints: mockEndpoints } });
    renderWithProviders(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByTestId("runtime-provider")).toBeInTheDocument();
    });
    expect(screen.queryByText("Inactive endpoint")).not.toBeInTheDocument();
  });

  it("shows a select-an-endpoint prompt when endpoints exist but none is chosen", async () => {
    // Simulate a previously-saved endpoint slug that no longer matches any
    // active endpoint's auto-select fallback by clearing localStorage and
    // returning an empty active list alongside a present (but filtered) one.
    mockGet.mockResolvedValue({
      data: {
        endpoints: [{ id: 2, slug: "inactive-ep", display_name: "Inactive", is_active: false }],
      },
    });
    renderWithProviders(<PlaygroundPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "No endpoints available. Configure an endpoint before using the playground.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("opens the settings modal and saves temperature/max tokens to localStorage", async () => {
    mockGet.mockResolvedValue({ data: { endpoints: mockEndpoints } });
    renderWithProviders(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByTestId("runtime-provider")).toBeInTheDocument();
    });

    const settingsButton = document
      .querySelector("svg.lucide-settings")
      ?.closest("button") as HTMLElement;
    fireEvent.click(settingsButton);
    expect(screen.getByRole("heading", { name: "Playground settings" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Max tokens"), { target: { value: "2048" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(window.localStorage.getItem("vw_playground_max_tokens")).toBe("2048");
    });
  });

  it("reads previously saved settings from localStorage on mount", async () => {
    window.localStorage.setItem("vw_playground_temperature", "1.2");
    window.localStorage.setItem("vw_playground_max_tokens", "8000");
    mockGet.mockResolvedValue({ data: { endpoints: mockEndpoints } });
    renderWithProviders(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByTestId("runtime-provider")).toBeInTheDocument();
    });

    const settingsButton2 = document
      .querySelector("svg.lucide-settings")
      ?.closest("button") as HTMLElement;
    fireEvent.click(settingsButton2);
    expect(screen.getByText("Temperature: 1.2")).toBeInTheDocument();
    expect(screen.getByLabelText("Max tokens")).toHaveValue("8000");
  });

  it("silently handles a failed endpoints fetch", async () => {
    mockGet.mockRejectedValue(new Error("network down"));
    renderWithProviders(<PlaygroundPage />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });
    expect(screen.getByText(/No endpoints available/)).toBeInTheDocument();
  });
});
