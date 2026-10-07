import { vi, describe, it, expect, beforeAll } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => <input data-testid={`field-${props.id || "field"}`} />,
}));
vi.mock("../../../Inputs/Datepicker", () => ({
  default: () => <div data-testid="datepicker" />,
}));
vi.mock("../../../Inputs/Select", () => ({
  default: () => <div data-testid="select" />,
}));
vi.mock("../../../HistorySidebar", () => ({
  HistorySidebar: () => null,
  default: () => null,
}));
vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [], approvedProjects: [] }),
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));
vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../../../../application/repository/user.repository", () => ({
  getAllUsers: vi.fn().mockResolvedValue({ data: [] }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import SideDrawerIncident, { NewIncidentFormValues } from "../index";

// Enum values as plain strings (the enum members are string-valued); avoids a
// test-only import of the enum module.
const validInitialData = {
  ai_project: "AI Recruitment Screening Platform",
  project_id: 1,
  type: "Performance",
  severity: "Minor",
  status: "Open",
  occurred_date: "2026-09-01",
  date_detected: "2026-09-01",
  reporter: "Jane Doe",
  categories_of_harm: [],
  description: "The model ranked candidates unfairly.",
  interim_report: false,
  approval_status: "Pending",
} as unknown as NewIncidentFormValues;

beforeAll(() => {
  // jsdom does not implement scrollIntoView (used by formValidationFocus).
  Element.prototype.scrollIntoView = vi.fn();
});

describe("NewIncident (SideDrawerIncident)", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<SideDrawerIncident isOpen={true} setIsOpen={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });

  it("marks Categories of harm as required", () => {
    renderWithProviders(<SideDrawerIncident isOpen={true} setIsOpen={vi.fn()} />);
    expect(document.querySelector(".MuiFormLabel-asterisk")).toBeTruthy();
  });

  it("shows an inline error and does not submit when Categories of harm is empty (issue #4754)", () => {
    const onSuccess = vi.fn();
    renderWithProviders(
      <SideDrawerIncident isOpen={true} setIsOpen={vi.fn()} onSuccess={onSuccess} />,
    );

    fireEvent.click(screen.getByText("Save incident"));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please select at least one Category of Harm.",
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("focuses the Categories of harm group when submit fails validation (issue #4754)", async () => {
    const onSuccess = vi.fn();
    renderWithProviders(
      <SideDrawerIncident
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={onSuccess}
        initialData={validInitialData}
      />,
    );

    fireEvent.click(screen.getByText("Save incident"));

    await waitFor(() => {
      expect(document.activeElement?.id).toMatch(/^harm-category-/);
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
