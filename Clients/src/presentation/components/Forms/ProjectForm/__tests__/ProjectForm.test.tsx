import { vi } from "vitest";
import React from "react";

// Stable references: the form re-runs effects when these change identity.
const usersResult = vi.hoisted(() => ({ users: [{ id: 1, name: "John", surname: "Doe" }] }));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => usersResult,
}));
const frameworksResult = vi.hoisted(() => ({
  frameworks: [],
  allFrameworks: [{ id: 1, name: "EU AI Act", is_organizational: false }],
}));
vi.mock("../../../../../application/hooks/useFrameworks", () => ({
  default: () => frameworksResult,
}));
vi.mock("../../../CustomFieldsSection", () => ({
  default: () => null,
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

import { act, fireEvent, screen, within } from "@testing-library/react";
import { updateProject } from "../../../../../application/repository/project.repository";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { ProjectForm } from "../index";

describe("ProjectForm", () => {
  it("renders without crashing", () => {
    renderWithProviders(<ProjectForm onClose={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});

/** A use case with EU AI Act, edited through the form; every other required field is valid. */
const euAiActUseCase = (roles: string[]) => ({
  id: 7,
  project_title: "Hiring tool",
  owner: 1,
  start_date: "2026-01-01T00:00:00.000Z",
  goal: "Screen candidates",
  geography: 1,
  ai_risk_classification: 2, // "High risk" item id in the form
  status: "In progress",
  is_organizational: false,
  members: [],
  monitored_regulations_and_standards: [{ _id: 1, name: "EU AI Act" }],
  high_risk_roles: roles,
});

function renderEditForm(roles: string[]) {
  const submitRef = { current: undefined } as React.MutableRefObject<(() => void) | undefined>;
  renderWithProviders(
    <ProjectForm
      onClose={vi.fn()}
      projectToEdit={euAiActUseCase(roles)}
      useStandardModal
      onSubmitRef={submitRef}
    />,
  );
  return submitRef;
}

const submit = async (submitRef: React.MutableRefObject<(() => void) | undefined>) => {
  await act(async () => {
    await (submitRef.current?.() as unknown as Promise<void>);
  });
};

describe("ProjectForm high-risk roles", () => {
  beforeEach(() => {
    vi.mocked(updateProject).mockClear();
    // jsdom has no scrollIntoView; the form scrolls to the first invalid field.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("sends both roles, Provider first, when both are chosen", async () => {
    const submitRef = renderEditForm(["Deployer"]);
    fireEvent.keyDown(document.getElementById("high-risk-roles-input")!, { key: "ArrowDown" });
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Provider"));
    await submit(submitRef);
    expect((vi.mocked(updateProject).mock.calls[0][0] as any).body.high_risk_roles).toEqual([
      "Provider",
      "Deployer",
    ]);
  });

  it("shows the required message and sends nothing when no role is chosen", async () => {
    const submitRef = renderEditForm([]);
    await submit(submitRef);
    expect(
      screen.getByText("Select at least one high-risk role when EU AI Act is selected."),
    ).toBeInTheDocument();
    expect(updateProject).not.toHaveBeenCalled();
  });
});
