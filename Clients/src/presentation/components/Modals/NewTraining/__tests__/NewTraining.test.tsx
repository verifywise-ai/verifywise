import { vi, describe, it, expect, beforeAll } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../StandardModal", () => ({
  default: ({ isOpen, children, title, onSubmit, submitButtonText }: any) =>
    isOpen ? (
      <div data-testid="standard-modal">
        <h2>{title}</h2>
        {children}
        <button data-testid="modal-submit" onClick={onSubmit}>
          {submitButtonText}
        </button>
      </div>
    ) : null,
}));
vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => (
    <div>
      <input id={props.id} data-testid={`field-${props.id || "field"}`} />
      {props.error && (
        <span role="alert" data-testid={`error-${props.id}`}>
          {props.error}
        </span>
      )}
    </div>
  ),
}));
vi.mock("../../../Inputs/Select", () => ({
  default: (props: any) => <div data-testid={`select-${props.id || "select"}`} />,
}));
vi.mock("../../../TabBar", () => ({
  default: () => <div data-testid="tab-bar" />,
}));
vi.mock("../../../HistorySidebar", () => ({
  HistorySidebar: () => null,
  default: () => null,
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import NewTraining from "../index";

// Valid values as plain strings (the status enum is string-valued); only
// numberOfPeople is intentionally missing.
const validInitialData = {
  training_name: "AI Ethics 101",
  duration: "2 hours",
  provider: "Internal Team",
  department: "Compliance",
  status: "Planned",
  numberOfPeople: undefined,
  description: "",
} as any;

beforeAll(() => {
  // jsdom does not implement scrollIntoView (used by formValidationFocus).
  Element.prototype.scrollIntoView = vi.fn();
});

describe("NewTraining", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<NewTraining isOpen={true} setIsOpen={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });

  it("shows an inline error and does not submit when Number of people is empty (issue #4756)", () => {
    const onSuccess = vi.fn();
    renderWithProviders(<NewTraining isOpen={true} setIsOpen={vi.fn()} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTestId("modal-submit"));

    expect(
      screen.getByText("Number of people is required and must be a positive number."),
    ).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("focuses the Number of people field when submit fails validation (issue #4756)", async () => {
    const onSuccess = vi.fn();
    renderWithProviders(
      <NewTraining
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={onSuccess}
        initialData={validInitialData}
      />,
    );

    fireEvent.click(screen.getByTestId("modal-submit"));

    await waitFor(() => {
      expect(document.activeElement?.id).toBe("number-of-people");
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
