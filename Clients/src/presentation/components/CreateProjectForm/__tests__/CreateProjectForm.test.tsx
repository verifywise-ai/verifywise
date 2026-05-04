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

describe("CreateProjectForm", () => {
  it("renders the form without crashing", () => {
    renderWithProviders(<CreateProjectForm closePopup={vi.fn()} onNewProject={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});
