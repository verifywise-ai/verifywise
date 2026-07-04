import { screen, act } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { MicrosoftSignIn } from "../index";

describe("MicrosoftSignIn", () => {
  const defaultProps = {
    isSubmitting: false,
    setIsSubmitting: vi.fn(),
    tenantId: "tenant-123",
    clientId: "client-456",
    organizationId: 1,
    onError: vi.fn(),
    text: "Sign in with Microsoft",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the sign-in button with default text", () => {
    renderWithProviders(<MicrosoftSignIn {...defaultProps} />);
    expect(screen.getByText("Sign in with Microsoft")).toBeInTheDocument();
  });

  it("renders with custom text", () => {
    renderWithProviders(<MicrosoftSignIn {...defaultProps} text="Sign in with SSO" />);
    expect(screen.getByText("Sign in with SSO")).toBeInTheDocument();
  });

  it("shows not-configured message when tenantId is missing", () => {
    renderWithProviders(<MicrosoftSignIn {...defaultProps} tenantId={undefined} />);
    expect(screen.getByText("Microsoft Sign-In Not Configured")).toBeInTheDocument();
  });

  it("shows not-configured message when clientId is missing", () => {
    renderWithProviders(<MicrosoftSignIn {...defaultProps} clientId={undefined} />);
    expect(screen.getByText("Microsoft Sign-In Not Configured")).toBeInTheDocument();
  });

  it("shows not-configured message when organizationId is missing", () => {
    renderWithProviders(<MicrosoftSignIn {...defaultProps} organizationId={undefined} />);
    expect(screen.getByText("Microsoft Sign-In Not Configured")).toBeInTheDocument();
  });

  it("disables button when isSubmitting is true", () => {
    renderWithProviders(<MicrosoftSignIn {...defaultProps} isSubmitting={true} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("disables button when config is missing", () => {
    renderWithProviders(<MicrosoftSignIn {...defaultProps} tenantId={undefined} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("shows not-configured text when missing required config props", () => {
    renderWithProviders(<MicrosoftSignIn {...defaultProps} tenantId={undefined} />);
    expect(screen.getByText("Microsoft Sign-In Not Configured")).toBeInTheDocument();
  });

  it("opens popup window on click with correct URL", () => {
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => ({}) as Window);
    const setIsSubmitting = vi.fn();
    renderWithProviders(<MicrosoftSignIn {...defaultProps} setIsSubmitting={setIsSubmitting} />);
    screen.getByRole("button").click();

    expect(setIsSubmitting).toHaveBeenCalledWith(true);
    const origin = window.location.origin;
    const expectedUrl = `https://login.microsoftonline.com/tenant-123/oauth2/v2.0/authorize?client_id=client-456&response_type=code&redirect_uri=${encodeURIComponent(`${origin}/auth/microsoft/callback`)}&scope=${encodeURIComponent("openid profile email User.Read")}&response_mode=query`;
    expect(windowOpen).toHaveBeenCalledWith(
      expectedUrl,
      "vw_microsoft_sso",
      "width=500,height=650",
    );
    expect(sessionStorage.getItem("sso_organization_id")).toBe("1");
    windowOpen.mockRestore();
  });

  it("calls onError when popup is blocked", () => {
    vi.spyOn(window, "open").mockImplementation(() => null);
    const onError = vi.fn();
    const setIsSubmitting = vi.fn();
    renderWithProviders(
      <MicrosoftSignIn {...defaultProps} onError={onError} setIsSubmitting={setIsSubmitting} />,
    );
    screen.getByRole("button").click();
    expect(setIsSubmitting).toHaveBeenCalledWith(true);
    expect(setIsSubmitting).toHaveBeenCalledWith(false);
    expect(onError).toHaveBeenCalledWith(
      "Popup blocked. Please allow popups for this site and try again.",
    );
    vi.restoreAllMocks();
  });

  it("handles MICROSOFT_AUTH_SUCCESS message", () => {
    const setIsSubmitting = vi.fn();
    renderWithProviders(<MicrosoftSignIn {...defaultProps} setIsSubmitting={setIsSubmitting} />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "MICROSOFT_AUTH_SUCCESS",
            token: "test-token",
            expirationDate: "2026-12-31",
          },
          origin: window.location.origin,
        }),
      );
    });
    expect(setIsSubmitting).toHaveBeenCalledWith(false);
  });

  it("handles MICROSOFT_AUTH_ERROR message", () => {
    const onError = vi.fn();
    const setIsSubmitting = vi.fn();
    renderWithProviders(
      <MicrosoftSignIn {...defaultProps} onError={onError} setIsSubmitting={setIsSubmitting} />,
    );
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "MICROSOFT_AUTH_ERROR", error: "User cancelled" },
          origin: window.location.origin,
        }),
      );
    });
    expect(setIsSubmitting).toHaveBeenCalledWith(false);
    expect(onError).toHaveBeenCalledWith("User cancelled");
  });

  it("ignores messages from different origin", () => {
    const onError = vi.fn();
    renderWithProviders(<MicrosoftSignIn {...defaultProps} onError={onError} />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "MICROSOFT_AUTH_ERROR", error: "test" },
          origin: "https://evil.com",
        }),
      );
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("ignores messages with unknown type", () => {
    const onError = vi.fn();
    renderWithProviders(<MicrosoftSignIn {...defaultProps} onError={onError} />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "UNKNOWN_TYPE" },
          origin: window.location.origin,
        }),
      );
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("cleans up message listener on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderWithProviders(<MicrosoftSignIn {...defaultProps} />);
    expect(addSpy).toHaveBeenCalledWith("message", expect.any(Function));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("message", expect.any(Function));
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
