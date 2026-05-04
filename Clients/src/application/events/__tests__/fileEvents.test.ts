import { describe, it, expect, vi, afterEach } from "vitest";
import { FILE_EVENTS, dispatchFileApprovalChanged, onFileApprovalChanged } from "../fileEvents";

describe("fileEvents", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("FILE_EVENTS.APPROVAL_STATUS_CHANGED equals 'file:approvalStatusChanged'", () => {
    expect(FILE_EVENTS.APPROVAL_STATUS_CHANGED).toBe("file:approvalStatusChanged");
  });

  it("dispatchFileApprovalChanged dispatches a CustomEvent on window", () => {
    const spy = vi.spyOn(window, "dispatchEvent");

    dispatchFileApprovalChanged();

    expect(spy).toHaveBeenCalledTimes(1);
    const event = spy.mock.calls[0][0] as CustomEvent;
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.type).toBe(FILE_EVENTS.APPROVAL_STATUS_CHANGED);
  });

  it("onFileApprovalChanged subscribes and receives events", () => {
    const callback = vi.fn();

    onFileApprovalChanged(callback);
    dispatchFileApprovalChanged({ fileId: 42, status: "approved" });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      fileId: 42,
      status: "approved",
    });
  });

  it("onFileApprovalChanged cleanup function removes listener", () => {
    const callback = vi.fn();

    const cleanup = onFileApprovalChanged(callback);
    cleanup();

    dispatchFileApprovalChanged({ fileId: 42, status: "approved" });

    expect(callback).not.toHaveBeenCalled();
  });

  it("detail is passed correctly with fileId and status", () => {
    const callback = vi.fn();

    onFileApprovalChanged(callback);

    dispatchFileApprovalChanged({ fileId: 99, status: "rejected" });

    expect(callback).toHaveBeenCalledWith({
      fileId: 99,
      status: "rejected",
    });

    dispatchFileApprovalChanged(undefined);

    expect(callback).toHaveBeenCalledWith(null);
  });
});
