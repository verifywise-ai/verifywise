import { screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { Routes, Route } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { invalidateLLMKeyQueries } from "../../../../application/hooks/useLLMKeys";
import CustomAxios from "../../../../infrastructure/api/customAxios";
import { IntakeFormBuilder } from "../index";
import CustomException from "../../../../infrastructure/exceptions/customeException";
import {
  getIntakeForm,
  getIntakeFormReviewTime,
  updateIntakeForm,
  updateIntakeFormReviewTime,
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
  getEligibleReviewers: vi.fn().mockResolvedValue([]),
  getIntakeFormReviewTime: vi.fn().mockResolvedValue(3),
  updateIntakeFormReviewTime: vi
    .fn()
    .mockImplementation((_id: number, days: number) => Promise.resolve(days)),
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
    vi.mocked(getIntakeFormReviewTime).mockReset().mockResolvedValue(3);
    vi.mocked(updateIntakeFormReviewTime)
      .mockReset()
      .mockImplementation((_id: number, days: number) => Promise.resolve(days));
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

  it("shows the logic overview from the header toggle", () => {
    renderWithProviders(<IntakeFormBuilder />, { route: "/intake-forms/new/edit" });
    expect(screen.queryByTestId("logic-overview-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Logic" }));
    expect(screen.getByTestId("logic-overview-panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Logic" })).toHaveAttribute("aria-pressed", "true");
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

    // Only shown with a key; without one the helper says reviewers see rules only.
    const AI_SCORING = /You can also generate suggested questions and field guidance text with AI/;
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

    it("saves live checks off when the submitter-typing toggle is turned off", async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(3) as never);
      renderEditRoute();
      await formLoaded();

      fireEvent.click(await screen.findByText("Check answers while the submitter types"));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(updateIntakeForm).toHaveBeenCalled());
      expect(
        (vi.mocked(updateIntakeForm).mock.calls[0][1] as { liveChecksEnabled: unknown })
          .liveChecksEnabled,
      ).toBe(false);
    });

    // The reply carries the form as it was sent; an edit made while the
    // request ran must survive it and keep the form unsaved.
    it("keeps an edit made while a save is running", async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(3) as never);
      let reply: (value: unknown) => void = () => {};
      vi.mocked(updateIntakeForm).mockImplementationOnce(
        () => new Promise((resolve) => (reply = resolve)) as never,
      );
      renderEditRoute();
      await formLoaded();

      const liveChecks = await screen.findByText("Check answers while the submitter types");
      fireEvent.click(liveChecks);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(updateIntakeForm).toHaveBeenCalledTimes(1));
      // Turned back on while the save of "off" is still running.
      fireEvent.click(liveChecks);
      await act(async () => {
        reply({ data: { ...savedForm(3).data, liveChecksEnabled: false, publicId: "abc" } });
      });

      const save = screen.getByRole("button", { name: "Save" });
      await waitFor(() => expect(save).toBeEnabled());
      expect(screen.getByText("Unsaved")).toBeInTheDocument();
      fireEvent.click(save);
      await waitFor(() => expect(updateIntakeForm).toHaveBeenCalledTimes(2));
      const second = vi.mocked(updateIntakeForm).mock.calls[1][1] as {
        liveChecksEnabled: unknown;
        publicId: unknown;
      };
      expect(second.liveChecksEnabled).toBe(true);
      expect(second.publicId).toBe("abc");
    });

    it("marks the form saved when nothing changed during the save", async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(3) as never);
      vi.mocked(updateIntakeForm).mockResolvedValueOnce({
        data: { ...savedForm(3).data, liveChecksEnabled: false },
      } as never);
      renderEditRoute();
      await formLoaded();

      fireEvent.click(await screen.findByText("Check answers while the submitter types"));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(updateIntakeForm).toHaveBeenCalledTimes(1));
      // "Unsaved" follows isDirty alone; Save is also disabled while saving.
      await waitFor(() => expect(screen.queryByText("Unsaved")).not.toBeInTheDocument());
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
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

    it("blocks saving a live form while a field has a logic problem", async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      vi.mocked(getIntakeForm).mockResolvedValue({
        data: {
          id: 5,
          name: "Intake",
          entityType: "use_case",
          status: "active",
          suggestedQuestionsEnabled: true,
          llmKeyId: 3,
          schema: {
            version: "1.0",
            fields: [
              { id: "total", type: "calculated", label: "Total", order: 0, formula: "{total} + 1" },
              { id: "later", type: "number", label: "Later", order: 1 },
            ],
          },
        },
      } as never);
      renderEditRoute();
      await formLoaded();
      fireEvent.click(toggle()!);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(
        await screen.findByText("Fix the highlighted fields before saving"),
      ).toBeInTheDocument();
      expect(updateIntakeForm).not.toHaveBeenCalled();
    });

    it("saves a draft with a logic problem and says what is left", async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      vi.mocked(getIntakeForm).mockResolvedValue({
        data: {
          id: 5,
          name: "Intake",
          entityType: "use_case",
          status: "draft",
          suggestedQuestionsEnabled: true,
          llmKeyId: 3,
          schema: {
            version: "1.0",
            fields: [
              { id: "total", type: "calculated", label: "Total", order: 0, formula: "{total} + 1" },
              { id: "later", type: "number", label: "Later", order: 1 },
            ],
          },
        },
      } as never);
      renderEditRoute();
      await formLoaded();
      fireEvent.click(toggle()!);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(
        await screen.findByText("Draft saved. Fix the highlighted fields before publishing"),
      ).toBeInTheDocument();
      expect(updateIntakeForm).toHaveBeenCalled();
    });

    it("blocks publishing while a field has a logic problem", async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      vi.mocked(getIntakeForm).mockResolvedValue({
        data: {
          id: 5,
          name: "Intake",
          entityType: "use_case",
          status: "draft",
          suggestedQuestionsEnabled: true,
          llmKeyId: 3,
          schema: {
            version: "1.0",
            fields: [
              { id: "total", type: "calculated", label: "Total", order: 0, formula: "{total} + 1" },
              { id: "later", type: "number", label: "Later", order: 1 },
            ],
          },
        },
      } as never);
      renderEditRoute();
      await formLoaded();
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
      expect(
        await screen.findByText("Fix the highlighted fields before publishing"),
      ).toBeInTheDocument();
      expect(updateIntakeForm).not.toHaveBeenCalled();
    });

    it("shows the server's reason when the save is rejected with a 4xx", async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(3) as never);
      vi.mocked(updateIntakeForm).mockRejectedValue(
        new CustomException("LLM key not found", 400, {
          message: "Bad Request",
          data: "LLM key not found",
        }) as never,
      );
      renderEditRoute();
      await formLoaded();
      await savedLlmKeyId();

      expect(await screen.findByText("LLM key not found")).toBeInTheDocument();
      expect(screen.queryByText("Failed to save form")).not.toBeInTheDocument();
    });

    it("refetches the key list when a save with a key is rejected, so the key falls back to none", async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(3) as never);
      vi.mocked(updateIntakeForm).mockRejectedValue(
        new CustomException("LLM key not found", 400, {
          message: "Bad Request",
          data: "LLM key not found",
        }) as never,
      );
      renderEditRoute();
      await formLoaded();
      await waitFor(() => expect(mockGetLLMKeys).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(screen.getByTestId("suggested-questions")).toHaveAttribute("data-llm-key", "3"),
      );

      // The key was deleted elsewhere: the next key list no longer has it.
      mockGetLLMKeys.mockResolvedValue({ data: { data: [] } });
      await savedLlmKeyId();

      await waitFor(() => expect(mockGetLLMKeys).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(llmKeyPicker()).not.toHaveTextContent("Saved key"));

      // The next attempt no longer sends the deleted key.
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(updateIntakeForm).toHaveBeenCalledTimes(2));
      expect(
        (vi.mocked(updateIntakeForm).mock.calls[1][1] as { llmKeyId: unknown }).llmKeyId,
      ).toBeNull();
    });

    it("does not refetch the key list when a save without a key is rejected", async () => {
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(null, true) as never);
      vi.mocked(updateIntakeForm).mockRejectedValue(
        new CustomException("Invalid entity type", 400, {
          message: "Bad Request",
          data: "Invalid entity type",
        }) as never,
      );
      renderEditRoute();
      await formLoaded();
      await waitFor(() => expect(mockGetLLMKeys).toHaveBeenCalledTimes(1));
      await savedLlmKeyId();

      expect(await screen.findByText("Invalid entity type")).toBeInTheDocument();
      expect(mockGetLLMKeys).toHaveBeenCalledTimes(1);
    });

    it("keeps the generic message when the save fails with a 5xx", async () => {
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(null, true) as never);
      vi.mocked(updateIntakeForm).mockRejectedValue(
        new CustomException("relation does not exist", 500, {
          message: "Internal Server Error",
          error: "relation does not exist",
        }) as never,
      );
      renderEditRoute();
      await formLoaded();
      await savedLlmKeyId();

      expect(await screen.findByText("Failed to save form")).toBeInTheDocument();
      expect(screen.queryByText("relation does not exist")).not.toBeInTheDocument();
    });

    it("shows the suggested questions toggle when the panel is on without a key", async () => {
      vi.mocked(getIntakeForm).mockResolvedValue(savedForm(null, true) as never);
      renderEditRoute();
      await formLoaded();

      expect(screen.getByTestId("suggested-questions")).toBeInTheDocument();
      expect(toggle()).toBeInTheDocument();
    });

    describe("review time", () => {
      const reviewTime = () => screen.getByLabelText("Review time (business days)");

      it("shows the stored review time", async () => {
        vi.mocked(getIntakeForm).mockResolvedValue(savedForm(null) as never);
        vi.mocked(getIntakeFormReviewTime).mockResolvedValue(7);
        renderEditRoute();
        await formLoaded();
        await waitFor(() => expect(reviewTime()).toHaveValue(7));
        expect(getIntakeFormReviewTime).toHaveBeenCalledWith(5);
      });

      it("saves a changed review time through its own endpoint, after the form", async () => {
        vi.mocked(getIntakeForm).mockResolvedValue(savedForm(null) as never);
        renderEditRoute();
        await formLoaded();
        await waitFor(() => expect(reviewTime()).toHaveValue(3));

        fireEvent.change(reviewTime(), { target: { value: "10" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(updateIntakeFormReviewTime).toHaveBeenCalledWith(5, 10));
        // The frozen form contract never carries it.
        expect(vi.mocked(updateIntakeForm).mock.calls[0][1]).not.toHaveProperty("reviewDays");
        expect(vi.mocked(updateIntakeForm).mock.invocationCallOrder[0]).toBeLessThan(
          vi.mocked(updateIntakeFormReviewTime).mock.invocationCallOrder[0],
        );
      });

      it("does not send an unchanged review time", async () => {
        vi.mocked(getIntakeForm).mockResolvedValue(savedForm(null) as never);
        renderEditRoute();
        await formLoaded();

        fireEvent.click(await screen.findByText("Check answers while the submitter types"));
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(updateIntakeForm).toHaveBeenCalled());
        expect(updateIntakeFormReviewTime).not.toHaveBeenCalled();
      });

      it("blocks a save while the review time is out of range", async () => {
        vi.mocked(getIntakeForm).mockResolvedValue(savedForm(null) as never);
        renderEditRoute();
        await formLoaded();

        fireEvent.change(reviewTime(), { target: { value: "31" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Fix the review time before saving")).toBeInTheDocument();
        expect(updateIntakeForm).not.toHaveBeenCalled();
      });

      it("says so when the review time could not be saved", async () => {
        vi.mocked(getIntakeForm).mockResolvedValue(savedForm(null) as never);
        vi.mocked(updateIntakeFormReviewTime).mockRejectedValue(new Error("down"));
        renderEditRoute();
        await formLoaded();

        fireEvent.change(reviewTime(), { target: { value: "4" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(
          await screen.findByText(
            "The form was saved, but the review time was not. Try saving again.",
          ),
        ).toBeInTheDocument();
      });
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
