import { Command, CommandGroup, CommandContext, CommandRegistry } from "./types";
import allowedRoles from "../constants/permissions";
import {
  Home,
  Building2,
  GitBranch,
  Users,
  AlertTriangle,
  GraduationCap,
  FileText,
  BarChart3,
  Brain,
  Shield,
  Telescope,
  Settings,
  FolderTree,
  Layers,
  Flag,
  AlertCircle,
} from "lucide-react";

// Define command groups
export const COMMAND_GROUPS: CommandGroup[] = [
  { id: "navigation", label: "Navigation", priority: 1 },
  { id: "actions", label: "Actions", priority: 2 },
  { id: "search", label: "Search", priority: 3 },
  { id: "filters", label: "Filters", priority: 4 },
  { id: "admin", label: "Administration", priority: 5 },
  { id: "help", label: "Help", priority: 6 },
];

// Core navigation commands
const NAVIGATION_COMMANDS: Command[] = [
  {
    id: "nav-dashboard",
    label: "Dashboard",
    description: "Go to main dashboard",
    keywords: ["home", "overview", "main"],
    group: COMMAND_GROUPS[0],
    icon: Home,
    action: { type: "navigate", payload: "/" },
  },
  {
    id: "nav-tasks",
    label: "Tasks",
    description: "Task management",
    keywords: ["tasks", "todo", "assignments"],
    group: COMMAND_GROUPS[0],
    icon: Flag,
    action: { type: "navigate", payload: "/tasks" },
  },
  {
    id: "nav-project-view",
    label: "Project oriented view",
    description: "Project-based organizational view",
    keywords: ["projects", "overview", "project view"],
    group: COMMAND_GROUPS[0],
    icon: FolderTree,
    action: { type: "navigate", payload: "/overview" },
  },
  {
    id: "nav-framework",
    label: "Organizational view",
    description: "Organizational framework view",
    keywords: ["compliance", "frameworks", "iso", "eu ai act", "organizational"],
    group: COMMAND_GROUPS[0],
    icon: Layers,
    action: { type: "navigate", payload: "/framework" },
  },
  {
    id: "nav-vendors",
    label: "Vendors",
    description: "Manage vendor relationships",
    keywords: ["suppliers", "partners", "third-party"],
    group: COMMAND_GROUPS[0],
    icon: Building2,
    action: { type: "navigate", payload: "/vendors" },
  },
  {
    id: "nav-model-inventory",
    label: "Model Inventory",
    description: "AI/ML model management",
    keywords: ["models", "ai", "ml", "machine learning"],
    group: COMMAND_GROUPS[0],
    icon: GitBranch,
    action: { type: "navigate", payload: "/model-inventory" },
  },
  {
    id: "nav-risk-management",
    label: "Risk Management",
    description: "Manage and monitor risks",
    keywords: ["risks", "threats", "vulnerabilities"],
    group: COMMAND_GROUPS[0],
    icon: AlertTriangle,
    action: { type: "navigate", payload: "/risk-management" },
  },
  {
    id: "nav-training",
    label: "Training Registry",
    description: "AI training programs",
    keywords: ["training", "education", "courses"],
    group: COMMAND_GROUPS[0],
    icon: GraduationCap,
    action: { type: "navigate", payload: "/training" },
  },
  {
    id: "nav-file-manager",
    label: "Evidence",
    description: "Evidence and documents",
    keywords: ["files", "documents", "evidence"],
    group: COMMAND_GROUPS[0],
    icon: FileText,
    action: { type: "navigate", payload: "/file-manager" },
  },
  {
    id: "nav-reporting",
    label: "Reporting",
    description: "Reports and analytics",
    keywords: ["reports", "analytics", "charts"],
    group: COMMAND_GROUPS[0],
    icon: BarChart3,
    action: { type: "navigate", payload: "/reporting" },
  },
  {
    id: "nav-ai-trust",
    label: "AI Trust Center",
    description: "AI transparency and trust",
    keywords: ["trust", "transparency", "ai"],
    group: COMMAND_GROUPS[0],
    icon: Brain,
    action: { type: "navigate", payload: "/ai-trust-center" },
  },
  {
    id: "nav-policies",
    label: "Policy Manager",
    description: "Manage organizational policies",
    keywords: ["policies", "policy", "governance"],
    group: COMMAND_GROUPS[0],
    icon: Shield,
    action: { type: "navigate", payload: "/policies" },
  },
  {
    id: "nav-event-tracker",
    label: "Event Tracker",
    description: "Event tracking and audit logs",
    keywords: ["logs", "events", "audit", "monitoring", "watch", "tower"],
    group: COMMAND_GROUPS[0],
    icon: Telescope,
    action: { type: "navigate", payload: "/event-tracker" },
  },
  {
    id: "nav-settings",
    label: "Settings",
    description: "System configuration",
    keywords: ["settings", "config", "preferences"],
    group: COMMAND_GROUPS[0],
    icon: Settings,
    action: { type: "navigate", payload: "/settings" },
  },
  {
    id: "nav-incident-management",
    label: "Incident Management",
    description: "EU AI Act Compliance Dashboard",
    keywords: ["incident", "management"],
    group: COMMAND_GROUPS[0],
    icon: AlertCircle,
    action: { type: "navigate", payload: "/ai-incident-managements" },
  },
  // Governance OS navigation commands are intentionally disabled from the
  // command palette while the module is not broadly released. The module remains
  // reachable by direct URL (e.g. /governance or /governance-os) so it can still
  // be activated and used by authorized users who know the route.
];

// Quick action commands - will be implemented later
const ACTION_COMMANDS: Command[] = [];

// Filter commands - will be implemented later
const FILTER_COMMANDS: Command[] = [];

// Admin commands
const ADMIN_COMMANDS: Command[] = [
  {
    id: "admin-team",
    label: "Manage Team",
    description: "User and team management",
    keywords: ["team", "users", "members"],
    group: COMMAND_GROUPS[4],
    icon: Users,
    action: { type: "function", payload: { name: "navigateToSettingsTab", params: "team" } },
    requiredRole: ["Admin"],
    scope: "projects.editTeamMembers",
  },
];

class CommandRegistryImpl implements CommandRegistry {
  private _commands: Command[] = [];
  private _groups: CommandGroup[] = COMMAND_GROUPS;

  constructor() {
    // Register default commands
    this._commands = [
      ...NAVIGATION_COMMANDS,
      ...ACTION_COMMANDS,
      ...FILTER_COMMANDS,
      ...ADMIN_COMMANDS,
    ];
  }

  get commands(): Command[] {
    return this._commands;
  }

  get groups(): CommandGroup[] {
    return this._groups;
  }

  getCommands(context: CommandContext): Command[] {
    return this._commands
      .filter((command) => {
        // Check permissions
        if (command.requiredRole && !command.requiredRole.includes(context.userRole)) {
          return false;
        }

        // Check specific scope permissions
        if (command.scope) {
          const scopeParts = command.scope.split(".");
          if (scopeParts.length !== 2) {
            console.error(
              `Invalid command scope format: ${command.scope}. Expected format: 'resource.action'`,
            );
            return false;
          }

          const [resource, action] = scopeParts;

          try {
            const resourcePermissions = allowedRoles[resource as keyof typeof allowedRoles];

            if (!resourcePermissions) {
              console.error(`Unknown resource in scope: ${resource}`);
              return false;
            }

            const actionPermissions = resourcePermissions[
              action as keyof typeof resourcePermissions
            ] as string[] | undefined;
            if (!actionPermissions) {
              console.error(`Unknown action in scope: ${action}`);
              return false;
            }

            const hasPermission =
              Array.isArray(actionPermissions) &&
              (actionPermissions as string[]).includes(context.userRole);
            if (!hasPermission) return false;
          } catch (error) {
            console.error(`Error checking permissions for scope: ${command.scope}`, error);
            return false;
          }
        }

        // Filter by search term if provided
        if (context.searchTerm) {
          const searchLower = context.searchTerm.toLowerCase();
          const matchesLabel = command.label.toLowerCase().includes(searchLower);
          const matchesDescription = command.description?.toLowerCase().includes(searchLower);
          const matchesKeywords = command.keywords?.some((keyword) =>
            keyword.toLowerCase().includes(searchLower),
          );

          return matchesLabel || matchesDescription || matchesKeywords;
        }

        return true;
      })
      .sort((a, b) => a.group.priority - b.group.priority);
  }

  registerCommand(command: Command): void {
    // Validate required fields
    if (!command.id?.trim()) {
      throw new Error("Command ID is required and cannot be empty");
    }

    if (!command.label?.trim()) {
      throw new Error("Command label is required and cannot be empty");
    }

    if (!command.action?.type) {
      throw new Error("Command action type is required");
    }

    // Validate action type
    const validActionTypes = ["navigate", "modal", "function", "filter", "export"] as const;
    if (!validActionTypes.includes(command.action.type)) {
      throw new Error(
        `Invalid action type: ${command.action.type}. Valid types: ${validActionTypes.join(", ")}`,
      );
    }

    // Validate group exists
    if (!this._groups.some((g) => g.id === command.group.id)) {
      console.warn(
        `Command group "${command.group.id}" not found in registry. Available groups: ${this._groups.map((g) => g.id).join(", ")}`,
      );
    }

    // Validate scope format if provided
    if (command.scope) {
      const scopeParts = command.scope.split(".");
      if (scopeParts.length !== 2) {
        throw new Error(
          `Invalid scope format: ${command.scope}. Expected format: 'resource.action'`,
        );
      }
    }

    const existingIndex = this._commands.findIndex((c) => c.id === command.id);
    if (existingIndex >= 0) {
      console.info(`Replacing existing command: ${command.id}`);
      this._commands[existingIndex] = command;
    } else {
      this._commands.push(command);
    }
  }

  unregisterCommand(commandId: string): void {
    this._commands = this._commands.filter((c) => c.id !== commandId);
  }
}

export const commandRegistry = new CommandRegistryImpl();
export default commandRegistry;
