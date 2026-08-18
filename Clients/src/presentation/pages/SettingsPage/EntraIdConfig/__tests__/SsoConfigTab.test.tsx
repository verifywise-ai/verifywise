import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

let mockOrganizationId: number | null = 1;
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ organizationId: mockOrganizationId }),
}));

const mockGetSsoConfig = vi.fn();
const mockUpdateSsoConfig = vi.fn();
const mockToggleSsoStatus = vi.fn();

vi.mock("../../../../../application/repository/ssoConfig.repository", () => ({
  GetSsoConfig: (...args: any[]) => mockGetSsoConfig(...args),
  UpdateSsoConfig: (...args: any[]) => mockUpdateSsoConfig(...args),
  ToggleSsoStatus: (...args: any[]) => mockToggleSsoStatus(...args),
}));

import SsoConfigTab from "../SsoConfigTab";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_2 = "22222222-2222-4222-8222-222222222222";

describe("SsoConfigTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrganizationId = 1;
    mockGetSsoConfig.mockResolvedValue({ data: { data: null } });
  });

  it("shows a loading spinner initially", () => {
    mockGetSsoConfig.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<SsoConfigTab />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("skips fetching when organizationId is missing and renders an empty form", async () => {
    mockOrganizationId = null;
    renderWithProviders(<SsoConfigTab />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter your Azure AD Tenant ID")).toBeInTheDocument();
    });
    expect(mockGetSsoConfig).not.toHaveBeenCalled();
  });

  it("loads and populates existing config", async () => {
    mockGetSsoConfig.mockResolvedValue({
      data: {
        data: {
          config_data: {
            tenant_id: VALID_UUID,
            client_id: VALID_UUID_2,
            cloud_environment: "AzureGovernment",
          },
          is_enabled: true,
        },
      },
    });
    renderWithProviders(<SsoConfigTab />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(VALID_UUID)).toBeInTheDocument();
    });
    expect(screen.getByText("Disable SSO")).toBeInTheDocument();
  });

  it("renders an empty form when GetSsoConfig throws", async () => {
    mockGetSsoConfig.mockRejectedValue(new Error("not found"));
    renderWithProviders(<SsoConfigTab />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter your Azure AD Tenant ID")).toBeInTheDocument();
    });
    expect((screen.getByPlaceholderText("Enter your Azure AD Tenant ID") as HTMLInputElement).value).toBe("");
  });

  it("shows validation errors for invalid tenant/client ids", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SsoConfigTab />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter your Azure AD Tenant ID")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter your Azure AD Tenant ID"), "not-a-uuid");
    await waitFor(() => {
      expect(screen.getByText("Please enter a valid UUID format")).toBeInTheDocument();
    });
  });

  it("shows required errors on submit with empty fields", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SsoConfigTab />);
    await waitFor(() => {
      expect(screen.getByText("Save configuration").closest("button")).toBeDisabled();
    });
  });

  it("shows client secret length validation error", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SsoConfigTab />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter your client secret")).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText("Enter your client secret"), "short");
    await waitFor(() => {
      expect(
        screen.getByText("Client Secret must be at least 10 characters"),
      ).toBeInTheDocument();
    });
  });

  it("enables save once all fields are valid and saves configuration", async () => {
    const user = userEvent.setup();
    mockUpdateSsoConfig.mockResolvedValue({});
    renderWithProviders(<SsoConfigTab />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter your Azure AD Tenant ID")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Enter your Azure AD Tenant ID"), VALID_UUID);
    await user.type(
      screen.getByPlaceholderText("Enter your Application (client) ID"),
      VALID_UUID_2,
    );
    await user.type(screen.getByPlaceholderText("Enter your client secret"), "supersecretvalue");

    const saveButton = await waitFor(() => {
      const btn = screen.getByText("Save configuration").closest("button")!;
      expect(btn).not.toBeDisabled();
      return btn;
    });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateSsoConfig).toHaveBeenCalledWith({
        routeUrl: `ssoConfig?provider=AzureAD`,
        body: {
          client_id: VALID_UUID_2,
          client_secret: "supersecretvalue",
          tenant_id: VALID_UUID,
          cloud_environment: "AzurePublic",
        },
      });
    });
  });

  it("toggles SSO enable status", async () => {
    mockGetSsoConfig.mockResolvedValue({
      data: {
        data: {
          config_data: { tenant_id: VALID_UUID, client_id: VALID_UUID_2 },
          is_enabled: false,
        },
      },
    });
    mockToggleSsoStatus.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<SsoConfigTab />);

    await waitFor(() => {
      expect(screen.getByText("Enable SSO").closest("button")).not.toBeDisabled();
    });
    await user.click(screen.getByText("Enable SSO"));

    await waitFor(() => {
      expect(mockToggleSsoStatus).toHaveBeenCalledWith({
        routeUrl: "ssoConfig/enable?provider=AzureAD",
        body: {},
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Disable SSO")).toBeInTheDocument();
    });
  });

  it("disables the enable-toggle button when there's no saved config", async () => {
    renderWithProviders(<SsoConfigTab />);
    await waitFor(() => {
      expect(screen.getByText("Enable SSO").closest("button")).toBeDisabled();
    });
  });
});
