/**
 * Policy template DTOs (VW-CQ-09).
 *
 * Mirrors the policy_templates table: a NULL organization_id marks a
 * system-wide template, an integer marks one the organization owns. The
 * backend orders lists system-first, name ASC.
 *
 * @module domain/interfaces/i.policyTemplate
 */

export type PolicyTemplateOrigin = "system" | "organization";

export interface PolicyTemplate {
  id: number;
  /** NULL for system templates; the org id for org-owned ones. */
  organization_id: number | null;
  name: string;
  category: string;
  description: string | null;
  /** Policy body HTML, same shape policy_manager stores in content_html. */
  content: string;
  tags: string[];
  is_system_template: boolean;
  is_active: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

/** Convenience view the UI derives from a row: which section it belongs to. */
export type PolicyTemplateView = PolicyTemplate & { origin: PolicyTemplateOrigin };

export interface PolicyTemplateCreateBody {
  name: string;
  category: string;
  description?: string | null;
  content?: string;
  tags?: string[];
}

// Same six names as the `allowed` list in updatePolicyTemplateQuery — if
// these drift apart, a PATCH for the missing field 400s as "no updatable
// fields".
export interface PolicyTemplateUpdateBody {
  name?: string;
  category?: string;
  description?: string | null;
  content?: string;
  tags?: string[];
  is_active?: boolean;
}

export interface PolicyTemplateFromPolicyBody {
  policy_id: number;
  name?: string;
  /** Defaults server-side to "Core AI governance policies" when omitted. */
  category?: string;
}
