-- Demo data for F9 deadline & SLA escalation, org 1.
--
-- THIS SEED UPDATES EXISTING DEMO RISKS; IT DOES NOT INSERT AND IT CLAIMS NO
-- NEW ID BLOCK. Touched ids: risks 9501, 9505, 9530, 9502 and model_risks 9201
-- (all owned by seed_risk_links_demo.sql's 9500-9599 / 9200-9299 blocks, so do
-- not go hunting for an F9 block -- there isn't one).
--
-- Relative dates only (NOW() +/- INTERVAL): this feature is entirely about
-- distance from today, and an absolute date is stale tomorrow. Re-running is
-- safe -- the same relative dates are simply re-applied.
SET search_path TO verifywise, public;
BEGIN;

-- 9501: NOW() + 7 days  -> the email threshold (in-app + email)
-- 9505: NOW() + 1 day   -> the Slack threshold
-- 9530: NOW() - 3 days  -> overdue: must still fire exactly once
-- 9502: NOW() + 30 days -> must NOT fire
UPDATE risks
   SET deadline = CASE id
                    WHEN 9501 THEN NOW() + INTERVAL '7 days'
                    WHEN 9505 THEN NOW() + INTERVAL '1 day'
                    WHEN 9530 THEN NOW() - INTERVAL '3 days'
                    WHEN 9502 THEN NOW() + INTERVAL '30 days'
                  END,
       updated_at = NOW()
 WHERE id IN (9501, 9505, 9530, 9502)
   AND organization_id = 1;

-- One model_risks row at the email threshold, for the second entity.
-- AT TIME ZONE 'UTC' is load-bearing: target_date is `timestamp WITHOUT time
-- zone` and psql here runs Europe/Istanbul while the app runs UTC. A bare
-- NOW() stores Istanbul wall-clock, which the app then reads as UTC and
-- compares 3 hours late -- enough to miss a row exactly at the threshold.
UPDATE model_risks
   SET target_date = (NOW() AT TIME ZONE 'UTC') + INTERVAL '7 days',
       updated_at = NOW()
 WHERE id = 9201
   AND organization_id = 1;

-- Show summary (distance from today, in days)
SELECT id, risk_name, round(extract(epoch FROM (deadline - NOW())) / 86400.0, 1) AS days_out
  FROM risks WHERE id IN (9501, 9505, 9530, 9502) ORDER BY id;
SELECT id, risk_name, round(extract(epoch FROM (target_date - NOW())) / 86400.0, 1) AS days_out
  FROM model_risks WHERE id = 9201;

COMMIT;
