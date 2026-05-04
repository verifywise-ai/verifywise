import { vi } from "vitest";

vi.mock("../../StandardModal", () => ({
  default: ({ isOpen, children, title }: any) =>
    isOpen ? (
      <div data-testid="standard-modal">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));
vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => <input data-testid={`field-${props.id || "field"}`} />,
}));
vi.mock("../../../Inputs/Datepicker", () => ({
  default: () => <div data-testid="datepicker" />,
}));
vi.mock("../../../Inputs/Select", () => ({
  default: () => <div data-testid="select" />,
}));
vi.mock("../../FileManagerUpload", () => ({
  default: () => null,
}));
vi.mock("../../../Inputs/CustomizableMultiSelect", () => ({
  default: () => <div data-testid="multi-select" />,
}));
vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../../../../application/hooks/useFormValidation", () => ({
  useFormValidation: () => ({
    errors: {},
    validate: vi.fn().mockReturnValue(true),
    clearError: vi.fn(),
    resetErrors: vi.fn(),
  }),
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import NewEvidenceHub from "../index";

describe("EvidenceHub (NewEvidenceHub)", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<NewEvidenceHub isOpen={true} setIsOpen={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});
