import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 1) Mock lucide-react icons
 * This avoids React / JSX dependencies during unit tests
 */
vi.mock("lucide-react", () => {
  const Icon = () => null;
  return {
    Home: Icon,
    Building2: Icon,
    GitBranch: Icon,
    Users: Icon,
    AlertTriangle: Icon,
    GraduationCap: Icon,
    FileText: Icon,
    BarChart3: Icon,
    Brain: Icon,
    Shield: Icon,
    Telescope: Icon,
    Settings: Icon,
    FolderTree: Icon,
    Layers: Icon,
    Flag: Icon,
    AlertCircle: Icon,
    LayoutDashboard: Icon,
    GitCompareArrows: Icon,
    Compass: Icon,
  };
});

/**
 * Helper function
 * Loads a fresh instance of the registry for each test
 * (prevents state leakage between tests because registry is a singleton)
 */
async function loadRegistryModule() {
  vi.resetModules();
  const mod = await import("../registry");
  return mod;
}

describe("commandRegistry (registry.ts)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes default command groups and commands", async () => {
    const { commandRegistry, COMMAND_GROUPS } = await loadRegistryModule();

    expect(COMMAND_GROUPS.length).toBeGreaterThan(0);
    expect(commandRegistry.groups).toHaveLength(COMMAND_GROUPS.length);

    // Should contain at least navigation and admin commands
    expect(commandRegistry.commands.length).toBeGreaterThan(0);
  });

  describe("getCommands()", () => {
    it("returns commands sorted by group priority", async () => {
      const { commandRegistry } = await loadRegistryModule();

      const results = commandRegistry.getCommands({ userRole: "Admin" } as any);

      // Ensure commands are sorted by group priority
      for (let i = 1; i < results.length; i++) {
        expect(results[i].group.priority).toBeGreaterThanOrEqual(results[i - 1].group.priority);
      }
    });

    it("filters out commands when requiredRole does not include userRole", async () => {
      const { commandRegistry } = await loadRegistryModule();

      // admin-team requires Admin role
      const results = commandRegistry.getCommands({ userRole: "User" } as any);

      expect(results.some((c) => c.id === "admin-team")).toBe(false);
    });

    it("allows commands when requiredRole includes userRole", async () => {
      const { commandRegistry } = await loadRegistryModule();

      const results = commandRegistry.getCommands({ userRole: "Admin" } as any);
      expect(results.some((c) => c.id === "admin-team")).toBe(true);
    });

    it("filters commands by searchTerm using label, description or keywords", async () => {
      const { commandRegistry } = await loadRegistryModule();

      const results = commandRegistry.getCommands({
        userRole: "Admin",
        searchTerm: "dash",
      } as any);

      // "Dashboard" command exists in navigation commands
      expect(results.some((c) => c.id === "nav-dashboard")).toBe(true);
    });

    it("returns an empty array when searchTerm matches nothing", async () => {
      const { commandRegistry } = await loadRegistryModule();

      const results = commandRegistry.getCommands({
        userRole: "Admin",
        searchTerm: "___no_match___",
      } as any);

      expect(results).toEqual([]);
    });

    it("returns all matching commands when searchTerm is empty string", async () => {
      const { commandRegistry } = await loadRegistryModule();

      const allResults = commandRegistry.getCommands({ userRole: "Admin" } as any);
      const emptySearchResults = commandRegistry.getCommands({
        userRole: "Admin",
        searchTerm: "",
      } as any);

      // Empty search term should behave same as no search term
      expect(emptySearchResults.length).toBe(allResults.length);
    });

    const scopedCommand = (commandRegistry: any, id: string, scope: string) => ({
      id,
      label: id,
      description: id,
      keywords: [id],
      group: commandRegistry.groups[0],
      icon: (() => null) as any,
      action: { type: "navigate", payload: "/" },
      scope,
    });

    it("excludes command and logs error for a scope that is not a permission key", async () => {
      const { commandRegistry } = await loadRegistryModule();
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Inject directly into internal command list to bypass registerCommand validation
      (commandRegistry as any)._commands.push(
        scopedCommand(commandRegistry, "bad-scope-command", "invalidformat"),
        scopedCommand(commandRegistry, "old-scope-command", "projects.editTeamMembers"),
      );

      const results = commandRegistry.getCommands({ userRole: "Admin" } as any);

      expect(results.some((c) => c.id === "bad-scope-command")).toBe(false);
      expect(results.some((c) => c.id === "old-scope-command")).toBe(false);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown permission in command scope: invalidformat"),
      );
    });

    it("uses the built-in role's permissions while the list has not loaded", async () => {
      const { commandRegistry } = await loadRegistryModule();
      commandRegistry.registerCommand(
        scopedCommand(commandRegistry, "needs-members", "useCase.members") as any,
      );

      const asEditor = commandRegistry.getCommands({ userRole: "Editor" } as any);
      const asAdmin = commandRegistry.getCommands({ userRole: "Admin" } as any);
      expect(asEditor.some((c) => c.id === "needs-members")).toBe(false);
      expect(asAdmin.some((c) => c.id === "needs-members")).toBe(true);
    });

    it("hides a scoped command from a custom role until its permissions load", async () => {
      const { commandRegistry } = await loadRegistryModule();
      commandRegistry.registerCommand(
        scopedCommand(commandRegistry, "needs-vendor-edit", "vendor.edit") as any,
      );

      const loading = commandRegistry.getCommands({ userRole: "Vendor team" } as any);
      expect(loading.some((c) => c.id === "needs-vendor-edit")).toBe(false);
    });

    it("follows the loaded permission list, for custom and built-in roles", async () => {
      const { commandRegistry } = await loadRegistryModule();
      commandRegistry.registerCommand(
        scopedCommand(commandRegistry, "needs-vendor-edit", "vendor.edit") as any,
      );

      const custom = commandRegistry.getCommands({
        userRole: "Vendor team",
        permissions: ["vendor.edit"],
      } as any);
      const adminWithout = commandRegistry.getCommands({
        userRole: "Admin",
        permissions: [],
      } as any);
      expect(custom.some((c) => c.id === "needs-vendor-edit")).toBe(true);
      expect(adminWithout.some((c) => c.id === "needs-vendor-edit")).toBe(false);
    });
  });

  describe("registerCommand()", () => {
    it("throws when command id is missing or empty", async () => {
      const { commandRegistry } = await loadRegistryModule();

      expect(() =>
        commandRegistry.registerCommand({
          id: "   ",
          label: "X",
          group: commandRegistry.groups[0],
          icon: (() => null) as any,
          action: { type: "navigate", payload: "/" },
        } as any),
      ).toThrow("Command ID is required and cannot be empty");
    });

    it("throws when command label is missing or empty", async () => {
      const { commandRegistry } = await loadRegistryModule();

      expect(() =>
        commandRegistry.registerCommand({
          id: "x",
          label: "",
          group: commandRegistry.groups[0],
          icon: (() => null) as any,
          action: { type: "navigate", payload: "/" },
        } as any),
      ).toThrow("Command label is required and cannot be empty");
    });

    it("throws when action type is missing", async () => {
      const { commandRegistry } = await loadRegistryModule();

      expect(() =>
        commandRegistry.registerCommand({
          id: "x",
          label: "X",
          group: commandRegistry.groups[0],
          icon: (() => null) as any,
          action: {} as any,
        } as any),
      ).toThrow("Command action type is required");
    });

    it("throws when action type is invalid", async () => {
      const { commandRegistry } = await loadRegistryModule();

      expect(() =>
        commandRegistry.registerCommand({
          id: "x",
          label: "X",
          group: commandRegistry.groups[0],
          icon: (() => null) as any,
          action: { type: "invalid" as any, payload: 1 },
        } as any),
      ).toThrow(/Invalid action type/);
    });

    it("throws when scope format is invalid (must be resource.action)", async () => {
      const { commandRegistry } = await loadRegistryModule();

      expect(() =>
        commandRegistry.registerCommand({
          id: "bad-scope",
          label: "Bad Scope",
          group: commandRegistry.groups[0],
          icon: (() => null) as any,
          action: { type: "navigate", payload: "/" },
          scope: "a.b.c", // ❌ invalid: has 3 segments
        } as any),
      ).toThrow("Invalid scope format: a.b.c. Expected format: 'resource.action'");
    });

    it("warns when command group does not exist", async () => {
      const { commandRegistry } = await loadRegistryModule();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      commandRegistry.registerCommand({
        id: "unknown-group",
        label: "Unknown Group",
        group: { id: "not-exists", label: "Nope", priority: 999 } as any,
        icon: (() => null) as any,
        action: { type: "navigate", payload: "/" },
      } as any);

      expect(warn).toHaveBeenCalled();
    });

    it("logs a warning when group id is not registered", async () => {
      const { commandRegistry } = await loadRegistryModule();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      commandRegistry.registerCommand({
        id: "cmd-unknown-group",
        label: "Cmd Unknown Group",
        group: { id: "does-not-exist", label: "X", priority: 999 } as any,
        icon: (() => null) as any,
        action: { type: "navigate", payload: "/" },
      } as any);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Command group "does-not-exist" not found in registry.'),
      );
    });

    it("adds a new command when id does not exist", async () => {
      const { commandRegistry } = await loadRegistryModule();

      const initial = commandRegistry.commands.length;

      commandRegistry.registerCommand({
        id: "new-cmd",
        label: "New Command",
        group: commandRegistry.groups[0],
        icon: (() => null) as any,
        action: { type: "navigate", payload: "/x" },
      } as any);

      expect(commandRegistry.commands.length).toBe(initial + 1);
    });

    it("replaces existing command when id already exists", async () => {
      const { commandRegistry } = await loadRegistryModule();
      const info = vi.spyOn(console, "info").mockImplementation(() => {});

      commandRegistry.registerCommand({
        id: "nav-dashboard",
        label: "Dashboard Updated",
        group: commandRegistry.groups[0],
        icon: (() => null) as any,
        action: { type: "navigate", payload: "/new" },
      } as any);

      expect(info).toHaveBeenCalledWith(
        expect.stringContaining("Replacing existing command: nav-dashboard"),
      );

      // Verify the command was actually replaced
      const updatedCommand = commandRegistry.commands.find((c) => c.id === "nav-dashboard");
      expect(updatedCommand?.label).toBe("Dashboard Updated");
      expect(updatedCommand?.action.payload).toBe("/new");
    });
  });

  describe("unregisterCommand()", () => {
    it("removes a command by id", async () => {
      const { commandRegistry } = await loadRegistryModule();

      commandRegistry.registerCommand({
        id: "to-remove",
        label: "To Remove",
        group: commandRegistry.groups[0],
        icon: (() => null) as any,
        action: { type: "navigate", payload: "/x" },
      } as any);

      commandRegistry.unregisterCommand("to-remove");

      expect(commandRegistry.commands.some((c) => c.id === "to-remove")).toBe(false);
    });

    it("does not throw when unregistering a non-existent command", async () => {
      const { commandRegistry } = await loadRegistryModule();

      const initialCount = commandRegistry.commands.length;

      // Should not throw
      expect(() => commandRegistry.unregisterCommand("non-existent-id")).not.toThrow();

      // Command count should remain unchanged
      expect(commandRegistry.commands.length).toBe(initialCount);
    });
  });

  describe("stable command contracts", () => {
    const STABLE_COMMANDS: Record<string, string> = {
      "nav-dashboard": "Dashboard",
      "nav-tasks": "Tasks",
      "nav-project-view": "Project oriented view",
      "nav-framework": "Organizational view",
      "nav-vendors": "Vendors",
      "nav-model-inventory": "Model Inventory",
      "nav-risk-management": "Risk Management",
      "nav-training": "Training Registry",
      "nav-file-manager": "Evidence",
      "nav-reporting": "Reporting",
      "nav-ai-trust": "AI Trust Center",
      "nav-policies": "Policy Manager",
      "nav-event-tracker": "Event Tracker",
      "nav-settings": "Settings",
      "nav-incident-management": "Incident Management",
      "admin-team": "Manage Team",
    };

    it("keeps built-in command IDs and labels stable for Wise Search", async () => {
      const { commandRegistry } = await loadRegistryModule();
      const byId = Object.fromEntries(commandRegistry.commands.map((c) => [c.id, c.label]));

      expect(Object.keys(byId)).toEqual(expect.arrayContaining(Object.keys(STABLE_COMMANDS)));

      for (const [id, label] of Object.entries(STABLE_COMMANDS)) {
        expect(byId[id]).toBe(label);
      }
    });

    it("keeps command IDs unique and non-empty", async () => {
      const { commandRegistry } = await loadRegistryModule();
      const ids = commandRegistry.commands.map((c) => c.id);

      expect(ids.every((id) => id.trim().length > 0)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("keeps command group IDs stable", async () => {
      const { COMMAND_GROUPS } = await loadRegistryModule();

      expect(COMMAND_GROUPS.map((g) => g.id)).toEqual([
        "navigation",
        "actions",
        "search",
        "filters",
        "admin",
        "help",
      ]);
    });
  });
});
