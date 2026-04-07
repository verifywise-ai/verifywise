export const ROLES = {
  1 : "Admin",
  2 : "Reviewer",
  3 : "Editor",
  4 : "Auditor",
  5 : "Super Admin"
}

/** Assignable role options (excludes Super Admin) for dropdowns */
export const ROLE_OPTIONS = [
  { value: 1, label: "Admin" },
  { value: 2, label: "Reviewer" },
  { value: 3, label: "Editor" },
  { value: 4, label: "Auditor" },
] as const;

/** Role badge colors for table display */
export const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  Admin: { bg: "#eff6ff", text: "#2563eb" },
  Reviewer: { bg: "#faf5ff", text: "#9333ea" },
  Editor: { bg: "#f0fdf4", text: "#16a34a" },
  Auditor: { bg: "#fefce8", text: "#ca8a04" },
};