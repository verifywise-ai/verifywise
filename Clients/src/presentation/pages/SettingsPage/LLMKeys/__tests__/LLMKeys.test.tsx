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

  describe("check on save", () => {
    /** The error the network layer throws: `response` is the response body. */
    const checkError = (code: string, message: string) =>
      Object.assign(new Error(message), {
        status: code === "unreachable" ? 409 : 400,
        response: {
          message: code === "unreachable" ? "Conflict" : "Bad Request",
          data: { message, code },
        },
      });

    /** Opens the add form on Anthropic, with its recommended model selected. */
    const openAnthropicForm = async (user: ReturnType<typeof userEvent.setup>) => {
      renderWithProviders(<LLMKeys />);
      await waitFor(() => expect(screen.getByText("No LLM keys yet")).toBeInTheDocument());
      await user.click(screen.getByText("Add API key"));
      await user.click(screen.getByText("Anthropic"));
      await user.type(screen.getByLabelText(/^API key/), "sk-ant-usr-abc");
    };

    it("masks the API key input", async () => {
      const user = userEvent.setup();
      await openAnthropicForm(user);
      expect(screen.getByLabelText(/^API key/)).toHaveAttribute("type", "password");
    });

    it("sends the Anthropic workspace ID as the anthropic-workspace-id header", async () => {
      const user = userEvent.setup();
      await openAnthropicForm(user);
      expect(
        screen.getByText("Only for keys that are not tied to a workspace."),
      ).toBeInTheDocument();
      await user.type(screen.getByLabelText(/^Workspace ID/), " wrkspc_01abc ");

      mockCreateLLMKey.mockResolvedValue({ data: { data: {} } });
      await user.click(screen.getByText("Add key"));

      await waitFor(() => expect(mockCreateLLMKey).toHaveBeenCalled());
      const [{ body }] = mockCreateLLMKey.mock.calls[0];
      expect(body.custom_headers).toEqual({ "anthropic-workspace-id": "wrkspc_01abc" });
      expect(body.skip_verification).toBeUndefined();
    });

    it("refuses a workspace ID with spaces", async () => {
      const user = userEvent.setup();
      await openAnthropicForm(user);
      await user.type(screen.getByLabelText(/^Workspace ID/), "wrkspc 01");
      expect(screen.getByText("Workspace ID cannot contain spaces.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add key" })).toBeDisabled();
    });

    it("shows a workspace refusal under the workspace field and keeps the form open", async () => {
      const user = userEvent.setup();
      await openAnthropicForm(user);
      const message =
        "This Anthropic key is not tied to a workspace. Create the key inside a workspace in the Anthropic Console, or enter the workspace ID.";
      mockCreateLLMKey.mockRejectedValue(checkError("workspace_required", message));

      await user.click(screen.getByText("Add key"));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Workspace ID/)).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByRole("heading", { name: "Add API key" })).toBeInTheDocument();
      expect(screen.queryByText("API key added successfully")).not.toBeInTheDocument();
    });

    it("shows a rejected key under the API key field", async () => {
      const user = userEvent.setup();
      await openAnthropicForm(user);
      const message = "The provider rejected this key. Check that you copied all of it.";
      mockCreateLLMKey.mockRejectedValue(checkError("invalid_key", message));

      await user.click(screen.getByText("Add key"));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByLabelText(/^API key/)).toHaveAttribute("aria-invalid", "true");
    });

    it("clears the refusal when the field changes", async () => {
      const user = userEvent.setup();
      await openAnthropicForm(user);
      const message = "The provider rejected this key. Check that you copied all of it.";
      mockCreateLLMKey.mockRejectedValue(checkError("invalid_key", message));
      await user.click(screen.getByText("Add key"));
      await screen.findByText(message);

      await user.type(screen.getByLabelText(/^API key/), "d");
      expect(screen.queryByText(message)).not.toBeInTheDocument();
    });

    it("offers Save anyway when the provider could not be reached, and resends with skip_verification", async () => {
      const user = userEvent.setup();
      await openAnthropicForm(user);
      mockCreateLLMKey.mockRejectedValueOnce(
        checkError("unreachable", "Could not reach Anthropic to check this key."),
      );

      await user.click(screen.getByText("Add key"));
      expect(
        await screen.findByText("Could not reach Anthropic to check this key."),
      ).toBeInTheDocument();

      mockCreateLLMKey.mockResolvedValueOnce({ data: { data: {} } });
      await user.click(screen.getByText("Save anyway"));

      await waitFor(() => expect(mockCreateLLMKey).toHaveBeenCalledTimes(2));
      expect(mockCreateLLMKey.mock.calls[1][0].body.skip_verification).toBe(true);
      await waitFor(() =>
        expect(screen.queryByRole("heading", { name: "Add API key" })).not.toBeInTheDocument(),
      );
    });

    it("says it is checking the key while saving", async () => {
      const user = userEvent.setup();
      await openAnthropicForm(user);
      mockCreateLLMKey.mockReturnValue(new Promise(() => undefined));

      await user.click(screen.getByText("Add key"));
      expect(await screen.findByText("Checking key…")).toBeInTheDocument();
    });

    it("reads the workspace ID back when editing an Anthropic key", async () => {
      mockGetLLMKeys.mockResolvedValue({
        data: {
          data: [
            buildKey({
              custom_headers: { "anthropic-workspace-id": "wrkspc_saved", "x-other": "kept" },
            }),
          ],
        },
      });
      const user = userEvent.setup();
      renderWithProviders(<LLMKeys />);
      await waitFor(() => expect(screen.getByText("Anthropic")).toBeInTheDocument());
      const editIcon = screen
        .getAllByRole("button")
        .find((btn) => btn.querySelector("svg.lucide-edit, svg.lucide-square-pen"));
      await user.click(editIcon!);

      expect(screen.getByLabelText(/^Workspace ID/)).toHaveValue("wrkspc_saved");

      await user.type(screen.getByLabelText(/^API key/), "sk-ant-new");
      mockEditLLMKey.mockResolvedValue({ data: { data: {} } });
      await user.click(screen.getByText("Save changes"));

      await waitFor(() => expect(mockEditLLMKey).toHaveBeenCalled());
      expect(mockEditLLMKey.mock.calls[0][0].body.custom_headers).toEqual({
        "x-other": "kept",
        "anthropic-workspace-id": "wrkspc_saved",
      });
    });

    it("has no workspace field for other providers", async () => {
      const user = userEvent.setup();
      renderWithProviders(<LLMKeys />);
      await waitFor(() => expect(screen.getByText("No LLM keys yet")).toBeInTheDocument());
      await user.click(screen.getByText("Add API key"));
      await user.click(screen.getByText("OpenAI"));
      expect(screen.queryByLabelText(/^Workspace ID/)).not.toBeInTheDocument();
    });

    it("shows a soft warning in the server's words and still offers Save anyway", async () => {
      const user = userEvent.setup();
      renderWithProviders(<LLMKeys />);
      await waitFor(() => expect(screen.getByText("No LLM keys yet")).toBeInTheDocument());
      await user.click(screen.getByText("Add API key"));
      await user.click(screen.getByText("Custom"));
      await user.type(screen.getByLabelText(/Endpoint URL/), "https://proxy.example.com/v1");
      await user.type(screen.getByLabelText(/Model name/), "llama-3");
      await user.type(screen.getByLabelText(/^API key/), "sk-custom");
      mockCreateLLMKey.mockRejectedValueOnce(
        checkError("unreachable", "llama-3 is not in this endpoint's model list."),
      );

      await user.click(screen.getByText("Add key"));

      expect(
        await screen.findByText("llama-3 is not in this endpoint's model list."),
      ).toBeInTheDocument();
      expect(screen.getByText("Save anyway")).toBeInTheDocument();
    });

    it("keeps the form open and shows the server's message for another refusal", async () => {
      const user = userEvent.setup();
      await openAnthropicForm(user);
      mockCreateLLMKey.mockRejectedValue(
        Object.assign(new Error("Endpoint URL is required for Custom provider"), {
          status: 400,
          response: {
            message: "Bad Request",
            data: "Endpoint URL is required for Custom provider",
          },
        }),
      );
      await user.click(screen.getByText("Add key"));

      expect(
        await screen.findByText("Endpoint URL is required for Custom provider"),
      ).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Add API key" })).toBeInTheDocument();
    });

    it("shows a generic message for a server or network failure", async () => {
      const user = userEvent.setup();
      await openAnthropicForm(user);
      mockCreateLLMKey.mockRejectedValue(
        Object.assign(new Error("Network Error"), { status: undefined, response: undefined }),
      );
      await user.click(screen.getByText("Add key"));
      expect(await screen.findByText("Failed to add API key")).toBeInTheDocument();
    });

    it("sends no custom headers for a new OpenAI key", async () => {
      const user = userEvent.setup();
      renderWithProviders(<LLMKeys />);
      await waitFor(() => expect(screen.getByText("No LLM keys yet")).toBeInTheDocument());
      await user.click(screen.getByText("Add API key"));
      await user.click(screen.getByText("OpenAI"));
      await user.type(screen.getByLabelText(/^API key/), "sk-proj-1");
      mockCreateLLMKey.mockResolvedValue({ data: { data: {} } });
      await user.click(screen.getByText("Add key"));
      await waitFor(() => expect(mockCreateLLMKey).toHaveBeenCalled());
      expect(mockCreateLLMKey.mock.calls[0][0].body.custom_headers).toBeNull();
    });

    const editFirstKey = async (user: ReturnType<typeof userEvent.setup>) => {
      const editIcon = screen
        .getAllByRole("button")
        .find((btn) => btn.querySelector("svg.lucide-edit, svg.lucide-square-pen"));
      await user.click(editIcon!);
    };

    it("drops a Custom key's headers when it is switched to OpenAI, and asks for the key again", async () => {
      mockGetLLMKeys.mockResolvedValue({
        data: {
          data: [
            buildKey({
              name: "Custom",
              url: "https://proxy.example.com/v1",
              model: "llama-3",
              custom_headers: { Authorization: "Bearer old-secret" },
            }),
          ],
        },
      });
      const user = userEvent.setup();
      renderWithProviders(<LLMKeys />);
      await waitFor(() => expect(screen.getByText("Custom endpoint")).toBeInTheDocument());
      await editFirstKey(user);
      expect(
        screen.queryByText("You changed the provider or endpoint, so enter the API key again."),
      ).not.toBeInTheDocument();

      await user.click(screen.getByText("OpenAI"));
      expect(
        screen.getByText("You changed the provider or endpoint, so enter the API key again."),
      ).toBeInTheDocument();

      await user.type(screen.getByLabelText(/^API key/), "sk-proj-new");
      mockEditLLMKey.mockResolvedValue({ data: { data: {} } });
      await user.click(screen.getByText("Save changes"));
      await waitFor(() => expect(mockEditLLMKey).toHaveBeenCalled());
      expect(mockEditLLMKey.mock.calls[0][0].body.custom_headers).toBeNull();
    });

    it("keeps an OpenAI key's own headers on edit", async () => {
      mockGetLLMKeys.mockResolvedValue({
        data: {
          data: [
            buildKey({
              name: "OpenAI",
              model: "gpt-4o",
              custom_headers: { "OpenAI-Organization": "org-1" },
            }),
          ],
        },
      });
      const user = userEvent.setup();
      renderWithProviders(<LLMKeys />);
      await waitFor(() => expect(screen.getByText("OpenAI")).toBeInTheDocument());
      await editFirstKey(user);
      await user.type(screen.getByLabelText(/^API key/), "sk-proj-new");
      mockEditLLMKey.mockResolvedValue({ data: { data: {} } });
      await user.click(screen.getByText("Save changes"));
      await waitFor(() => expect(mockEditLLMKey).toHaveBeenCalled());
      expect(mockEditLLMKey.mock.calls[0][0].body.custom_headers).toEqual({
        "OpenAI-Organization": "org-1",
      });
    });

    it("asks for the key again when a Custom endpoint URL changes", async () => {
      mockGetLLMKeys.mockResolvedValue({
        data: {
          data: [buildKey({ name: "Custom", url: "https://proxy.example.com/v1", model: "m" })],
        },
      });
      const user = userEvent.setup();
      renderWithProviders(<LLMKeys />);
      await waitFor(() => expect(screen.getByText("Custom endpoint")).toBeInTheDocument());
      await editFirstKey(user);
      await user.type(screen.getByLabelText(/Endpoint URL/), "/x");
      expect(
        screen.getByText("You changed the provider or endpoint, so enter the API key again."),
      ).toBeInTheDocument();
    });
  });
});
