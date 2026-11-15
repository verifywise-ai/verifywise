export interface Command {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  group: CommandGroup;
  action: CommandAction;
  icon?: React.ComponentType<Record<string, unknown>>;
  shortcut?: string[];
  requiredRole?: string[];
  /** A permission key (e.g. "useCase.edit") the user must hold to see the command. */
  scope?: string;
}

export interface CommandGroup {
  id: string;
  label: string;
  priority: number;
}

// Specific payload types for better type safety
export interface NavigatePayload {
  path: string;
}

export interface ModalPayload {
  modalType: string;
  data?: Record<string, unknown>;
}

export interface FunctionPayload {
  name: string;
  params?: unknown;
}

export interface FilterPayload {
  type: string;
  value: unknown;
}

export interface ExportPayload {
  format: string;
  data?: Record<string, unknown>;
}

export type CommandPayload =
  NavigatePayload | ModalPayload | FunctionPayload | FilterPayload | ExportPayload | string;

export interface CommandAction {
  type: "navigate" | "modal" | "function" | "filter" | "export";
  payload?: CommandPayload;
}

export interface CommandContext {
  currentPath: string;
  userRole: string;
  /** The user's permission keys; undefined while they load (built-in roles fall back). */
  permissions?: readonly string[];
  searchTerm?: string;
}

export interface CommandRegistry {
  commands: Command[];
  groups: CommandGroup[];
  getCommands: (context: CommandContext) => Command[];
  registerCommand: (command: Command) => void;
  unregisterCommand: (commandId: string) => void;
}
