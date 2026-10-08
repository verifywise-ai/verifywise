import { screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { Routes, Route } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { invalidateLLMKeyQueries } from "../../../../application/hooks/useLLMKeys";
import CustomAxios from "../../../../infrastructure/api/customAxios";
import { IntakeFormBuilder } from "../index";
import { getIntakeForm } from "../../../../application/repository/intakeForm.repository";

// The key list is cached per organization; give the page one.
const ORG_ID = 7;
vi.mock("../../../../application/hooks/useAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../application/hooks/useAuth")>();
  return { useAuth: () => ({ ...actual.useAuth(), organizationId: ORG_ID }) };
});

const mockGetLLMKeys = vi.fn();
vi.mock("../../../../application/repository/llmKeys.repository", () => ({
  getLLMKeys: (...args: unknown[]) => mockGetLLMKeys(...args),
}));

const openAIKey = { id: 3, name: "OpenAI", key: "sk-***", model: "gpt-4o" };
const anthropicKey = { id: 4, name: "Anthropic", key: "sk-ant-***", model: "claude-x" };

// Mock repository functions
vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getIntakeForm: vi.fn().mockResolvedValue({ data: null }),
  createIntakeForm: vi.fn().mockResolvedValue({ data: {} }),
  updateIntakeForm: vi.fn().mockResolvedValue({ data: {} }),
  IntakeFormStatus: {
    DRAFT: "draft",
    ACTIVE: "active",
    ARCHIVED: "archived",
  },
  IntakeEntityType: {
    USE_CASE: "use_case",
    MODEL: "model",
  },
}));

// Mock CustomAxios for users loading
vi.mock("../../../../infrastructure/api/customAxios", () => ({
  __esModule: true,
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock child components to isolate the page
vi.mock("../FieldPalette", () => ({
  FieldPalette: () => <div data-testid="field-palette" />,
  SuggestedQuestionsPanel: ({ llmKeyId }: { llmKeyId?: number | null }) => (
    <div data-testid="suggested-questions" data-llm-key={String(llmKeyId ?? null)} />
  ),
  SuggestedQuestionsPanelHandle: {},
}));

vi.mock("../FormCanvas", () => ({
  FormCanvas: () => <div data-testid="form-canvas" />,
  FormCanvasHandle: {},
}));

vi.mock("../FieldEditor", () => ({
  FieldEditor: () => <div data-testid="field-editor" />,
}));

vi.mock("../DesignPanel", () => ({
  DesignPanel: () => <div data-testid="design-panel" />,
}));

describe("IntakeFormBuilder Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLLMKeys.mockResolvedValue({ data: { data: [] } });
  });

  const openLLMKeyOptions = () => {
    const label = screen.getByText("LLM key");
    fireEvent.mouseDown(within(label.parentElement as HTMLElement).getByRole("combobox"));
    return screen.getByRole("listbox");
  };

  it("renders without crashing for a new form", () => {
    const { container } = renderWithProviders(<IntakeFormBuilder />, {
      route: "/intake-forms/new/edit",
    });

    expect(container).toBeInTheDocument();
  });

  it("lists the keys from the shared query cache without fetching them again", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(["llmKeys", ORG_ID], [openAIKey]);

    renderWithProviders(<IntakeFormBuilder />, { route: "/intake-forms/new/edit", queryClient });

    expect(within(openLLMKeyOptions()).getByText("OpenAI — gpt-4o")).toBeInTheDocument();
    expect(mockGetLLMKeys).not.toHaveBeenCalled();
    expect(CustomAxios.get).not.toHaveBeenCalledWith("/llm-keys");
  });

  it("refreshes the key options when the key queries are invalidated", async () => {
    mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
    const { queryClient } = renderWithProviders(<IntakeFormBuilder />, {
      route: "/intake-forms/new/edit",
    });
    await waitFor(() => expect(mockGetLLMKeys).toHaveBeenCalledTimes(1));

    // A key is added elsewhere (e.g. Settings > LLM keys).
    mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey, anthropicKey] } });
    await act(() => invalidateLLMKeyQueries(queryClient));

    await waitFor(() => {
      expect(within(openLLMKeyOptions()).getByText("Anthropic — claude-x")).toBeInTheDocument();
    });
  });

  describe("a form whose stored LLM key no longer exists", () => {
    const savedForm = (llmKeyId: number) => ({
      data: {
        id: 5,
        name: "Intake",
        entityType: "use_case",
        status: "draft",
        schema: { version: "1.0", fields: [] },
        suggestedQuestionsEnabled: true,
        llmKeyId,
      },
    });

    const renderEditRoute = () =>
      renderWithProviders(
        <Routes>
          <Route path="/intake-forms/:formId/edit" element={<IntakeFormBuilder />} />
        </Routes>,
        { route: "/intake-forms/5/edit" },
      );

    it("treats the form as having no key, so nothing is fetched", async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(8) as never);
      renderEditRoute();

      const panel = await screen.findByTestId("suggested-questions");
      await waitFor(() => expect(mockGetLLMKeys).toHaveBeenCalled());
      expect(panel).toHaveAttribute("data-llm-key", "null");
    });

    it("passes the key through when it is one of the organization's keys", async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(3) as never);
      renderEditRoute();

      await waitFor(() =>
        expect(screen.getByTestId("suggested-questions")).toHaveAttribute("data-llm-key", "3"),
      );
    });
  });
});
