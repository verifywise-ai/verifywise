import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FILE_EVENTS, dispatchFileApprovalChanged, onFileApprovalChanged } from "../fileEvents";

describe("fileEvents", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should dispatch a CustomEvent with correct type and detail", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);

    dispatchFileApprovalChanged({ fileId: 42, status: "approved" });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe(FILE_EVENTS.APPROVAL_STATUS_CHANGED);
    expect(event.detail).toEqual({ fileId: 42, status: "approved" });

    dispatchSpy.mockRestore();
  });

  it("should call callback when file approval event is dispatched", () => {
    const callback = vi.fn();
    const cleanup = onFileApprovalChanged(callback);

    dispatchFileApprovalChanged({ fileId: 99, status: "rejected" });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ fileId: 99, status: "rejected" });

    cleanup();
  });

  it("should not call callback after cleanup", () => {
    const callback = vi.fn();
    const cleanup = onFileApprovalChanged(callback);

    cleanup();

    dispatchFileApprovalChanged({ fileId: 1, status: "pending" });

    expect(callback).not.toHaveBeenCalled();
  });

  it("should handle multiple listeners independently", () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const cleanup1 = onFileApprovalChanged(callback1);
    const cleanup2 = onFileApprovalChanged(callback2);

    dispatchFileApprovalChanged({ fileId: 10, status: "approved" });

    expect(callback1).toHaveBeenCalledTimes(1);
    expect(callback2).toHaveBeenCalledTimes(1);

    cleanup1();
    cleanup2();
  });

  it("should handle dispatch with no detail", () => {
    const callback = vi.fn();
    const cleanup = onFileApprovalChanged(callback);

    dispatchFileApprovalChanged();

    expect(callback).toHaveBeenCalledWith(null);

    cleanup();
  });
});
