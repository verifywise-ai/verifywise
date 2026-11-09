import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

let mockTools: { data?: { name: string }[]; isLoading: boolean; isError: boolean };

vi.mock("../../../../application/hooks/useMcpTools", () => ({
  useMcpTools: () => mockTools,
}));
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 8 }),
}));

import McpConnect from "../McpConnect";

describe("McpConnect", () => {
  /** The server decides each user's tools, so the page shows its answer, not a fixed list. */
  it("lists the tools the server gives this user", () => {
    mockTools = {
      data: [{ name: "list_organizations" }, { name: "update_user_role" }, { name: "list_risks" }],
      isLoading: false,
      isError: false,
    };
    renderWithProviders(<McpConnect />);
    expect(screen.getByText("3 tools for your account")).toBeInTheDocument();
    expect(screen.getByText("update_user_role")).toBeInTheDocument();
    expect(screen.getByText("list_risks")).toBeInTheDocument();
  });

  it("says the list is loading until the server answers", () => {
    mockTools = { data: undefined, isLoading: true, isError: false };
    renderWithProviders(<McpConnect />);
    expect(screen.getByText("Loading the tools…")).toBeInTheDocument();
  });

  it("says the list could not be loaded when the request fails", () => {
    mockTools = { data: undefined, isLoading: false, isError: true };
    renderWithProviders(<McpConnect />);
    expect(
      screen.getByText("Couldn't load the tool list. Reload the page to try again."),
    ).toBeInTheDocument();
  });

  it("shows the reason and turns downloading off when given one", () => {
    mockTools = { data: [], isLoading: false, isError: false };
    renderWithProviders(<McpConnect disabledReason="Use the other tab." />);
    expect(screen.getByText("Use the other tab.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download config file/i })).toBeDisabled();
  });
});
