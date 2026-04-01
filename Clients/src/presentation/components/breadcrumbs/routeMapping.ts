/**
 * Centralized route mapping configuration for breadcrumbs
 * This file contains all the route-to-label mappings used by the Breadcrumbs component
 *
 * @file routeMapping.ts
 * @description Route mapping utilities for breadcrumb navigation
 * @version 2.0.0
 */

import React from "react";
import {
  Home,
  Flag,
  BarChart3,
  AlertTriangle,
  Building,
  Settings,
  FileText,
  Brain,
  Shield,
  GraduationCap,
  Telescope,
  List as ListIcon,
  FolderTree,
  Layers,
  Puzzle,
  Zap,
  FileCode,
  Link,
  User,
  Lock,
  Users,
  Building2,
  Key,
  WorkflowIcon,
  Bot,
  Database,
  FileSearch,
  FolderGit2,
  Search,
  History,
  Eye,
  ShieldAlert,
  ClipboardList,
  Inbox,
  Router,
  MessageSquare,
  ShieldCheck,
  KeyRound,
  BookOpen,
} from "lucide-react";

/**
 * Static route mappings for exact path matches
 * @type {Record<string, string>}
 */
export const routeMapping: Record<string, string> = {
  // Main pages
  "/": "Dashboard",
  "/overview": "Use cases",

  // Project related
  "/project-view": "Project overview",

  // Vendor management
  "/vendors": "Vendor management",

  // Settings
  "/settings": "Settings",
  "/settings/profile": "Profile",
  "/settings/password": "Password",
  "/settings/team": "Team",
  "/settings/organization": "Organization",
  "/settings/preferences": "Preferences",
  "/settings/apikeys": "API keys",
  "/organization": "Organization settings",

  // File management
  "/file-manager": "Evidence",

  // Plugins
  "/plugins/marketplace": "Plugins",
  "/plugins/my-plugins": "Plugins",

  // Reporting
  "/reporting": "Reporting dashboard",

  // AI Trust Center
  "/ai-trust-center": "AI trust center",
  "/public": "Public AI Trust Center",

  // Training
  "/training": "Training registry",

  // Event tracking
  "/event-tracker": "Event tracker",
  "/event-tracker/logs": "Logs",

  // Automations
  "/automations": "Automations",

  // Model inventory
  "/model-inventory": "Model inventory",
  "/model-inventory/model-risks": "Model risks",
  "/model-inventory/evidence-hub": "Evidence hub",
  // Plugin tabs are handled dynamically by the breadcrumb component

  // Datasets
  "/datasets": "Datasets",

  // Incident management
  "/ai-incident-managements": "Incident management",

  // Agent discovery
  "/agent-discovery": "Agent discovery",

  // Framework tabs (note: /framework itself shows dashboard, no /framework/dashboard route)
  "/framework/framework-risks": "Framework risks",
  "/framework/linked-models": "Linked models",
  "/framework/controls": "Controls and requirements",
  "/framework/settings": "Settings",

  // AI Detection
  "/ai-detection": "AI detection",
  "/ai-detection/scan": "Scan repository",
  "/ai-detection/history": "Scan history",
  "/ai-detection/scans": "Scan history",
  "/ai-detection/repositories": "Repositories",
  "/ai-detection/settings": "Settings",

  // AI Gateway
  "/ai-gateway": "AI gateway",
  "/ai-gateway/dashboard": "Dashboard",
  "/ai-gateway/endpoints": "Endpoints",
  "/ai-gateway/playground": "Playground",
  "/ai-gateway/guardrails": "Guardrails",
  "/ai-gateway/guardrails/pii": "PII detection",
  "/ai-gateway/guardrails/content-filter": "Content filter",
  "/ai-gateway/models": "Models",
  "/ai-gateway/models/catalog": "All models",
  "/ai-gateway/models/calculator": "Cost calculator",
  "/ai-gateway/models/compare": "Feature comparison",
  "/ai-gateway/logs": "Logs",
  "/ai-gateway/prompts": "Prompts",
  "/ai-gateway/virtual-keys": "Virtual keys",
  "/ai-gateway/settings": "Settings",
  "/ai-gateway/settings/api-keys": "API keys",
  "/ai-gateway/settings/budget": "Budget",
  "/ai-gateway/settings/virtual-keys": "Virtual keys",
  "/ai-gateway/settings/guardrails": "Guardrail settings",
  "/ai-gateway/settings/risks": "Suggested risks",

  // Shadow AI
  "/shadow-ai": "Shadow AI",
  "/shadow-ai/insights": "Insights",
  "/shadow-ai/user-activity": "User activity",
  "/shadow-ai/user-activity/users": "Users",
  "/shadow-ai/user-activity/departments": "Departments",
  "/shadow-ai/tools": "AI tools",
  "/shadow-ai/rules": "Rules",
  "/shadow-ai/rules/alerts": "Alert history",
  "/shadow-ai/settings": "Settings",

  // Intake forms
  "/intake-forms": "Intake forms",
  "/intake-forms/submissions": "Submissions",

  // Policies
  "/policies": "Policies",

  // Super Admin
  "/super-admin": "Super Admin",
  "/super-admin/users": "Users",

  // Authentication
  "/login": "Sign in",
  "/register": "Create account",
  "/admin-reg": "Admin registration",
  "/user-reg": "User registration",
  "/forgot-password": "Forgot password",
  "/reset-password": "Reset password",
  "/set-new-password": "Set new password",
  "/reset-password-continue": "Continue password reset",

};

/**
 * Icon mapping functions for breadcrumb items based on paths
 * @type {Record<string, () => React.ReactNode>}
 */
export const routeIconMapping: Record<string, () => React.ReactNode> = {
  // Main pages
  "/": () => React.createElement(Home, { size: 14, strokeWidth: 1.5 }),

  // Project related
  "/project-view": () => React.createElement(FolderTree, { size: 14, strokeWidth: 1.5 }),
  "/overview": () => React.createElement(FolderTree, { size: 14, strokeWidth: 1.5 }),

  // Tasks
  "/tasks": () => React.createElement(Flag, { size: 14, strokeWidth: 1.5 }),

  // Framework/Organizational
  "/framework": () => React.createElement(Layers, { size: 14, strokeWidth: 1.5 }),

  // Vendor management
  "/vendors": () => React.createElement(Building, { size: 14, strokeWidth: 1.5 }),

  // Model inventory
  "/model-inventory": () => React.createElement(ListIcon, { size: 14, strokeWidth: 1.5 }),
  "/model-inventory/model-risks": () => React.createElement(AlertTriangle, { size: 14, strokeWidth: 1.5 }),
  "/model-inventory/evidence-hub": () => React.createElement(FileText, { size: 14, strokeWidth: 1.5 }),
  // Plugin tabs use default icon (or could be made dynamic via plugin registry)

  // Risk management
  "/risk-management": () => React.createElement(AlertTriangle, { size: 14, strokeWidth: 1.5 }),

  // Settings
  "/settings": () => React.createElement(Settings, { size: 14, strokeWidth: 1.5 }),
  "/settings/profile": () => React.createElement(User, { size: 14, strokeWidth: 1.5 }),
  "/settings/password": () => React.createElement(Lock, { size: 14, strokeWidth: 1.5 }),
  "/settings/team": () => React.createElement(Users, { size: 14, strokeWidth: 1.5 }),
  "/settings/organization": () => React.createElement(Building2, { size: 14, strokeWidth: 1.5 }),
  "/settings/preferences": () => React.createElement(Settings, { size: 14, strokeWidth: 1.5 }),
  "/settings/apikeys": () => React.createElement(Key, { size: 14, strokeWidth: 1.5 }),
  "/organization": () => React.createElement(Settings, { size: 14, strokeWidth: 1.5 }),

  // File management
  "/file-manager": () => React.createElement(FileText, { size: 14, strokeWidth: 1.5 }),

  // Plugins
  "/plugins/marketplace": () => React.createElement(Puzzle, { size: 14, strokeWidth: 1.5 }),
  "/plugins/my-plugins": () => React.createElement(Puzzle, { size: 14, strokeWidth: 1.5 }),

  // Reporting
  "/reporting": () => React.createElement(BarChart3, { size: 14, strokeWidth: 1.5 }),

  // AI Trust Center
  "/ai-trust-center": () => React.createElement(Brain, { size: 14, strokeWidth: 1.5 }),
  "/public": () => React.createElement(Brain, { size: 14, strokeWidth: 1.5 }),

  // Training
  "/training": () => React.createElement(GraduationCap, { size: 14, strokeWidth: 1.5 }),

  // Event tracking
  "/event-tracker": () => React.createElement(Telescope, { size: 14, strokeWidth: 1.5 }),
  "/event-tracker/logs": () => React.createElement(FileText, { size: 14, strokeWidth: 1.5 }),

  // Policy Manager
  "/policies": () => React.createElement(Shield, { size: 14, strokeWidth: 1.5 }),
  "/policies/new": () => React.createElement(Shield, { size: 14, strokeWidth: 1.5 }),

  // Automations
  "/automations": () => React.createElement(Zap, { size: 14, strokeWidth: 1.5 }),

  // Framework tabs (note: /framework itself shows dashboard, no /framework/dashboard route)
  "/framework/framework-risks": () => React.createElement(AlertTriangle, { size: 14, strokeWidth: 1.5 }),
  "/framework/linked-models": () => React.createElement(Link, { size: 14, strokeWidth: 1.5 }),
  "/framework/controls": () => React.createElement(FileCode, { size: 14, strokeWidth: 1.5 }),
  "/framework/settings": () => React.createElement(Settings, { size: 14, strokeWidth: 1.5 }),

  // Datasets
  "/datasets": () => React.createElement(Database, { size: 14, strokeWidth: 1.5 }),

  // Agent discovery
  "/agent-discovery": () => React.createElement(Bot, { size: 14, strokeWidth: 1.5 }),

  //ApprovalWorkflow
  "/approval-workflows": () => React.createElement(WorkflowIcon, { size: 14, strokeWidth: 1.5 }),

  // AI Detection
  "/ai-detection": () => React.createElement(FileSearch, { size: 14, strokeWidth: 1.5 }),
  "/ai-detection/scan": () => React.createElement(Search, { size: 14, strokeWidth: 1.5 }),
  "/ai-detection/history": () => React.createElement(History, { size: 14, strokeWidth: 1.5 }),
  "/ai-detection/scans": () => React.createElement(History, { size: 14, strokeWidth: 1.5 }),
  "/ai-detection/repositories": () => React.createElement(FolderGit2, { size: 14, strokeWidth: 1.5 }),
  "/ai-detection/settings": () => React.createElement(Settings, { size: 14, strokeWidth: 1.5 }),

  // Intake forms
  "/intake-forms": () => React.createElement(ClipboardList, { size: 14, strokeWidth: 1.5 }),
  "/intake-forms/submissions": () => React.createElement(Inbox, { size: 14, strokeWidth: 1.5 }),

  // AI Gateway
  "/ai-gateway": () => React.createElement(Router, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/dashboard": () => React.createElement(BarChart3, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/endpoints": () => React.createElement(Router, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/playground": () => React.createElement(MessageSquare, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/guardrails": () => React.createElement(ShieldCheck, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/guardrails/pii": () => React.createElement(ShieldCheck, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/guardrails/content-filter": () => React.createElement(ShieldCheck, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/models": () => React.createElement(Layers, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/models/catalog": () => React.createElement(Layers, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/models/calculator": () => React.createElement(Layers, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/models/compare": () => React.createElement(Layers, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/logs": () => React.createElement(FileSearch, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/prompts": () => React.createElement(BookOpen, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/virtual-keys": () => React.createElement(KeyRound, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/settings": () => React.createElement(Settings, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/settings/api-keys": () => React.createElement(Settings, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/settings/budget": () => React.createElement(Settings, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/settings/virtual-keys": () => React.createElement(Settings, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/settings/guardrails": () => React.createElement(Settings, { size: 14, strokeWidth: 1.5 }),
  "/ai-gateway/settings/risks": () => React.createElement(Settings, { size: 14, strokeWidth: 1.5 }),

  // Super Admin
  "/super-admin": () => React.createElement(Shield, { size: 14, strokeWidth: 1.5 }),
  "/super-admin/users": () => React.createElement(Users, { size: 14, strokeWidth: 1.5 }),

  // Shadow AI
  "/shadow-ai": () => React.createElement(Eye, { size: 14, strokeWidth: 1.5 }),
  "/shadow-ai/insights": () => React.createElement(BarChart3, { size: 14, strokeWidth: 1.5 }),
  "/shadow-ai/user-activity": () => React.createElement(Users, { size: 14, strokeWidth: 1.5 }),
  "/shadow-ai/user-activity/users": () => React.createElement(Users, { size: 14, strokeWidth: 1.5 }),
  "/shadow-ai/user-activity/departments": () => React.createElement(Users, { size: 14, strokeWidth: 1.5 }),
  "/shadow-ai/tools": () => React.createElement(Bot, { size: 14, strokeWidth: 1.5 }),
  "/shadow-ai/rules": () => React.createElement(ShieldAlert, { size: 14, strokeWidth: 1.5 }),
  "/shadow-ai/rules/alerts": () => React.createElement(ShieldAlert, { size: 14, strokeWidth: 1.5 }),
  "/shadow-ai/settings": () => React.createElement(Settings, { size: 14, strokeWidth: 1.5 }),

};

/**
 * Route pattern configuration for dynamic route matching
 */
export const dynamicRoutePatterns = [
  {
    pattern: /\/project-view.*projectId=/,
    label: "Project details",
    description: "Project view with specific project ID",
  },
  {
    pattern: /\/fairness-results\/\w+/,
    label: "Fairness results",
    description: "Fairness results for specific analysis",
  },
  {
    pattern: /\/model-inventory\/models\/\d+/,
    label: "Model",
    description: "Detailed view of specific model",
  },
  {
    pattern: /\/vendors\/[a-zA-Z0-9-]+/,
    label: "Vendor details",
    description: "Specific vendor information",
  },
  {
    pattern: /\/ai-incident-managements\/\d+/,
    label: "Incident management details",
    description: "Specific incident management information",
  },
  {
    pattern: /\/plugins\/[a-zA-Z0-9-]+\/manage/,
    label: "Plugin details",
    description: "Specific plugin management page",
  },
  {
    pattern: /\/ai-detection\/scans\/\d+/,
    label: "Scan details",
    description: "Detailed view of specific scan results",
    icon: () => React.createElement(FileSearch, { size: 14, strokeWidth: 1.5 }),
  },
  {
    pattern: /\/ai-gateway\/prompts\/\d+/,
    label: "Prompt editor",
    description: "Edit a specific prompt",
    icon: () => React.createElement(BookOpen, { size: 14, strokeWidth: 1.5 }),
  },
  {
    pattern: /\/shadow-ai\/tools\/\d+/,
    label: "Tool details",
    description: "Detailed view of specific AI tool",
    icon: () => React.createElement(Bot, { size: 14, strokeWidth: 1.5 }),
  },
  {
    pattern: /\/super-admin\/organizations\/\d+\/users/,
    label: "Organization users",
    description: "Users in a specific organization",
    icon: () => React.createElement(Users, { size: 14, strokeWidth: 1.5 }),
  },
  {
    pattern: /\/intake-forms\/\w+\/edit/,
    label: "Form builder",
    description: "Edit intake form",
    icon: () => React.createElement(ClipboardList, { size: 14, strokeWidth: 1.5 }),
  },
  {
    pattern: /\/policies\/\d+\/edit/,
    label: "Edit policy",
    description: "Edit an existing policy",
    icon: () => React.createElement(Shield, { size: 14, strokeWidth: 1.5 }),
  },
  {
    pattern: /\/policies\/new/,
    label: "New policy",
    description: "Create a new policy",
    icon: () => React.createElement(Shield, { size: 14, strokeWidth: 1.5 }),
  },
];

/**
 * Dynamic route mapping function for project-specific routes
 * This handles routes with dynamic parameters like project IDs
 *
 * @param {string} pathname - The pathname to match against dynamic patterns
 * @returns {string} The matched label or empty string if no match
 */
export const getDynamicRouteMapping = (pathname: string): string => {
  for (const { pattern, label } of dynamicRoutePatterns) {
    if (pattern.test(pathname)) {
      return label;
    }
  }
  return "";
};

/**
 * Normalize and convert path segments to readable labels
 *
 * @param {string} segment - The path segment to normalize
 * @returns {string} The normalized label
 */
export const normalizePathSegment = (segment: string): string => {
  return segment
    .replace(/[-_]/g, " ") // Convert kebab-case and snake_case to spaces
    .replace(/([a-z])([A-Z])/g, "$1 $2") // Handle camelCase
    .replace(/\b\w/g, (char) => char.toUpperCase()) // Title case
    .trim();
};

/**
 * Convert a full path to a readable breadcrumb label
 *
 * @param {string} path - The full path to convert
 * @returns {string} The converted breadcrumb label
 */
export const pathToLabel = (path: string): string => {
  return path.split("/").filter(Boolean).map(normalizePathSegment).join(" / ");
};

/**
 * Get the appropriate route mapping for a given path
 *
 * @param {string} path - The path to get mapping for
 * @returns {string} The appropriate breadcrumb label
 */
export const getRouteMapping = (path: string): string => {
  // Check static mapping first
  if (routeMapping[path]) {
    return routeMapping[path];
  }

  // Check dynamic mapping
  const dynamicMapping = getDynamicRouteMapping(path);
  if (dynamicMapping) {
    return dynamicMapping;
  }

  // Fallback to path conversion
  return pathToLabel(path);
};

/**
 * Get the appropriate icon for a given path
 *
 * @param {string} path - The path to get icon for
 * @returns {React.ReactNode | null} The appropriate icon or null if no match
 */
export const getRouteIcon = (path: string): React.ReactNode | null => {
  // Check static mapping first
  const iconFunction = routeIconMapping[path];
  if (iconFunction) return iconFunction();

  // Check dynamic patterns for icon
  for (const entry of dynamicRoutePatterns) {
    if (entry.pattern.test(path) && "icon" in entry && entry.icon) {
      return entry.icon();
    }
  }

  return null;
};

/**
 * Get all available route mappings for debugging/documentation purposes
 *
 * @returns {Object} Object containing static and dynamic mappings info
 */
export const getAllRouteMappings = () => {
  return {
    static: routeMapping,
    dynamic: dynamicRoutePatterns,
    totalStaticRoutes: Object.keys(routeMapping).length,
    totalDynamicPatterns: dynamicRoutePatterns.length,
  };
};
