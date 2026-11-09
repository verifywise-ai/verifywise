import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { LiveCheckHint } from "../../../domain/types/intakeLiveChecks";

const postLiveChecks = vi.fn();
vi.mock("../../repository/intakeForm.repository", () => ({
  DEFAULT_RATE_LIMIT_PAUSE_SECONDS: 300,
  postLiveChecks: (...args: unknown[]) => postLiveChecks(...args),
}));
import { useIntakeLiveChecks } from "../useIntakeLiveChecks";
import type { FormSchema } from "../../repository/intakeForm.repository";

const schema = {
  version: "1",
  fields: [
    { id: "q1", type: "textarea", label: "Purpose", order: 1 },
    { id: "q2", type: "text", label: "Data", order: 2 },
    { id: "q3", type: "select", label: "Mode", order: 3 },
  ],
} as unknown as FormSchema;
const ref = { publicId: "abc" };
const LONG = "We will score job applicants automatically using their CVs";

const aiHint = (id: string, questionId = "q1"): LiveCheckHint => ({
  id,
  kind: "vague",
  source: "ai",
  questionId,
  title: "t",
  text: "x",
});

type Props = { values: Record<string, unknown>; enabled?: boolean; aiAvailable?: boolean };
const setup = (initial: Props) =>
  renderHook(
    (p: Props) =>
      useIntakeLiveChecks({
        ref,
        schema,
        values: p.values,
        enabled: p.enabled ?? true,
        aiAvailable: p.aiAvailable ?? true,
      }),
    { initialProps: initial },
  );

const flush = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("useIntakeLiveChecks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    postLiveChecks.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("shows rule hints with no network call", async () => {
    const { result } = setup({ values: { q1: "facial recognition " + LONG } });
    await flush(10_000);
    expect(result.current.hints.some((h) => h.source === "rule")).toBe(true);
    expect(result.current.hintsFor("q1").length).toBeGreaterThan(0);
    expect(postLiveChecks).not.toHaveBeenCalled();
  });

  it("runs one AI check on the current answers when asked", async () => {
    postLiveChecks.mockResolvedValue({ aiAvailable: true, hints: [aiHint("a1")] });
    const { result } = setup({ values: { q1: LONG } });
    expect(result.current.aiCheck).toEqual({ status: "idle", blockedBy: null });
    act(() => result.current.checkWithAi());
    expect(result.current.aiCheck.status).toBe("running");
    await flush(0);
    expect(postLiveChecks).toHaveBeenCalledTimes(1);
    expect(postLiveChecks.mock.calls[0][0]).toEqual(ref);
    expect(postLiveChecks.mock.calls[0][1]).toEqual({ q1: LONG });
    expect(result.current.hints.some((h) => h.id === "a1")).toBe(true);
    expect(result.current.aiCheck).toEqual({ status: "done", blockedBy: "checked" });
  });

  it("sends one request however often it is asked while one is running", async () => {
    postLiveChecks.mockReturnValue(new Promise(() => undefined));
    const { result } = setup({ values: { q1: LONG } });
    act(() => {
      result.current.checkWithAi();
      result.current.checkWithAi();
    });
    act(() => result.current.checkWithAi());
    await flush(0);
    expect(postLiveChecks).toHaveBeenCalledTimes(1);
    expect(result.current.aiCheck.blockedBy).toBe("running");
  });

  it("can check again only once an answer has changed", async () => {
    postLiveChecks.mockResolvedValue({ aiAvailable: true, hints: [] });
    const { result, rerender } = setup({ values: { q1: LONG, q3: "x" } });
    act(() => result.current.checkWithAi());
    await flush(0);
    expect(result.current.aiCheck.blockedBy).toBe("checked");
    act(() => result.current.checkWithAi());
    await flush(0);
    expect(postLiveChecks).toHaveBeenCalledTimes(1);
    // A select counts too: the model reads every visible answer.
    rerender({ values: { q1: LONG, q3: "y" } });
    expect(result.current.aiCheck).toEqual({ status: "done", blockedBy: null });
    act(() => result.current.checkWithAi());
    await flush(0);
    expect(postLiveChecks).toHaveBeenCalledTimes(2);
  });

  it("cannot run when every answer is under 20 chars, AI is unavailable or checks are off", async () => {
    const cases: Array<[Props, string]> = [
      [{ values: { q1: "short", q2: "tiny" } }, "short"],
      [{ values: { q1: LONG }, aiAvailable: false }, "off"],
      [{ values: { q1: LONG }, enabled: false }, "off"],
    ];
    for (const [props, reason] of cases) {
      const { result } = setup(props);
      expect(result.current.aiCheck.blockedBy).toBe(reason);
      act(() => result.current.checkWithAi());
      await flush(0);
    }
    expect(postLiveChecks).not.toHaveBeenCalled();
  });

  it("returns no hints when disabled", () => {
    const { result } = setup({ values: { q1: "facial recognition " + LONG }, enabled: false });
    expect(result.current.hints).toEqual([]);
  });

  it("marks AI hints stale while their answer is edited", async () => {
    postLiveChecks.mockResolvedValue({ aiAvailable: true, hints: [aiHint("a1")] });
    const { result, rerender } = setup({ values: { q1: LONG } });
    act(() => result.current.checkWithAi());
    await flush(0);
    expect(result.current.staleQuestionIds.size).toBe(0);
    rerender({ values: { q1: LONG + "!" } });
    expect(result.current.staleQuestionIds.has("q1")).toBe(true);
  });

  it("pauses AI after a 429 until the reset time passes", async () => {
    const { LiveCheckRequestError } = await vi.importActual<
      typeof import("../../repository/intakeForm.repository")
    >("../../repository/intakeForm.repository");
    postLiveChecks.mockRejectedValue(new LiveCheckRequestError("slow down", 429, 60));
    const { result, rerender } = setup({ values: { q1: LONG } });
    act(() => result.current.checkWithAi());
    await flush(0);
    expect(result.current.aiPaused).toBe(true);
    rerender({ values: { q1: LONG + " again" } });
    expect(result.current.aiCheck.blockedBy).toBe("paused");
    act(() => result.current.checkWithAi());
    await flush(0);
    expect(postLiveChecks).toHaveBeenCalledTimes(1);
    await flush(60_000);
    expect(result.current.aiPaused).toBe(false);
    expect(result.current.aiCheck.blockedBy).toBeNull();
  });

  it("keeps rule and earlier AI hints and reports an error when a check fails", async () => {
    postLiveChecks.mockResolvedValueOnce({ aiAvailable: true, hints: [aiHint("a1")] });
    const { result, rerender } = setup({ values: { q1: "facial recognition " + LONG } });
    act(() => result.current.checkWithAi());
    await flush(0);
    postLiveChecks.mockRejectedValueOnce(new Error("offline"));
    rerender({ values: { q1: "facial recognition " + LONG + " x" } });
    act(() => result.current.checkWithAi());
    await flush(0);
    const ids = result.current.hints.map((h) => h.id);
    expect(ids).toContain("a1");
    expect(result.current.hints.some((h) => h.source === "rule")).toBe(true);
    expect(result.current.aiPaused).toBe(false);
    // A failed check can be tried again on the same answers.
    expect(result.current.aiCheck).toEqual({ status: "error", blockedBy: null });
  });

  it("reports an error when the server answers unavailable", async () => {
    postLiveChecks.mockResolvedValue({ aiAvailable: true, hints: [], error: "unavailable" });
    const { result } = setup({ values: { q1: LONG } });
    act(() => result.current.checkWithAi());
    await flush(0);
    expect(result.current.aiCheck).toEqual({ status: "error", blockedBy: null });
  });

  it("reports an error, not a clean check, when the form lost its key", async () => {
    postLiveChecks.mockResolvedValueOnce({ aiAvailable: true, hints: [aiHint("a1")] });
    const { result, rerender } = setup({ values: { q1: LONG } });
    act(() => result.current.checkWithAi());
    await flush(0);
    postLiveChecks.mockResolvedValueOnce({ aiAvailable: false, hints: [] });
    rerender({ values: { q1: LONG + " more" } });
    act(() => result.current.checkWithAi());
    await flush(0);
    expect(result.current.aiCheck.status).toBe("error");
    expect(result.current.hints.map((h) => h.id)).toContain("a1");
  });

  it("gives up on a check that hangs for 20 s and allows another", async () => {
    postLiveChecks.mockImplementation(
      (_r: unknown, _d: unknown, _l: unknown, signal: AbortSignal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    const { result } = setup({ values: { q1: LONG } });
    act(() => result.current.checkWithAi());
    await flush(19_000);
    expect(result.current.aiCheck.status).toBe("running");
    await flush(1_000);
    expect(result.current.aiCheck).toEqual({ status: "error", blockedBy: null });
  });
});
