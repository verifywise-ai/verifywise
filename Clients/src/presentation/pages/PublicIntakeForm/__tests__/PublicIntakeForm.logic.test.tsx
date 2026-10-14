import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PublicIntakeForm } from "..";

const repo = vi.hoisted(() => ({
  getPublicFormById: vi.fn(),
  submitPublicFormById: vi.fn(),
  getCaptcha: vi.fn(),
  getPublicForm: vi.fn(),
  submitPublicForm: vi.fn(),
}));
vi.mock("../../../../application/repository/intakeForm.repository", () => repo);

const FIELDS = [
  { id: "personal", type: "checkbox", label: "Uses personal data", order: 0 },
  {
    id: "details",
    type: "textarea",
    label: "Describe the data",
    order: 1,
    validation: { required: true },
    visibility: { match: "all", conditions: [{ fieldId: "personal", operator: "is_checked" }] },
  },
  { id: "cost", type: "number", label: "Monthly cost", order: 2 },
  {
    id: "total",
    type: "calculated",
    label: "Annual cost",
    order: 3,
    formula: "{cost} * 12",
    decimals: 2,
    prefix: "€",
  },
];

const formResponse = (extra: object = {}) => ({
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

const fillContactAndCaptcha = async () => {
  fireEvent.change(await screen.findByLabelText(/Email/), { target: { value: "a@example.com" } });
  await screen.findByText("2 + 2");
  const captcha = document.getElementById("captcha-answer") as HTMLInputElement;
  fireEvent.change(captcha, { target: { value: "4" } });
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.getCaptcha.mockResolvedValue({ data: { question: "2 + 2", token: "t" } });
  repo.submitPublicFormById.mockResolvedValue({ data: { submissionId: 1 } });
  repo.getPublicFormById.mockResolvedValue(formResponse());
});

describe("public form logic", () => {
  it("hides a conditional field until its condition holds", async () => {
    renderPage();
    await screen.findByLabelText("Uses personal data");
    expect(screen.queryByLabelText(/Describe the data/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Uses personal data"));
    expect(await screen.findByLabelText(/Describe the data/)).toBeInTheDocument();
  });

  it("shows the calculated value live, with a hint while an input is missing", async () => {
    renderPage();
    expect(await screen.findByText("Fill in Monthly cost to calculate")).toBeInTheDocument();
    expect(screen.getByTestId("calculated-total")).toHaveTextContent("—");
    fireEvent.change(screen.getByLabelText("Monthly cost"), { target: { value: "1200" } });
    await waitFor(() =>
      expect(screen.getByTestId("calculated-total")).toHaveTextContent("€ 14,400.00"),
    );
    expect(screen.queryByText("Fill in Monthly cost to calculate")).not.toBeInTheDocument();
  });

  it("submits without hidden answers and ignores typed calculated values", async () => {
    renderPage();
    fireEvent.click(await screen.findByLabelText("Uses personal data"));
    fireEvent.change(await screen.findByLabelText(/Describe the data/), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByLabelText("Uses personal data")); // hides the required field again
    fireEvent.change(screen.getByLabelText("Monthly cost"), { target: { value: "10" } });
    await fillContactAndCaptcha();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(repo.submitPublicFormById).toHaveBeenCalled());
    expect({ ...repo.submitPublicFormById.mock.calls[0][1].formData }).toEqual({
      personal: false,
      cost: "10",
      total: 120,
    });
  });

  it("submits right after a required field is hidden, without waiting for an animation", async () => {
    renderPage();
    await fillContactAndCaptcha();
    fireEvent.click(screen.getByLabelText("Uses personal data"));
    await screen.findByLabelText(/Describe the data/);
    fireEvent.click(screen.getByLabelText("Uses personal data"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(repo.submitPublicFormById).toHaveBeenCalled());
    expect(repo.submitPublicFormById.mock.calls[0][1].formData).not.toHaveProperty("details");
  });

  it("treats a required answer of only spaces as missing, as the server does", async () => {
    renderPage();
    await fillContactAndCaptcha();
    fireEvent.click(screen.getByLabelText("Uses personal data"));
    fireEvent.change(await screen.findByLabelText(/Describe the data/), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("This field is required")).toBeInTheDocument();
    expect(repo.submitPublicFormById).not.toHaveBeenCalled();
  });

  it("does not submit pre-filled answers to hidden fields", async () => {
    repo.getPublicFormById.mockResolvedValue(
      formResponse({ previousData: { personal: false, details: "old answer", cost: "1" } }),
    );
    renderPage();
    await screen.findByLabelText("Uses personal data");
    expect(screen.queryByLabelText(/Describe the data/)).not.toBeInTheDocument();
    await fillContactAndCaptcha();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(repo.submitPublicFormById).toHaveBeenCalled());
    expect(repo.submitPublicFormById.mock.calls[0][1].formData).not.toHaveProperty("details");
  });
});
