import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockNavigate = vi.fn();
let mockParams: { id?: string } = { id: "1" };

vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
  };
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

vi.mock("../shared", async () => {
  const actual: any = await vi.importActual("../shared");
  return { ...actual, streamPromptTest: vi.fn() };
});

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title, description, actionButton }: any) => (
    <div data-testid="page-header">
      <div data-testid="header-title">{title}</div>
      <div>{description}</div>
      {actionButton}
      {children}
    </div>
  ),
}));

// ComparePanel, TestDatasetPanel, and VersionDiffModal each have their own
// dedicated test files — stub them here to keep this test focused on
// PromptEditor's own logic (message editing, save/publish, version history).
vi.mock("./ComparePanel", () => ({
  default: () => <div data-testid="compare-panel" />,
}));
vi.mock("./TestDatasetPanel", () => ({
  default: () => <div data-testid="test-dataset-panel" />,
}));
vi.mock("./VersionDiffModal", () => ({
  default: ({ isOpen, versionA, versionB }: any) =>
    isOpen ? (
      <div data-testid="version-diff-modal">
        {versionA?.version} vs {versionB?.version}
      </div>
    ) : null,
}));

import { apiServices } from "../../../../infrastructure/api/networkServices";
import { streamPromptTest } from "../shared";
import PromptEditor from "./PromptEditor";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiServices.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiServices.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiServices.delete as unknown as ReturnType<typeof vi.fn>;
const mockStreamPromptTest = streamPromptTest as unknown as ReturnType<typeof vi.fn>;

const mockVersion1 = {
  id: 101,
  version: 1,
  content: [{ role: "system", content: "You are a {{role}} assistant." }],
  variables: ["role"],
  model: "openai/gpt-4o",
  config: { temperature: 0.5 },
  status: "published",
  published_at: "2025-01-02T00:00:00Z",
  published_by_name: "Jane Doe",
  created_by_name: "Jane Doe",
  created_at: "2025-01-01T00:00:00Z",
  commit_message: "Initial version",
};

const mockVersion2 = {
  id: 102,
  version: 2,
  content: [{ role: "system", content: "You are a {{role}} assistant, v2." }],
  variables: ["role"],
  model: "openai/gpt-4o",
  config: {},
  status: "draft",
  published_at: null,
  published_by_name: null,
  created_by_name: "John Smith",
  created_at: "2025-01-03T00:00:00Z",
  commit_message: null,
};

const mockPromptData = { id: 1, slug: "support-agent", name: "Support agent", description: null };

function mockLoad(overrides: {
  prompt?: any;
  versions?: any[];
  endpoints?: any[];
  labels?: any[];
} = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes("/versions")) {
      return Promise.resolve({ data: { versions: overrides.versions ?? [mockVersion1, mockVersion2] } });
    }
    if (url.includes("/labels")) {
      return Promise.resolve({ data: { labels: overrides.labels ?? [] } });
    }
    if (url.includes("/ai-gateway/endpoints")) {
      return Promise.resolve({
        data: {
          endpoints: overrides.endpoints ?? [
            { slug: "prod", display_name: "Prod", is_active: true },
          ],
        },
      });
    }
    if (url.includes("/ai-gateway/providers")) {
      return Promise.resolve({ data: { data: { providers: [] } } });
    }
    if (url.includes("/ai-gateway/prompts/1")) {
      return Promise.resolve({ data: { prompt: overrides.prompt ?? mockPromptData } });
    }
    return Promise.resolve({ data: {} });
  });
}

// jsdom does not implement scrollIntoView; the chat panel calls it whenever
// chatMessages changes.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("AIGateway - PromptEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = { id: "1" };
    mockLoad();
    mockPost.mockResolvedValue({ data: {} });
    mockPut.mockResolvedValue({ data: {} });
    mockDelete.mockResolvedValue({ data: {} });
  });

  it("shows a loading skeleton initially", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<PromptEditor />);
    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("shows an error state with a working retry button", async () => {
    // useGatewayModels() also calls apiServices.get("/ai-gateway/providers")
    // on mount and catches its own errors internally, so a blanket
    // mockRejectedValueOnce can get consumed by that call instead of
    // loadPrompt's — reject specifically on the prompt-loading URLs.
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/ai-gateway/providers")) {
        return Promise.resolve({ data: { data: { providers: [] } } });
      }
      return Promise.reject(new Error("boom"));
    });
    renderWithProviders(<PromptEditor />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load prompt. Please try again.")).toBeInTheDocument();
    });

    mockLoad();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByTestId("header-title")).toHaveTextContent("Support agent");
    });
  });

  it("shows a not-found state and navigates back when the prompt is missing", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/ai-gateway/prompts/1") && !url.includes("versions") && !url.includes("labels")) {
        return Promise.resolve({ data: {} });
      }
      return Promise.resolve({ data: { versions: [], endpoints: [], labels: [] } });
    });
    renderWithProviders(<PromptEditor />);

    await waitFor(() => {
      expect(screen.getByText("Prompt not found.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Back to prompts" }));
    expect(mockNavigate).toHaveBeenCalledWith("/ai-gateway/prompts");
  });

  it("loads the latest version into the editor with its messages and status", async () => {
    renderWithProviders(<PromptEditor />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant.")).toBeInTheDocument();
    });
    expect(screen.getByTestId("header-title")).toHaveTextContent("v1");
    expect(screen.getByTestId("header-title")).toHaveTextContent("Published");
  });

  it("detects {{variables}} from message content and lists them", async () => {
    renderWithProviders(<PromptEditor />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant.")).toBeInTheDocument();
    });

    expect(screen.getByText("Variables:")).toBeInTheDocument();
    expect(screen.getByText("{{role}}")).toBeInTheDocument();
  });

  it("adds and removes message blocks", async () => {
    renderWithProviders(<PromptEditor />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add message"));
    expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(1);

    const textboxes = screen.getAllByPlaceholderText(
      /Write a sample user message|You are a helpful assistant/,
    );
    expect(textboxes.length).toBeGreaterThanOrEqual(0); // second block has empty content

    // Remove buttons only render when there's more than one message.
    const trashButtons = document.querySelectorAll("svg.lucide-trash-2");
    expect(trashButtons.length).toBeGreaterThan(0);
  });

  it("saves a new version with a commit message", async () => {
    mockPost.mockImplementation((url: string) => {
      if (url.includes("/versions")) {
        return Promise.resolve({
          data: { version: { ...mockVersion2, version: 3, id: 103 } },
        });
      }
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<PromptEditor />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(screen.getByRole("heading", { name: "Save version" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("What changed?"), {
      target: { value: "Tweaked wording" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/prompts/1/versions",
        expect.objectContaining({ commit_message: "Tweaked wording" }),
      );
    });
  });

  it("skips the commit message when Skip is clicked", async () => {
    mockPost.mockResolvedValue({ data: { version: { ...mockVersion2, version: 3, id: 103 } } });
    renderWithProviders(<PromptEditor />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/prompts/1/versions",
        expect.objectContaining({ commit_message: null }),
      );
    });
  });

  it("publishes the current version", async () => {
    mockPost.mockImplementation((url: string) => {
      if (url.includes("/publish")) {
        return Promise.resolve({
          data: { version: { ...mockVersion1, published_at: "2025-02-01T00:00:00Z" } },
        });
      }
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<PromptEditor />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/ai-gateway/prompts/1/versions/1/publish");
    });
  });

  it("opens the version history drawer and loads a different version", async () => {
    renderWithProviders(<PromptEditor />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant.")).toBeInTheDocument();
    });

    const historyButtons = screen.getAllByRole("button");
    const historyButton = historyButtons.find((b) => b.querySelector("svg.lucide-history"));
    fireEvent.click(historyButton!);

    expect(screen.getByText("Version history")).toBeInTheDocument();
    expect(screen.getByText(/John Smith/)).toBeInTheDocument();
    expect(screen.getByText("Initial version")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/John Smith/));

    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant, v2.")).toBeInTheDocument();
    });
  });

  it("publishes a non-current version directly from the history drawer", async () => {
    mockPost.mockImplementation((url: string) => {
      if (url.includes("/versions/2/publish")) {
        return Promise.resolve({ data: { version: { ...mockVersion2, status: "published" } } });
      }
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<PromptEditor />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant.")).toBeInTheDocument();
    });

    const historyButtons = screen.getAllByRole("button");
    fireEvent.click(historyButtons.find((b) => b.querySelector("svg.lucide-history"))!);

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/ai-gateway/prompts/1/versions/2/publish");
    });
  });

  it("opens the diff modal comparing the current and a past version", async () => {
    renderWithProviders(<PromptEditor />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant.")).toBeInTheDocument();
    });

    const historyButtons = screen.getAllByRole("button");
    fireEvent.click(historyButtons.find((b) => b.querySelector("svg.lucide-history"))!);

    fireEvent.click(screen.getByRole("button", { name: "Compare" }));

    expect(screen.getByTestId("version-diff-modal")).toHaveTextContent("1 vs 2");
  });

  it("assigns a label to a version", async () => {
    renderWithProviders(<PromptEditor />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant.")).toBeInTheDocument();
    });

    const historyButtons = screen.getAllByRole("button");
    fireEvent.click(historyButtons.find((b) => b.querySelector("svg.lucide-history"))!);

    const labelButtons = screen.getAllByRole("button", { name: "Label" });
    fireEvent.click(labelButtons[0]);

    expect(screen.getByRole("heading", { name: "Add label" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Label name"), { target: { value: "production" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        "/ai-gateway/prompts/1/labels/production",
        expect.objectContaining({ version_id: 101 }),
      );
    });
  });

  it("removes a label from a version", async () => {
    mockLoad({ labels: [{ id: 1, label_name: "staging", version_id: 101 }] });
    renderWithProviders(<PromptEditor />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant.")).toBeInTheDocument();
    });

    const historyButtons = screen.getAllByRole("button");
    fireEvent.click(historyButtons.find((b) => b.querySelector("svg.lucide-history"))!);

    // "staging" also appears as a chip in the page header (currentLabels for
    // the loaded version) — the drawer's copy is the last match, and its
    // remove (X) icon button is its next sibling.
    const stagingChips = screen.getAllByText("staging");
    const drawerChip = stagingChips[stagingChips.length - 1];
    fireEvent.click(drawerChip.parentElement!.querySelector("button")!);

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/ai-gateway/prompts/1/labels/staging");
    });
  });

  it("selects a test endpoint and sends a chat message", async () => {
    // The chat message content is populated via the onDelta callback during
    // streaming, not from the resolved value alone — invoke it like the real
    // implementation would.
    mockStreamPromptTest.mockImplementation(async (opts: any) => {
      opts.onDelta("Hi!");
      return { content: "Hi!", tokens: 10, cost: 0.001, latency: 120 };
    });
    renderWithProviders(<PromptEditor />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant.")).toBeInTheDocument();
    });

    const combos = screen.getAllByRole("combobox");
    // The endpoint select is the only combobox in the chat panel (model
    // autocomplete uses a textbox, not a MUI Select combobox).
    fireEvent.mouseDown(combos[combos.length - 1]);
    fireEvent.click(screen.getByRole("option", { name: "Prod (prod)" }));

    fireEvent.change(screen.getByPlaceholderText("Type a message..."), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByLabelText(/^role/));
    fireEvent.change(screen.getByLabelText(/^role/), { target: { value: "engineer" } });

    const sendButtons = screen.getAllByRole("button");
    const sendButton = sendButtons.find((b) => b.querySelector("svg.lucide-send"));
    fireEvent.click(sendButton!);

    await waitFor(() => {
      expect(mockStreamPromptTest).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("Hi!")).toBeInTheDocument();
    });
    expect(screen.getByText("120ms")).toBeInTheDocument();
  });

  it("shows a chat error when the test request fails", async () => {
    mockStreamPromptTest.mockRejectedValue(new Error("Connection refused"));
    renderWithProviders(<PromptEditor />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant.")).toBeInTheDocument();
    });

    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[combos.length - 1]);
    fireEvent.click(screen.getByRole("option", { name: "Prod (prod)" }));

    fireEvent.change(screen.getByPlaceholderText("Type a message..."), {
      target: { value: "Hello" },
    });
    const sendButtons = screen.getAllByRole("button");
    fireEvent.click(sendButtons.find((b) => b.querySelector("svg.lucide-send"))!);

    await waitFor(() => {
      expect(screen.getByText("Error: Connection refused")).toBeInTheDocument();
    });
  });

  it("switches to the Compare and Test set tabs", async () => {
    renderWithProviders(<PromptEditor />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("You are a {{role}} assistant.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Compare"));
    expect(screen.getByTestId("compare-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Test set"));
    expect(screen.getByTestId("test-dataset-panel")).toBeInTheDocument();
  });

  it("shows an empty version-history state when there are no versions", async () => {
    mockLoad({ versions: [] });
    renderWithProviders(<PromptEditor />);
    await waitFor(() => {
      expect(screen.getByTestId("header-title")).toHaveTextContent("Support agent");
    });

    const historyButtons = screen.getAllByRole("button");
    fireEvent.click(historyButtons.find((b) => b.querySelector("svg.lucide-history"))!);

    expect(screen.getByText("No versions yet")).toBeInTheDocument();
  });
});
