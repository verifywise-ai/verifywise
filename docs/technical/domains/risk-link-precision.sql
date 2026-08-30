-- Risk link precision: which suggestions people accept, and which they throw away.
--
-- Run from the repo root: psql -d verifywise -f docs/technical/domains/risk-link-precision.sql
--
-- This is a hand-run telemetry query, not app code. Nothing here writes.
-- It answers one question: are the recompute signals and the direction agent
-- earning their place, or are they generating noise someone has to clear?
--
-- HOW TO READ THE NUMBERS -- these four rules are the whole file; the SQL is easy:
--
--  1. `suggested` rows are excluded from every denominator. Undecided is not
--     rejected. Counting pending rows as failures makes any signal nobody has
--     reviewed yet look broken.
--
--  2. `source = 'user'` rows are excluded. A link somebody created by hand was
--     never a suggestion, so it cannot be right or wrong about one.
--
--  3. A row's verdict is credited to EVERY signal on that row. That is
--     co-occurrence, not attribution: a weak signal that always rides along
--     with a strong one inherits the strong one's score. Never read query 1
--     without query 3.
--
--  4. Under roughly 30 decisions a percentage is noise. Every query prints the
--     raw `decided` count next to the rate for exactly this reason.
--
-- Schema note: risk_links lives in the `verifywise` schema, matching the
-- search_path the app sets in Servers/database/db.ts.

SET search_path TO verifywise;

\echo
\echo === 1. Confirm rate per signal (worst first) -- tunes signal WEIGHT ===
\echo

SELECT
  r.signal,
  count(*)                                                                    AS decided,
  count(*) FILTER (WHERE l.status = 'confirmed')                              AS confirmed,
  round(100.0 * count(*) FILTER (WHERE l.status = 'confirmed') / count(*), 1) AS confirm_pct
FROM risk_links l
CROSS JOIN LATERAL jsonb_to_recordset(l.reasons) AS r(signal text)
WHERE l.source = 'derived'
  AND l.status IN ('confirmed', 'dismissed')
GROUP BY r.signal
ORDER BY confirm_pct;

\echo
\echo === 2. Confirm rate per score band -- tunes LINK_SCORE_THRESHOLD (now 3) ===
\echo
-- If the lowest band that clears the threshold confirms far worse than the one
-- above it, the threshold is set too low and is leaking noise into the queue.

SELECT
  floor(l.score)                                                              AS score_floor,
  count(*)                                                                    AS decided,
  count(*) FILTER (WHERE l.status = 'confirmed')                              AS confirmed,
  round(100.0 * count(*) FILTER (WHERE l.status = 'confirmed') / count(*), 1) AS confirm_pct
FROM risk_links l
WHERE l.source = 'derived'
  AND l.status IN ('confirmed', 'dismissed')
GROUP BY floor(l.score)
ORDER BY floor(l.score);

\echo
\echo === 3. Confirm rate per signal COMBINATION -- disentangles query 1 ===
\echo
-- Read this before acting on query 1. A signal that scores badly alone but well
-- in company should lose weight, not be deleted. Biggest samples first; the
-- long tail at the bottom is single-occurrence noise.

SELECT
  s.signal_set,
  count(*)                                                                      AS decided,
  count(*) FILTER (WHERE s.status = 'confirmed')                                AS confirmed,
  round(100.0 * count(*) FILTER (WHERE s.status = 'confirmed') / count(*), 1)   AS confirm_pct
FROM (
  SELECT
    l.status,
    (SELECT string_agg(DISTINCT r.signal, '+' ORDER BY r.signal)
       FROM jsonb_to_recordset(l.reasons) AS r(signal text)) AS signal_set
  FROM risk_links l
  WHERE l.source = 'derived'
    AND l.status IN ('confirmed', 'dismissed')
) s
WHERE s.signal_set IS NOT NULL
GROUP BY s.signal_set
ORDER BY decided DESC;

\echo
\echo === 4. Direction agent accuracy -- tunes the C2 prompt ===
\echo

SELECT
  count(*) FILTER (WHERE status = 'confirmed')                            AS confirmed,
  count(*) FILTER (WHERE status = 'dismissed')                            AS dismissed,
  count(*) FILTER (WHERE status = 'suggested')                            AS still_pending,
  round(100.0 * count(*) FILTER (WHERE status = 'confirmed')
        / nullif(count(*) FILTER (WHERE status IN ('confirmed', 'dismissed')), 0), 1)
                                                                          AS confirm_pct
FROM risk_links
WHERE source = 'agent'
  AND relation_type = 'inherits_from';

\echo
\echo === 5. Wrong way round -- right pair, backwards arrow ===
\echo
-- The agent proposed A inherits from B, someone dismissed it, and LATER someone
-- confirmed B inherits from A. The pairing was right and only the direction was
-- wrong, which is the most fixable kind of prompt error.
--
-- The `d.decided_at < m.decided_at` ordering is load-bearing. Without it this
-- also catches "the user already had the correct edge and cleared a redundant
-- suggestion" -- same rows, completely different diagnosis.
--
-- agent_reason is the model's own justification for the edge that got rejected,
-- which is the text to read when rewriting the prompt.
-- Query 6's `wrong_direction` now measures this directly. Keep both: this one
-- finds backwards arrows the user silently fixed by hand without labelling the
-- dismissal, which is every dismissal made before C3 shipped and every one
-- since where the reason was skipped.

SELECT
  d.organization_id,
  d.source_risk_id            AS agent_said_child,
  d.target_risk_id            AS agent_said_parent,
  d.reasons #>> '{0,detail}'  AS agent_reason,
  d.decided_at                AS dismissed_at,
  m.decided_at                AS mirror_confirmed_at
FROM risk_links d
JOIN risk_links m
  ON  m.organization_id = d.organization_id
  AND m.source_risk_id  = d.target_risk_id
  AND m.target_risk_id  = d.source_risk_id
  AND m.relation_type   = 'inherits_from'
  AND m.status          = 'confirmed'
WHERE d.relation_type = 'inherits_from'
  AND d.status        = 'dismissed'
  AND d.source        = 'agent'
  AND d.decided_at IS NOT NULL
  AND m.decided_at IS NOT NULL
  AND d.decided_at < m.decided_at
ORDER BY m.decided_at DESC;


-- 6. Why people throw suggestions away.
--
-- Reasons are OPTIONAL, so read the `(none given)` row FIRST: a breakdown
-- sitting under 20% coverage is an anecdote, not a measurement. It is in the
-- same result set for exactly that reason — a reader who sees the breakdown
-- sees how much of it is silence.
--
-- Only a dismissal FROM `suggested` carries a reason. Un-linking a pair
-- somebody previously confirmed is a content edit, not feedback about the
-- engine, and deliberately records nothing. `source <> 'user'` is
-- belt-and-braces: a hand-made link lands `confirmed`, so it can only ever be
-- dismissed from `confirmed`.
SELECT
  l.relation_type,
  coalesce(l.dismiss_reason, '(none given)')                       AS dismiss_reason,
  count(*)                                                         AS dismissals,
  round(100.0 * count(*)
        / sum(count(*)) OVER (PARTITION BY l.relation_type), 1)    AS pct_of_type
FROM risk_links l
WHERE l.status = 'dismissed'
  AND l.source <> 'user'
GROUP BY l.relation_type, l.dismiss_reason
ORDER BY l.relation_type, dismissals DESC;
