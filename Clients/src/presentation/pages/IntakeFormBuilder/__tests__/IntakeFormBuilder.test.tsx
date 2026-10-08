import { screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { Routes, Route } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { invalidateLLMKeyQueries } from "../../../../application/hooks/useLLMKeys";
import CustomAxios from "../../../../infrastructure/api/customAxios";
import { IntakeFormBuilder } from "../index";
import {
  getIntakeForm,
  updateIntakeForm,
} from "../../../../application/repository/intakeForm.repository";

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
    // Reset implementations too, so a per-test form or key list never leaks.
    mockGetLLMKeys.mockReset().mockResolvedValue({ data: { data: [] } });
    vi.mocked(getIntakeForm)
      .mockReset()
      .mockResolvedValue({ data: null } as never);
    vi.mocked(updateIntakeForm)
      .mockReset()
      .mockResolvedValue({ data: {} } as never);
  });

  const llmKeyPicker = () =>
    within(screen.getByText("LLM key").parentElement as HTMLElement).getByRole("combobox");

  const openLLMKeyOptions = () => {
    fireEvent.mouseDown(llmKeyPicker());
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

  describe("a form's stored LLM key", () => {
    const savedForm = (llmKeyId: number | null, suggestedQuestionsEnabled = true) => ({
      data: {
        id: 5,
        name: "Intake",
        entityType: "use_case",
        status: "draft",
        schema: { version: "1.0", fields: [] },
        suggestedQuestionsEnabled,
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

    const AI_SCORING = /Submissions will be scored using AI-enhanced risk analysis/;
    const toggle = () => screen.queryByText("Suggested questions");
    // The breadcrumb shows the saved form name once it has loaded.
    const formLoaded = () => screen.findAllByText("Intake");
    // Flip the suggested questions toggle to make the form dirty, then save.
    const savedLlmKeyId = async () => {
      fireEvent.click(toggle()!);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(updateIntakeForm).toHaveBeenCalled());
      return (vi.mocked(updateIntakeForm).mock.calls[0][1] as { llmKeyId: unknown }).llmKeyId;
    };

    it("is treated as no key once the key list has loaded without it", async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(8) as never);
      renderEditRoute();
      await formLoaded();

      // Wait for the key list itself before judging the stored key.
      expect(await within(openLLMKeyOptions()).findByText("OpenAI — gpt-4o")).toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });

      expect(screen.getByTestId("suggested-questions")).toHaveAttribute("data-llm-key", "null");
      expect(screen.queryByText(AI_SCORING)).not.toBeInTheDocument();
      expect(await savedLlmKeyId()).toBeNull();
    });

    it("passes the key through when it is one of the organization's keys", async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(3) as never);
      renderEditRoute();

      await waitFor(() =>
        expect(screen.getByTestId("suggested-questions")).toHaveAttribute("data-llm-key", "3"),
      );
    });

    it("still counts while the key list is loading", async () => {
      mockGetLLMKeys.mockReturnValue(new Promise(() => {}));
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(3, false) as never);
      renderEditRoute();
      await formLoaded();

      expect(mockGetLLMKeys).toHaveBeenCalled();
      expect(llmKeyPicker()).toHaveTextContent("Saved key");
      expect(screen.getByText(AI_SCORING)).toBeInTheDocument();
      expect(toggle()).toBeInTheDocument();
      expect(await savedLlmKeyId()).toBe(3);
    });

    it("still counts when the key list fails to load", async () => {
      mockGetLLMKeys.mockRejectedValue(new Error("network"));
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(3, false) as never);
      const { queryClient } = renderEditRoute();
      await formLoaded();
      await waitFor(() =>
        expect(queryClient.getQueryState(["llmKeys", ORG_ID])?.status).toBe("error"),
      );

      expect(llmKeyPicker()).toHaveTextContent("Saved key");
      expect(screen.getByText(AI_SCORING)).toBeInTheDocument();
      expect(toggle()).toBeInTheDocument();
      expect(await savedLlmKeyId()).toBe(3);
    });

    it("shows the suggested questions toggle when the panel is on without a key", async () => {
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(null, true) as never);
      renderEditRoute();
      await formLoaded();

      expect(screen.getByTestId("suggested-questions")).toBeInTheDocument();
      expect(toggle()).toBeInTheDocument();
    });

    it("hides the toggle when there is no key and the panel is off", async () => {
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(null, false) as never);
      renderEditRoute();
      await formLoaded();
      await waitFor(() => expect(mockGetLLMKeys).toHaveBeenCalled());

      expect(toggle()).not.toBeInTheDocument();
    });
  });
});
