import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ organizationId: 1 }),
}));

vi.mock("../../../../../application/repository/ssoConfig.repository", () => ({
  GetSsoConfig: vi.fn().mockResolvedValue({ data: { data: null } }),
  UpdateSsoConfig: vi.fn(),
  ToggleSsoStatus: vi.fn(),
}));

import EntraIdConfig from "../index";

describe("EntraIdConfig", () => {
  it("renders the SSO config tab inside its wrapper box", async () => {
    renderWithProviders(<EntraIdConfig />);
    await waitFor(() => {
      expect(screen.getByText("Entra ID SSO configuration")).toBeInTheDocument();
    });
    expect(screen.getByText("Enable Entra ID SSO")).toBeInTheDocument();
  });
});
