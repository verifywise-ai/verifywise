import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

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
  PageHeaderExtended: ({ children, title, actionButton }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {actionButton}
      {children}
    </div>
  ),
}));

import { apiServices } from "../../../../infrastructure/api/networkServices";
import PromptsPage from "./index";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiServices.post as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiServices.delete as unknown as ReturnType<typeof vi.fn>;

function makePrompt(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    slug: "support-agent",
    name: "Support agent",
    description: "Handles customer questions",
    published_version: 2,
    published_model: "openai/gpt-4o",
    published_status: "published",
    version_count: 3,
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function mockLoad(prompts: any[], labels: Record<number, any[]> = {}) {
  mockGet.mockImplementation((url: string) => {
    const labelsMatch = url.match(/\/prompts\/(\d+)\/labels/);
    if (labelsMatch) {
      const id = Number(labelsMatch[1]);
      return Promise.resolve({ data: { labels: labels[id] || [] } });
    }
    if (url.includes("/ai-gateway/prompts")) {
      return Promise.resolve({ data: { prompts } });
    }
    return Promise.resolve({ data: {} });
  });
}

describe("AIGateway - Prompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton initially", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<PromptsPage />);
    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("shows an error state with a working retry button", async () => {
    mockGet.mockRejectedValue(new Error("boom"));
    renderWithProviders(<PromptsPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load prompts. Please try again.")).toBeInTheDocument();
    });

    mockLoad([makePrompt()]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("Support agent")).toBeInTheDocument();
    });
  });

  it("shows an empty state with tips when there are no prompts", async () => {
    mockLoad([]);
    renderWithProviders(<PromptsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No prompts yet/)).toBeInTheDocument();
    });
    expect(screen.getByText("Prompts are reusable message templates")).toBeInTheDocument();
  });

  it("renders prompt rows with version, labels, model, and updated date", async () => {
    mockLoad([makePrompt()], { 1: [{ label_name: "production" }] });
    renderWithProviders(<PromptsPage />);

    await waitFor(() => {
      expect(screen.getByText("Support agent")).toBeInTheDocument();
    });

    expect(screen.getByText("Handles customer questions")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("production")).toBeInTheDocument();
    expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument();
  });

  it("shows a Draft chip when there's no published version but versions exist", async () => {
    mockLoad([makePrompt({ published_version: null, version_count: 1 })]);
    renderWithProviders(<PromptsPage />);

    await waitFor(() => {
      expect(screen.getByText("Draft")).toBeInTheDocument();
    });
  });

  it("shows a 'No versions' chip when there are no versions at all", async () => {
    mockLoad([makePrompt({ published_version: null, version_count: 0 })]);
    renderWithProviders(<PromptsPage />);

    await waitFor(() => {
      expect(screen.getByText("No versions")).toBeInTheDocument();
    });
  });

  it("navigates to the prompt detail page when a row is clicked", async () => {
    mockLoad([makePrompt()]);
    renderWithProviders(<PromptsPage />);

    await waitFor(() => {
      expect(screen.getByText("Support agent")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Support agent"));
    expect(mockNavigate).toHaveBeenCalledWith("/ai-gateway/prompts/1");
  });

  it("validates that a name is required before creating a prompt", async () => {
    mockLoad([]);
    renderWithProviders(<PromptsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No prompts yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create prompt" }));
    expect(screen.getByRole("heading", { name: "Create prompt" })).toBeInTheDocument();

    const submitButtons = screen.getAllByRole("button", { name: "Create" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("creates a prompt and navigates to its detail page", async () => {
    mockLoad([]);
    mockPost.mockResolvedValue({ data: { prompt: { id: 9 } } });
    renderWithProviders(<PromptsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No prompts yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create prompt" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "New Support Prompt" },
    });

    const submitButtons = screen.getAllByRole("button", { name: "Create" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/ai-gateway/prompts", {
        name: "New Support Prompt",
        slug: "new-support-prompt",
        description: null,
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/ai-gateway/prompts/9");
    });
  });

  it("shows the API error message when create submission fails", async () => {
    mockLoad([]);
    mockPost.mockRejectedValue({ response: { data: { detail: "Slug taken" } } });
    renderWithProviders(<PromptsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No prompts yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create prompt" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Dup" } });

    const submitButtons = screen.getAllByRole("button", { name: "Create" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Slug taken")).toBeInTheDocument();
    });
  });

  it("deletes a prompt after confirming in the delete modal", async () => {
    mockLoad([makePrompt()]);
    mockDelete.mockResolvedValue({ data: {} });
    renderWithProviders(<PromptsPage />);

    await waitFor(() => {
      expect(screen.getByText("Support agent")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button");
    const trashButton = deleteButtons.find((b) =>
      b.querySelector("svg.lucide-trash-2"),
    ) as HTMLButtonElement;
    fireEvent.click(trashButton);

    expect(screen.getByRole("heading", { name: "Delete prompt" })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete "Support agent"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/ai-gateway/prompts/1");
    });
    await waitFor(() => {
      expect(screen.queryByText("Support agent")).not.toBeInTheDocument();
    });
  });

  it("shows pagination controls when there are more than 5 prompts", async () => {
    // Default rows-per-page (from getPaginationRowCount's fallback) is 10.
    const many = Array.from({ length: 15 }, (_, i) =>
      makePrompt({ id: i + 1, name: `Prompt ${i + 1}` }),
    );
    mockLoad(many);
    renderWithProviders(<PromptsPage />);

    await waitFor(() => {
      expect(screen.getByText("Prompt 1")).toBeInTheDocument();
    });

    expect(screen.queryByText("Prompt 11")).not.toBeInTheDocument();
    expect(screen.getByText(/1–10 of 15/)).toBeInTheDocument();
  });
});
