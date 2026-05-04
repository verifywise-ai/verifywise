interface DashboardState {
  dashboard: Record<string, unknown>;
  projects: Record<string, unknown> | Project[];
  compliance: Record<string, unknown>;
  assessments: Record<string, unknown>;
  vendors: Vendor[];
  users?: User[];
}

// Define Project interface for better type safety
interface Project {
  id: string | number;
  project_title?: string;
  is_organizational?: boolean;
  framework?: FrameworkValues[];
  [key: string]: unknown;
}

interface FrameworkValues {
  project_framework_id: number;
  framework_id: number;
  name: string;
  [key: string]: unknown;
}

// Supporting interfaces for better type safety
interface Vendor {
  id: number;
  vendor_name: string;
  [key: string]: unknown;
}

interface User {
  id: number;
  name: string;
  email: string;
  surname?: string;
  [key: string]: unknown;
}

interface AppState {
  ui: {
    mode: "light" | "dark";
  };
  auth: {
    authToken: string;
  };
  dashboard: {
    users: Array<{
      id: number;
      email: string;
      name: string;
      surname: string;
    }>;
  };
}

interface AlertState {
  variant: "success" | "info" | "warning" | "error";
  title?: string;
  body: string;
}

// UI state values for theme, layout, and other UI preferences
interface UIValues {
  mode?: "light" | "dark";
  sidebarOpen?: boolean;
  selectedTheme?: string;
  layout?: Record<string, unknown>;
}

// Authentication state values
interface AuthValues {
  authToken?: string;
  refreshToken?: string;
  userRole?: string;
  permissions?: string[];
  loginTime?: number;
  expiresAt?: number;
}

// Input state values for forms and dynamic data entry
interface InputValues {
  id?: string | number;
  risk_name?: string;
  risk_owner?: number | string;
  risk_description?: string;
  ai_lifecycle_phase?: string;
  risk_category?: string[] | unknown;
  impact?: string;
  assessment_mapping?: number;
  controlsMapping?: number;
  likelihood?: string;
  severity?: string;
  riskLevel?: number | string;
  review_notes?: string;
  projects?: number[] | unknown;
  frameworks?: number[] | unknown;
  mitigation_status?: string;
  mitigation_plan?: string;
  current_risk_level?: string;
  implementation_strategy?: string;
  deadline?: string | Date;
  mitigation_evidence_document?: string;
  likelihood_mitigation?: string;
  risk_severity?: string;
  risk_approval?: number;
  approval_status?: string;
  date_of_assessment?: string | Date;
  // Vendor risk form fields
  vendor_name?: number;
  owner?: number;
  review_date?: string | Date;
  // Generic field for dynamic form data
  [key: string]: unknown;
}

export type {
  DashboardState,
  AppState,
  AlertState,
  UIValues,
  AuthValues,
  InputValues,
  Vendor,
  User,
  Project,
  FrameworkValues,
};
