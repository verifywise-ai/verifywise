import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Readable } from "stream";
import EventEmitter from "events";
import { Request, Response } from "express";

// Mock dependencies
jest.mock("../logger/fileLogger", () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

import { pipeStreamWithCleanup } from "../streamCleanup.utils";
import logger from "../logger/fileLogger";

const mockLoggerError = logger.error as jest.MockedFunction<typeof logger.error>;

describe("streamCleanup.utils", () => {
  let mockStream: Readable & EventEmitter;
  let mockReq: Request & EventEmitter;
  let mockRes: any;
  let cleanup: jest.Mock<() => Promise<void>>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockStream = Object.assign(new Readable({ read() {} }), new EventEmitter());
    mockReq = Object.assign(new EventEmitter(), { destroy: jest.fn() }) as unknown as Request &
      EventEmitter;
    mockRes = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
      headersSent: false,
      writableEnded: false,
    });
    cleanup = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  });

  it("should set SSE headers correctly", () => {
    pipeStreamWithCleanup(mockStream, mockReq as Request, mockRes as Response, cleanup);

    expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    expect(mockRes.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");
    expect(mockRes.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
  });

  it("should pipe stream to response", () => {
    const pipeSpy = jest.spyOn(mockStream, "pipe");

    pipeStreamWithCleanup(mockStream, mockReq as Request, mockRes as Response, cleanup);

    expect(pipeSpy).toHaveBeenCalledWith(mockRes);
  });

  it("should call cleanup once on stream end", async () => {
    pipeStreamWithCleanup(mockStream, mockReq as Request, mockRes as Response, cleanup);

    mockStream.emit("end");
    await new Promise((resolve) => setImmediate(resolve));

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("should call cleanup, log error, and send 500 when stream errors and headers are not sent", async () => {
    pipeStreamWithCleanup(mockStream, mockReq as Request, mockRes as Response, cleanup);
    const err = new Error("Stream broke");

    mockStream.emit("error", err);
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockLoggerError).toHaveBeenCalledWith("Stream error:", err);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.end).toHaveBeenCalled();
  });

  it("should not send 500 when stream errors and headers are already sent", async () => {
    (mockRes as any).headersSent = true;
    pipeStreamWithCleanup(mockStream, mockReq as Request, mockRes as Response, cleanup);
    const err = new Error("Stream broke");

    mockStream.emit("error", err);
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockLoggerError).toHaveBeenCalledWith("Stream error:", err);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockRes.end).not.toHaveBeenCalled();
  });

  it("should destroy stream and call cleanup when request closes before response ends", async () => {
    const destroySpy = jest.spyOn(mockStream, "destroy");
    pipeStreamWithCleanup(mockStream, mockReq as Request, mockRes as Response, cleanup);

    mockReq.emit("close");
    await new Promise((resolve) => setImmediate(resolve));

    expect(destroySpy).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("should not destroy stream or call cleanup when request closes after response has ended", async () => {
    const destroySpy = jest.spyOn(mockStream, "destroy");
    (mockRes as any).writableEnded = true;
    pipeStreamWithCleanup(mockStream, mockReq as Request, mockRes as Response, cleanup);

    mockReq.emit("close");
    await new Promise((resolve) => setImmediate(resolve));

    expect(destroySpy).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("should be idempotent and call cleanup only once even if multiple events fire", async () => {
    pipeStreamWithCleanup(mockStream, mockReq as Request, mockRes as Response, cleanup);

    mockStream.emit("end");
    mockStream.emit("end");
    mockReq.emit("close");
    await new Promise((resolve) => setImmediate(resolve));

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
