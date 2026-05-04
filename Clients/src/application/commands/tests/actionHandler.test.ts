import { describe, it, expect, beforeEach, vi } from "vitest";

import { CommandActionHandler } from "../actionHandler";
import { logEngine } from "../../tools/log.engine";

// ✅ Vitest mock
vi.mock("../../tools/log.engine", () => ({
  logEngine: vi.fn(),
}));

describe("CommandActionHandler", () => {
  const mockedLogEngine = logEngine as unknown as ReturnType<typeof vi.fn>;

  const makeHandlers = () => ({
    navigate: vi.fn(),
    modal: vi.fn(),
    function: vi.fn(),
    filter: vi.fn(),
    export: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("happy paths", () => {
    it('executes "navigate" action and logs success', () => {
      const handlers = makeHandlers();
      const sut = new CommandActionHandler(handlers);

      sut.execute({ type: "navigate", payload: "/home" } as any);

      expect(handlers.navigate).toHaveBeenCalledTimes(1);
      expect(handlers.navigate).toHaveBeenCalledWith("/home");

      expect(mockedLogEngine).toHaveBeenCalledTimes(1);
      expect(mockedLogEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "info",
          message: "Command executed successfully: navigate",
          details: { payload: "/home" },
        }),
      );
    });

    it('executes "modal" action and logs success', () => {
      const handlers = makeHandlers();
      const sut = new CommandActionHandler(handlers);

      sut.execute({ type: "modal", payload: "DELETE_CONFIRM" } as any);

      expect(handlers.modal).toHaveBeenCalledTimes(1);
      expect(handlers.modal).toHaveBeenCalledWith("DELETE_CONFIRM");

      expect(mockedLogEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "info",
          message: "Command executed successfully: modal",
          details: { payload: "DELETE_CONFIRM" },
        }),
      );
    });

    it('executes "function" action and logs success', () => {
      const handlers = makeHandlers();
      const sut = new CommandActionHandler(handlers);

      sut.execute({
        type: "function",
        payload: { name: "doSomething", params: { a: 1 } },
      } as any);

      expect(handlers.function).toHaveBeenCalledTimes(1);
      expect(handlers.function).toHaveBeenCalledWith("doSomething", { a: 1 });

      expect(mockedLogEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "info",
          message: "Command executed successfully: function",
          details: { payload: { name: "doSomething", params: { a: 1 } } },
        }),
      );
    });

    it('executes "filter" action and logs success', () => {
      const handlers = makeHandlers();
      const sut = new CommandActionHandler(handlers);

      sut.execute({ type: "filter", payload: null } as any);

      expect(handlers.filter).toHaveBeenCalledTimes(1);
      expect(handlers.filter).toHaveBeenCalledWith(null);

      expect(mockedLogEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "info",
          message: "Command executed successfully: filter",
          details: { payload: null },
        }),
      );
    });

    it('executes "export" action and logs success', () => {
      const handlers = makeHandlers();
      const sut = new CommandActionHandler(handlers);

      sut.execute({ type: "export", payload: "csv" } as any);

      expect(handlers.export).toHaveBeenCalledTimes(1);
      expect(handlers.export).toHaveBeenCalledWith("csv");

      expect(mockedLogEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "info",
          message: "Command executed successfully: export",
          details: { payload: "csv" },
        }),
      );
    });
  });

  describe("validation + error handling", () => {
    it("throws when action is missing type and logs error", () => {
      const handlers = makeHandlers();
      const sut = new CommandActionHandler(handlers);

      expect(() => sut.execute({} as any)).toThrow(
        "Command execution failed: Invalid command action: missing action type",
      );

      expect(mockedLogEngine).toHaveBeenCalledTimes(1);
      expect(mockedLogEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining("Command execution failed:"),
          details: expect.objectContaining({
            error: "Invalid command action: missing action type",
          }),
        }),
      );
    });

    it("throws for unknown action type and logs error", () => {
      const handlers = makeHandlers();
      const sut = new CommandActionHandler(handlers);

      expect(() => sut.execute({ type: "wat", payload: 123 } as any)).toThrow(
        "Command execution failed: Unknown command action type: wat",
      );

      expect(mockedLogEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: "Command execution failed: wat",
          details: expect.objectContaining({
            error: "Unknown command action type: wat",
            payload: 123,
          }),
        }),
      );
    });

    it("validates navigate payload must be a string", () => {
      const handlers = makeHandlers();
      const sut = new CommandActionHandler(handlers);

      expect(() => sut.execute({ type: "navigate", payload: 123 } as any)).toThrow(
        "Command execution failed: Navigate action requires a valid path string",
      );

      expect(handlers.navigate).not.toHaveBeenCalled();
      expect(mockedLogEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: "Command execution failed: navigate",
        }),
      );
    });

    it("validates modal payload must be a string", () => {
      const handlers = makeHandlers();
      const sut = new CommandActionHandler(handlers);

      expect(() => sut.execute({ type: "modal", payload: { x: 1 } } as any)).toThrow(
        "Command execution failed: Modal action requires a valid modal type string",
      );

      expect(handlers.modal).not.toHaveBeenCalled();
      expect(mockedLogEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: "Command execution failed: modal",
        }),
      );
    });

    it("validates function payload must be an object", () => {
      const handlers = makeHandlers();
      const sut = new CommandActionHandler(handlers);

      expect(() => sut.execute({ type: "function", payload: "nope" } as any)).toThrow(
        "Command execution failed: Function action requires a valid payload object",
      );

      expect(handlers.function).not.toHaveBeenCalled();
      expect(mockedLogEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: "Command execution failed: function",
        }),
      );
    });

    it("validates function payload requires a valid name", () => {
      const handlers = makeHandlers();
      const sut = new CommandActionHandler(handlers);

      expect(() => sut.execute({ type: "function", payload: { name: 123 } } as any)).toThrow(
        "Command execution failed: Function action requires a valid function name",
      );

      expect(handlers.function).not.toHaveBeenCalled();
    });

    it("validates filter payload cannot be undefined", () => {
      const handlers = makeHandlers();
      const sut = new CommandActionHandler(handlers);

      expect(() => sut.execute({ type: "filter" } as any)).toThrow(
        "Command execution failed: Filter action requires a payload",
      );

      expect(handlers.filter).not.toHaveBeenCalled();
      expect(mockedLogEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: "Command execution failed: filter",
        }),
      );
    });

    it("validates export payload must be a string", () => {
      const handlers = makeHandlers();
      const sut = new CommandActionHandler(handlers);

      expect(() => sut.execute({ type: "export", payload: true } as any)).toThrow(
        "Command execution failed: Export action requires a valid export type string",
      );

      expect(handlers.export).not.toHaveBeenCalled();
      expect(mockedLogEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: "Command execution failed: export",
        }),
      );
    });

    it('logs "Unknown error occurred" and undefined stack when a non-Error is thrown', () => {
      const handlers = makeHandlers();

      // force a throw NON-Error (covers the else branch)
      handlers.navigate.mockImplementation(() => {
        throw "boom"; // string, not is Error
      });

      const sut = new CommandActionHandler(handlers);

      expect(() => sut.execute({ type: "navigate", payload: "/home" } as any)).toThrow(
        "Command execution failed: Unknown error occurred",
      );

      expect(logEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: "Command execution failed: navigate",
          details: expect.objectContaining({
            error: "Unknown error occurred",
            payload: "/home",
            stack: undefined,
          }),
        }),
      );
    });

    it("logs error message and stack when handler throws an Error object", () => {
      const handlers = makeHandlers();

      handlers.navigate.mockImplementation(() => {
        throw new Error("connection failed");
      });

      const sut = new CommandActionHandler(handlers);

      expect(() => sut.execute({ type: "navigate", payload: "/dashboard" } as any)).toThrow(
        "Command execution failed: connection failed",
      );

      expect(logEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: "Command execution failed: navigate",
          details: expect.objectContaining({
            error: "connection failed",
            payload: "/dashboard",
            stack: expect.stringContaining("Error: connection failed"),
          }),
        }),
      );
    });
  });
});
