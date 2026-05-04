import { CommandAction } from "./types";
import { logEngine } from "../tools/log.engine";

export interface CommandActionHandlers {
  navigate: (path: string) => void;
  modal: (modalType: string) => void;
  function: (funcName: string, params?: unknown) => void;
  filter: (filterConfig: unknown) => void;
  export: (exportType: string) => void;
}

export class CommandActionHandler {
  private handlers: CommandActionHandlers;

  constructor(handlers: CommandActionHandlers) {
    this.handlers = handlers;
  }

  execute(action: CommandAction): void {
    try {
      // Validate action structure
      if (!action || !action.type) {
        throw new Error("Invalid command action: missing action type");
      }

      switch (action.type) {
        case "navigate":
          if (!action.payload || typeof action.payload !== "string") {
            throw new Error("Navigate action requires a valid path string");
          }
          this.handlers.navigate(action.payload);
          break;

        case "modal":
          if (!action.payload || typeof action.payload !== "string") {
            throw new Error("Modal action requires a valid modal type string");
          }
          this.handlers.modal(action.payload);
          break;

        case "function": {
          if (!action.payload || typeof action.payload !== "object") {
            throw new Error("Function action requires a valid payload object");
          }
          const funcPayload = action.payload as { name: string; params?: unknown };
          if (!funcPayload.name || typeof funcPayload.name !== "string") {
            throw new Error("Function action requires a valid function name");
          }
          this.handlers.function(funcPayload.name, funcPayload.params);
          break;
        }

        case "filter":
          if (action.payload === undefined) {
            throw new Error("Filter action requires a payload");
          }
          this.handlers.filter(action.payload);
          break;

        case "export":
          if (!action.payload || typeof action.payload !== "string") {
            throw new Error("Export action requires a valid export type string");
          }
          this.handlers.export(action.payload);
          break;

        default:
          throw new Error(`Unknown command action type: ${action.type}`);
      }

      // Log successful command execution
      logEngine({
        type: "info",
        message: `Command executed successfully: ${action.type}`,
        details: { payload: action.payload },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

      // Log detailed error information
      logEngine({
        type: "error",
        message: `Command execution failed: ${action.type}`,
        details: {
          error: errorMessage,
          payload: action.payload,
          stack: error instanceof Error ? error.stack : undefined,
        },
      });

      // Re-throw error for component-level error handling
      throw new Error(`Command execution failed: ${errorMessage}`);
    }
  }
}

export default CommandActionHandler;
