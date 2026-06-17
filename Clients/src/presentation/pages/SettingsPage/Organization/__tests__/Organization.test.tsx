import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { buildOrganization } from "../../../../../test/factories/organization.factory";

// Mock URL static methods not available in jsdom
beforeAll(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-object-url");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

// --- Repository mocks (mutable variables pattern) ---
const mockGetMyOrganization = vi.fn();
const mockCreateMyOrganization = vi.fn();
const mockUpdateMyOrganization = vi.fn();

vi.mock("../../../../../application/repository/organization.repository", () => ({
  GetMyOrganization: (...args: any[]) => mockGetMyOrganization(...args),
  CreateMyOrganization: (...args: any[]) => mockCreateMyOrganization(...args),
  UpdateMyOrganization: (...args: any[]) => mockUpdateMyOrganization(...args),
}));

const mockUploadAITrustCentreLogo = vi.fn();
const mockDeleteAITrustCentreLogo = vi.fn();

vi.mock("../../../../../application/repository/aiTrustCentre.repository", () => ({
  uploadAITrustCentreLogo: (...args: any[]) => mockUploadAITrustCentreLogo(...args),
  deleteAITrustCentreLogo: (...args: any[]) => mockDeleteAITrustCentreLogo(...args),
}));

// --- Auth mock with mutable role ---
let mockUserRoleName = "Admin";

vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockUserRoleName, organizationId: 1 }),
}));

// --- Logo fetch mock ---
const mockFetchLogoAsBlobUrl = vi.fn();

vi.mock("../../../../../application/hooks/useLogoFetch", () => ({
  useLogoFetch: () => ({ fetchLogoAsBlobUrl: mockFetchLogoAsBlobUrl }),
}));

vi.mock("../../../../../application/tools/extractToken", () => ({
  extractUserToken: vi.fn(() => ({
    tenantId: "tenant-1",
    organizationId: "1",
    roleName: "Admin",
    id: "1",
    email: "test@test.com",
    name: "Test",
    surname: "User",
    roleId: "1",
    expire: "",
    iat: "",
  })),
}));

vi.mock("../../../../../application/redux/auth/getAuthToken", () => ({
  getAuthToken: vi.fn(() => "fake-jwt-token"),
}));

import Organization from "../index";

describe("Organization Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRoleName = "Admin";
    mockGetMyOrganization.mockResolvedValue({
      data: { data: buildOrganization({ name: "Test Org", logo: "" }) },
    });
    mockFetchLogoAsBlobUrl.mockResolvedValue("blob:http://localhost/logo");
    mockCreateMyOrganization.mockResolvedValue({
      data: buildOrganization({ id: 2, name: "New Org" }),
    });
    mockUpdateMyOrganization.mockResolvedValue(buildOrganization({ id: 1, name: "Updated Org" }));
  });

  // --- Basic rendering ---

  it("renders name field, logo section, and save button", async () => {
    renderWithProviders(<Organization />);
    expect(screen.getByPlaceholderText("e.g. My Organization")).toBeInTheDocument();
    expect(screen.getByText("Organization Logo")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Change")).toBeInTheDocument();
  });

  // --- Data loading ---

  it("loads organization data on mount and populates the name field", async () => {
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Org")).toBeInTheDocument();
    });
    expect(mockGetMyOrganization).toHaveBeenCalledTimes(1);
    expect(mockGetMyOrganization).toHaveBeenCalledWith({
      routeUrl: "/organizations/1",
    });
  });

  it("displays the logo image when logo loads successfully", async () => {
    renderWithProviders(<Organization />);
    await waitFor(() => {
      const img = screen.getByAltText("Organization Logo");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "blob:http://localhost/logo");
    });
  });

  it("shows placeholder when no logo is returned", async () => {
    mockFetchLogoAsBlobUrl.mockResolvedValue(null);
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByText("Logo")).toBeInTheDocument();
    });
    expect(screen.queryByAltText("Organization Logo")).not.toBeInTheDocument();
  });

  it("shows empty form when fetchOrganization throws (org does not exist)", async () => {
    mockGetMyOrganization.mockRejectedValue(new Error("Not found"));
    renderWithProviders(<Organization />);
    await waitFor(() => {
      const input = screen.getByPlaceholderText("e.g. My Organization") as HTMLInputElement;
      expect(input.value).toBe("");
    });
  });

  it("shows loading spinner while logo is being fetched", async () => {
    let resolveLogo!: (val: string | null) => void;
    mockFetchLogoAsBlobUrl.mockReturnValue(
      new Promise((r) => {
        resolveLogo = r;
      }),
    );

    renderWithProviders(<Organization />);

    await waitFor(() => {
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
    const spinners = screen.getAllByRole("progressbar");
    expect(spinners.length).toBeGreaterThanOrEqual(1);

    resolveLogo!("blob:http://localhost/logo");

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
    const spinnersAfter = screen.queryAllByRole("progressbar");
    expect(spinnersAfter.length).toBe(0);
  });

  // --- Validation ---

  it("shows validation error when name is shorter than 2 characters", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Org")).toBeInTheDocument();
    });
    const input = screen.getByDisplayValue("Test Org");
    await user.clear(input);
    await user.type(input, "A");
    await waitFor(() => {
      expect(
        screen.getByText("Organization name must be at least 2 characters"),
      ).toBeInTheDocument();
    });
  });

  it("shows validation error when name exceeds 50 characters", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Org")).toBeInTheDocument();
    });
    const input = screen.getByDisplayValue("Test Org");
    await user.clear(input);
    await user.type(input, "A".repeat(51));
    await waitFor(() => {
      expect(
        screen.getByText("Organization name must be less than 50 characters"),
      ).toBeInTheDocument();
    });
  });

  // --- RBAC ---

  it("enables the name field for Admin role", async () => {
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Org")).not.toBeDisabled();
    });
  });

  it("disables the name field for Editor role", async () => {
    mockUserRoleName = "Editor";
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Org")).toBeDisabled();
    });
  });

  // --- Save button states ---

  it("disables save button when no changes have been made", async () => {
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Org")).toBeInTheDocument();
    });
    const saveButton = screen.getByText("Save").closest("button");
    expect(saveButton).toBeDisabled();
  });

  it("enables save button after user makes changes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Org")).toBeInTheDocument();
    });
    const input = screen.getByDisplayValue("Test Org");
    await user.clear(input);
    await user.type(input, "Updated Org");
    await waitFor(() => {
      const saveButton = screen.getByText("Save").closest("button");
      expect(saveButton).not.toBeDisabled();
    });
  });

  // --- Update flow ---

  it("calls UpdateMyOrganization when saving changes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Org")).toBeInTheDocument();
    });
    const input = screen.getByDisplayValue("Test Org");
    await user.clear(input);
    await user.type(input, "Updated Org");
    await user.click(screen.getByText("Save").closest("button")!);
    await waitFor(() => {
      expect(mockUpdateMyOrganization).toHaveBeenCalledWith({
        routeUrl: "/organizations/1",
        body: { name: "Updated Org" },
      });
    });
  });

  it("shows success alert after updating organization", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Org")).toBeInTheDocument();
    });
    const input = screen.getByDisplayValue("Test Org");
    await user.clear(input);
    await user.type(input, "Updated Org");
    await user.click(screen.getByText("Save").closest("button")!);
    await waitFor(() => {
      expect(screen.getByText("The organization was updated successfully.")).toBeInTheDocument();
    });
  });

  it("shows error alert when update fails", async () => {
    mockUpdateMyOrganization.mockRejectedValue(new Error("Server error"));
    const user = userEvent.setup();
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Org")).toBeInTheDocument();
    });
    const input = screen.getByDisplayValue("Test Org");
    await user.clear(input);
    await user.type(input, "Updated Org");
    await user.click(screen.getByText("Save").closest("button")!);
    await waitFor(() => {
      expect(screen.getByText("Failed to update organization.")).toBeInTheDocument();
    });
  });

  // --- Create flow ---

  it("calls CreateMyOrganization for a new org and shows success", async () => {
    mockGetMyOrganization
      .mockRejectedValueOnce(new Error("Not found"))
      .mockResolvedValueOnce({ data: { data: buildOrganization({ id: 2, name: "New Org" }) } });
    const user = userEvent.setup();
    renderWithProviders(<Organization />);
    await waitFor(() => {
      const input = screen.getByPlaceholderText("e.g. My Organization") as HTMLInputElement;
      expect(input.value).toBe("");
    });
    const input = screen.getByPlaceholderText("e.g. My Organization");
    await user.type(input, "New Org");
    await user.click(screen.getByText("Save").closest("button")!);
    await waitFor(() => {
      expect(mockCreateMyOrganization).toHaveBeenCalledWith({
        routeUrl: "/organizations",
        body: { name: "New Org" },
      });
    });
    await waitFor(() => {
      expect(screen.getByText("The organization was created successfully.")).toBeInTheDocument();
    });
  });

  it("shows error alert when create fails", async () => {
    mockGetMyOrganization.mockRejectedValue(new Error("Not found"));
    mockCreateMyOrganization.mockRejectedValue(new Error("Server error"));
    const user = userEvent.setup();
    renderWithProviders(<Organization />);
    await waitFor(() => {
      const input = screen.getByPlaceholderText("e.g. My Organization") as HTMLInputElement;
      expect(input.value).toBe("");
    });
    const input = screen.getByPlaceholderText("e.g. My Organization");
    await user.type(input, "New Org");
    await user.click(screen.getByText("Save").closest("button")!);
    await waitFor(() => {
      expect(screen.getByText("Failed to create organization.")).toBeInTheDocument();
    });
  });

  // --- Logo upload ---

  it("handles logo upload successfully — calls API and shows success", async () => {
    mockUploadAITrustCentreLogo.mockResolvedValue({
      data: { logo: "uploaded", message: "Logo uploaded" },
    });
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Org")).toBeInTheDocument();
    });
    const file = new File(["test"], "logo.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(mockUploadAITrustCentreLogo).toHaveBeenCalledWith(file);
    });
    await waitFor(() => {
      expect(screen.getByText("Logo uploaded")).toBeInTheDocument();
    });
  });

  it("shows error alert for invalid logo file type", async () => {
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Org")).toBeInTheDocument();
    });
    const file = new File(["test"], "document.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("Please select a valid image file")).toBeInTheDocument();
    });
    expect(mockUploadAITrustCentreLogo).not.toHaveBeenCalled();
  });

  it("shows error alert for oversize logo file", async () => {
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Org")).toBeInTheDocument();
    });
    const oversizedFile = new File(["x".repeat(6 * 1024 * 1024)], "large.png", {
      type: "image/png",
    });
    Object.defineProperty(oversizedFile, "size", { value: 6 * 1024 * 1024 });
    const fileInput = document.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [oversizedFile] } });
    await waitFor(() => {
      expect(screen.getByText("File size must be less than 5MB")).toBeInTheDocument();
    });
    expect(mockUploadAITrustCentreLogo).not.toHaveBeenCalled();
  });

  it("shows error alert when logo upload API call fails", async () => {
    mockUploadAITrustCentreLogo.mockRejectedValue(new Error("Upload failed"));
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Org")).toBeInTheDocument();
    });
    const file = new File(["test"], "logo.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("Upload failed")).toBeInTheDocument();
    });
  });

  // --- Logo removal ---

  it("opens confirmation modal when Delete button is clicked", async () => {
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByAltText("Organization Logo")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Delete"));
    expect(screen.getByText("Confirm logo removal")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Are you sure you want to remove the organization logo? This action cannot be undone.",
      ),
    ).toBeInTheDocument();
  });

  it("closes confirmation modal on Cancel", async () => {
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByAltText("Organization Logo")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Delete"));
    expect(screen.getByText("Confirm logo removal")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Cancel"));
    await waitFor(() => {
      expect(screen.queryByText("Confirm logo removal")).not.toBeInTheDocument();
    });
  });

  it("removes logo on confirmation — calls delete API and shows success", async () => {
    mockDeleteAITrustCentreLogo.mockResolvedValue({});
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByAltText("Organization Logo")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Delete"));
    await userEvent.click(screen.getByText("Remove"));
    await waitFor(() => {
      expect(mockDeleteAITrustCentreLogo).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByText("Organization logo removed successfully")).toBeInTheDocument();
    });
  });

  it("shows error alert when logo removal API call fails", async () => {
    mockDeleteAITrustCentreLogo.mockRejectedValue(new Error("Remove failed"));
    renderWithProviders(<Organization />);
    await waitFor(() => {
      expect(screen.getByAltText("Organization Logo")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Delete"));
    await userEvent.click(screen.getByText("Remove"));
    await waitFor(() => {
      expect(screen.getByText("Failed to remove logo. Please try again.")).toBeInTheDocument();
    });
  });
});
