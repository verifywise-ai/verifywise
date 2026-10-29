import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PublicIntakeForm } from "..";
import { LiveCheckHints, fieldToneFor } from "../LiveCheckHints";
import type { LiveCheckHint } from "../../../../domain/types/intakeLiveChecks";
import { RULE_COPY } from "../../../../application/utils/intakeLiveChecks";
import * as liveCheckStrings from "../../../../i18n/modules/intakeLiveChecks";

const repo = vi.hoisted(() => ({
  getPublicFormById: vi.fn(),
  submitPublicFormById: vi.fn(),
  getCaptcha: vi.fn(),
  getPublicForm: vi.fn(),
  submitPublicForm: vi.fn(),
  postLiveChecks: vi.fn(),
  postPrefill: vi.fn(),
  DEFAULT_RATE_LIMIT_PAUSE_SECONDS: 300,
}));
vi.mock("../../../../application/repository/intakeForm.repository", () => repo);

const FIELDS = [
  { id: "name", type: "text", label: "System name", order: 0 },
  { id: "purpose", type: "textarea", label: "Purpose", order: 1 },
  { id: "vendor", type: "text", label: "Vendor", order: 2 },
];

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

const formResponse = (liveChecks: object | undefined, extra: object = {}) => ({
  data: {
    form: {
      id: 1,
      name: "Request",
      description: "",
      slug: "request",
      entityType: "use_case",
      schema: { version: "1.0", fields: FIELDS },
      submitButtonText: "Submit",
      designSettings: null,
    },
    ...(liveChecks ? { liveChecks } : {}),
    ...extra,
  },
});

const suggestion = (questionId: string, value: string) => ({
  questionId,
  value,
  location: "page 2",
  excerpt: `${value} is described here`,
  token: `token-${questionId}`,
});

const renderPage = () =>
  renderWithProviders(
    <Routes>
      <Route path="/:publicId/use-case-form-intake" element={<PublicIntakeForm />} />
      <Route path="/:publicId/use-case-form-intake/success" element={<div>Submitted</div>} />
    </Routes>,
    { route: "/abc/use-case-form-intake" },
  );

const fillContactAndCaptcha = async () => {
  fireEvent.change(await screen.findByLabelText(/Email/), { target: { value: "a@example.com" } });
  await screen.findByText("2 + 2");
  const captcha = document.getElementById("captcha-answer") as HTMLInputElement;
  fireEvent.change(captcha, { target: { value: "4" } });
};

const uploadDocument = async () => {
  const input = (await screen.findByTestId("vendor-prefill-input")) as HTMLInputElement;
  const file = new File(["%PDF-1.4"], "vendor.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
};

const questionBox = (id: string) => document.getElementById(`question-${id}`) as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  repo.getCaptcha.mockResolvedValue({ data: { question: "2 + 2", token: "t" } });
  repo.submitPublicFormById.mockResolvedValue({ data: { submissionId: 1 } });
  repo.postLiveChecks.mockResolvedValue({ aiAvailable: true, hints: [] });
  repo.getPublicFormById.mockResolvedValue(formResponse({ enabled: true, aiAvailable: true }));
});

describe("public form live checks", () => {
  it("shows a rule hint under the field and counts it in the assistant panel", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("System name"), { target: { value: "TBD" } });

    expect(await within(questionBox("name")).findByText("Needs more detail")).toBeInTheDocument();
    const panel = screen.getByRole("complementary", { name: "Intake assistant" });
    // The app sidebar styles every <aside> globally, so the panel must not be one.
    expect(panel.tagName).not.toBe("ASIDE");
    expect(within(panel).getByTestId("assistant-count-vague")).toHaveTextContent("1");
    expect(
      within(panel).getByText("These checks never block submission. Your reviewer sees them too."),
    ).toBeInTheDocument();
  });

  it("lists a possible prohibited practice first under the field", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("Purpose"), {
      target: { value: "scores video interviews for enthusiasm and confidence of job candidates" },
    });
    const hints = await within(questionBox("purpose")).findAllByTestId(/live-check-hint-/);
    expect(hints[0]).toHaveAttribute("data-testid", "live-check-hint-prohibited");
    expect(hints.map((h) => h.getAttribute("data-testid"))).toContain("live-check-hint-regulation");
  });

  it("colors the field red for prohibited and amber for regulation or contradiction", () => {
    const hint = (kind: LiveCheckHint["kind"]) =>
      ({ id: kind, kind, source: "rule", questionId: "q", title: "", text: "" }) as LiveCheckHint;
    expect(fieldToneFor([hint("vague"), hint("prohibited")])).toBe("error");
    expect(fieldToneFor([hint("contradiction")])).toBe("warning");
    expect(fieldToneFor([hint("regulation")])).toBe("warning");
    expect(fieldToneFor([hint("vague")])).toBeUndefined();
  });

  it("dims an AI contradiction under either question once one of them changes", () => {
    const contradiction = {
      id: "c1",
      kind: "contradiction",
      source: "ai",
      questionId: "auto",
      alsoQuestionId: "humans",
      title: "Answers may conflict",
      text: "Check both answers.",
    } as LiveCheckHint;
    // Rendered under "humans" (the other question); only "auto" was edited.
    renderWithProviders(
      <LiveCheckHints hints={[contradiction]} staleQuestionIds={new Set(["auto"])} />,
    );
    expect(screen.getByTestId("live-check-hint-contradiction")).toHaveStyle({ opacity: "0.5" });
  });

  it("shows the AI notice and the prefill card only when AI is available", async () => {
    renderPage();
    expect(await screen.findByTestId("live-checks-ai-notice")).toHaveTextContent(
      "AI can point out vague or conflicting answers when you select Check my answers. Your answers go to AI only when you ask.",
    );
    expect(screen.getByText("Fill from a vendor document")).toBeInTheDocument();
  });

  it("calls AI only from the button, once per set of answers", async () => {
    repo.postLiveChecks.mockResolvedValue({
      aiAvailable: true,
      hints: [
        {
          id: "ai-1",
          kind: "vague",
          source: "ai",
          questionId: "purpose",
          title: "Purpose is unclear",
          text: "Say which tasks it supports.",
        },
      ],
    });
    renderPage();
    const button = await screen.findByTestId("assistant-ai-check");
    expect(button).toBeDisabled();
    expect(screen.getByText("Write a sentence or two first")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Purpose"), {
      target: { value: "Summarises supplier invoices for the finance team" },
    });
    // Typing never calls the model on its own (the hook tests cover this with fake timers).
    expect(repo.postLiveChecks).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("assistant-ai-check"));
    expect(
      await within(questionBox("purpose")).findByText("Purpose is unclear"),
    ).toBeInTheDocument();
    expect(repo.postLiveChecks).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Checked. Edit an answer to check again.")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-ai-check")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Purpose"), {
      target: { value: "Summarises supplier invoices for the finance team weekly" },
    });
    expect(screen.getByTestId("assistant-ai-check")).toHaveTextContent("Check again");
    expect(screen.getByTestId("assistant-ai-check")).toBeEnabled();
  });

  it("runs rules but hides the AI notice and prefill card when the form has no AI", async () => {
    repo.getPublicFormById.mockResolvedValue(formResponse({ enabled: true, aiAvailable: false }));
    renderPage();
    fireEvent.change(await screen.findByLabelText("System name"), { target: { value: "TBD" } });
    expect(await within(questionBox("name")).findByText("Needs more detail")).toBeInTheDocument();
    expect(screen.queryByTestId("live-checks-ai-notice")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vendor-prefill-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("assistant-ai-check")).not.toBeInTheDocument();
  });

  it("shows nothing and calls nothing when live checks are off", async () => {
    repo.getPublicFormById.mockResolvedValue(formResponse({ enabled: false, aiAvailable: false }));
    renderPage();
    fireEvent.change(await screen.findByLabelText("Purpose"), {
      target: { value: "TBD and a long enough answer to qualify for checks" },
    });
    await new Promise((r) => setTimeout(r, 2200));
    expect(screen.queryByTestId("intake-assistant-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("live-checks-ai-notice")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vendor-prefill-card")).not.toBeInTheDocument();
    expect(repo.postLiveChecks).not.toHaveBeenCalled();
  });

  it("fills empty questions from a vendor document and lets the submitter confirm", async () => {
    repo.postPrefill.mockResolvedValue({
      fileName: "vendor.pdf",
      suggestions: [suggestion("vendor", "Acme Corp"), suggestion("name", "Other name")],
    });
    renderPage();
    fireEvent.change(await screen.findByLabelText("System name"), {
      target: { value: "Hiring helper" },
    });
    await uploadDocument();

    await waitFor(() => expect(screen.getByLabelText("Vendor")).toHaveValue("Acme Corp"));
    // A question that already had an answer is not changed.
    expect(screen.getByLabelText("System name")).toHaveValue("Hiring helper");
    expect(screen.queryByTestId("prefill-line-name")).not.toBeInTheDocument();

    const line = screen.getByTestId("prefill-line-vendor");
    expect(within(line).getByText("AI-suggested")).toBeInTheDocument();
    expect(within(line).getByText("vendor.pdf")).toBeInTheDocument();
    expect(within(line).getByText("page 2")).toBeInTheDocument();
    fireEvent.click(within(line).getByRole("button", { name: "Confirm" }));
    expect(await within(line).findByText("Confirmed by submitter")).toBeInTheDocument();
  });

  it("counts unconfirmed suggestions in the panel and drops the count on confirm", async () => {
    repo.postPrefill.mockResolvedValue({
      fileName: "vendor.pdf",
      suggestions: [suggestion("vendor", "Acme Corp"), suggestion("purpose", "Screens invoices")],
    });
    renderPage();
    await uploadDocument();

    const count = await screen.findByTestId("assistant-unconfirmed");
    expect(count).toHaveTextContent(
      "2 answers were read from the vendor document. Confirm before submitting.",
    );
    fireEvent.click(
      within(screen.getByTestId("prefill-line-vendor")).getByRole("button", { name: "Confirm" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("assistant-unconfirmed")).toHaveTextContent(
        "1 answer was read from the vendor document. Confirm before submitting.",
      ),
    );
  });

  it("drops the prefill line of an edited answer and leaves it out of the submit", async () => {
    repo.postPrefill.mockResolvedValue({
      fileName: "vendor.pdf",
      suggestions: [suggestion("vendor", "Acme Corp"), suggestion("purpose", "Screens invoices")],
    });
    renderPage();
    await uploadDocument();
    await screen.findByTestId("prefill-line-vendor");

    fireEvent.change(screen.getByLabelText("Vendor"), { target: { value: "Acme Ltd" } });
    await waitFor(() =>
      expect(screen.queryByTestId("prefill-line-vendor")).not.toBeInTheDocument(),
    );

    await fillContactAndCaptcha();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(repo.submitPublicFormById).toHaveBeenCalledTimes(1));
    expect(repo.submitPublicFormById.mock.calls[0][1].prefill).toEqual({
      purpose: { token: "token-purpose", confirmed: false },
    });
  });

  it("submits once with a live check still pending and a failed prefill", async () => {
    repo.postLiveChecks.mockReturnValue(new Promise(() => {}));
    repo.postPrefill.mockRejectedValue(
      new Error("We couldn't read answers from this document. You can fill in the form as usual."),
    );
    renderPage();
    fireEvent.change(await screen.findByLabelText("Purpose"), {
      target: { value: "Summarises supplier invoices for the finance team" },
    });
    fireEvent.click(screen.getByTestId("assistant-ai-check"));
    await waitFor(() => expect(repo.postLiveChecks).toHaveBeenCalled());
    await uploadDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't read answers from this document.",
    );

    await fillContactAndCaptcha();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(repo.submitPublicFormById).toHaveBeenCalledTimes(1));
    expect(repo.submitPublicFormById.mock.calls[0][1].prefill).toBeUndefined();
  });

  it("shows no hints on the EU AI Act risk step", async () => {
    repo.getPublicFormById.mockResolvedValue(
      formResponse(
        { enabled: true, aiAvailable: true },
        { euAiActRiskStep: { questionnaire: QUESTIONNAIRE } },
      ),
    );
    renderPage();
    expect(await screen.findByRole("heading", { name: "Risk classification" })).toBeInTheDocument();
    expect(screen.queryByTestId("intake-assistant-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("live-checks-ai-notice")).not.toBeInTheDocument();
  });

  it("has de, fr and es copy for every rule hint string", () => {
    const strings = new Set<string>();
    for (const copy of Object.values(RULE_COPY)) {
      strings.add(copy.title);
      strings.add(copy.text);
      if (copy.ref) strings.add(copy.ref);
    }
    for (const lang of ["de", "fr", "es"] as const) {
      const missing = [...strings].filter((s) => !liveCheckStrings[lang][s]);
      expect({ lang, missing }).toEqual({ lang, missing: [] });
    }
  });
});
