/**
 * Shadow AI usage definition shared by every reader of shadow_ai_events.
 */

/**
 * The one definition of AI usage for Shadow AI counts: an event counts when
 * it matched an AI tool at ingestion. Proxy traffic that matched no tool is
 * stored but is not AI usage, so it must not add users, events, prompts or
 * departments to any count.
 *
 * It reads the is_ai_tool flag, not detected_tool_id: that foreign key is
 * ON DELETE SET NULL, so filtering on it would drop a deleted tool's users
 * from past counts. A database trigger sets the flag whenever
 * detected_tool_id is set and never clears it (migration 20261102063837).
 * Pass the table alias when the query uses one.
 */
export function aiUsageEvent(alias?: string): string {
  return `${alias ? `${alias}.` : ""}is_ai_tool = TRUE`;
}
