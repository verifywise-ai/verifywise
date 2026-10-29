import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PublicIntakeForm } from "../index";
import { getPublicFormById } from "../../../../application/repository/intakeForm.repository";

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getPublicForm: vi.fn().mockResolvedValue({ data: null }),
  getPublicFormById: vi.fn(),
  submitPublicForm: vi.fn(),
  submitPublicFormById: vi.fn(),
  FormSchema: {},
  IntakeEntityType: { USE_CASE: "use_case", MODEL: "model" },
}));

vi.mock("../FormFieldRenderer", () => ({
  FormFieldRenderer: () => <div data-testid="form-field-renderer" />,
  FormFieldHint: ({ text }: { text?: string }) => (text ? <p>{text}</p> : null),
  FieldLabel: ({ label, htmlFor }: { label: string; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{label}</label>
  ),
}));

vi.mock("../MathCaptcha", () => ({
  MathCaptcha: () => <div data-testid="math-captcha" />,
}));

const mockedGetPublicFormById = vi.mocked(getPublicFormById);

const mockForm = {
  id: 1,
  name: "Vendor intake",
  description: "Tell us about the vendor",
  slug: "vendor-intake",
  entityType: "use_case",
  schema: { version: "1", fields: [] },
  submitButtonText: "Submit",
};

function renderForm(route = "/abc123/use-case-form-intake") {
  return renderWithProviders(
    <Routes>
      <Route path="/:publicId/use-case-form-intake" element={<PublicIntakeForm />} />
    </Routes>,
    { route },
  );
}

describe("PublicIntakeForm Page", () => {
  beforeEach(() => {
    mockedGetPublicFormById.mockReset();
    mockedGetPublicFormById.mockResolvedValue({
      data: { form: mockForm },
    } as Awaited<ReturnType<typeof getPublicFormById>>);
  });

  it("renders a main landmark and the form title as h1", async () => {
    renderForm();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Vendor intake" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Your contact information" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.getByText("We'll send you updates about your submission")).toBeInTheDocument();
  });

  it("labels the contact inputs", async () => {
    renderForm();

    expect(await screen.findByLabelText("Name")).toHaveAttribute("id", "submitter-name");
    expect(screen.getByLabelText("Email")).toHaveAttribute("id", "submitter-email");
  });

  // The form column is the main landmark's only child.
  const formColumn = () => screen.getByRole("main").firstElementChild as HTMLElement;

  it.each([
    ["has no design settings", undefined],
    ["has design settings without an alignment", { colorTheme: "#13715B" }],
  ])("centers the form when it %s", async (_label, designSettings) => {
    mockedGetPublicFormById.mockResolvedValue({
      data: { form: { ...mockForm, designSettings } },
    } as Awaited<ReturnType<typeof getPublicFormById>>);
    renderForm();

    await screen.findByRole("heading", { level: 1, name: "Vendor intake" });
    expect(formColumn()).toHaveStyle({ marginLeft: "auto", marginRight: "auto" });
  });

  it("keeps a form left-aligned when that alignment is saved", async () => {
    // Saved design settings can be partial; the page fills in the defaults.
    mockedGetPublicFormById.mockResolvedValue({
      data: { form: { ...mockForm, designSettings: { alignment: "left" } } },
    } as unknown as Awaited<ReturnType<typeof getPublicFormById>>);
    renderForm();

    await screen.findByRole("heading", { level: 1, name: "Vendor intake" });
    expect(formColumn()).toHaveStyle({ marginLeft: "0px", marginRight: "auto" });
  });

  it("uses a main landmark and h1 when the form cannot be loaded", async () => {
    mockedGetPublicFormById.mockRejectedValue(new Error("not found"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderForm();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Form unavailable" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
