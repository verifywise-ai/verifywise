/**
 * The bias audit module's sections. Each is a route segment,
 * `/bias-audit/:projectId/:section`, so the module sidebar and the page read
 * the same URL.
 */
export const BIAS_AUDIT_SECTIONS = ["profile", "generate", "runs", "scope"] as const;

export type BiasAuditSection = (typeof BIAS_AUDIT_SECTIONS)[number];

/** An absent or unknown segment opens the profile. */
export function parseSection(segment: string | undefined): BiasAuditSection {
  return (BIAS_AUDIT_SECTIONS as readonly string[]).includes(segment ?? "")
    ? (segment as BiasAuditSection)
    : "profile";
}

/** With no use case chosen yet, the page picks the first one. */
export function sectionPath(projectId: number | null, section: BiasAuditSection): string {
  return projectId === null ? "/bias-audit" : `/bias-audit/${projectId}/${section}`;
}
