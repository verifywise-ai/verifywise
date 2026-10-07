-- Demo data for F8 control coverage gaps, org 1.
--
-- RUN ORDER: seed_risk_links_demo.sql MUST run first, then
-- seed_risk_duplicates_demo.sql, then this file. Project 9001 and risks
-- 9501/9505/9530 come from the links seed, but risk 9561 comes ONLY from the
-- duplicates seed (F7 owns 9560-9579 inside the 9500-9599 block) -- running
-- this file straight after the links seed fails on the mappings INSERT below.
-- Re-running the links seed afterwards wipes 9560-9579 and cascade-deletes
-- the 9561 mapping, so the full order must be re-run from the top.
--
-- THE CLEAN-SLATE BELOW IS ONE STATEMENT ON PURPOSE. Every FK in this subtree
-- is ON DELETE CASCADE (verified against pg_constraint):
--   subcontrols_eu__risks.subcontrol_id -> subcontrols_eu(id)      CASCADE
--   subcontrols_eu.control_id           -> controls_eu(id)         CASCADE
--   controls_eu.projects_frameworks_id  -> projects_frameworks(id) CASCADE
-- so deleting the projects_frameworks block cascades through controls_eu ->
-- subcontrols_eu -> subcontrols_eu__risks. There is no DELETE-ordering hazard
-- because there is only one DELETE. Do not write a chain of four.
--
-- THE WHERE CLAUSE IS THE ONLY THING PREVENTING CATASTROPHE. Widen it by one
-- character and it silently destroys a real tenant's entire control tree --
-- controls, subcontrols, every risk mapping -- with no error and no alarming
-- row count. Never widen a DELETE to 9500-9599, and never write an unqualified
-- DELETE FROM projects_frameworks or DELETE FROM controls_eu.
SET search_path TO verifywise, public;
BEGIN;

-- --------------------------------------------------------------- clean slate
DELETE FROM projects_frameworks WHERE id BETWEEN 9800 AND 9809;

-- Fail fast with an actionable message when the RUN ORDER above was not
-- followed. This MUST sit before the first INSERT: without it, a missing
-- prerequisite surfaces as a cryptic FK violation (projects_frameworks or
-- projects_risks_id 9561 not present), which reads like a bug in this file
-- rather than a skipped seed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = 9001 AND organization_id = 1) THEN
    RAISE EXCEPTION 'seed_risk_coverage_demo.sql requires project 9001: run seed_risk_links_demo.sql first';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES (9501), (9505), (9561)) AS need(id)
    WHERE NOT EXISTS (SELECT 1 FROM risks r WHERE r.id = need.id AND r.organization_id = 1)
  ) THEN
    RAISE EXCEPTION 'seed_risk_coverage_demo.sql requires risks 9501/9505/9561: run seed_risk_links_demo.sql then seed_risk_duplicates_demo.sql first';
  END IF;
END $$;

-- ------------------------------------------------- framework onto project 9001
-- Exactly one demo project gets a framework, so all three report states show
-- at once: 9001's risks split into gap/covered, every other project's risks
-- stay no_framework. Framework 1 is EU AI Act.
INSERT INTO projects_frameworks (id, organization_id, project_id, framework_id, is_demo)
VALUES (9800, 1, 9001, 1, true);

-- ------------------------------------------------------- controls + subcontrols
-- Real meta ids, looked up at runtime so the seed works on any install
-- regardless of struct id numbering: the first 6 struct subcontrols overall
-- (184 available), hanging under their distinct struct controls.
WITH first_subs AS (
  SELECT id AS meta_id, control_id AS struct_control
  FROM subcontrols_struct_eu ORDER BY id LIMIT 6
),
parent_controls AS (
  SELECT DISTINCT struct_control FROM first_subs
)
INSERT INTO controls_eu (id, organization_id, control_meta_id, projects_frameworks_id, is_demo)
SELECT 9809 + ROW_NUMBER() OVER (ORDER BY struct_control), 1, struct_control, 9800, true
FROM parent_controls;

WITH first_subs AS (
  SELECT ss.id AS meta_id, ss.control_id AS struct_control,
         ROW_NUMBER() OVER (ORDER BY ss.id) AS rn
  FROM subcontrols_struct_eu ss ORDER BY ss.id LIMIT 6
)
INSERT INTO subcontrols_eu (id, organization_id, control_id, subcontrol_meta_id, is_demo)
SELECT 9829 + f.rn, 1, ce.id, f.meta_id, true
FROM first_subs f
JOIN controls_eu ce ON ce.control_meta_id = f.struct_control AND ce.id BETWEEN 9810 AND 9829;

-- ------------------------------------------------------------------- mappings
-- Exactly these three risks, positionally paired with the first three
-- subcontrols (9501 -> lowest subcontrol id, 9505 -> next, 9561 -> next):
--   9501 High risk      discriminatory lending outcomes, the headline risk
--   9505 Very high risk training data retention, proves a Very high CAN be covered
--   9561 Medium risk    vendor assessment overdue, half of F7's duplicate pair
-- Everything else in 9001 stays unmapped -- leave 9502-9504, 9506, 9526-9528,
-- 9530 and 9562-9564 alone -- which puts 9530 (Very high, third-party
-- sub-processor unvetted) at the top of the gap list. Mapping 9561 but not
-- its twin 9562 shows F7 and F8 together: one of a duplicate pair is
-- controlled, the other is not.
--
INSERT INTO subcontrols_eu__risks (organization_id, subcontrol_id, projects_risks_id)
SELECT 1, se.id, r.id
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM subcontrols_eu WHERE id BETWEEN 9830 AND 9879 ORDER BY id LIMIT 3
) se
JOIN (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM (VALUES (9501), (9505), (9561)) AS r(id)
) r ON r.rn = se.rn;

-- Sequences must clear the seeded block so app-created rows never collide.
-- The floor is 9899, the END of F8's reserved range -- NOT MAX(id), which is the
-- range's START. With a bare MAX(id) the next app-created projects_frameworks row
-- gets 9801, inside the DELETE above, and the next seed run cascades a real
-- tenant's whole control tree away. Same convention as seed_risk_links_demo.sql:293.
SELECT setval('verifywise.projects_frameworks_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM projects_frameworks), 9899));
SELECT setval('verifywise.controls_eu_id_seq',         GREATEST((SELECT COALESCE(MAX(id),0) FROM controls_eu),         9899));
SELECT setval('verifywise.subcontrols_eu_id_seq',      GREATEST((SELECT COALESCE(MAX(id),0) FROM subcontrols_eu),      9899));

-- Show summary
SELECT id, project_id, framework_id FROM projects_frameworks WHERE id BETWEEN 9800 AND 9809 ORDER BY id;
SELECT id, control_meta_id, projects_frameworks_id FROM controls_eu WHERE id BETWEEN 9810 AND 9829 ORDER BY id;
SELECT id, control_id, subcontrol_meta_id FROM subcontrols_eu WHERE id BETWEEN 9830 AND 9879 ORDER BY id;
SELECT subcontrol_id, projects_risks_id AS risk_id FROM subcontrols_eu__risks WHERE subcontrol_id BETWEEN 9830 AND 9879 ORDER BY subcontrol_id;

COMMIT;
