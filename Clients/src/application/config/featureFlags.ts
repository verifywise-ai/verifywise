/**
 * Frontend feature flags.
 *
 * Simple compile-time toggles for hiding features from the UI without removing
 * their code. Flip a flag and every gated touch point follows.
 */

/**
 * AI Gateway "Prompts" feature (prompt library / templates).
 *
 * When false, the Prompts page is unrouted, its sidebar item and breadcrumbs
 * are hidden, the Endpoints prompt-template picker stays dormant, and the
 * user-guide article is unregistered. The page, editor, backend router, CRUD,
 * and database tables remain in place; set this to true to surface it again.
 */
export const SHOW_AI_GATEWAY_PROMPTS = false;
