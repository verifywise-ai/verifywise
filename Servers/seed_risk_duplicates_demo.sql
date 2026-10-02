-- Demo data for F7 duplicate detection, org 1 / user 1.
-- Run seed_risk_links_demo.sql first: project 9001 is defined there.
-- Idempotent: fixed ids 9560-9579, deleted and re-inserted on every run.
-- Narrow deletes on purpose: seed_risk_links_demo.sql owns the whole 9500-9599
-- block and clears it, so widening these would wipe the Feature 1-5 demo data.
-- Reuses demo project 9001 (Loan Approval Copilot) rather than creating one.
SET search_path TO verifywise, public;
BEGIN;

-- --------------------------------------------------------------- clean slate
DELETE FROM projects_risks WHERE risk_id BETWEEN 9560 AND 9579;
DELETE FROM risks           WHERE id BETWEEN 9560 AND 9579;

-- ------------------------------------------------------------------ seed rows
-- All four share category 'Operational risk' and project 9001. Hand-computed
-- Jaccard (lowercase, strip [^a-z0-9 ], split, drop len <= 2, set):
--   (9561,9562)  9/19 = 0.47  -> reported (genuine duplicate, reworded)
--   (9561,9563)  5/21 = 0.24  -> NOT reported (borderline, just under 0.25)
--   (9562,9563)  4/22 = 0.18  -> NOT reported
--   (9561,9564), (9562,9564), (9563,9564) = 0.00 -> NOT reported (the §2.2
--   false positive: same category and project, different topic)
WITH seed(id, project_id, risk_name, likelihood, severity, category, phase, description) AS (VALUES
 (9561,9001,'Vendor assessment overdue','Possible','Moderate',ARRAY['Operational risk'],'Monitoring & maintenance','Vendor security assessments stay incomplete past the review deadline for production data.'),
 (9562,9001,'Late vendor security review','Possible','Moderate',ARRAY['Operational risk'],'Monitoring & maintenance','Production data vendor reviews miss the assessment deadline and remain incomplete.'),
 (9563,9001,'Vendor report review cadence','Unlikely','Minor', ARRAY['Operational risk'],'Deployment & integration','Assessment summaries for data vendors arrive without a review schedule.'),
 (9564,9001,'On-call rota gaps','Possible','Minor',           ARRAY['Operational risk'],'Monitoring & maintenance','Night shifts lack coverage when engineers swap rotations informally.')
), scored AS (
  SELECT s.*,
         (CASE likelihood WHEN 'Rare' THEN 1 WHEN 'Unlikely' THEN 2 WHEN 'Possible' THEN 3
                          WHEN 'Likely' THEN 4 ELSE 5 END)
       + 3 * (CASE severity WHEN 'Negligible' THEN 1 WHEN 'Minor' THEN 2 WHEN 'Moderate' THEN 3
                            WHEN 'Major' THEN 4 ELSE 5 END) AS score
  FROM seed s
)
INSERT INTO risks (id, organization_id, risk_name, risk_owner, ai_lifecycle_phase, risk_description,
                   risk_category, impact, likelihood, severity, risk_level_autocalculated,
                   mitigation_status, current_risk_level, deadline, mitigation_plan,
                   likelihood_mitigation, risk_severity, final_risk_level, risk_approval,
                   approval_status, date_of_assessment, is_demo, is_deleted, created_at, updated_at)
SELECT id, 1, risk_name, 1, phase::enum_projectrisks_ai_lifecycle_phase, description,
       category::text[]::enum_projectrisks_risk_category[],
       'See description', likelihood::enum_projectrisks_likelihood, severity::enum_projectrisks_severity,
       (CASE WHEN score <= 4 THEN 'No risk' WHEN score <= 8 THEN 'Low risk'
             WHEN score <= 12 THEN 'Medium risk' WHEN score <= 16 THEN 'High risk'
             ELSE 'Very high risk' END)::enum_projectrisks_risk_level_autocalculated,
       'In Progress'::enum_projectrisks_mitigation_status,
       'Medium risk', NOW() + INTERVAL '60 days',
       'Tracked in the project mitigation plan.',
       'Unlikely'::enum_projectrisks_likelihood_mitigation, 'Minor'::enum_projectrisks_risk_severity,
       'Low risk', 1, 'In Review', NOW() - INTERVAL '20 days', true, false,
       NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'
FROM scored;

INSERT INTO projects_risks (organization_id, risk_id, project_id)
SELECT 1, id, project_id FROM (VALUES
 (9561,9001),(9562,9001),(9563,9001),(9564,9001)
) AS t(id, project_id);

SELECT setval('risks_id_seq', (SELECT MAX(id) FROM risks));

-- Show summary
SELECT id, risk_name FROM risks WHERE id BETWEEN 9560 AND 9579 ORDER BY id;

COMMIT;
