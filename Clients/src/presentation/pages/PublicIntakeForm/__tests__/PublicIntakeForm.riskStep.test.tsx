import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PublicIntakeForm } from "..";
import CustomException from "../../../../infrastructure/exceptions/customeException";

const repo = vi.hoisted(() => ({
  getPublicFormById: vi.fn(),
  submitPublicFormById: vi.fn(),
  getCaptcha: vi.fn(),
  getPublicForm: vi.fn(),
  submitPublicForm: vi.fn(),
}));
vi.mock("../../../../application/repository/intakeForm.repository", () => repo);

const QUESTIONNAIRE = {
  version: 2,
  questions: [
    {
      id: "scope",
      text: "Scope?",
      articleRef: "Article 2(6) and 2(8)",
      inputType: "single_select",
      options: [
        { value: "research_only", label: "Research" },
        { value: "in_scope", label: "In scope" },
      ],
    },
  ],
};

const formResponse = (extra: object = {}) => ({
  data: {
    form: {
      id: 1,
      name: "Request",
      description: "",
      slug: "request",
      entityType: "use_case",
      schema: { version: "1.0", fields: [] },
      submitButtonText: "Submit",
      designSettings: null,
    },
    ...extra,
  },
});

const renderPage = () =>
  renderWithProviders(
    <Routes>
      <Route path="/:publicId/use-case-form-intake" element={<PublicIntakeForm />} />
      <Route path="/:publicId/use-case-form-intake/success" element={<div>Submitted</div>} />
    </Routes>,
    { route: "/abc/use-case-form-intake" },
  );

const fillAndSubmit = async () => {
  fireEvent.change(await screen.findByLabelText(/Email/), {
    target: { value: "a@example.com" },
  });
  await screen.findByText("2 + 2");
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.getCaptcha.mockResolvedValue({ data: { question: "2 + 2", token: "t" } });
  repo.submitPublicFormById.mockResolvedValue({
    data: { submissionId: 1, resubmissionToken: "r", message: "ok" },
  });
});

describe("PublicIntakeForm risk step", () => {
  it("shows the risk step first when the form has one, and the form questions after Continue", async () => {
    repo.getPublicFormById.mockResolvedValue(
      formResponse({ euAiActRiskStep: { questionnaire: QUESTIONNAIRE } }),
    );
    renderPage();

    expect(await screen.findByRole("heading", { name: "Risk classification" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Email/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Research"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Risk classification" })).not.toBeInTheDocument();
  });

  it("keeps the answers when going back from the form to the risk step", async () => {
    repo.getPublicFormById.mockResolvedValue(
      formResponse({ euAiActRiskStep: { questionnaire: QUESTIONNAIRE } }),
    );
    renderPage();

    fireEvent.click(await screen.findByLabelText("Research"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Back to risk classification" }));

    expect(await screen.findByLabelText("Research")).toBeChecked();
  });

  it("submits the pruned risk answers with the form", async () => {
    repo.getPublicFormById.mockResolvedValue(
      formResponse({ euAiActRiskStep: { questionnaire: QUESTIONNAIRE } }),
    );
    renderPage();

    fireEvent.click(await screen.findByLabelText("Research"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await fillAndSubmit();

    await waitFor(() => expect(repo.submitPublicFormById).toHaveBeenCalled());
    expect(repo.submitPublicFormById.mock.calls[0][1]).toMatchObject({
      euAiActRiskAnswers: { scope: "research_only" },
    });
  });

  it("pre-fills risk answers on a resubmission", async () => {
    repo.getPublicFormById.mockResolvedValue(
      formResponse({
        euAiActRiskStep: { questionnaire: QUESTIONNAIRE },
        previousRiskAnswers: { scope: "in_scope" },
      }),
    );
    renderPage();

    expect(await screen.findByLabelText("In scope")).toBeChecked();
  });

  it("returns to the risk step and shows the server message when the server rejects the answers", async () => {
    repo.getPublicFormById.mockResolvedValue(
      formResponse({ euAiActRiskStep: { questionnaire: QUESTIONNAIRE } }),
    );
    repo.submitPublicFormById.mockRejectedValue(
      // Same shape apiServices.handleError builds from the server's 400 envelope.
      new CustomException("Risk classification answers are invalid", 400, {
        message: "Bad Request",
        data: {
          message: "Risk classification answers are invalid",
          errors: [{ id: "scope" }],
          step: "eu_ai_act_risk",
        },
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage();

    fireEvent.click(await screen.findByLabelText("Research"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await fillAndSubmit();

    expect(await screen.findByRole("heading", { name: "Risk classification" })).toBeInTheDocument();
    expect(screen.getByText("Risk classification answers are invalid")).toBeInTheDocument();
  });

  it("keeps the form when a 400 is a form validation error, not a risk step rejection", async () => {
    repo.getPublicFormById.mockResolvedValue(
      formResponse({ euAiActRiskStep: { questionnaire: QUESTIONNAIRE } }),
    );
    repo.submitPublicFormById.mockRejectedValue(
      new CustomException("Form validation failed", 400, {
        message: "Bad Request",
        data: { message: "Form validation failed", errors: [{ field: "name" }] },
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage();

    fireEvent.click(await screen.findByLabelText("Research"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await fillAndSubmit();

    expect(await screen.findByText("Failed to submit form. Please try again.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Risk classification" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
  });

  it("a form without the step renders exactly as before", async () => {
    repo.getPublicFormById.mockResolvedValue(formResponse());
    renderPage();

    expect(await screen.findByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Risk classification" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back to risk classification" }),
    ).not.toBeInTheDocument();

    await fillAndSubmit();
    await waitFor(() => expect(repo.submitPublicFormById).toHaveBeenCalled());
    expect(repo.submitPublicFormById.mock.calls[0][1]).not.toHaveProperty("euAiActRiskAnswers");
  });
});
