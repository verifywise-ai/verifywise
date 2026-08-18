import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { UserDateFormat } from "../../../../../domain/enums/userDateFormat.enum";

/** MUI's custom Select associates the visible label with a pointer-events:none
 * hidden input; the actual clickable element is the sibling role=combobox div. */
function openCustomSelect(hiddenInputId: string) {
  const hiddenInput = document.getElementById(hiddenInputId)!;
  const combobox = hiddenInput
    .closest(".MuiInputBase-root")!
    .querySelector('[role="combobox"]') as HTMLElement;
  fireEvent.mouseDown(combobox);
}

vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));

const mockCreateNewUserPreferences = vi.fn();
const mockUpdateUserPreferencesById = vi.fn();
vi.mock("../../../../../application/repository/userPreferences.repository", () => ({
  createNewUserPreferences: (...args: any[]) => mockCreateNewUserPreferences(...args),
  updateUserPreferencesById: (...args: any[]) => mockUpdateUserPreferencesById(...args),
}));

let mockGetLanguage = vi.fn(() => "en");
const mockSetLanguage = vi.fn();
vi.mock("../../../../../i18n/domTranslator", () => ({
  setLanguage: (...args: any[]) => mockSetLanguage(...args),
  getLanguage: () => mockGetLanguage(),
}));

const mockRefreshUserPreferences = vi.fn();
let mockHookState: any;
vi.mock("../../../../../application/hooks/useUserPreferences", () => ({
  default: () => mockHookState,
}));

import Preferences from "../index";

describe("Preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLanguage = vi.fn(() => "en");
    mockHookState = {
      userPreferences: {
        date_format: UserDateFormat.DD_MM_YYYY_DASH,
        language: "en",
        theme: "light",
      },
      isDefault: false,
      loading: false,
      refreshUserPreferences: mockRefreshUserPreferences,
    };
  });

  it("shows a loading skeleton while preferences are loading", () => {
    mockHookState = { ...mockHookState, loading: true };
    const { container } = renderWithProviders(<Preferences />);
    expect(container.querySelector(".MuiSkeleton-root")).toBeTruthy();
  });

  it("renders date format and language selects once loaded", () => {
    renderWithProviders(<Preferences />);
    expect(screen.getByLabelText(/Date format/)).toBeInTheDocument();
    expect(screen.getByLabelText("Language")).toBeInTheDocument();
  });

  it("disables Save when preferences are already saved (not default)", () => {
    renderWithProviders(<Preferences />);
    expect(screen.getByText("Save").closest("button")).toBeDisabled();
  });

  it("enables Save when preferences are default (never saved before)", () => {
    mockHookState = { ...mockHookState, isDefault: true };
    renderWithProviders(<Preferences />);
    expect(screen.getByText("Save").closest("button")).not.toBeDisabled();
  });

  it("creates new preferences and shows success when isDefault is true", async () => {
    mockHookState = { ...mockHookState, isDefault: true };
    mockCreateNewUserPreferences.mockResolvedValue({ id: 1 });
    const user = userEvent.setup();
    renderWithProviders(<Preferences />);

    await user.click(screen.getByText("Save").closest("button")!);

    await waitFor(() => {
      expect(mockCreateNewUserPreferences).toHaveBeenCalledWith({
        user_id: 1,
        date_format: UserDateFormat.DD_MM_YYYY_DASH,
        language: "en",
      });
    });
    await waitFor(() => {
      expect(screen.getByText("User preferences set successfully.")).toBeInTheDocument();
    });
    expect(mockRefreshUserPreferences).toHaveBeenCalled();
  });

  it("updates preferences when a date format change is made", async () => {
    mockUpdateUserPreferencesById.mockResolvedValue({ id: 1 });
    const user = userEvent.setup();
    renderWithProviders(<Preferences />);

    openCustomSelect("risk-classification-input");
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByText("MM-DD-YYYY"));

    const saveButton = await waitFor(() => {
      const btn = screen.getByText("Save").closest("button")!;
      expect(btn).not.toBeDisabled();
      return btn;
    });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateUserPreferencesById).toHaveBeenCalledWith({
        userId: 1,
        data: { user_id: 1, date_format: UserDateFormat.MM_DD_YYYY_DASH, language: "en" },
      });
    });
    await waitFor(() => {
      expect(screen.getByText("User preferences updated successfully.")).toBeInTheDocument();
    });
  });

  it("updates the language selection and applies it via setLanguage", async () => {
    mockUpdateUserPreferencesById.mockResolvedValue({ id: 1 });
    const user = userEvent.setup();
    renderWithProviders(<Preferences />);

    openCustomSelect("language-input");
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByText("Deutsch"));

    const saveButton = await waitFor(() => {
      const btn = screen.getByText("Save").closest("button")!;
      expect(btn).not.toBeDisabled();
      return btn;
    });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockSetLanguage).toHaveBeenCalledWith("de");
    });
  });

  it("shows an error alert when saving fails", async () => {
    mockHookState = { ...mockHookState, isDefault: true };
    mockCreateNewUserPreferences.mockRejectedValue(new Error("Server down"));
    const user = userEvent.setup();
    renderWithProviders(<Preferences />);

    await user.click(screen.getByText("Save").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText("Server down")).toBeInTheDocument();
    });
  });

  it("syncs local language when the server language differs from the stored one", async () => {
    mockGetLanguage = vi.fn(() => "en");
    mockHookState = {
      ...mockHookState,
      userPreferences: {
        date_format: UserDateFormat.DD_MM_YYYY_DASH,
        language: "fr",
        theme: "light",
      },
    };
    renderWithProviders(<Preferences />);
    await waitFor(() => {
      expect(mockSetLanguage).toHaveBeenCalledWith("fr");
    });
  });
});
