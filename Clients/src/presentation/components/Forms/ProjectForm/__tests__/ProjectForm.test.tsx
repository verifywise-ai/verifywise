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
const projectsCacheResult = vi.hoisted(() => ({
  setProjectsCache: vi.fn(),
  refreshProjects: vi.fn(),
}));
vi.mock("../../../../../application/hooks/useProjectsCache", () => ({
  useProjectsCache: () => projectsCacheResult,
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
import CustomException from "../../../../../infrastructure/exceptions/customeException";
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

describe("ProjectForm external owner (#5256)", () => {
  beforeEach(() => {
    vi.mocked(updateProject).mockClear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  const renderWith = (projectToEdit: object) => {
    const submitRef = { current: undefined } as React.MutableRefObject<(() => void) | undefined>;
    renderWithProviders(
      <ProjectForm
        onClose={vi.fn()}
        projectToEdit={projectToEdit as never}
        useStandardModal
        onSubmitRef={submitRef}
      />,
    );
    return submitRef;
  };
  const externalUseCase = {
    ...euAiActUseCase(["Deployer"]),
    owner: null,
    external_owner_name: "Ada Lovelace",
    external_owner_email: "ada@example.com",
  };

  it("keeps an externally owned use case external on save", async () => {
    await submit(renderWith(externalUseCase));
    expect((vi.mocked(updateProject).mock.calls[0][0] as any).body).toMatchObject({
      owner: null,
      external_owner_name: "Ada Lovelace",
      external_owner_email: "ada@example.com",
    });
  });

  it("does not save an external owner with an invalid email", async () => {
    await submit(renderWith({ ...externalUseCase, external_owner_email: "not-an-email" }));
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("sends empty external fields for a user owner", async () => {
    await submit(renderWith(euAiActUseCase(["Deployer"])));
    expect((vi.mocked(updateProject).mock.calls[0][0] as any).body).toMatchObject({
      owner: 1,
      external_owner_name: null,
      external_owner_email: null,
    });
  });
});

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

// A refused save used to do nothing at all: only a 400 with field errors was
// shown. The server's message now shows above the form, which stays open.
describe("ProjectForm server errors", () => {
  beforeEach(() => {
    vi.mocked(updateProject).mockReset();
    projectsCacheResult.setProjectsCache.mockClear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  const renderEdit = (onClose = vi.fn()) => {
    const submitRef = { current: undefined } as React.MutableRefObject<(() => void) | undefined>;
    renderWithProviders(
      <ProjectForm
        onClose={onClose}
        projectToEdit={euAiActUseCase(["Deployer"])}
        useStandardModal
        onSubmitRef={submitRef}
      />,
    );
    return submitRef;
  };

  it("shows a 403 message and keeps the form open", async () => {
    const message =
      "Only an approval workflow admin can change the workflow while its approval is pending or rejected";
    vi.mocked(updateProject).mockRejectedValue(
      new CustomException(message, 403, { message: "Forbidden", data: message }),
    );
    const onClose = vi.fn();
    await submit(renderEdit(onClose));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a 400 without field errors as a form message", async () => {
    const message = "The selected approval workflow does not exist";
    vi.mocked(updateProject).mockRejectedValue(
      new CustomException(message, 400, { message: "Bad Request", data: message }),
    );
    await submit(renderEdit());
    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });

  it("shows a field error for a field the form has no input for as a form message", async () => {
    vi.mocked(updateProject).mockRejectedValue(
      new CustomException("Bad Request", 400, {
        message: "Bad Request",
        data: { errors: [{ field: "uc_id", message: "uc_id must be a string", location: "body" }] },
      }),
    );
    await submit(renderEdit());
    expect(screen.getByRole("alert")).toHaveTextContent("uc_id must be a string");
  });

  it("clears the message when the next save succeeds", async () => {
    const message = "Access denied";
    vi.mocked(updateProject)
      .mockRejectedValueOnce(new CustomException(message, 403, { data: message }))
      .mockResolvedValueOnce({ status: 202, data: { data: euAiActUseCase(["Deployer"]) } } as any);
    const submitRef = renderEdit();
    await submit(submitRef);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    await submit(submitRef);
    expect(screen.queryByRole("alert")).toBeNull();
    // The saved use case is merged into its entry in the projects cache: the answer is the bare
    // row, so fields the list joins in (such as `framework`) are kept.
    expect(projectsCacheResult.setProjectsCache).toHaveBeenCalledTimes(1);
    const updater = projectsCacheResult.setProjectsCache.mock.calls[0][0] as (
      prev: object[],
    ) => object[];
    const framework = [{ framework_id: 1, name: "EU AI Act" }];
    expect(updater([{ id: 7, framework, goal: "old goal" }, { id: 2 }])).toEqual([
      { framework, ...euAiActUseCase(["Deployer"]) },
      { id: 2 },
    ]);
  });
});
