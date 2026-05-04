/**
 * Fixed plugin slot identifiers
 * These are the only locations where plugins can inject UI
 */
export const PLUGIN_SLOTS = {
  // Risk Management Page
  RISKS_ACTIONS: "page.risks.actions", // Menu item in "Insert From" dropdown
  RISKS_TOOLBAR: "page.risks.toolbar", // Additional toolbar buttons

  // Model Inventory Page
  MODELS_TABS: "page.models.tabs", // Additional tabs in TabBar
  MODELS_TOOLBAR: "page.models.toolbar", // Toolbar buttons
  MODEL_ROW_ACTIONS: "table.model.row-actions", // Additional menu items in model row gear dropdown
  MODEL_ROW_ICON_ACTIONS: "table.model.row-icon-actions", // Icon buttons beside the gear dropdown

  // Model Detail Page
  MODEL_DETAIL_LIFECYCLE: "page.model-detail.lifecycle", // Lifecycle phase tracking

  // Settings Page
  SETTINGS_TABS: "page.settings.tabs", // Additional tabs in Settings

  // Plugin Management Page (for plugin-specific config UI)
  PLUGIN_CONFIG: "page.plugin.config", // Config panel for each plugin

  // Framework Selection (Add Framework Modal)
  FRAMEWORK_SELECTION: "modal.framework.selection", // Custom framework cards in Add Framework modal

  // Organizational Framework Management (Framework Settings page)
  ORG_FRAMEWORK_MANAGEMENT: "page.org-framework.management", // Custom frameworks in organizational framework management

  // Controls and Requirements - Custom Framework Viewer (Organizational)
  CONTROLS_CUSTOM_FRAMEWORK: "page.controls.custom-framework", // Custom framework viewer in Controls tab (organizational)

  // Controls and Requirements - Custom Framework Viewer (Project/Use-case)
  PROJECT_CONTROLS_CUSTOM_FRAMEWORK: "page.project-controls.custom-framework", // Custom framework viewer in project Controls tab

  // Framework Dashboard - Custom Framework Dashboard
  FRAMEWORK_DASHBOARD_CUSTOM: "page.framework-dashboard.custom", // Custom framework dashboard content

  // Use-case Overview - Custom Framework Progress
  PROJECT_OVERVIEW_CUSTOM_FRAMEWORK: "page.project-overview.custom-framework", // Custom framework progress in use-case overview

  // Use-case Detail View - All tabs can be overridden by plugins
  USE_CASE_DETAIL_VIEW: "page.usecase.detail-view", // Full detail view override
  USE_CASE_OVERVIEW: "page.usecase.overview", // Overview tab
  USE_CASE_RISKS: "page.usecase.risks", // Risks tab
  USE_CASE_MODELS: "page.usecase.models", // Linked models tab
  USE_CASE_FRAMEWORKS: "page.usecase.frameworks", // Frameworks tab
  USE_CASE_CE_MARKING: "page.usecase.ce-marking", // CE Marking tab
  USE_CASE_ACTIVITY: "page.usecase.activity", // Activity tab
  USE_CASE_MONITORING: "page.usecase.monitoring", // Monitoring tab
  USE_CASE_SETTINGS: "page.usecase.settings", // Settings tab

  // Datasets Page
  DATASETS_TOOLBAR: "page.datasets.toolbar", // Toolbar buttons (e.g., bulk upload)

  // Dashboard (future)
  DASHBOARD_WIDGETS: "page.dashboard.widgets", // Dashboard widget area

  // Sidebar (future)
  SIDEBAR_ITEMS: "layout.sidebar.items", // Sidebar menu items
} as const;

export type PluginSlotId = (typeof PLUGIN_SLOTS)[keyof typeof PLUGIN_SLOTS];

/**
 * Render types for plugin components
 */
export type PluginRenderType = "menuitem" | "modal" | "tab" | "card" | "button" | "widget" | "raw";
