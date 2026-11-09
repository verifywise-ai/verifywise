import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { IntakeFormBuilder } from "../index";
import {
  createIntakeForm,
  getIntakeForm,
  getIntakeFormReviewTime,
  updateIntakeForm,
  updateIntakeFormReviewTime,
} from "../../../../application/repository/intakeForm.repository";

vi.mock("../../../../application/hooks/useAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../application/hooks/useAuth")>();
  return { useAuth: () => ({ ...actual.useAuth(), organizationId: 7 }) };
});

vi.mock("../../../../application/repository/llmKeys.repository", () => ({
  getLLMKeys: vi.fn().mockResolvedValue({ data: { data: [] } }),
}));

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getIntakeForm: vi.fn(),
  createIntakeForm: vi.fn(),
  updateIntakeForm: vi.fn(),
  getEligibleReviewers: vi.fn().mockResolvedValue([]),
  getIntakeFormReviewTime: vi.fn(),
  updateIntakeFormReviewTime: vi.fn(),
  IntakeFormStatus: { DRAFT: "draft", ACTIVE: "active", ARCHIVED: "archived" },
  IntakeEntityType: { USE_CASE: "use_case", MODEL: "model" },
}));

vi.mock("../../../../infrastructure/api/customAxios", () => ({
  __esModule: true,
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Publishing checks entity mappings; these tests are about the review time.
vi.mock("../types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../types")>();
  return {
    ...actual,
    analyzeMappingCoverage: (...args: Parameters<typeof actual.analyzeMappingCoverage>) => ({
      ...actual.analyzeMappingCoverage(...args),
      missingRequired: [],
      typeMismatches: [],
      missingOptional: [],
    }),
  };
});

vi.mock("../FieldPalette", () => ({
  FieldPalette: () => <div data-testid="field-palette" />,
  SuggestedQuestionsPanel: () => <div data-testid="suggested-questions" />,
  SuggestedQuestionsPanelHandle: {},
}));
vi.mock("../FormCanvas", () => ({
  FormCanvas: ({ onNameChange }: { onNameChange?: (name: string) => void }) => (
    <input aria-label="Form name" onChange={(e) => onNameChange?.(e.target.value)} />
  ),
  FormCanvasHandle: {},
}));
vi.mock("../FieldEditor", () => ({ FieldEditor: () => <div data-testid="field-editor" /> }));
vi.mock("../DesignPanel", () => ({ DesignPanel: () => <div data-testid="design-panel" /> }));

const SAVED_FORM = {
  data: {
    id: 5,
    name: "Intake",
    entityType: "use_case",
    status: "draft",
    schema: { version: "1.0", fields: [{ id: "f1", type: "text", label: "Purpose", order: 0 }] },
    llmKeyId: null,
  },
};

const renderRoute = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/intake-forms/:formId/edit" element={<IntakeFormBuilder />} />
    </Routes>,
    { route },
  );

const reviewTime = () => screen.getByLabelText("Review time (business days)");
const formLoaded = () => screen.findAllByText("Intake");

describe("IntakeFormBuilder review time", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIntakeForm).mockResolvedValue(SAVED_FORM as never);
    vi.mocked(getIntakeFormReviewTime).mockResolvedValue(3);
    vi.mocked(updateIntakeForm).mockImplementation(
      (id: number, data: object) => Promise.resolve({ data: { ...data, id } }) as never,
    );
    vi.mocked(createIntakeForm).mockImplementation(
      (data: object) => Promise.resolve({ data: { ...data, id: 77 } }) as never,
    );
    vi.mocked(updateIntakeFormReviewTime).mockImplementation((_id: number, days: number) =>
      Promise.resolve(days),
    );
  });

  it("keeps the field empty and disabled until the stored value has loaded", async () => {
    let resolve: (days: number) => void = () => {};
    vi.mocked(getIntakeFormReviewTime).mockImplementation(
      () => new Promise<number>((r) => (resolve = r)),
    );
    renderRoute("/intake-forms/5/edit");
    await formLoaded();
    expect(reviewTime()).toBeDisabled();
    expect(reviewTime()).toHaveValue(null);

    resolve(9);
    await waitFor(() => expect(reviewTime()).toHaveValue(9));
    expect(reviewTime()).toBeEnabled();
  });

  it("shows an inline error and never sends the default when the load fails", async () => {
    vi.mocked(getIntakeFormReviewTime).mockRejectedValue(new Error("down"));
    renderRoute("/intake-forms/5/edit");
    await formLoaded();
    expect(
      await screen.findByText("Could not load the review time. Reload the page to change it."),
    ).toBeInTheDocument();
    expect(reviewTime()).toBeDisabled();
    expect(reviewTime()).toHaveValue(null);

    fireEvent.click(await screen.findByText("Check answers while the submitter types"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateIntakeForm).toHaveBeenCalled());
    expect(updateIntakeFormReviewTime).not.toHaveBeenCalled();
  });

  it("keeps the form unsaved and points at Save when the review time is not saved", async () => {
    vi.mocked(updateIntakeFormReviewTime).mockRejectedValue(new Error("down"));
    renderRoute("/intake-forms/5/edit");
    await formLoaded();
    await waitFor(() => expect(reviewTime()).toBeEnabled());

    fireEvent.change(reviewTime(), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(
        "The form was saved, but the review time was not. Click Save to try again.",
      ),
    ).toBeInTheDocument();
    expect(updateIntakeForm).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    // Saving again retries it.
    vi.mocked(updateIntakeFormReviewTime).mockResolvedValue(4);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateIntakeFormReviewTime).toHaveBeenCalledTimes(2));
  });

  it("publishes an existing form only after its review time is saved", async () => {
    renderRoute("/intake-forms/5/edit");
    await formLoaded();
    await waitFor(() => expect(reviewTime()).toBeEnabled());

    fireEvent.change(reviewTime(), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(updateIntakeForm).toHaveBeenCalled());
    expect(updateIntakeFormReviewTime).toHaveBeenCalledWith(5, 6);
    expect(vi.mocked(updateIntakeFormReviewTime).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(updateIntakeForm).mock.invocationCallOrder[0],
    );
  });

  it("does not publish an existing form when its review time is not saved", async () => {
    vi.mocked(updateIntakeFormReviewTime).mockRejectedValue(new Error("down"));
    renderRoute("/intake-forms/5/edit");
    await formLoaded();
    await waitFor(() => expect(reviewTime()).toBeEnabled());

    fireEvent.change(reviewTime(), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(
      await screen.findByText(
        "The review time could not be saved, so the form was not published. Click Publish to try again.",
      ),
    ).toBeInTheDocument();
    expect(updateIntakeForm).not.toHaveBeenCalled();
  });

  describe("publishing a new form", () => {
    const fillNewForm = (days: string) => {
      renderRoute("/intake-forms/new/edit");
      fireEvent.change(screen.getByLabelText("Form name"), { target: { value: "New intake" } });
      fireEvent.change(reviewTime(), { target: { value: days } });
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    };

    it("creates it as a draft, saves the review time, then makes it active", async () => {
      fillNewForm("8");
      await waitFor(() => expect(updateIntakeForm).toHaveBeenCalled());

      expect(vi.mocked(createIntakeForm).mock.calls[0][0]).toMatchObject({ status: "draft" });
      expect(updateIntakeFormReviewTime).toHaveBeenCalledWith(77, 8);
      expect(vi.mocked(updateIntakeForm).mock.calls[0]).toEqual([
        77,
        expect.objectContaining({ status: "active" }),
      ]);
      const order = [
        vi.mocked(createIntakeForm).mock.invocationCallOrder[0],
        vi.mocked(updateIntakeFormReviewTime).mock.invocationCallOrder[0],
        vi.mocked(updateIntakeForm).mock.invocationCallOrder[0],
      ];
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(await screen.findByText("Form published successfully")).toBeInTheDocument();
    });

    it("leaves it a draft and says so when the review time is not saved", async () => {
      vi.mocked(updateIntakeFormReviewTime).mockRejectedValue(new Error("down"));
      fillNewForm("8");
      expect(
        await screen.findByText(
          "The form was saved as a draft, but the review time was not. Click Publish to try again.",
        ),
      ).toBeInTheDocument();
      expect(updateIntakeForm).not.toHaveBeenCalled();
    });

    it("creates it active at once with the default review time", async () => {
      fillNewForm("3");
      expect(await screen.findByText("Form published successfully")).toBeInTheDocument();
      expect(vi.mocked(createIntakeForm).mock.calls[0][0]).toMatchObject({ status: "active" });
      expect(updateIntakeFormReviewTime).not.toHaveBeenCalled();
      expect(updateIntakeForm).not.toHaveBeenCalled();
    });
  });
});
