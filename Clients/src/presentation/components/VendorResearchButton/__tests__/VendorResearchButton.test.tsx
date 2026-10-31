import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import type { VendorResearchConfig } from "../../../../domain/interfaces/i.vendorResearch";
import {
  deferred,
  refusal,
  run,
} from "../../../pages/Vendors/VendorResearchFindings/__tests__/fixtures";
import { AfterSettings, SET_UP } from "./fixtures";

// The Task 9 repository, with `readVendorResearchError` kept real: the alerts read refusals with it.
vi.mock("../../../../application/repository/vendorResearch.repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../../application/repository/vendorResearch.repository")
  >()),
  getVendorResearchConfig: vi.fn(),
  startVendorResearch: vi.fn(),
}));

const role = vi.hoisted(() => ({ canEdit: true }));
vi.mock("../../../../application/hooks/useMyPermissions", () => ({
  useHasPermission: (key: string) => key === "vendor.edit" && role.canEdit,
}));

import * as repository from "../../../../application/repository/vendorResearch.repository";
import { VENDOR_RESEARCH_FOLLOW_KEY } from "../../../../application/hooks/useVendorResearch";
import VendorResearchButton from "..";

const mocks = {
  config: vi.mocked(repository.getVendorResearchConfig),
  start: vi.mocked(repository.startVendorResearch),
};

type StartResult = Awaited<ReturnType<typeof repository.startVendorResearch>>;

const researchButton = () => screen.getByRole("button", { name: "Research risks" });

/** The button of vendor 7, on a page that knows the settings. */
const renderWithSettings = async (
  settings: VendorResearchConfig,
  children?: (onNotify: () => void) => ReactNode,
) => {
  mocks.config.mockResolvedValue(settings);
  const onNotify = vi.fn();
  const view = renderWithProviders(
    <AfterSettings>
      {children ? (
        children(onNotify)
      ) : (
        <VendorResearchButton vendorId={7} vendorName="Acme Cloud" onNotify={onNotify} />
      )}
    </AfterSettings>,
  );
  await screen.findAllByRole("button", { name: "Research risks" });
  return { ...view, onNotify };
};

beforeEach(() => {
  vi.clearAllMocks();
  role.canEdit = true;
  mocks.config.mockResolvedValue(SET_UP);
});

describe("who sees the button", () => {
  it("is not shown without vendor.edit, and the server is asked for nothing", () => {
    role.canEdit = false;
    renderWithProviders(
      <VendorResearchButton vendorId={7} vendorName="Acme Cloud" onNotify={vi.fn()} />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("is an icon button named Research risks, 30px high, with that tooltip", async () => {
    await renderWithSettings(SET_UP);

    const button = researchButton();
    expect(button).toBeEnabled();
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(button).toHaveStyle({ height: "30px", width: "30px" });

    await userEvent.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Research risks");
  });
});

describe("when research is not set up", () => {
  it("is disabled, and says research is not set up, when the organization has no LLM key", async () => {
    await renderWithSettings({ hasLlmKey: false, autoRunEnabled: true });

    const button = researchButton();
    expect(button).toBeDisabled();
    // A disabled button gets no pointer events, so the tooltip hangs on the span around it.
    await userEvent.hover(button.parentElement as HTMLElement);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Vendor research is not set up.");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "is enabled with an LLM key alone, with the automatic runs on or off (%s)",
    async (autoRunEnabled) => {
      await renderWithSettings({ hasLlmKey: true, autoRunEnabled });

      expect(researchButton()).toBeEnabled();
      await userEvent.hover(researchButton());
      expect(await screen.findByRole("tooltip")).toHaveTextContent("Research risks");
    },
  );

  it("stays disabled and silent while the settings load, and starts nothing until they say it can", async () => {
    const settings = deferred<VendorResearchConfig>();
    mocks.config.mockReturnValue(settings.promise);
    renderWithProviders(
      <VendorResearchButton vendorId={7} vendorName="Acme Cloud" onNotify={vi.fn()} />,
    );

    // The settings are asked for as soon as an allowed button renders: the control for the first
    // test, which expects no request for a user who may not start research.
    expect(mocks.config).toHaveBeenCalled();
    expect(researchButton()).toBeDisabled();

    // From here the clock is the test's own, so that the time a tooltip needs to open is spent,
    // not waited for. Before the answer, a tooltip saying "not set up" would only be a guess.
    vi.useFakeTimers();
    const pass = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    fireEvent.mouseOver(researchButton().parentElement as HTMLElement);
    await pass(500);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();

    // The same hover opens the tooltip once the settings are in (the control for the line above).
    settings.resolve(SET_UP);
    await pass(10);
    expect(researchButton()).toBeEnabled();
    fireEvent.mouseOver(researchButton().parentElement as HTMLElement);
    await pass(500);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Research risks");
  });
});

// The findings section on the Risks tab takes a failed request as "set up" as well. A button that
// stayed disabled, with nothing to say why, until the page is opened again would be worse than a
// start that the server can still refuse: it answers 409, and the message says "not set up".
describe("when the settings cannot be loaded", () => {
  /**
   * The button of vendor 7 where the request for the settings fails for good (the test client
   * never retries). It starts out like any button whose settings are on their way, disabled, and
   * is enabled once the request has failed. It is rendered on its own, not behind
   * `AfterSettings`, which renders its children only once the settings have data, and a failed
   * request never gives any.
   */
  const renderWithFailedSettings = async () => {
    mocks.config.mockRejectedValue(refusal(500));
    const onNotify = vi.fn();
    const view = renderWithProviders(
      <VendorResearchButton vendorId={7} vendorName="Acme Cloud" onNotify={onNotify} />,
    );
    expect(researchButton()).toBeDisabled();
    await waitFor(() => expect(researchButton()).toBeEnabled());
    return { ...view, onNotify };
  };

  it("lets the server decide: the button is enabled, with the Research risks tooltip", async () => {
    await renderWithFailedSettings();

    await userEvent.hover(researchButton());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Research risks");
  });

  it("is disabled until the request has failed, not only until it has succeeded", async () => {
    const settings = deferred<VendorResearchConfig>();
    mocks.config.mockReturnValue(settings.promise);
    renderWithProviders(
      <VendorResearchButton vendorId={7} vendorName="Acme Cloud" onNotify={vi.fn()} />,
    );
    expect(researchButton()).toBeDisabled();

    settings.reject(refusal(500));

    await waitFor(() => expect(researchButton()).toBeEnabled());
  });

  // Every row has its own button, and each of them reads the one settings query. When the table is
  // sorted or paged, or the user comes back to the tab, new buttons mount on the failed query: it
  // must not be asked again, or every button would turn disabled for as long as that takes.
  it("stays enabled when another row's button mounts, and the request is not asked again", async () => {
    mocks.config.mockRejectedValue(refusal(500));
    const rows = (vendorIds: number[]) => (
      <div>
        {vendorIds.map((vendorId) => (
          <VendorResearchButton
            key={vendorId}
            vendorId={vendorId}
            vendorName={`Vendor ${vendorId}`}
            onNotify={vi.fn()}
          />
        ))}
      </div>
    );
    const { rerender } = renderWithProviders(rows([7]));
    await waitFor(() => expect(researchButton()).toBeEnabled());
    expect(mocks.config).toHaveBeenCalledTimes(1);

    rerender(rows([7, 8]));

    expect(mocks.config).toHaveBeenCalledTimes(1);
    const buttons = screen.getAllByRole("button", { name: "Research risks" });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button).toBeEnabled();
  });

  it("starts the research when the server accepts it", async () => {
    mocks.start.mockResolvedValue({ run: run({ status: "queued" }), alreadyRunning: false });
    const { onNotify } = await renderWithFailedSettings();

    await userEvent.click(researchButton());

    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledWith(7);
    expect(onNotify).toHaveBeenCalledWith({
      variant: "success",
      body: "Research started for Acme Cloud. Findings appear on the Risks tab.",
    });
    await waitFor(() => expect(researchButton()).toBeEnabled());
  });

  it("says research is not set up when the server refuses the start with a 409", async () => {
    mocks.start.mockRejectedValue(refusal(409, { code: "llm_key_missing" }));
    const { onNotify } = await renderWithFailedSettings();

    await userEvent.click(researchButton());

    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    expect(mocks.start).toHaveBeenCalledWith(7);
    expect(onNotify).toHaveBeenCalledWith({
      variant: "warning",
      body: "Vendor research is not set up.",
    });
    await waitFor(() => expect(researchButton()).toBeEnabled());
  });
});

describe("starting the research", () => {
  it("starts it for its vendor and says where the findings will appear", async () => {
    mocks.start.mockResolvedValue({ run: run({ status: "queued" }), alreadyRunning: false });
    const { onNotify } = await renderWithSettings(SET_UP);

    await userEvent.click(researchButton());

    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledWith(7);
    expect(onNotify).toHaveBeenCalledWith({
      variant: "success",
      body: "Research started for Acme Cloud. Findings appear on the Risks tab.",
    });
    await waitFor(() => expect(researchButton()).toBeEnabled());
  });

  it("says so when the vendor is being researched already", async () => {
    mocks.start.mockResolvedValue({ run: run({ status: "running" }), alreadyRunning: true });
    const { onNotify } = await renderWithSettings(SET_UP);

    await userEvent.click(researchButton());

    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    expect(onNotify).toHaveBeenCalledWith({
      variant: "info",
      body: "Research is already running for Acme Cloud.",
    });
    await waitFor(() => expect(researchButton()).toBeEnabled());
  });

  // The global error toast is off for this call, so nothing but the message tells the user.
  const GENERIC = "The research could not be started. Try again.";
  it.each([
    [
      "a 429 for the cooldown",
      refusal(429, { code: "cooldown", retryAfterSeconds: 540 }),
      "warning",
      "Research ran recently. Try again in 9 min.",
    ],
    [
      "a 429 for the daily limit",
      refusal(429, { code: "daily_cap" }),
      "warning",
      "The daily research limit for your organization was reached. Try again tomorrow.",
    ],
    [
      "a 409 for a missing setting",
      refusal(409, { code: "llm_key_missing" }),
      "warning",
      "Vendor research is not set up.",
    ],
    [
      "a 503 from the job queue",
      refusal(503),
      "error",
      "The research could not be started because the job queue is unavailable. Try again later.",
    ],
    ["a 500", refusal(500), "error", GENERIC],
    ["a 403", refusal(403), "error", GENERIC],
    ["a network failure", new Error("Network Error"), "error", GENERIC],
  ])("answers %s with a message", async (_case, failure, variant, body) => {
    mocks.start.mockRejectedValue(failure);
    const { onNotify } = await renderWithSettings(SET_UP);

    await userEvent.click(researchButton());

    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    expect(onNotify).toHaveBeenCalledWith({ variant, body });
    await waitFor(() => expect(researchButton()).toBeEnabled());
  });

  it("is disabled while its own request is on its way, and another vendor's button is not", async () => {
    const request = deferred<StartResult>();
    mocks.start.mockReturnValue(request.promise);
    const { onNotify } = await renderWithSettings(SET_UP, (notify) => (
      <>
        <VendorResearchButton vendorId={7} vendorName="Acme Cloud" onNotify={notify} />
        <VendorResearchButton vendorId={8} vendorName="Zeta Labs" onNotify={notify} />
      </>
    ));
    const [acme, zeta] = screen.getAllByRole("button", { name: "Research risks" });

    await userEvent.click(acme);

    await waitFor(() => expect(acme).toBeDisabled());
    expect(zeta).toBeEnabled();
    expect(onNotify).not.toHaveBeenCalled();

    request.resolve({ run: run(), alreadyRunning: false });
    await waitFor(() => expect(acme).toBeEnabled());
    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  // The Risks tab cannot see a run that was started here, so a started run is left for it to
  // follow. The hint is one entry of the query cache (VENDOR_RESEARCH_FOLLOW_KEY).
  describe("leaving the run for the Risks tab to follow", () => {
    const hint = (queryClient: { getQueryData: (key: readonly string[]) => unknown }) =>
      queryClient.getQueryData(VENDOR_RESEARCH_FOLLOW_KEY);

    it("leaves the vendor after a run was started", async () => {
      mocks.start.mockResolvedValue({ run: run({ status: "queued" }), alreadyRunning: false });
      const { onNotify, queryClient } = await renderWithSettings(SET_UP);
      expect(hint(queryClient)).toBeUndefined();

      await userEvent.click(researchButton());

      await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
      expect(hint(queryClient)).toBe(7);
    });

    it("leaves the vendor when the answer is that a run is already going", async () => {
      mocks.start.mockResolvedValue({ run: run({ status: "running" }), alreadyRunning: true });
      const { onNotify, queryClient } = await renderWithSettings(SET_UP);

      await userEvent.click(researchButton());

      await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
      expect(hint(queryClient)).toBe(7);
    });

    it("keeps the vendor of the latest start when several are started", async () => {
      mocks.start.mockResolvedValue({ run: run({ status: "queued" }), alreadyRunning: false });
      const { onNotify, queryClient } = await renderWithSettings(SET_UP, (notify) => (
        <>
          <VendorResearchButton vendorId={7} vendorName="Acme Cloud" onNotify={notify} />
          <VendorResearchButton vendorId={8} vendorName="Zeta Labs" onNotify={notify} />
        </>
      ));
      const [acme, zeta] = screen.getAllByRole("button", { name: "Research risks" });

      await userEvent.click(acme);
      await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
      await userEvent.click(zeta);
      await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(2));

      expect(hint(queryClient)).toBe(8);
    });

    it.each([
      ["a 429 for the cooldown", refusal(429, { code: "cooldown", retryAfterSeconds: 540 })],
      ["a 409 for a missing setting", refusal(409, { code: "llm_key_missing" })],
      ["a 503 from the job queue", refusal(503)],
      ["a 500", refusal(500)],
      ["a 403", refusal(403)],
      ["a network failure", new Error("Network Error")],
    ])("leaves nothing after %s", async (_case, failure) => {
      mocks.start.mockRejectedValue(failure);
      const { onNotify, queryClient } = await renderWithSettings(SET_UP);

      await userEvent.click(researchButton());

      await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
      expect(hint(queryClient)).toBeUndefined();
    });

    it("leaves nothing while the request is still on its way", async () => {
      const request = deferred<StartResult>();
      mocks.start.mockReturnValue(request.promise);
      const { queryClient } = await renderWithSettings(SET_UP);

      await userEvent.click(researchButton());
      await waitFor(() => expect(researchButton()).toBeDisabled());

      expect(hint(queryClient)).toBeUndefined();
      request.resolve({ run: run(), alreadyRunning: false });
      await waitFor(() => expect(hint(queryClient)).toBe(7));
    });
  });

  it("keeps its click to itself, so the row it sits in is not opened", async () => {
    mocks.start.mockResolvedValue({ run: run(), alreadyRunning: false });
    const openRow = vi.fn();
    const { onNotify } = await renderWithSettings(SET_UP, (notify) => (
      <div data-testid="row" onClick={openRow}>
        <VendorResearchButton vendorId={7} vendorName="Acme Cloud" onNotify={notify} />
      </div>
    ));

    // The row opens when it is clicked...
    await userEvent.click(screen.getByTestId("row"));
    expect(openRow).toHaveBeenCalledTimes(1);

    // ...but not when its research button is.
    await userEvent.click(researchButton());
    await waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    expect(mocks.start).toHaveBeenCalledWith(7);
    expect(openRow).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(researchButton()).toBeEnabled());
  });
});
