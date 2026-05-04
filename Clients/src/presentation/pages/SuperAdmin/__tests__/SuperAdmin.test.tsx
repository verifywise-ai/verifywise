import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock the repository used by Organizations page
vi.mock("../../../../application/repository/superAdmin.repository", () => ({
  getOrganizations: vi.fn().mockResolvedValue({ data: { data: [] } }),
  createOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
}));

// Mock child components
vi.mock("../../../components/Modals/StandardModal", () => ({
  default: () => null,
}));

import Organizations from "../Organizations/index";

describe("SuperAdmin - Organizations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<Organizations />, {
      route: "/super-admin",
    });
    expect(container).toBeTruthy();
  });
});
