import { describe, it, expect, vi, afterEach } from "vitest";
import {
  AI_ACTION_EVENTS,
  dispatchAiActionCompleted,
  onAiActionCompleted,
} from "../aiActionEvents";

describe("aiActionEvents", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AI_ACTION_EVENTS.COMPLETED equals 'aiAction:completed'", () => {
    expect(AI_ACTION_EVENTS.COMPLETED).toBe("aiAction:completed");
  });

  it("dispatchAiActionCompleted dispatches a CustomEvent on window", () => {
    const spy = vi.spyOn(window, "dispatchEvent");

    dispatchAiActionCompleted();

    expect(spy).toHaveBeenCalledTimes(1);
    const event = spy.mock.calls[0][0] as CustomEvent;
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.type).toBe(AI_ACTION_EVENTS.COMPLETED);
  });

  it("onAiActionCompleted subscribes and receives events", () => {
    const callback = vi.fn();

    onAiActionCompleted(callback);
    dispatchAiActionCompleted({ toolName: "agent_create_risk", status: "approved" });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      toolName: "agent_create_risk",
      status: "approved",
    });
  });

  it("onAiActionCompleted cleanup function removes listener", () => {
    const callback = vi.fn();

    const cleanup = onAiActionCompleted(callback);
    cleanup();

    dispatchAiActionCompleted({ toolName: "agent_create_risk", status: "approved" });

    expect(callback).not.toHaveBeenCalled();
  });

  it("detail is passed correctly with toolName and status", () => {
    const callback = vi.fn();

    onAiActionCompleted(callback);

    dispatchAiActionCompleted({ toolName: "agent_create_vendor", status: "rejected" });

    expect(callback).toHaveBeenCalledWith({
      toolName: "agent_create_vendor",
      status: "rejected",
    });

    dispatchAiActionCompleted(undefined);

    expect(callback).toHaveBeenCalledWith(null);
  });
});
