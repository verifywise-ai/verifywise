/**
 * The research settings window with the real LLM keys hook: only the request for the list is
 * mocked. The window must never offer the saved keys as the default, nor save the default over
 * them, while it has no list of keys that was read: after the request failed, and while Retry
 * asks for it again (the query is pending then, with neither an error nor a first load).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { deferred } from "./fixtures";

vi.mock(
  "../../../../../application/repository/vendorResearch.repository",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../../../application/repository/vendorResearch.repository")
    >()),
    getVendorResearchSettings: vi.fn(),
    // No line about the search: what these tests read is elsewhere.
    getVendorResearchSearchStatus: vi.fn(async () => ({
      engines: { default: null, byKey: {} },
      recentRunsFoundNoNews: false,
    })),
    saveVendorResearchSettings: vi.fn(),
  }),
);
vi.mock("../../../../../application/repository/llmKeys.repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../../../application/repository/llmKeys.repository")
  >()),
  getLLMKeys: vi.fn(),
}));
// The keys are read for the organization of the person signed in.
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ organizationId: 1, userId: 4, userRoleName: "Admin" }),
}));

import * as repository from "../../../../../application/repository/vendorResearch.repository";
import { getLLMKeys } from "../../../../../application/repository/llmKeys.repository";
import ResearchSettingsModal from "../ResearchSettingsModal";

const mocks = {
  settings: vi.mocked(repository.getVendorResearchSettings),
  save: vi.mocked(repository.saveVendorResearchSettings),
  keys: vi.mocked(getLLMKeys),
};

/** The answer of GET /llm-keys, as the repository hands it on. */
const KEY_LIST = {
  data: {
    data: [
      { id: 30, name: "OpenAI", model: "gpt-newest" },
      { id: 20, name: "Anthropic", model: "claude-deep" },
      { id: 10, name: "OpenRouter", model: "llama-fast" },
    ],
  },
};
const serverError = () => Object.assign(new Error("Request failed"), { status: 500 });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.mockResolvedValue({
    researchKeyId: 20,
    analysisKeyId: 10,
    scanIntervalDays: null,
    autoResearchOnCreate: true,
  });
  mocks.save.mockImplementation(async (settings) => settings);
});

describe("research settings with a list of keys that could not be read", () => {
  it("offers nothing and saves nothing, also while Retry reads the list again", async () => {
    const retried = deferred<typeof KEY_LIST>();
    mocks.keys.mockRejectedValueOnce(serverError()).mockReturnValueOnce(retried.promise);
    renderWithProviders(<ResearchSettingsModal onClose={vi.fn()} onNotify={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "Research settings" });

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Could not load the research settings.");
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    const save = () => within(dialog).getByRole("button", { name: "Save" });
    expect(save()).toBeDisabled();

    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mocks.keys).toHaveBeenCalledTimes(2));

    // The list is on its way: still nothing to choose, nothing to save.
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    expect(mocks.save).not.toHaveBeenCalled();

    retried.resolve(KEY_LIST);

    const [research, analysis] = await within(dialog).findAllByRole("combobox");
    expect(research).toHaveTextContent("Anthropic · claude-deep");
    expect(analysis).toHaveTextContent("OpenRouter · llama-fast");
    expect(save()).toBeEnabled();
  });

  it("sends the saved keys unchanged once the list has been read", async () => {
    mocks.keys.mockRejectedValueOnce(serverError()).mockResolvedValueOnce(KEY_LIST);
    const onClose = vi.fn();
    renderWithProviders(<ResearchSettingsModal onClose={onClose} onNotify={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "Research settings" });

    await userEvent.click(await within(dialog).findByRole("button", { name: "Retry" }));
    await within(dialog).findAllByRole("combobox");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.save).toHaveBeenCalledWith({
      researchKeyId: 20,
      analysisKeyId: 10,
      scanIntervalDays: null,
      autoResearchOnCreate: true,
    });
  });
});
