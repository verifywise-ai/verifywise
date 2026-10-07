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
vi.mock("../../../Inputs/Datepicker", () => ({
  default: () => <div data-testid="datepicker" />,
}));
vi.mock("../../../Inputs/Select", () => ({
  default: (props: any) => <div data-testid={`select-${props.id || "select"}`} />,
}));
vi.mock("../../../Inputs/Toggle", () => ({
  default: () => <div data-testid="toggle" />,
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
vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import NewModelInventory from "../index";

// Valid values so client-side validation passes and the save reaches onSuccess.
const validInitialData = {
  provider: "OpenAI",
  model: "GPT-4",
  version: "1",
  status: "Approved",
  status_date: "2026-09-01",
  external_key: "key-1",
  projects: [],
  frameworks: [],
  capabilities: [],
} as any;

const conflictError = {
  response: {
    status: 409,
    data: {
      message: "Conflict",
      data: "A model with this external key already exists in your organization.",
    },
  },
};

beforeAll(() => {
  // jsdom does not implement scrollIntoView (used by formValidationFocus).
  Element.prototype.scrollIntoView = vi.fn();
});

describe("NewModelInventory", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(
      <NewModelInventory
        isOpen={true}
        setIsOpen={vi.fn()}
        evidenceData={[]}
        modelInventoryData={[]}
      />,
    );
    expect(document.body).toBeTruthy();
  });

  it("surfaces a 409 conflict as a field-level error on External key and focuses it (issue #4755)", async () => {
    const onSuccess = vi.fn().mockRejectedValue(conflictError);
    const onError = vi.fn();
    renderWithProviders(
      <NewModelInventory
        isOpen={true}
        setIsOpen={vi.fn()}
        onSuccess={onSuccess}
        onError={onError}
        initialData={validInitialData}
        evidenceData={[]}
        modelInventoryData={[]}
      />,
    );

    fireEvent.click(screen.getByTestId("modal-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("error-external_key")).toHaveTextContent(
        "A model with this external key already exists in your organization.",
      );
    });
    await waitFor(() => {
      expect(document.activeElement?.id).toBe("external_key");
    });
    expect(onError).toHaveBeenCalled();
  });
});
