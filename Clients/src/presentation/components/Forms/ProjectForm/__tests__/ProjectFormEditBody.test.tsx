import { vi } from "vitest";
import React from "react";
import dayjs from "dayjs";

// Stable references: the form re-runs effects when these change identity.
const usersResult = vi.hoisted(() => ({ users: [{ id: 1, name: "John", surname: "Doe" }] }));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => usersResult,
}));
const frameworksResult = vi.hoisted(() => ({
  frameworks: [],
  allFrameworks: [
    { id: 1, name: "EU AI Act", is_organizational: false },
    { id: 2, name: "ISO 42001", is_organizational: true },
  ],
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
vi.mock("../../../../../application/hooks/useProjectsCache", () => ({
  useProjectsCache: () => ({ setProjectsCache: vi.fn(), refreshProjects: vi.fn() }),
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
// The picker hands back the chosen day as local midnight, like the real one.
vi.mock("../../../../components/Inputs/Datepicker", () => ({
  default: ({ handleDateChange }: any) => (
    <button data-testid="pick-start-date" onClick={() => handleDateChange(dayjs("2026-03-15"))} />
  ),
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

import { act, fireEvent, screen } from "@testing-library/react";
import { updateProject } from "../../../../../application/repository/project.repository";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { ProjectForm } from "../index";

/** A loaded use case as the edit callers pass it: frameworks as names and rows. */
const loadedUseCase = (overrides: object = {}) => ({
  id: 7,
  project_title: "Hiring tool",
  owner: 1,
  start_date: "2026-01-01T00:00:00.000Z",
  goal: "Screen candidates",
  geography: 1,
  ai_risk_classification: "High risk",
  status: "In progress",
  is_organizational: true,
  members: [],
  monitored_regulations_and_standards: ["ISO 42001"],
  framework: [{ project_framework_id: 3, framework_id: 2, name: "ISO 42001" }],
  high_risk_roles: ["Deployer"],
  ...overrides,
});

const renderEdit = (projectToEdit: object) => {
  const submitRef = { current: undefined } as React.MutableRefObject<(() => void) | undefined>;
  renderWithProviders(
    <ProjectForm
      onClose={vi.fn()}
      projectToEdit={projectToEdit}
      useStandardModal
      onSubmitRef={submitRef}
    />,
  );
  return submitRef;
};

const submit = async (submitRef: React.MutableRefObject<(() => void) | undefined>) => {
  await act(async () => {
    await (submitRef.current?.() as unknown as Promise<void>);
  });
};

const sentBody = () => (vi.mocked(updateProject).mock.calls[0][0] as any).body;

describe("ProjectForm edit body", () => {
  beforeEach(() => {
    vi.mocked(updateProject).mockClear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("leaves out the AI Act classification and roles when EU AI Act does not apply", async () => {
    await submit(renderEdit(loadedUseCase()));
    expect(updateProject).toHaveBeenCalledTimes(1);
    expect(sentBody()).not.toHaveProperty("ai_risk_classification");
    expect(sentBody()).not.toHaveProperty("high_risk_roles");
  });

  it("recognises EU AI Act from the stored framework rows and sends its fields", async () => {
    await submit(
      renderEdit(
        loadedUseCase({
          is_organizational: false,
          ai_risk_classification: "High risk", // stored by name
          monitored_regulations_and_standards: ["EU AI Act"],
          framework: [{ project_framework_id: 4, framework_id: 1, name: "EU AI Act" }],
        }),
      ),
    );
    expect(sentBody()).toMatchObject({
      ai_risk_classification: "High risk",
      high_risk_roles: ["Deployer"],
    });
  });

  it("does not send an untouched start date", async () => {
    await submit(renderEdit(loadedUseCase()));
    expect(sentBody()).not.toHaveProperty("start_date");
  });

  it("sends the start date when the user picks another day", async () => {
    const submitRef = renderEdit(loadedUseCase());
    fireEvent.click(screen.getByTestId("pick-start-date"));
    await submit(submitRef);
    expect(sentBody().start_date).toBe(dayjs("2026-03-15").toISOString());
  });
});
