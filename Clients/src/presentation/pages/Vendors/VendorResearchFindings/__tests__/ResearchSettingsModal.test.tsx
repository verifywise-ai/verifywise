import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { LLMKeysModel } from "../../../../../domain/models/Common/llmKeys/llmKeys.model";
import { deferred, refusal } from "./fixtures";

vi.mock(
  "../../../../../application/repository/vendorResearch.repository",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../../../application/repository/vendorResearch.repository")
    >()),
    getVendorResearchSettings: vi.fn(),
    saveVendorResearchSettings: vi.fn(),
  }),
);

// The organization's keys come from the LLM keys hook, newest first, as the server lists them.
const llmKeys = vi.hoisted(() => ({
  current: { keys: [] as unknown[], loading: false },
}));
vi.mock("../../../../../application/hooks/useLLMKeys", () => ({
  useLLMKeys: () => llmKeys.current,
  invalidateLLMKeyQueries: vi.fn(),
}));

import * as repository from "../../../../../application/repository/vendorResearch.repository";
import { invalidateLLMKeyQueries } from "../../../../../application/hooks/useLLMKeys";
import ResearchSettingsModal from "../ResearchSettingsModal";

const mocks = {
  settings: vi.mocked(repository.getVendorResearchSettings),
  save: vi.mocked(repository.saveVendorResearchSettings),
  invalidateKeys: vi.mocked(invalidateLLMKeyQueries),
};

const KEYS = [
  new LLMKeysModel({ id: 30, name: "OpenAI", key: "", model: "gpt-newest" }),
  new LLMKeysModel({ id: 20, name: "Anthropic", key: "", model: "claude-deep" }),
  new LLMKeysModel({ id: 10, name: "OpenRouter", key: "", model: "llama-fast" }),
];
const NEWEST = "OpenAI · gpt-newest";
const DEEP = "Anthropic · claude-deep";
const FAST = "OpenRouter · llama-fast";
const RESEARCH_DEFAULT = "Newest key (default)";
const ANALYSIS_DEFAULT = "Same as the research key (default)";
const SCAN_OFF = "Off";
const SCAN_WEEKLY = "Every week";
const SCAN_BIWEEKLY = "Every 2 weeks";
const SCAN_MONTHLY = "Every month";

type SavedSettings = {
  researchKeyId: number | null;
  analysisKeyId: number | null;
  scanIntervalDays: number | null;
};

const renderModal = () => {
  const handlers = { onClose: vi.fn(), onNotify: vi.fn() };
  renderWithProviders(<ResearchSettingsModal {...handlers} />);
  return handlers;
};

/** The window, once the settings have loaded and the three selects are in it. */
const openWindow = async () => {
  const dialog = await screen.findByRole("dialog", { name: "Research settings" });
  await within(dialog).findAllByRole("combobox");
  return dialog;
};
const selectsOf = (dialog: HTMLElement) => {
  const [research, analysis, scan] = within(dialog).getAllByRole("combobox");
  return { research, analysis, scan };
};
const choose = async (select: HTMLElement, name: string) => {
  await userEvent.click(select);
  await userEvent.click(await screen.findByRole("option", { name }));
};
/** The options of the open select, by name. The shared Select writes a space after each name. */
const optionNames = async () =>
  (await screen.findAllByRole("option")).map((option) => option.textContent?.trim());
const clickSave = (dialog: HTMLElement) =>
  userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

beforeEach(() => {
  vi.clearAllMocks();
  llmKeys.current = { keys: KEYS, loading: false };
  mocks.settings.mockResolvedValue({
    researchKeyId: null,
    analysisKeyId: null,
    scanIntervalDays: null,
  });
  mocks.save.mockImplementation(async (settings) => settings);
});

describe("what the window shows", () => {
  it("shows the default for both keys when nothing has been chosen", async () => {
    renderModal();
    const { research, analysis } = selectsOf(await openWindow());

    expect(research).toHaveTextContent(RESEARCH_DEFAULT);
    expect(analysis).toHaveTextContent(ANALYSIS_DEFAULT);
  });

  it("explains what each key is used for", async () => {
    renderModal();
    const dialog = await openWindow();

    expect(dialog).toHaveTextContent("Choose which LLM key runs the vendor research.");
    expect(dialog).toHaveTextContent("The research key makes many small calls");
    expect(dialog).toHaveTextContent("The analysis key writes the risks");
  });

  it("shows the keys that were chosen, by provider and model", async () => {
    mocks.settings.mockResolvedValue({
      researchKeyId: 10,
      analysisKeyId: 20,
      scanIntervalDays: null,
    });
    renderModal();
    const { research, analysis } = selectsOf(await openWindow());

    expect(research).toHaveTextContent(FAST);
    expect(analysis).toHaveTextContent(DEEP);
  });

  it("lists the default and every key of the organization in both selects, newest first", async () => {
    renderModal();
    const { research, analysis } = selectsOf(await openWindow());

    await userEvent.click(research);
    expect(await optionNames()).toEqual([RESEARCH_DEFAULT, NEWEST, DEEP, FAST]);
    await userEvent.keyboard("{Escape}");

    await userEvent.click(analysis);
    expect(await optionNames()).toEqual([ANALYSIS_DEFAULT, NEWEST, DEEP, FAST]);
  });

  it("shows the scheduled scan as off when nothing has been chosen", async () => {
    renderModal();
    const { scan } = selectsOf(await openWindow());

    expect(scan).toHaveTextContent(SCAN_OFF);
  });

  it.each([
    [7, SCAN_WEEKLY],
    [14, SCAN_BIWEEKLY],
    [30, SCAN_MONTHLY],
  ])("shows a saved interval of %i days as %s", async (days, name) => {
    mocks.settings.mockResolvedValue({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: days,
    });
    renderModal();
    const { scan } = selectsOf(await openWindow());

    expect(scan).toHaveTextContent(name);
  });

  it("lists off and the three intervals for the scheduled scan", async () => {
    renderModal();
    const { scan } = selectsOf(await openWindow());

    await userEvent.click(scan);

    expect(await optionNames()).toEqual([SCAN_OFF, SCAN_WEEKLY, SCAN_BIWEEKLY, SCAN_MONTHLY]);
  });

  // The server takes 7, 14 and 30. The same rule as for a key that is gone: what is shown is what
  // is saved.
  it("shows off for a saved interval that is not one of the choices", async () => {
    mocks.settings.mockResolvedValue({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: 21,
    });
    renderModal();
    const { scan } = selectsOf(await openWindow());

    expect(scan).toHaveTextContent(SCAN_OFF);
  });

  it("explains what the scheduled scan does and which keys it uses", async () => {
    renderModal();
    const dialog = await openWindow();

    expect(dialog).toHaveTextContent(
      "A scheduled scan researches every vendor again on this schedule and tells its assignee when it finds something.",
    );
    expect(dialog).toHaveTextContent(
      "It analyses only sources it has not seen before, and it uses the keys above.",
    );
  });

  it("shows the default for a saved key that is not in the list any more", async () => {
    mocks.settings.mockResolvedValue({
      researchKeyId: 99,
      analysisKeyId: 98,
      scanIntervalDays: null,
    });
    renderModal();
    const { research, analysis } = selectsOf(await openWindow());

    expect(research).toHaveTextContent(RESEARCH_DEFAULT);
    expect(analysis).toHaveTextContent(ANALYSIS_DEFAULT);
  });
});

describe("while it loads", () => {
  it("shows a skeleton and cannot be saved while the settings load", async () => {
    mocks.settings.mockReturnValue(new Promise(() => {}));
    renderModal();

    const dialog = await screen.findByRole("dialog", { name: "Research settings" });

    expect(within(dialog).getByRole("status", { name: "Loading research settings" })).toBeVisible();
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shows the skeleton while the keys load, because a choice cannot be shown without them", async () => {
    llmKeys.current = { keys: [], loading: true };
    renderModal();

    const dialog = await screen.findByRole("dialog", { name: "Research settings" });

    expect(within(dialog).getByRole("status", { name: "Loading research settings" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("says the settings could not be loaded, cannot be saved, and tries again on Retry", async () => {
    mocks.settings.mockRejectedValueOnce(refusal(500));
    renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Research settings" });

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Could not load the research settings.");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    await within(dialog).findAllByRole("combobox");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.settings).toHaveBeenCalledTimes(2);
  });
});

describe("saving", () => {
  it("sends the keys that were chosen, tells the page, and closes", async () => {
    const { onClose, onNotify } = renderModal();
    const dialog = await openWindow();
    const { research, analysis } = selectsOf(dialog);

    await choose(research, FAST);
    await choose(analysis, DEEP);
    await clickSave(dialog);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0][0]).toEqual({
      researchKeyId: 10,
      analysisKeyId: 20,
      scanIntervalDays: null,
    });
    expect(onNotify).toHaveBeenCalledWith({
      variant: "success",
      body: "Research settings saved.",
    });
  });

  it("sends null for a key that is set back to the default", async () => {
    mocks.settings.mockResolvedValue({
      researchKeyId: 10,
      analysisKeyId: 20,
      scanIntervalDays: null,
    });
    const { onClose } = renderModal();
    const dialog = await openWindow();
    const { research, analysis } = selectsOf(dialog);

    await choose(research, RESEARCH_DEFAULT);
    await choose(analysis, ANALYSIS_DEFAULT);
    await clickSave(dialog);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0]).toEqual({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
  });

  it("sends the interval that was chosen", async () => {
    const { onClose } = renderModal();
    const dialog = await openWindow();

    await choose(selectsOf(dialog).scan, SCAN_BIWEEKLY);
    await clickSave(dialog);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0]).toEqual({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: 14,
    });
  });

  it("sends null for a scan that is switched off", async () => {
    mocks.settings.mockResolvedValue({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: 30,
    });
    const { onClose } = renderModal();
    const dialog = await openWindow();

    await choose(selectsOf(dialog).scan, SCAN_OFF);
    await clickSave(dialog);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0]).toEqual({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
  });

  it("sends the saved interval as it is when only a key was changed", async () => {
    mocks.settings.mockResolvedValue({
      researchKeyId: null,
      analysisKeyId: null,
      scanIntervalDays: 7,
    });
    const { onClose } = renderModal();
    const dialog = await openWindow();

    await choose(selectsOf(dialog).research, DEEP);
    await clickSave(dialog);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0]).toEqual({
      researchKeyId: 20,
      analysisKeyId: null,
      scanIntervalDays: 7,
    });
  });

  it("sends the saved choice as it is when nothing was changed", async () => {
    mocks.settings.mockResolvedValue({
      researchKeyId: 10,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
    const { onClose } = renderModal();
    const dialog = await openWindow();

    await clickSave(dialog);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0]).toEqual({
      researchKeyId: 10,
      analysisKeyId: null,
      scanIntervalDays: null,
    });
  });

  it("offers nothing to choose before the saved choice is there, so that it cannot be overwritten by mistake", async () => {
    const loading = deferred<SavedSettings>();
    mocks.settings.mockReturnValue(loading.promise);
    renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Research settings" });
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();

    loading.resolve({ researchKeyId: 10, analysisKeyId: null, scanIntervalDays: null });
    const { research } = selectsOf(await openWindow());

    expect(research).toHaveTextContent(FAST);
  });

  it("sends one request when Save is clicked while the first one is on its way", async () => {
    const answer = deferred<SavedSettings>();
    mocks.save.mockReturnValue(answer.promise);
    const { onClose } = renderModal();
    const dialog = await openWindow();
    await choose(selectsOf(dialog).research, DEEP);

    await clickSave(dialog);
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled(),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    answer.resolve({ researchKeyId: 20, analysisKeyId: null, scanIntervalDays: null });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("stays open with the choice when saving fails, and can be saved again", async () => {
    mocks.save.mockRejectedValueOnce(refusal(500));
    const { onClose, onNotify } = renderModal();
    const dialog = await openWindow();
    const { research } = selectsOf(dialog);
    await choose(research, DEEP);

    await clickSave(dialog);

    // The global error toast reports a 500 on its own: the window says nothing more.
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Save" })).not.toBeDisabled(),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalled();
    expect(research).toHaveTextContent(DEEP);

    await clickSave(dialog);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledTimes(2);
  });

  it("says a key is gone when the server answers 404, reads the list of keys again, and stays open", async () => {
    mocks.save.mockRejectedValueOnce(refusal(404));
    const { onClose, onNotify } = renderModal();
    const dialog = await openWindow();
    await choose(selectsOf(dialog).research, DEEP);

    await clickSave(dialog);

    // The global error toast skips a 404 on purpose, so the window has to say why nothing was saved.
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith({
        variant: "warning",
        body: "One of the chosen LLM keys no longer exists. Choose the keys again.",
      }),
    );
    expect(mocks.invalidateKeys).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("closing", () => {
  it("closes on Cancel without saving", async () => {
    const { onClose, onNotify } = renderModal();
    const dialog = await openWindow();
    await choose(selectsOf(dialog).research, DEEP);

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalled();
  });
});
