import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import CustomException from "../../../../../infrastructure/exceptions/customeException";
import { APIError } from "../../../../../application/tools/error";

let mockUserRoleName = "Admin";
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockUserRoleName, organizationId: 1 }),
}));

vi.mock(
  "../../../../../application/repository/vendorResearch.repository",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../../../application/repository/vendorResearch.repository")
    >()),
    getVendorResearchSearchKey: vi.fn(),
    saveVendorResearchSearchKey: vi.fn(),
    removeVendorResearchSearchKey: vi.fn(),
  }),
);

import * as repository from "../../../../../application/repository/vendorResearch.repository";
import SearchKey from "../index";

const mocks = {
  get: vi.mocked(repository.getVendorResearchSearchKey),
  save: vi.mocked(repository.saveVendorResearchSearchKey),
  remove: vi.mocked(repository.removeVendorResearchSearchKey),
};

const NONE = { provider: "brave", configured: false, last4: null } as const;
const STORED = { provider: "brave", configured: true, last4: "1234" } as const;
const INVALID = "Brave rejected this key. Check that you copied all of it.";
const UNREACHABLE = "Could not reach Brave to check this key.";

/** What the repository throws for a 422 of the search key, as the real one would. */
const refused = (code: string) =>
  new APIError(
    "Unprocessable Entity",
    422,
    new CustomException("Unprocessable Entity", 422, {
      message: "Unprocessable Entity",
      data: { message: "Brave said no.", code },
    }),
  );

/** Shows the query string, so a test can see the deep link removed. */
const SearchProbe = () => <span data-testid="search">{useLocation().search}</span>;

const statusText = () => screen.findByTestId("search-key-status");
const formDialog = () => screen.findByRole("dialog", { name: "Brave search key" });

const typeKey = async (dialog: HTMLElement, key: string) =>
  userEvent.type(within(dialog).getByLabelText(/API key/), key);

beforeEach(() => {
  vi.clearAllMocks();
  mockUserRoleName = "Admin";
  mocks.get.mockResolvedValue(NONE);
});

describe("SearchKey", () => {
  it("says what the key is for and that none is set, and offers to add one", async () => {
    renderWithProviders(<SearchKey />);

    expect(await statusText()).toHaveTextContent("Not set");
    expect(screen.getByText("Search API key")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Vendor research searches the news with Brave when the research key is not an Anthropic key. Without a Brave key, news comes from the GDELT Project, which sometimes refuses requests.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("search-key-add")).toHaveTextContent("Add key");
    expect(screen.queryByTestId("search-key-replace")).not.toBeInTheDocument();
    expect(screen.queryByTestId("search-key-remove")).not.toBeInTheDocument();
  });

  it("shows the last 4 characters of a stored key, and offers to replace or remove it", async () => {
    mocks.get.mockResolvedValue(STORED);
    renderWithProviders(<SearchKey />);

    expect(await statusText()).toHaveTextContent("Brave Search · ending in 1234");
    expect(screen.getByTestId("search-key-replace")).toHaveTextContent("Replace key");
    expect(screen.getByTestId("search-key-remove")).toHaveTextContent("Remove");
    expect(screen.queryByTestId("search-key-add")).not.toBeInTheDocument();
  });

  it("shows nothing, and asks nothing of the server, without llmKeys.admin", async () => {
    mockUserRoleName = "Editor";
    const { container } = renderWithProviders(<SearchKey />);

    expect(container).toBeEmptyDOMElement();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("adds a key, says so, closes the form and shows the key", async () => {
    mocks.save.mockResolvedValue(STORED);
    renderWithProviders(<SearchKey />);
    await statusText();
    mocks.get.mockResolvedValue(STORED);

    await userEvent.click(screen.getByTestId("search-key-add"));
    const dialog = await formDialog();
    const field = within(dialog).getByLabelText(/API key/);
    expect(field).toHaveAttribute("type", "password");
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await typeKey(dialog, "  BSA-secret  ");
    await userEvent.click(save);

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0]).toEqual({ key: "BSA-secret" });
    expect(await screen.findByText("Brave search key saved.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Brave search key" })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTestId("search-key-status")).toHaveTextContent(
        "Brave Search · ending in 1234",
      ),
    );
  });

  it("links to Brave's API page in a new tab and says what Brave charges", async () => {
    renderWithProviders(<SearchKey />);
    await statusText();

    await userEvent.click(screen.getByTestId("search-key-add"));
    const dialog = await formDialog();

    const link = within(dialog).getByRole("link", { name: "Get a key at brave.com/search/api" });
    expect(link).toHaveAttribute("href", "https://brave.com/search/api/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(
      within(dialog).getByText(
        "Brave charges about $5 per 1,000 searches after $5 of free credit a month. A research run makes about 8.",
      ),
    ).toBeInTheDocument();
  });

  it("replaces a stored key", async () => {
    mocks.get.mockResolvedValue(STORED);
    mocks.save.mockResolvedValue({ ...STORED, last4: "9876" });
    renderWithProviders(<SearchKey />);
    await statusText();

    await userEvent.click(screen.getByTestId("search-key-replace"));
    const dialog = await formDialog();
    await typeKey(dialog, "BSA-new-9876");
    mocks.get.mockResolvedValue({ ...STORED, last4: "9876" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.save.mock.calls[0][0]).toEqual({ key: "BSA-new-9876" }));
    await waitFor(() =>
      expect(screen.getByTestId("search-key-status")).toHaveTextContent(
        "Brave Search · ending in 9876",
      ),
    );
  });

  it("says Brave rejected a key, keeps the form open, and offers no Save anyway", async () => {
    mocks.save.mockRejectedValue(refused("invalid_key"));
    renderWithProviders(<SearchKey />);
    await statusText();

    await userEvent.click(screen.getByTestId("search-key-add"));
    const dialog = await formDialog();
    await typeKey(dialog, "BSA-wrong");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText(INVALID)).toBeInTheDocument();
    expect(within(dialog).queryByTestId("search-key-save-anyway")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Brave search key" })).toBeInTheDocument();
    expect(screen.queryByText("Brave search key saved.")).not.toBeInTheDocument();

    // Editing the key clears the error.
    await typeKey(dialog, "x");
    expect(within(dialog).queryByText(INVALID)).not.toBeInTheDocument();
  });

  it("says Brave could not be reached, and saves anyway without the check", async () => {
    mocks.save.mockRejectedValueOnce(refused("unreachable")).mockResolvedValueOnce(STORED);
    renderWithProviders(<SearchKey />);
    await statusText();

    await userEvent.click(screen.getByTestId("search-key-add"));
    const dialog = await formDialog();
    await typeKey(dialog, "BSA-secret");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText(UNREACHABLE)).toBeInTheDocument();
    const anyway = within(dialog).getByTestId("search-key-save-anyway");
    expect(anyway).toHaveTextContent("Save anyway");

    await userEvent.click(anyway);

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][0]).toEqual({ key: "BSA-secret", skipCheck: true });
    expect(await screen.findByText("Brave search key saved.")).toBeInTheDocument();
  });

  it("says the key could not be saved for any other failure", async () => {
    mocks.save.mockRejectedValue(new APIError("Server error", 500));
    renderWithProviders(<SearchKey />);
    await statusText();

    await userEvent.click(screen.getByTestId("search-key-add"));
    const dialog = await formDialog();
    await typeKey(dialog, "BSA-secret");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await within(dialog).findByText("Could not save the key. Try again."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByTestId("search-key-save-anyway")).not.toBeInTheDocument();
  });

  it("removes the key after a confirmation that says what happens instead", async () => {
    mocks.get.mockResolvedValue(STORED);
    mocks.remove.mockResolvedValue(NONE);
    renderWithProviders(<SearchKey />);
    await statusText();

    await userEvent.click(screen.getByTestId("search-key-remove"));
    const title = await screen.findByText("Remove the Brave search key?");
    expect(
      screen.getByText("Vendor research will search the news with the GDELT Project instead."),
    ).toBeInTheDocument();
    const confirm = title.closest("[role='dialog'], .MuiModal-root") as HTMLElement;
    mocks.get.mockResolvedValue(NONE);
    await userEvent.click(within(confirm).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Brave search key removed.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("search-key-status")).toHaveTextContent("Not set"),
    );
    expect(screen.queryByText("Remove the Brave search key?")).not.toBeInTheDocument();
  });

  it("keeps the key when the confirmation is cancelled", async () => {
    mocks.get.mockResolvedValue(STORED);
    renderWithProviders(<SearchKey />);
    await statusText();

    await userEvent.click(screen.getByTestId("search-key-remove"));
    const title = await screen.findByText("Remove the Brave search key?");
    const confirm = title.closest("[role='dialog'], .MuiModal-root") as HTMLElement;
    await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));

    expect(mocks.remove).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("Remove the Brave search key?")).not.toBeInTheDocument(),
    );
  });

  it("opens the form from the research settings link, then drops the flag from the URL", async () => {
    renderWithProviders(
      <>
        <SearchKey />
        <SearchProbe />
      </>,
      { route: "/settings/apikeys?addSearchKey=1" },
    );

    expect(await formDialog()).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent(/^$/));
  });

  it("drops the flag without opening anything for a user who cannot manage the key", async () => {
    mockUserRoleName = "Editor";
    renderWithProviders(
      <>
        <SearchKey />
        <SearchProbe />
      </>,
      { route: "/settings/apikeys?addSearchKey=1" },
    );

    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent(/^$/));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
