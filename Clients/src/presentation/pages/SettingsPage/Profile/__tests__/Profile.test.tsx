import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

vi.mock("../../../../../application/redux/store", () => ({
  store: { getState: () => ({ auth: { authToken: "fake-token" } }) },
}));
vi.mock("../../../../../application/tools/extractToken", () => ({
  extractUserToken: vi.fn(() => ({ id: 1 })),
}));

let mockUserRoleName = "Editor";
let mockIsSuperAdmin = false;
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockUserRoleName, isSuperAdmin: mockIsSuperAdmin }),
}));

const mockLogout = vi.fn();
vi.mock("../../../../../application/hooks/useLogout", () => ({
  default: () => mockLogout,
}));

const mockGetUserById = vi.fn();
const mockUpdateUserById = vi.fn();
const mockDeleteUserById = vi.fn();
const mockUploadUserProfilePhoto = vi.fn();
const mockDeleteUserProfilePhoto = vi.fn();

vi.mock("../../../../../application/repository/user.repository", () => ({
  getUserById: (...args: any[]) => mockGetUserById(...args),
  updateUserById: (...args: any[]) => mockUpdateUserById(...args),
  deleteUserById: (...args: any[]) => mockDeleteUserById(...args),
  uploadUserProfilePhoto: (...args: any[]) => mockUploadUserProfilePhoto(...args),
  deleteUserProfilePhoto: (...args: any[]) => mockDeleteUserProfilePhoto(...args),
}));

const mockFetchProfilePhotoAsBlobUrl = vi.fn();
vi.mock("../../../../../application/hooks/useProfilePhotoFetch", () => ({
  useProfilePhotoFetch: () => ({ fetchProfilePhotoAsBlobUrl: mockFetchProfilePhotoAsBlobUrl }),
}));

beforeAll(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview-url");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

import ProfileForm from "../index";

describe("ProfileForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRoleName = "Editor";
    mockIsSuperAdmin = false;
    mockGetUserById.mockResolvedValue({
      data: { name: "Jane", surname: "Doe", email: "jane@example.com" },
    });
    mockFetchProfilePhotoAsBlobUrl.mockResolvedValue(null);
  });

  it("loads and populates user data on mount", async () => {
    renderWithProviders(<ProfileForm />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Jane")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("Doe")).toBeInTheDocument();
    expect(screen.getByDisplayValue("jane@example.com")).toBeInTheDocument();
  });

  it("keeps the email field disabled", async () => {
    renderWithProviders(<ProfileForm />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("jane@example.com")).toBeDisabled();
    });
  });

  it("disables save until a field is modified", async () => {
    renderWithProviders(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("Jane")).toBeInTheDocument());
    expect(screen.getByText("Save").closest("button")).toBeDisabled();
  });

  it("enables save and shows a validation error for a too-short name", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("Jane")).toBeInTheDocument());

    const nameField = screen.getByDisplayValue("Jane");
    await user.clear(nameField);
    await user.type(nameField, "J");

    await waitFor(() => {
      expect(screen.getByText("Save").closest("button")).toBeDisabled();
    });
  });

  it("saves updated profile info successfully", async () => {
    mockUpdateUserById.mockResolvedValue({ status: 200 });
    const user = userEvent.setup();
    renderWithProviders(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("Jane")).toBeInTheDocument());

    const nameField = screen.getByDisplayValue("Jane");
    await user.clear(nameField);
    await user.type(nameField, "Janet");

    const saveButton = await waitFor(() => {
      const btn = screen.getByText("Save").closest("button")!;
      expect(btn).not.toBeDisabled();
      return btn;
    });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateUserById).toHaveBeenCalledWith({
        userId: 1,
        userData: { name: "Janet", surname: "Doe", email: "jane@example.com" },
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Profile updated successfully.")).toBeInTheDocument();
    });
  });

  it("shows an error alert when the save response is not 2xx", async () => {
    mockUpdateUserById.mockResolvedValue({ status: 500 });
    const user = userEvent.setup();
    renderWithProviders(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("Jane")).toBeInTheDocument());

    const nameField = screen.getByDisplayValue("Jane");
    await user.clear(nameField);
    await user.type(nameField, "Janet");
    const saveButton = await waitFor(() => {
      const btn = screen.getByText("Save").closest("button")!;
      expect(btn).not.toBeDisabled();
      return btn;
    });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText("Failed to update profile. Please try again.")).toBeInTheDocument();
    });
  });

  it("shows an error alert when the save call throws", async () => {
    mockUpdateUserById.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderWithProviders(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("Jane")).toBeInTheDocument());

    const nameField = screen.getByDisplayValue("Jane");
    await user.clear(nameField);
    await user.type(nameField, "Janet");
    const saveButton = await waitFor(() => {
      const btn = screen.getByText("Save").closest("button")!;
      expect(btn).not.toBeDisabled();
      return btn;
    });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText("Failed to update profile. Please try again.")).toBeInTheDocument();
    });
  });

  it("hides the delete-account section for super admins", async () => {
    mockIsSuperAdmin = true;
    renderWithProviders(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("Jane")).toBeInTheDocument());
    expect(screen.queryByText("Delete account")).not.toBeInTheDocument();
  });

  it("shows the delete-account section and disables it for admins", async () => {
    mockUserRoleName = "Admin";
    renderWithProviders(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("Jane")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Delete account" })).toBeDisabled();
  });

  it("opens the delete confirmation modal and deletes the account", async () => {
    mockDeleteUserById.mockResolvedValue({ status: 202 });
    const user = userEvent.setup();
    renderWithProviders(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("Jane")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByText("Confirm delete")).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByText("Delete"));

    await waitFor(() => {
      expect(mockDeleteUserById).toHaveBeenCalledWith({ userId: 1 });
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  it("shows an error alert when account deletion fails", async () => {
    mockDeleteUserById.mockResolvedValue({ status: 500 });
    const user = userEvent.setup();
    renderWithProviders(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("Jane")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.click(within(screen.getByRole("dialog")).getByText("Delete"));

    await waitFor(() => {
      expect(screen.getByText("Failed to delete account. Please try again.")).toBeInTheDocument();
    });
  });

  it("uploads a profile photo", async () => {
    mockUploadUserProfilePhoto.mockResolvedValue({ status: 200 });
    mockFetchProfilePhotoAsBlobUrl.mockResolvedValue("blob:http://localhost/photo");
    renderWithProviders(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("Jane")).toBeInTheDocument());

    const file = new File(["img"], "avatar.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockUploadUserProfilePhoto).toHaveBeenCalledWith(1, file);
    });
    await waitFor(() => {
      expect(screen.getByText("Profile photo uploaded successfully")).toBeInTheDocument();
    });
  });

  it("shows an error for an invalid image type", async () => {
    renderWithProviders(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("Jane")).toBeInTheDocument());

    const file = new File(["doc"], "resume.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Please select a valid image file")).toBeInTheDocument();
    });
    expect(mockUploadUserProfilePhoto).not.toHaveBeenCalled();
  });

  it("shows an error for an oversized image", async () => {
    renderWithProviders(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("Jane")).toBeInTheDocument());

    const oversized = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(oversized, "size", { value: 6 * 1024 * 1024 });
    const fileInput = document.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [oversized] } });

    await waitFor(() => {
      expect(screen.getByText("File size must be less than 5MB")).toBeInTheDocument();
    });
    expect(mockUploadUserProfilePhoto).not.toHaveBeenCalled();
  });

  it("removes the profile photo via the confirmation modal", async () => {
    mockFetchProfilePhotoAsBlobUrl.mockResolvedValue("blob:http://localhost/photo");
    mockDeleteUserProfilePhoto.mockResolvedValue({ status: 200 });
    const user = userEvent.setup();
    renderWithProviders(<ProfileForm />);
    await waitFor(() => expect(screen.getByDisplayValue("Jane")).toBeInTheDocument());

    const deleteImgButton = await waitFor(() => {
      const btn = screen.getByText("Delete", { selector: "button" });
      expect(btn).not.toBeDisabled();
      return btn;
    });
    await user.click(deleteImgButton);
    expect(screen.getByText("Remove profile photo")).toBeInTheDocument();
    await user.click(screen.getByText("Remove"));

    await waitFor(() => {
      expect(mockDeleteUserProfilePhoto).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(screen.getByText("Profile photo removed successfully")).toBeInTheDocument();
    });
  });
});
