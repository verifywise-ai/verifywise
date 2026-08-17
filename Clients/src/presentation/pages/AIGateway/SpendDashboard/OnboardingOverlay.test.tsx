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

import { apiServices } from "../../../../infrastructure/api/networkServices";
import OnboardingOverlay from "./OnboardingOverlay";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiServices.post as unknown as ReturnType<typeof vi.fn>;

const noneComplete = {
  hasApiKey: false,
  hasEndpoint: false,
  hasVirtualKey: false,
  hasRequests: false,
};

function mockDefaultGet() {
  mockGet.mockImplementation((url: string) => {
    if (url.includes("/ai-gateway/providers")) {
      return Promise.resolve({
        data: { data: { providers: ["openai"], models: { openai: [{ id: "gpt-4o", provider: "openai", mode: "chat" }] } } },
      });
    }
    if (url.includes("/ai-gateway/keys")) {
      return Promise.resolve({
        data: { data: [{ id: 1, key_name: "Prod key", provider: "openai", is_active: true }] },
      });
    }
    if (url.includes("/ai-gateway/endpoints")) {
      return Promise.resolve({
        data: { endpoints: [{ slug: "prod-gpt4o", is_active: true }] },
      });
    }
    if (url.includes("/ai-gateway/virtual-keys")) {
      return Promise.resolve({
        data: { data: [{ key_prefix: "vk_abc", is_active: true }] },
      });
    }
    return Promise.resolve({ data: {} });
  });
}

describe("OnboardingOverlay", () => {
  const onGetStarted = vi.fn();
  const onStepCompleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultGet();
    mockPost.mockResolvedValue({ data: {} });
  });

  it("renders the checklist and architecture diagram", () => {
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    expect(screen.getByText("Add a provider API key")).toBeInTheDocument();
    expect(screen.getByText("Create an endpoint")).toBeInTheDocument();
    expect(screen.getByText("Create a virtual key")).toBeInTheDocument();
    expect(screen.getByText("Make your first request")).toBeInTheDocument();
    expect(screen.getByText("Your app")).toBeInTheDocument();
    expect(screen.getByText("VerifyWise AI gateway")).toBeInTheDocument();
    expect(screen.getByText("LLM providers")).toBeInTheDocument();
  });

  it("calls onGetStarted when 'Read the guide' is clicked", () => {
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Read the guide/ }));
    expect(onGetStarted).toHaveBeenCalled();
  });

  it("does not allow clicking an already-completed checklist item", () => {
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={{ ...noneComplete, hasApiKey: true }}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByText("Add a provider API key"));
    expect(screen.queryByRole("heading", { name: "Add API key" })).not.toBeInTheDocument();
  });

  it("opens the Add API key modal and validates required fields", async () => {
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByText("Add a provider API key"));
    expect(screen.getByRole("heading", { name: "Add API key" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(screen.getByText("All fields are required")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("validates API key format before verifying", async () => {
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByText("Add a provider API key"));
    fireEvent.change(screen.getByLabelText(/^Key name/), { target: { value: "Test" } });

    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[0]);
    fireEvent.click(screen.getByRole("option", { name: "OpenAI" }));

    fireEvent.change(screen.getByLabelText(/^API key/), { target: { value: "bad-format" } });
    fireEvent.click(screen.getByRole("button", { name: "Add key" }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid key format/)).toBeInTheDocument();
    });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("creates an API key and calls onStepCompleted", async () => {
    mockPost.mockImplementation((url: string) => {
      if (url.includes("/keys/verify")) return Promise.resolve({ data: { data: { valid: true } } });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByText("Add a provider API key"));
    fireEvent.change(screen.getByLabelText(/^Key name/), { target: { value: "Test" } });
    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[0]);
    fireEvent.click(screen.getByRole("option", { name: "OpenAI" }));
    fireEvent.change(screen.getByLabelText(/^API key/), {
      target: { value: "sk-abcdefghijklmnopqrstuvwxyz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add key" }));

    await waitFor(() => {
      expect(onStepCompleted).toHaveBeenCalled();
    });
    expect(screen.queryByRole("heading", { name: "Add API key" })).not.toBeInTheDocument();
  });

  it("shows a key-rejected message from the provider verification step", async () => {
    mockPost.mockImplementation((url: string) => {
      if (url.includes("/keys/verify")) {
        return Promise.resolve({ data: { data: { valid: false, message: "Bad key" } } });
      }
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByText("Add a provider API key"));
    fireEvent.change(screen.getByLabelText(/^Key name/), { target: { value: "Test" } });
    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[0]);
    fireEvent.click(screen.getByRole("option", { name: "OpenAI" }));
    fireEvent.change(screen.getByLabelText(/^API key/), {
      target: { value: "sk-abcdefghijklmnopqrstuvwxyz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add key" }));

    await waitFor(() => {
      expect(screen.getByText("Bad key")).toBeInTheDocument();
    });
    expect(onStepCompleted).not.toHaveBeenCalled();
  });

  it("opens the Create endpoint modal, auto-slugifies, and validates required fields", async () => {
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByText("Create an endpoint"));
    expect(screen.getByRole("heading", { name: "Create endpoint" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Endpoint name/), {
      target: { value: "My Endpoint!" },
    });
    expect(screen.getByText("my-endpoint")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create endpoint" }));
    await waitFor(() => {
      expect(screen.getByText(/Name, provider, model, and API key are required/)).toBeInTheDocument();
    });
    expect(mockPost).not.toHaveBeenCalledWith("/ai-gateway/endpoints", expect.anything());
  });

  it("creates an endpoint with the selected provider, model, and API key", async () => {
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByText("Create an endpoint"));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Create endpoint" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^Endpoint name/), { target: { value: "Prod" } });

    // Wait for available keys to load before interacting with comboboxes.
    await waitFor(() => {
      expect(screen.queryByText("No API keys available. Complete step 1 first.")).not.toBeInTheDocument();
    });

    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[0]); // provider
    fireEvent.click(screen.getByRole("option", { name: "openai" }));
    fireEvent.mouseDown(combos[1]); // model
    fireEvent.click(screen.getByRole("option", { name: "gpt-4o" }));
    fireEvent.mouseDown(combos[2]); // api key
    fireEvent.click(screen.getByRole("option", { name: "Prod key (openai)" }));

    fireEvent.click(screen.getByRole("button", { name: "Create endpoint" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/endpoints",
        expect.objectContaining({ display_name: "Prod", provider: "openai", model: "openai/gpt-4o" }),
      );
    });
    await waitFor(() => {
      expect(onStepCompleted).toHaveBeenCalled();
    });
  });

  it("shows a fallback message when no API keys are available for the endpoint modal", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/ai-gateway/keys")) return Promise.resolve({ data: { data: [] } });
      if (url.includes("/ai-gateway/providers")) return Promise.resolve({ data: { data: { providers: [] } } });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByText("Create an endpoint"));

    await waitFor(() => {
      expect(screen.getByText("No API keys available. Complete step 1 first.")).toBeInTheDocument();
    });
  });

  it("validates the virtual key name before creating", async () => {
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByText("Create a virtual key"));
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));

    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("creates a virtual key and shows the key-display phase with copy", async () => {
    mockPost.mockResolvedValue({ data: { data: { plain_key: "vw_plaintext_secret" } } });
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextSpy },
      configurable: true,
    });
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByText("Create a virtual key"));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Backend key" } });
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Virtual key created" })).toBeInTheDocument();
    });
    expect(screen.getByText("vw_plaintext_secret")).toBeInTheDocument();
    expect(onStepCompleted).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
    expect(writeTextSpy).toHaveBeenCalledWith("vw_plaintext_secret");
  });

  it("shows an error when the virtual key creation response has no plain_key", async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByText("Create a virtual key"));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Backend key" } });
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() => {
      expect(
        screen.getByText("Key was created but could not be retrieved. Refresh the page."),
      ).toBeInTheDocument();
    });
  });

  it("runs the first request and shows the response", async () => {
    mockPost.mockResolvedValue({
      data: { data: { choices: [{ message: { content: "Hello there!" } }] } },
    });
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByText("Make your first request"));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Make your first request" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Run/ }));

    await waitFor(() => {
      expect(screen.getByText("Hello there!")).toBeInTheDocument();
    });
    expect(onStepCompleted).toHaveBeenCalled();
  });

  it("shows an error when the first request has no endpoint configured", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/ai-gateway/endpoints")) return Promise.resolve({ data: { endpoints: [] } });
      if (url.includes("/ai-gateway/virtual-keys")) return Promise.resolve({ data: { data: [] } });
      if (url.includes("/ai-gateway/providers")) return Promise.resolve({ data: { data: { providers: [] } } });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByText("Make your first request"));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Make your first request" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Run/ }));

    await waitFor(() => {
      expect(screen.getByText("No endpoint found. Create an endpoint first.")).toBeInTheDocument();
    });
  });

  it("shows the provider error message when the first request fails", async () => {
    mockPost.mockRejectedValue({ response: { data: { detail: "Gateway timeout" } } });
    renderWithProviders(
      <OnboardingOverlay
        setupStatus={noneComplete}
        onGetStarted={onGetStarted}
        onStepCompleted={onStepCompleted}
      />,
    );

    fireEvent.click(screen.getByText("Make your first request"));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Make your first request" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Run/ }));

    await waitFor(() => {
      expect(screen.getByText("Gateway timeout")).toBeInTheDocument();
    });
  });
});
