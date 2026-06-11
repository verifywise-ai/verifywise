import { vi } from "vitest";

vi.mock("../../../../application/validations/stringValidation", () => ({
  checkStringValidation: vi.fn().mockReturnValue(""),
}));
vi.mock("../../../../application/validations/selectValidation", () => ({
  default: vi.fn().mockReturnValue(""),
}));
vi.mock("../../../../application/tools/extractToken", () => ({
  extractUserToken: vi.fn().mockReturnValue({ id: 1 }),
}));
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 1, name: "John", surname: "Doe" }] }),
}));
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1, roleName: "Admin" }),
}));
vi.mock("../../../../application/repository/project.repository", () => ({
  createProject: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../../../application/constants/permissions", () => ({
  default: {
    canEdit: ["Admin"],
    projects: { editTeamMembers: ["Admin"], editDetails: ["Admin"] },
  },
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import { CreateProjectForm } from "../index";

import { fireEvent, screen, waitFor } from "@testing-library/react";

describe("CreateProjectForm", () => {
  it("renders the form without crashing", () => {
    renderWithProviders(<CreateProjectForm closePopup={vi.fn()} onNewProject={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });

  it("displays validation errors when submitting empty form", async () => {
    renderWithProviders(<CreateProjectForm closePopup={vi.fn()} onNewProject={vi.fn()} />);

    const submitButton = screen.getByRole("button", { name: /create use case/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/use case title/i)).toBeInTheDocument();
    });
  });

  it("allows typing into the project title field", () => {
    renderWithProviders(<CreateProjectForm closePopup={vi.fn()} onNewProject={vi.fn()} />);

    const titleInput = document.querySelector("#project-title-input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "New AI Project" } });

    expect(titleInput).toHaveValue("New AI Project");
  });

  it("allows typing into the goal field", () => {
    renderWithProviders(<CreateProjectForm closePopup={vi.fn()} onNewProject={vi.fn()} />);

    const goalInput = document.querySelector("#goal-input") as HTMLInputElement;
    fireEvent.change(goalInput, { target: { value: "Assess AI compliance" } });

    expect(goalInput).toHaveValue("Assess AI compliance");
  });

  it("has a submit button that can be clicked", () => {
    renderWithProviders(<CreateProjectForm closePopup={vi.fn()} onNewProject={vi.fn()} />);

    const submitButton = screen.getByRole("button", { name: /create use case/i });
    expect(submitButton).toBeInTheDocument();
    expect(submitButton).toHaveAttribute("type", "submit");
  });
});
