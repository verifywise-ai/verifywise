import { vi } from "vitest";
import React from "react";

vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 1, name: "John", surname: "Doe" }] }),
}));
vi.mock("../../../../../application/hooks/useFrameworks", () => ({
  default: () => ({ frameworks: [] }),
}));
vi.mock("../../../../../application/hooks/useFormValidation", () => ({
  useFormValidation: () => ({
    errors: {},
    validate: vi.fn().mockReturnValue(true),
    clearError: vi.fn(),
  }),
}));
vi.mock("../../../../../application/validations/stringValidation", () => ({
  checkStringValidation: vi.fn().mockReturnValue(""),
}));
vi.mock("../../../../../application/validations/selectValidation", () => ({
  default: vi.fn().mockReturnValue(""),
}));
vi.mock("../../../../../application/tools/extractToken", () => ({
  extractUserToken: vi.fn().mockReturnValue({ id: 1 }),
}));
vi.mock("../../../../../application/contexts/VerifyWise.context", () => ({
  VerifyWiseContext: React.createContext({
    inputValues: {},
    dashboardValues: {},
  }),
}));
vi.mock("../../../../utils/inputStyles", () => ({
  getAutocompleteStyles: () => new Proxy({}, { get: () => ({}) }),
}));
vi.mock("../../../../components/Inputs/Field", () => ({
  default: (props: any) => <input data-testid={`field-${props.id || "field"}`} />,
}));
vi.mock("../../../../components/Inputs/Select", () => ({
  default: () => <div data-testid="select" />,
}));
vi.mock("../../../../components/Inputs/Datepicker", () => ({
  default: () => <div data-testid="datepicker" />,
}));
vi.mock("../../../../components/Inputs/Checkbox", () => ({
  default: () => <div data-testid="checkbox" />,
}));
vi.mock("../../../../components/button/customizable-button", () => ({
  CustomizableButton: ({ children }: any) => <button>{children}</button>,
}));
vi.mock("../../../../components/Toast", () => ({
  default: () => null,
}));
vi.mock("../../../../../application/repository/project.repository", () => ({
  createProject: vi.fn().mockResolvedValue({}),
  updateProject: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../../../../application/repository/approvalWorkflow.repository", () => ({
  getAllApprovalWorkflows: vi.fn().mockResolvedValue({ data: [] }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { ProjectForm } from "../index";

describe("ProjectForm", () => {
  it("renders without crashing", () => {
    renderWithProviders(<ProjectForm onClose={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});
