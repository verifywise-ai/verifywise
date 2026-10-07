import { screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { LLMKeysModel } from "../../../../../domain/models/Common/llmKeys/llmKeys.model";

let mockUserRoleName = "Admin";

/** Shows the current query string, so a test can see the deep link removed. */
const SearchProbe = () => <span data-testid="search">{useLocation().search}</span>;
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockUserRoleName, organizationId: 1 }),
}));

const mockGetLLMKeys = vi.fn();
const mockCreateLLMKey = vi.fn();
const mockEditLLMKey = vi.fn();
const mockDeleteLLMKey = vi.fn();

vi.mock("../../../../../application/repository/llmKeys.repository", () => ({
  getLLMKeys: (...args: any[]) => mockGetLLMKeys(...args),
  createLLMKey: (...args: any[]) => mockCreateLLMKey(...args),
  editLLMKey: (...args: any[]) => mockEditLLMKey(...args),
  deleteLLMKey: (...args: any[]) => mockDeleteLLMKey(...args),
}));

import LLMKeys from "../index";

const buildKey = (overrides: Partial<LLMKeysModel> = {}) =>
  LLMKeysModel.createNewKey({
    id: 1,
    name: "Anthropic",
    key: "sk-ant-abc",
    model: "claude-3-5-sonnet-20241022",
    url: null,
    custom_headers: null,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  } as LLMKeysModel);

describe("LLMKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRoleName = "Admin";
    mockGetLLMKeys.mockResolvedValue({ data: { data: [] } });
  });

  it("shows the empty state when there are no keys", async () => {
    renderWithProviders(<LLMKeys />);
    await waitFor(() => {
      expect(screen.getByText("No LLM keys yet")).toBeInTheDocument();
    });
  });

  it("renders existing keys", async () => {
    mockGetLLMKeys.mockResolvedValue({ data: { data: [buildKey()] } });
    renderWithProviders(<LLMKeys />);
    await waitFor(() => {
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
    });
    expect(screen.getByText("claude-3-5-sonnet-20241022")).toBeInTheDocument();
  });

  it("renders a custom endpoint key with its URL", async () => {
    mockGetLLMKeys.mockResolvedValue({
      data: {
        data: [
          buildKey({
            name: "Custom",
            url: "https://my-proxy.example.com/v1",
            model: "llama-3",
          }),
        ],
      },
    });
    renderWithProviders(<LLMKeys />);
    await waitFor(() => {
      expect(screen.getByText("Custom endpoint")).toBeInTheDocument();
    });
    expect(screen.getByText("https://my-proxy.example.com/v1")).toBeInTheDocument();
  });

  it("shows an error alert when fetching keys fails", async () => {
    mockGetLLMKeys.mockRejectedValue(new Error("boom"));
    renderWithProviders(<LLMKeys />);
    await waitFor(() => {
      expect(screen.getByText("Failed to fetch LLM Keys")).toBeInTheDocument();
    });
  });

  it("shows no error when a cached list whose refetch failed reloads on mount", async () => {
    // A list loaded elsewhere (e.g. the Advisor), then a refetch failed: the
    // cache holds the list with status "error", which it keeps while it
    // refetches on this page's mount.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["llmKeys", 1], [buildKey()]);
    await queryClient
      .fetchQuery({ queryKey: ["llmKeys", 1], queryFn: () => Promise.reject(new Error("blip")) })
      .catch(() => undefined);
    expect(queryClient.getQueryState(["llmKeys", 1])?.status).toBe("error");

    mockGetLLMKeys.mockResolvedValue({ data: { data: [buildKey()] } });
    renderWithProviders(<LLMKeys />, { queryClient });

    await waitFor(() => expect(screen.getByText("Anthropic")).toBeInTheDocument());
    expect(screen.queryByText("Failed to fetch LLM Keys")).not.toBeInTheDocument();
  });

  it("opens the add-key modal and creates a key using a custom endpoint", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LLMKeys />);
    await waitFor(() => expect(screen.getByText("No LLM keys yet")).toBeInTheDocument());

    await user.click(screen.getByText("Add API key"));
    expect(screen.getByRole("heading", { name: "Add API key" })).toBeInTheDocument();

    await user.click(screen.getByText("Custom"));
    await user.type(screen.getByLabelText(/Endpoint URL/), "https://my-proxy.example.com/v1");
    await user.type(screen.getByLabelText(/Model name/), "llama-3");
    await user.type(screen.getByLabelText(/^API key/), "sk-custom-newkey");

    mockCreateLLMKey.mockResolvedValue({ data: { data: {} } });
    mockGetLLMKeys.mockResolvedValue({ data: { data: [buildKey({ name: "Custom" })] } });

    await user.click(screen.getByText("Add key"));

    await waitFor(() => {
      expect(mockCreateLLMKey).toHaveBeenCalled();
    });
    const [{ body }] = mockCreateLLMKey.mock.calls[0];
    expect(body.name).toBe("Custom");
    expect(body.url).toBe("https://my-proxy.example.com/v1");
  });

  it("does not flash the empty state while the list refreshes after adding a key", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LLMKeys />);
    await waitFor(() => expect(screen.getByText("No LLM keys yet")).toBeInTheDocument());

    await user.click(screen.getByText("Add API key"));
    await user.click(screen.getByText("Custom"));
    await user.type(screen.getByLabelText(/Endpoint URL/), "https://my-proxy.example.com/v1");
    await user.type(screen.getByLabelText(/Model name/), "llama-3");
    await user.type(screen.getByLabelText(/^API key/), "sk-custom-newkey");

    mockCreateLLMKey.mockResolvedValue({ data: { data: {} } });
    let resolveList!: (value: unknown) => void;
    mockGetLLMKeys.mockReturnValue(new Promise((resolve) => (resolveList = resolve)));

    await user.click(screen.getByText("Add key"));
    await waitFor(() => expect(mockCreateLLMKey).toHaveBeenCalled());
    await waitFor(() => expect(mockGetLLMKeys).toHaveBeenCalledTimes(2));

    // Still refreshing: a spinner, not "no keys".
    expect(screen.queryByText("No LLM keys yet")).not.toBeInTheDocument();

    resolveList({ data: { data: [buildKey({ name: "Custom" })] } });
    await waitFor(() => expect(screen.getByText("Custom endpoint")).toBeInTheDocument());
  });

  it("shows a custom endpoint URL field when Custom provider is selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LLMKeys />);
    await waitFor(() => expect(screen.getByText("No LLM keys yet")).toBeInTheDocument());
    await user.click(screen.getByText("Add API key"));

    await user.click(screen.getByText("Custom"));
    expect(screen.getByLabelText(/Endpoint URL/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Model name/)).toBeInTheDocument();
  });

  it("opens the edit modal pre-filled with existing key data", async () => {
    mockGetLLMKeys.mockResolvedValue({ data: { data: [buildKey()] } });
    const user = userEvent.setup();
    renderWithProviders(<LLMKeys />);
    await waitFor(() => expect(screen.getByText("Anthropic")).toBeInTheDocument());

    const editButtons = screen.getAllByRole("button");
    const editIcon = editButtons.find((btn) =>
      btn.querySelector("svg.lucide-edit, svg.lucide-square-pen"),
    );
    expect(editIcon).toBeTruthy();
    await user.click(editIcon!);
    expect(screen.getByText("Edit API key")).toBeInTheDocument();
  });

  it("deletes a key via the delete confirmation modal", async () => {
    mockGetLLMKeys.mockResolvedValue({ data: { data: [buildKey()] } });
    mockDeleteLLMKey.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWithProviders(<LLMKeys />);
    await waitFor(() => expect(screen.getByText("Anthropic")).toBeInTheDocument());

    const buttons = screen.getAllByRole("button");
    const deleteBtn = buttons.find((btn) => btn.querySelector("svg.lucide-trash"));
    await user.click(deleteBtn!);
    expect(screen.getByText("Delete API key")).toBeInTheDocument();

    await user.click(screen.getByText("Delete"));
    await waitFor(() => {
      expect(mockDeleteLLMKey).toHaveBeenCalledWith("1");
    });
  });

  it("shows an error alert when delete fails", async () => {
    mockGetLLMKeys.mockResolvedValue({ data: { data: [buildKey()] } });
    mockDeleteLLMKey.mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    renderWithProviders(<LLMKeys />);
    await waitFor(() => expect(screen.getByText("Anthropic")).toBeInTheDocument());

    const buttons = screen.getAllByRole("button");
    const deleteBtn = buttons.find((btn) => btn.querySelector("svg.lucide-trash"));
    await user.click(deleteBtn!);
    await user.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(screen.getByText("Failed to delete LLM Key")).toBeInTheDocument();
    });
  });

  it("disables the create button for non-admin roles", async () => {
    mockUserRoleName = "Editor";
    mockGetLLMKeys.mockResolvedValue({ data: { data: [buildKey()] } });
    renderWithProviders(<LLMKeys />);
    await waitFor(() => expect(screen.getByText("Anthropic")).toBeInTheDocument());
    expect(screen.getByText("Create new LLM key").closest("button")).toBeDisabled();
  });

  it("opens the create form when the addKey query is present", async () => {
    renderWithProviders(<LLMKeys />, { route: "/settings/apikeys?addKey=1" });
    expect(await screen.findByRole("heading", { name: "Add API key" })).toBeInTheDocument();
  });

  it("does not open the create form from the deep link for non-admins", async () => {
    mockUserRoleName = "Editor";
    renderWithProviders(<LLMKeys />, { route: "/settings/apikeys?addKey=1" });
    await waitFor(() => expect(screen.getByText("No LLM keys yet")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Add API key" })).not.toBeInTheDocument();
  });

  it("removes the addKey flag from the URL once the form is open", async () => {
    renderWithProviders(
      <>
        <LLMKeys />
        <SearchProbe />
      </>,
      { route: "/settings/apikeys?addKey=1" },
    );
    expect(await screen.findByRole("heading", { name: "Add API key" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent(/^$/));
  });

  it("removes the addKey flag for non-admins too", async () => {
    mockUserRoleName = "Editor";
    renderWithProviders(
      <>
        <LLMKeys />
        <SearchProbe />
      </>,
      { route: "/settings/apikeys?addKey=1" },
    );
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent(/^$/));
  });

  it("stays closed after the deep-linked form is cancelled", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LLMKeys />, { route: "/settings/apikeys?addKey=1" });
    await screen.findByRole("heading", { name: "Add API key" });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Add API key" })).not.toBeInTheDocument(),
    );
  });
});
