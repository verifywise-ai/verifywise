import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ModelSelector from "../index";

vi.mock("../../../assets/icons/openai_logo.svg", () => ({
  ReactComponent: () => null,
}));
vi.mock("../../../assets/icons/anthropic_logo.svg", () => ({
  ReactComponent: () => null,
}));
vi.mock("../../../assets/icons/gemini_logo.svg", () => ({
  ReactComponent: () => null,
}));
vi.mock("../../../assets/icons/mistral_logo.svg", () => ({
  ReactComponent: () => null,
}));
vi.mock("../../../assets/icons/xai_logo.svg", () => ({
  ReactComponent: () => null,
}));
vi.mock("../../../assets/icons/openrouter_logo.svg", () => ({
  ReactComponent: () => null,
}));

const baseConfiguredProviders = [{ provider: "openai" }, { provider: "anthropic" }];

describe("ModelSelector Component", () => {
  it("renders label", () => {
    renderWithProviders(
      <ModelSelector
        provider="openai"
        model=""
        onProviderChange={vi.fn()}
        onModelChange={vi.fn()}
        configuredProviders={baseConfiguredProviders}
        onNavigateToSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("Model")).toBeInTheDocument();
  });

  it("renders custom label", () => {
    renderWithProviders(
      <ModelSelector
        provider="openai"
        model=""
        onProviderChange={vi.fn()}
        onModelChange={vi.fn()}
        configuredProviders={baseConfiguredProviders}
        onNavigateToSettings={vi.fn()}
        label="AI Model"
      />,
    );

    expect(screen.getByText("AI Model")).toBeInTheDocument();
  });

  it("shows 'Select a model' when no model is selected", () => {
    renderWithProviders(
      <ModelSelector
        provider="openai"
        model=""
        onProviderChange={vi.fn()}
        onModelChange={vi.fn()}
        configuredProviders={baseConfiguredProviders}
        onNavigateToSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("Select a model")).toBeInTheDocument();
  });

  it("opens dropdown on click", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ModelSelector
        provider="openai"
        model=""
        onProviderChange={vi.fn()}
        onModelChange={vi.fn()}
        configuredProviders={baseConfiguredProviders}
        onNavigateToSettings={vi.fn()}
      />,
    );

    const trigger = screen.getByText("Select a model").closest("div")?.parentElement;
    if (trigger) await user.click(trigger);

    expect(screen.getByPlaceholderText("Find a model")).toBeInTheDocument();
  });

  it("shows provider list in dropdown", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ModelSelector
        provider="openai"
        model=""
        onProviderChange={vi.fn()}
        onModelChange={vi.fn()}
        configuredProviders={baseConfiguredProviders}
        onNavigateToSettings={vi.fn()}
      />,
    );

    const trigger = screen.getByText("Select a model").closest("div")?.parentElement;
    if (trigger) await user.click(trigger);

    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
  });

  it("calls onProviderChange when a different provider is clicked", async () => {
    const handleProviderChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <ModelSelector
        provider="openai"
        model=""
        onProviderChange={handleProviderChange}
        onModelChange={vi.fn()}
        configuredProviders={baseConfiguredProviders}
        onNavigateToSettings={vi.fn()}
      />,
    );

    const trigger = screen.getByText("Select a model").closest("div")?.parentElement;
    if (trigger) await user.click(trigger);

    await user.click(screen.getByText("Anthropic"));
    expect(handleProviderChange).toHaveBeenCalledWith("anthropic");
  });

  it("closes dropdown when clicking away", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ModelSelector
        provider="openai"
        model=""
        onProviderChange={vi.fn()}
        onModelChange={vi.fn()}
        configuredProviders={baseConfiguredProviders}
        onNavigateToSettings={vi.fn()}
      />,
    );

    const trigger = screen.getByText("Select a model").closest("div")?.parentElement;
    if (trigger) await user.click(trigger);

    expect(screen.getByPlaceholderText("Find a model")).toBeInTheDocument();

    await user.click(document.body);

    expect(screen.queryByPlaceholderText("Find a model")).not.toBeInTheDocument();
  });

  it("shows 'Add API key' button", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ModelSelector
        provider="openai"
        model=""
        onProviderChange={vi.fn()}
        onModelChange={vi.fn()}
        configuredProviders={baseConfiguredProviders}
        onNavigateToSettings={vi.fn()}
      />,
    );

    const trigger = screen.getByText("Select a model").closest("div")?.parentElement;
    if (trigger) await user.click(trigger);

    expect(screen.getByText("Add API key")).toBeInTheDocument();
  });

  it("calls onNavigateToSettings when 'Add API key' is clicked", async () => {
    const handleNavigate = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <ModelSelector
        provider="openai"
        model=""
        onProviderChange={vi.fn()}
        onModelChange={vi.fn()}
        configuredProviders={baseConfiguredProviders}
        onNavigateToSettings={handleNavigate}
      />,
    );

    const trigger = screen.getByText("Select a model").closest("div")?.parentElement;
    if (trigger) await user.click(trigger);

    await user.click(screen.getByText("Add API key"));
    expect(handleNavigate).toHaveBeenCalled();
  });

  it("shows 'API key required' for unconfigured provider", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ModelSelector
        provider="mistral"
        model=""
        onProviderChange={vi.fn()}
        onModelChange={vi.fn()}
        configuredProviders={baseConfiguredProviders}
        onNavigateToSettings={vi.fn()}
      />,
    );

    const trigger = screen.getByText("Select a model").closest("div")?.parentElement;
    if (trigger) await user.click(trigger);

    expect(screen.getByText("API key required")).toBeInTheDocument();
  });

  it("shows 'Go to settings' button for unconfigured provider", async () => {
    const handleNavigate = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <ModelSelector
        provider="mistral"
        model=""
        onProviderChange={vi.fn()}
        onModelChange={vi.fn()}
        configuredProviders={baseConfiguredProviders}
        onNavigateToSettings={handleNavigate}
      />,
    );

    const trigger = screen.getByText("Select a model").closest("div")?.parentElement;
    if (trigger) await user.click(trigger);

    await user.click(screen.getByText("Go to settings"));
    expect(handleNavigate).toHaveBeenCalled();
  });
});
