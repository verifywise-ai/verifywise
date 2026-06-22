/**
 * Shared SQL visibility filter for AI feature tables.
 * Generates a WHERE clause fragment that enforces public/private visibility.
 *
 * - "public": only public results
 * - "private": only the user's own private results
 * - "all" (default): public + user's own private
 */
export function buildVisibilityFilter(
  userId: number | null,
  visibility?: string,
  alias?: string,
): { clause: string; replacements: Record<string, any> } {
  const a = alias ? `${alias}.` : "";

  if (visibility === "private") {
    return {
      clause: `AND ${a}visibility = 'private' AND ${a}created_by = :visUserId`,
      replacements: { visUserId: userId },
    };
  }

  if (visibility === "public") {
    return {
      clause: `AND ${a}visibility = 'public'`,
      replacements: {},
    };
  }

  // Default "all": public results + user's own private results
  if (userId) {
    return {
      clause: `AND (${a}visibility = 'public' OR (${a}visibility = 'private' AND ${a}created_by = :visUserId))`,
      replacements: { visUserId: userId },
    };
  }

  // No userId — only public
  return {
    clause: `AND ${a}visibility = 'public'`,
    replacements: {},
  };
}

/**
 * For evidence_ai_analysis which uses analyzed_by instead of created_by.
 */
export function buildVisibilityFilterForEvidence(
  userId: number | null,
  visibility?: string,
  alias?: string,
): { clause: string; replacements: Record<string, any> } {
  const a = alias ? `${alias}.` : "";

  if (visibility === "private") {
    return {
      clause: `AND ${a}visibility = 'private' AND ${a}analyzed_by = :visUserId`,
      replacements: { visUserId: userId },
    };
  }

  if (visibility === "public") {
    return {
      clause: `AND ${a}visibility = 'public'`,
      replacements: {},
    };
  }

  if (userId) {
    return {
      clause: `AND (${a}visibility = 'public' OR (${a}visibility = 'private' AND ${a}analyzed_by = :visUserId))`,
      replacements: { visUserId: userId },
    };
  }

  return {
    clause: `AND ${a}visibility = 'public'`,
    replacements: {},
  };
}
