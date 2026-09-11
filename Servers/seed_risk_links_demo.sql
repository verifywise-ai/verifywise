-- Demo data for the risk-links feature chain (Features 1-5), org 1 / user 1.
-- Idempotent: fixed id ranges, deleted and re-inserted on every run.
-- Every row is is_demo = true so it never mixes with rows created by hand.
SET search_path TO verifywise, public;
BEGIN;

-- ---------------------------------------------------------------- clean slate
-- evidence_hub has no is_demo column and none of risk_links' cascade coverage,
-- so it needs its own delete line.
DELETE FROM evidence_hub                          WHERE id BETWEEN 9700 AND 9799;
DELETE FROM risk_links                            WHERE id BETWEEN 9600 AND 9699;
DELETE FROM projects_risks                        WHERE risk_id BETWEEN 9500 AND 9599;
DELETE FROM frameworks_risks                      WHERE risk_id BETWEEN 9500 AND 9599;
DELETE FROM risks                                 WHERE id BETWEEN 9500 AND 9599;
DELETE FROM vendorrisks                           WHERE id BETWEEN 9400 AND 9499;
DELETE FROM vendors_projects                      WHERE vendor_id BETWEEN 9300 AND 9399;
DELETE FROM vendors                               WHERE id BETWEEN 9300 AND 9399;
DELETE FROM model_risks                           WHERE id BETWEEN 9200 AND 9299;
DELETE FROM model_inventories_projects_frameworks WHERE model_inventory_id BETWEEN 9100 AND 9199;
DELETE FROM model_inventories                     WHERE id BETWEEN 9100 AND 9199;
DELETE FROM projects_members                      WHERE project_id BETWEEN 9000 AND 9099;
DELETE FROM projects                              WHERE id BETWEEN 9000 AND 9099;

-- ------------------------------------------------------------------- projects
INSERT INTO projects (id, organization_id, uc_id, project_title, owner, start_date,
                      ai_risk_classification, type_of_high_risk_role, goal, status,
                      last_updated, last_updated_by, is_demo)
VALUES
 (9001,1,'UC-DEMO-001','Loan Approval Copilot',      1, NOW()-INTERVAL '210 days','High risk','Deployer','Assist underwriters with consumer credit decisions.','In progress',   NOW(),1,true),
 (9002,1,'UC-DEMO-002','Customer Support Chatbot',   1, NOW()-INTERVAL '160 days','Limited risk','Deployer','Answer tier-1 support questions without a human.','In progress',    NOW(),1,true),
 (9003,1,'UC-DEMO-003','Fraud Detection Engine',     1, NOW()-INTERVAL '300 days','High risk','Provider','Score card transactions for fraud in real time.','Under review',       NOW(),1,true),
 (9004,1,'UC-DEMO-004','HR Resume Screener',         1, NOW()-INTERVAL '120 days','High risk','Deployer','Rank inbound applications for recruiters.','In progress',             NOW(),1,true),
 (9005,1,'UC-DEMO-005','Clinical Triage Assistant',  1, NOW()-INTERVAL '75 days', 'High risk','Provider','Suggest triage priority from intake notes.','Not started',            NOW(),1,true);

INSERT INTO projects_members (organization_id, project_id, user_id, is_demo)
SELECT 1, id, 1, true FROM projects WHERE id BETWEEN 9000 AND 9099;

-- ------------------------------------------------------------ model inventory
INSERT INTO model_inventories (id, organization_id, provider, model, version, approver,
                               capabilities, security_assessment, status, status_date,
                               hosting_provider, is_demo)
VALUES
 (9101,1,'OpenAI',        'gpt-4o',              '2024-11-20',1,'Text, vision, function calling',true, 'Approved',  NOW()-INTERVAL '90 days','Azure OpenAI',true),
 (9102,1,'Anthropic',     'claude-3-5-sonnet',   '20241022',  1,'Long-context reasoning, tool use',true,'Approved',  NOW()-INTERVAL '60 days','AWS Bedrock', true),
 (9103,1,'Acme Internal', 'fraud-scorer-v2',     '2.4.1',     1,'Gradient-boosted transaction scoring',false,'Restricted',NOW()-INTERVAL '30 days','On-prem',  true);

-- One model in two projects, and one of those under two frameworks: this is the
-- row set the "Same project: X +1" badge and the DISTINCT in the C5 query need.
INSERT INTO model_inventories_projects_frameworks (organization_id, model_inventory_id, project_id, framework_id)
VALUES (1,9101,9001,1), (1,9101,9002,1), (1,9101,9002,2),
       (1,9102,9002,1),
       (1,9103,9003,4);

INSERT INTO model_risks (id, organization_id, risk_name, risk_category, risk_level, status,
                         owner, target_date, description, mitigation_plan, impact, likelihood,
                         key_metrics, current_values, threshold, model_id, is_deleted, is_demo)
VALUES
 (9201,1,'Provider deprecates the model version without notice','Compliance','High','Open',       1,NOW()+INTERVAL '30 days','The pinned snapshot can be retired on 30 days notice.','Pin a fallback model and rehearse the swap.','Decisioning stops until a swap lands.','Possible','Deprecation notices','0 open','1',9101,false,true),
 (9202,1,'Output toxicity above threshold','Bias & Fairness','Medium','In Progress',               1,NOW()+INTERVAL '45 days','Toxicity classifier fires on a small slice of replies.','Add a post-generation filter.','Customer harm and complaints.','Unlikely','Toxicity rate','0.4%','0.2%',9101,false,true),
 (9203,1,'Token cost spike under load','Performance','Low','Open',                                 1,NOW()+INTERVAL '90 days','Burst traffic multiplies inference spend.','Cache frequent answers.','Budget overrun.','Possible','Cost per 1k requests','$3.10','$2.50',9101,false,true),
 (9204,1,'Context window truncation drops policy text','Performance','Medium','Open',              1,NOW()+INTERVAL '60 days','Long tickets push the policy section out of context.','Chunk and re-rank before the call.','Answers ignore policy.','Likely','Truncation rate','7%','2%',9102,false,true),
 (9205,1,'Fine-tune data leakage','Security','Critical','Open',                                    1,NOW()+INTERVAL '15 days','Fine-tune corpus contained unredacted transcripts.','Re-build the corpus from redacted exports.','Regulatory exposure and breach notification.','Possible','Redaction coverage','86%','100%',9102,false,true),
 (9206,1,'Scorer recall degradation','Performance','High','In Progress',                           1,NOW()+INTERVAL '20 days','Recall drifts down between quarterly retrains.','Shorten the retrain cadence.','Fraud losses rise.','Likely','Recall','0.81','0.90',9103,false,true),
 (9207,1,'Feature parity between train and serve','Data Quality','Medium','Open',                  1,NOW()+INTERVAL '75 days','Serving pipeline computes two features differently.','Move both paths to the shared feature store.','Silent scoring error.','Possible','Parity checks failing','2','0',9103,false,true),
 (9208,1,'Unversioned model artifact in production','Compliance','High','Open',                    1,NOW()+INTERVAL '10 days','The deployed binary is not tied to a training run.','Enforce artifact signing in CI.','No audit trail for decisions.','Likely','Signed artifacts','60%','100%',9103,false,true);

-- --------------------------------------------------------------------- vendors
INSERT INTO vendors (id, organization_id, order_no, vendor_name, vendor_provides, assignee,
                     website, vendor_contact_person, review_result, review_status, reviewer,
                     review_date, data_sensitivity, business_criticality, past_issues,
                     regulatory_exposure, risk_score, is_demo)
VALUES
 (9301,1,1,'OpenAI',   'Hosted LLM inference for the copilot and the chatbot',1,'https://openai.com',    'Dana Whitfield','Approved with conditions','Reviewed',            1,NOW()-INTERVAL '40 days','Personally identifiable information (PII)','High (critical to core services or products)','Minor incident (e.g. small delay, minor bug)','EU AI act',72,true),
 (9302,1,2,'Snowflake','Data warehouse for feature and decision history',      1,'https://snowflake.com', 'Marco Feld',    'Follow-up required',      'Requires follow-up',   1,NOW()-INTERVAL '25 days','Financial data',                            'High (critical to core services or products)','None',                                        'GDPR (EU)', 64,true),
 (9303,1,3,'Workday',  'Applicant tracking and HR records',                    1,'https://workday.com',   'Priya Raman',   'Not yet assessed',        'In review',            1,NOW()-INTERVAL '10 days','Personally identifiable information (PII)','Medium (affects operations but is replaceable)','None',                                       'CCPA (california)',48,true);

INSERT INTO vendors_projects (organization_id, vendor_id, project_id, is_demo)
VALUES (1,9301,9001,true),(1,9301,9002,true),
       (1,9302,9001,true),(1,9302,9003,true),
       (1,9303,9004,true);

INSERT INTO vendorrisks (id, organization_id, vendor_id, order_no, risk_description, impact_description,
                         likelihood, risk_severity, action_plan, action_owner, risk_level, is_deleted, is_demo)
VALUES
 (9401,1,9301,1,'Sub-processor list changes without the contractual 30-day notice','New sub-processors can appear before we can object.','Possible','Major',    'Subscribe to the change feed and review monthly.',1,'High Risk',     false,true),
 (9402,1,9301,2,'No SOC 2 Type II report for the inference region','We cannot evidence control operation for that region.','Likely','Moderate',                'Request a regional bridge letter.',              1,'Medium Risk',   false,true),
 (9403,1,9302,3,'Data residency not guaranteed for EU tenants','EU decision history may be replicated outside the EEA.','Possible','Catastrophic',            'Enable region pinning and verify with a restore test.',1,'Very High Risk',false,true),
 (9404,1,9302,4,'Backup retention exceeds the contractual limit','Deleted records survive longer than the DPA allows.','Likely','Moderate',                   'Reduce retention to 30 days and re-test deletion.',1,'Medium Risk',   false,true),
 (9405,1,9302,5,'Breach notification window is 72h, our contract says 24h','Late notice delays our own regulatory clock.','Unlikely','Major',                 'Renegotiate at renewal.',                        1,'Low Risk',      false,true),
 (9406,1,9303,6,'Applicant data exported to a non-EU analytics tenant','Candidate PII leaves the agreed region.','Possible','Major',                          'Disable the export or scope it to aggregates.',   1,'High Risk',     false,true),
 (9407,1,9303,7,'No right-to-audit clause in the current agreement','We cannot verify controls independently.','Likely','Minor',                             'Add the clause at renewal.',                     1,'Medium Risk',   false,true),
 (9408,1,9301,8,'Support model uses shared credentials','Actions cannot be attributed to an individual.','Unlikely','Minor',                                 'Move support access to named accounts with SSO.', 1,'Low Risk',      false,true);

-- --------------------------------------------------------------- project risks
-- risk_level_autocalculated is NOT computed by the database: the client writes
-- it as likelihood + 3 x severity, banded. It is derived here with the same
-- formula (Clients/src/presentation/tools/riskCalculator.ts) so that the first
-- edit the tester makes in the UI produces a level that actually differs from
-- the seeded one -- which is exactly what Feature 2's trigger keys on.
WITH seed(id, project_id, risk_name, likelihood, severity, category, phase, description) AS (VALUES
 -- P1 Loan Approval Copilot
 (9501,9001,'Discriminatory lending outcomes across protected groups','Likely','Major',        ARRAY['Compliance risk','Legal risk'],        'Model validation & testing','Approval rates diverge by more than the fairness threshold for two protected groups.'),
 (9502,9001,'Protected-attribute proxy leakage in features','Possible','Moderate',             ARRAY['Compliance risk'],                     'Data collection & processing','Zip code and employer tenure act as proxies for a protected attribute.'),
 (9503,9001,'Applicant appeal backlog','Unlikely','Minor',                                     ARRAY['Operational risk'],                    'Monitoring & maintenance','Appeals against automated declines queue beyond the regulated response window.'),
 (9504,9001,'Adverse-action notice accuracy','Possible','Minor',                               ARRAY['Legal risk','Compliance risk'],        'Deployment & integration','Generated decline reasons do not always match the driving features.'),
 (9505,9001,'Training data retention beyond the stated purpose','Likely','Catastrophic',       ARRAY['Data privacy risk'],                   'Data collection & processing','Historic applications are retained past the purpose limitation stated at collection.'),
 (9506,9001,'Underwriter override not logged','Rare','Moderate',                               ARRAY['Operational risk'],                    'Deployment & integration','Manual overrides bypass the decision log, so the audit trail is incomplete.'),
 -- P2 Customer Support Chatbot
 (9507,9002,'Hallucinated policy answers','Likely','Moderate',                                 ARRAY['Reputational risk','Legal risk'],      'Deployment & integration','The assistant states refund and warranty terms that do not exist.'),
 (9508,9002,'Refund promise not honoured downstream','Possible','Major',                       ARRAY['Financial risk'],                      'Monitoring & maintenance','Customers act on a promised refund the billing system will not process.'),
 (9509,9002,'PII echoed back in transcripts','Possible','Catastrophic',                        ARRAY['Data privacy risk','Cybersecurity risk'],'Deployment & integration','The assistant repeats card fragments and addresses into stored transcripts.'),
 (9510,9002,'Escalation to a human fails silently','Unlikely','Moderate',                      ARRAY['Operational risk'],                    'Monitoring & maintenance','Handover to an agent drops without telling the customer.'),
 (9511,9002,'Prompt injection via ticket text','Likely','Major',                               ARRAY['Cybersecurity risk'],                  'Deployment & integration','Attacker-controlled ticket bodies steer the assistant out of policy.'),
 (9512,9002,'Multilingual quality gap','Possible','Minor',                                     ARRAY['Operational risk'],                    'Model validation & testing','Answer quality drops sharply outside English and German.'),
 -- P3 Fraud Detection Engine
 (9513,9003,'False positives freeze customer accounts','Likely','Major',                       ARRAY['Reputational risk','Operational risk'],'Deployment & integration','Legitimate customers are locked out during a scoring spike.'),
 (9514,9003,'Feature store staleness','Possible','Moderate',                                   ARRAY['Technological risk'],                  'Monitoring & maintenance','Serving features lag the warehouse by up to six hours.'),
 (9515,9003,'Adversarial evasion of scoring','Possible','Major',                               ARRAY['Cybersecurity risk','Fraud risk'],     'Monitoring & maintenance','Fraud rings probe the boundary and shape transactions to stay under it.'),
 (9516,9003,'Alert fatigue in the review queue','Likely','Minor',                              ARRAY['Operational risk','Human resources risk'],'Monitoring & maintenance','Reviewers clear alerts without reading them once volume rises.'),
 (9517,9003,'Cross-border transfer of decision history','Unlikely','Catastrophic',             ARRAY['Data privacy risk','Compliance risk'], 'Data collection & processing','Scoring history replicates to a region outside the approved list.'),
 -- P4 HR Resume Screener
 (9518,9004,'Gender bias in candidate ranking','Likely','Major',                               ARRAY['Compliance risk','Reputational risk'], 'Model validation & testing','Ranking favours one gender at equal qualification.'),
 (9519,9004,'Candidate consent not captured','Possible','Moderate',                            ARRAY['Data privacy risk','Legal risk'],      'Data collection & processing','Applications are screened before consent is recorded.'),
 (9520,9004,'Explainability gap for rejections','Possible','Major',                            ARRAY['Legal risk'],                          'Deployment & integration','Rejected candidates cannot be told why in meaningful terms.'),
 (9521,9004,'Vendor lock-in on the scoring API','Unlikely','Minor',                            ARRAY['Third-party/vendor risk','Strategic risk'],'Problem definition & planning','No exit path if the scoring vendor changes terms.'),
 -- P5 Clinical Triage Assistant
 (9522,9005,'Missed red-flag symptoms','Almost Certain','Catastrophic',                        ARRAY['Health and safety risk'],              'Model validation & testing','Time-critical presentations are triaged as routine.'),
 (9523,9005,'Clinician over-reliance on the suggestion','Likely','Major',                      ARRAY['Health and safety risk','Operational risk'],'Deployment & integration','Staff accept the suggested priority without independent review.'),
 (9524,9005,'Off-label use outside triage','Possible','Moderate',                              ARRAY['Compliance risk'],                     'Monitoring & maintenance','The assistant is used for diagnosis, which it was never validated for.'),
 (9525,9005,'Audit trail incomplete for triage decisions','Unlikely','Moderate',               ARRAY['Compliance risk'],                     'Monitoring & maintenance','Suggestion and final decision are not stored together.'),
 -- Cross-cutting, attached to more than one project
 (9526,9001,'Shadow AI usage by staff','Possible','Moderate',                                  ARRAY['Cybersecurity risk','Data privacy risk'],'Problem definition & planning','Staff paste internal data into unapproved assistants.'),
 (9527,9002,'Incident response playbook missing AI failure modes','Possible','Major',          ARRAY['Operational risk'],                    'Monitoring & maintenance','The playbook has no path for model failure or prompt-injection incidents.'),
 (9528,9003,'Model card not maintained','Rare','Minor',                                        ARRAY['Compliance risk'],                     'Monitoring & maintenance','Documentation lags the deployed version by several releases.'),
 (9529,9002,'Human-in-the-loop SLA breached','Likely','Moderate',                              ARRAY['Operational risk','Compliance risk'],  'Deployment & integration','Reviews take longer than the SLA the risk assessment assumed.'),
 (9530,9001,'Third-party sub-processor unvetted','Possible','Catastrophic',                    ARRAY['Third-party/vendor risk','Data privacy risk'],'Problem definition & planning','A sub-processor handles production data with no completed assessment.'),
 -- 9531-9533 are deliberately left OUT of every risk_links row below. The
 -- "Scan for related risks" button renders only in the panel's empty state, so
 -- without a link-free risk somewhere in the org that button is unreachable and
 -- Feature 1's tier-0 scan cannot be exercised at all. Their categories and
 -- lifecycle phases overlap existing risks on purpose (category = 3 points,
 -- lifecycle = 2, shared project = 1, threshold = 3), so the scan returns real
 -- ranked suggestions instead of "No related risks found".
 (9531,9005,'Model drift not monitored after release','Possible','Moderate',                   ARRAY['Operational risk'],                    'Monitoring & maintenance','No drift metric is tracked once the model is live, so degradation is found by complaint.'),
 (9532,9005,'Consent text not versioned','Unlikely','Major',                                   ARRAY['Data privacy risk','Legal risk'],      'Data collection & processing','The consent wording shown to each patient cannot be reconstructed after the fact.'),
 (9533,9005,'Red-team coverage gap for jailbreaks','Likely','Major',                            ARRAY['Cybersecurity risk'],                  'Deployment & integration','Adversarial prompting is never tested before a release goes out.')
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
       -- 9502 and 9503 ship as 'Completed' so the evidence-freshness sweep has
       -- something to knock down: 9502's evidence is stale (it drops to
       -- 'Requires review'), 9503's is fresh (it stays 'Completed').
       (CASE WHEN id IN (9502, 9503) THEN 'Completed' ELSE 'In Progress' END)::enum_projectrisks_mitigation_status,
       'Medium risk', NOW() + INTERVAL '60 days',
       'Tracked in the project mitigation plan.',
       'Unlikely'::enum_projectrisks_likelihood_mitigation, 'Minor'::enum_projectrisks_risk_severity,
       'Low risk', 1, 'In Review', NOW() - INTERVAL '20 days', true, false,
       NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'
FROM scored;

INSERT INTO projects_risks (organization_id, risk_id, project_id)
SELECT 1, id, project_id FROM (VALUES
 (9501,9001),(9502,9001),(9503,9001),(9504,9001),(9505,9001),(9506,9001),
 (9507,9002),(9508,9002),(9509,9002),(9510,9002),(9511,9002),(9512,9002),
 (9513,9003),(9514,9003),(9515,9003),(9516,9003),(9517,9003),
 (9518,9004),(9519,9004),(9520,9004),(9521,9004),
 (9522,9005),(9523,9005),(9524,9005),(9525,9005),
 -- deliberately in two projects each: this is what makes the C5 badge read
 -- "Same project: Loan Approval Copilot +1" instead of a single title.
 (9526,9001),(9526,9002),
 (9527,9002),(9527,9001),
 (9528,9003),(9528,9001),
 (9529,9002),
 (9530,9001),(9530,9002),
 (9531,9005),(9532,9005),(9533,9005)
) AS t(id, project_id);

-- Framework 2 (ISO 42001), not 1 (EU AI Act): the risk form's "Applicable
-- frameworks" picker lists only frameworks with is_organizational = true, so a
-- framework-1 link would be stored but render as an empty field.
INSERT INTO frameworks_risks (organization_id, risk_id, framework_id)
SELECT 1, id, 2 FROM risks WHERE id BETWEEN 9500 AND 9599;

-- ------------------------------------------------------------------ risk links
-- source_risk_id is the CHILD, target_* is the PARENT.
INSERT INTO risk_links (id, organization_id, source_risk_id, target_risk_id, target_model_risk_id,
                        target_vendor_risk_id, relation_type, status, source, score, reasons,
                        created_by_user_id, decided_by_user_id, decided_at, last_computed_at,
                        dismiss_reason, dismiss_note, parent_level_changed_at)
VALUES
-- F2: confirmed inheritance, risk -> risk. 9502 is the parent to edit; it sits at
-- score 12 (top of "Medium risk"), so one step up on severity lands in "High risk"
-- and the trigger fires for certain.
 (9601,1,9503,9502,NULL,NULL,'inherits_from','confirmed','user',  0,'[]',                                                          1,1,NOW()-INTERVAL '12 days',NULL,NULL,NULL,NULL),
 (9602,1,9504,9502,NULL,NULL,'inherits_from','confirmed','agent', 0,'[{"signal":"hierarchy","detail":"Both concern the reasons given to a declined applicant."}]',NULL,1,NOW()-INTERVAL '11 days',NOW()-INTERVAL '11 days',NULL,NULL,NULL),
 -- Child is 9506, NOT 9502: the grouping is two levels deep by design
 -- (Servers/services/riskLinks/hierarchy.ts -- "a risk is either a parent, or a
 -- child, or unattached, never both"). 9502 is already the parent of 9503/9504,
 -- so making it 9501's child too would seed a state the app itself rejects.
 (9603,1,9506,9501,NULL,NULL,'inherits_from','confirmed','agent', 0,'[{"signal":"hierarchy","detail":"An unlogged override is one way a discriminatory outcome goes unnoticed."}]',NULL,1,NOW()-INTERVAL '14 days',NOW()-INTERVAL '14 days',NULL,NULL,NULL),
-- F2: already stale on arrival -- the badge is visible without editing anything.
 (9604,1,9508,9507,NULL,NULL,'inherits_from','confirmed','agent', 0,'[{"signal":"hierarchy","detail":"A hallucinated refund promise is a specific case of a hallucinated policy answer."}]',NULL,1,NOW()-INTERVAL '9 days',NOW()-INTERVAL '9 days',NULL,NULL,NOW()-INTERVAL '3 hours'),
-- F2: cross-entity parents. The model-risk one can be triggered from the UI
-- (model risk level is a select); the vendor-risk one cannot, because the vendor
-- risk form hardcodes risk_level -- so it ships pre-flagged.
 (9605,1,9510,NULL,9201,NULL,'inherits_from','confirmed','agent', 0,'[{"signal":"cross_entity_hierarchy","detail":"Handover breaks when the provider swaps the model version."}]',NULL,1,NOW()-INTERVAL '8 days',NOW()-INTERVAL '8 days',NULL,NULL,NULL),
 (9606,1,9512,NULL,NULL,9401,'inherits_from','confirmed','user',  0,'[]',                                                          1,1,NOW()-INTERVAL '7 days',NULL,NULL,NULL,NOW()-INTERVAL '2 days'),
-- F3: a second and third inheritance tree, so the graph has more than one root.
 (9607,1,9520,9518,NULL,NULL,'inherits_from','confirmed','user',  0,'[]',                                                          1,1,NOW()-INTERVAL '6 days',NULL,NULL,NULL,NULL),
 (9608,1,9519,9518,NULL,NULL,'inherits_from','confirmed','agent', 0,'[{"signal":"hierarchy","detail":"Consent gaps feed the same screening decision."}]',NULL,1,NOW()-INTERVAL '6 days',NOW()-INTERVAL '6 days',NULL,NULL,NULL),
 (9609,1,9515,9513,NULL,NULL,'inherits_from','confirmed','agent', 0,'[{"signal":"hierarchy","detail":"Evasion drives the false-positive spike."}]',NULL,1,NOW()-INTERVAL '5 days',NOW()-INTERVAL '5 days',NULL,NULL,NULL),
 (9610,1,9516,9513,NULL,NULL,'inherits_from','confirmed','agent', 0,'[{"signal":"hierarchy","detail":"Alert volume is downstream of the false-positive rate."}]',NULL,1,NOW()-INTERVAL '5 days',NOW()-INTERVAL '5 days',NULL,NULL,NULL),
 -- Parent is 9513, NOT 9515: 9515 is already 9513's child (9609), and the
 -- two-level rule forbids a risk being both.
 (9611,1,9514,9513,NULL,NULL,'inherits_from','confirmed','user',  0,'[]',                                                          1,1,NOW()-INTERVAL '4 days',NULL,NULL,NULL,NULL),
-- F1 (C6): cross-entity suggestions waiting for a decision. Pre-seeded so the
-- tester never has to sit through the LLM grouping run to see this state.
 (9612,1,9511,NULL,9201,NULL,'inherits_from','suggested','agent', 0,'[{"signal":"cross_entity_hierarchy","detail":"Injection resistance is a property of the pinned model version."}]',NULL,NULL,NULL,NOW()-INTERVAL '2 days',NULL,NULL,NULL),
 (9613,1,9509,NULL,9205,NULL,'inherits_from','suggested','agent', 0,'[{"signal":"cross_entity_hierarchy","detail":"Both are the same unredacted-transcript exposure, one in the model, one in the product."}]',NULL,NULL,NULL,NOW()-INTERVAL '2 days',NULL,NULL,NULL),
 (9614,1,9517,NULL,NULL,9403,'inherits_from','suggested','agent', 0,'[{"signal":"cross_entity_hierarchy","detail":"Residency is guaranteed by the vendor, not by the engine."}]',NULL,NULL,NULL,NOW()-INTERVAL '2 days',NULL,NULL,NULL),
 (9615,1,9530,NULL,NULL,9401,'inherits_from','suggested','agent', 0,'[{"signal":"cross_entity_hierarchy","detail":"The unvetted sub-processor arrives through the notice-period gap."}]',NULL,NULL,NULL,NOW()-INTERVAL '1 day',NULL,NULL,NULL),
 (9616,1,9521,NULL,NULL,9406,'inherits_from','suggested','agent', 0,'[{"signal":"cross_entity_hierarchy","detail":"Both sit on the same applicant-tracking vendor."}]',NULL,NULL,NULL,NOW()-INTERVAL '1 day',NULL,NULL,NULL),
 (9617,1,9527,NULL,9204,NULL,'inherits_from','suggested','agent', 0,'[{"signal":"cross_entity_hierarchy","detail":"Truncation is one of the failure modes the playbook is missing."}]',NULL,NULL,NULL,NOW()-INTERVAL '1 day',NULL,NULL,NULL),
-- F3: competing parents. Legal only while they stay suggested -- the single-parent
-- unique index allows exactly one CONFIRMED inherits_from row per child.
 (9618,1,9529,9507,NULL,NULL,'inherits_from','suggested','agent', 0,'[{"signal":"hierarchy","detail":"Reviews exist to catch hallucinated answers."}]',NULL,NULL,NULL,NOW()-INTERVAL '1 day',NULL,NULL,NULL),
 (9619,1,9529,9511,NULL,NULL,'inherits_from','suggested','agent', 0,'[{"signal":"hierarchy","detail":"Review load is driven by injection attempts."}]',NULL,NULL,NULL,NOW()-INTERVAL '1 day',NULL,NULL,NULL),
 (9620,1,9526,9501,NULL,NULL,'inherits_from','confirmed','user',  0,'[]',                                                          1,1,NOW()-INTERVAL '3 days',NULL,NULL,NULL,NULL),
 (9621,1,9526,9513,NULL,NULL,'inherits_from','suggested','agent', 0,'[{"signal":"hierarchy","detail":"Shadow usage also leaks into fraud review workflows."}]',NULL,NULL,NULL,NOW()-INTERVAL '1 day',NULL,NULL,NULL),
-- related_to. The canonical check requires source_risk_id < target_risk_id here.
 (9622,1,9505,9509,NULL,NULL,'related_to','confirmed','derived', 6.400,'[{"signal":"shared_category","weight":3,"detail":"Data privacy risk"},{"signal":"shared_project","weight":1}]',NULL,1,NOW()-INTERVAL '10 days',NOW()-INTERVAL '10 days',NULL,NULL,NULL),
 (9623,1,9506,9525,NULL,NULL,'related_to','confirmed','derived', 3.200,'[{"signal":"same_lifecycle_phase","weight":2,"detail":"Monitoring & maintenance"}]',NULL,1,NOW()-INTERVAL '9 days',NOW()-INTERVAL '9 days',NULL,NULL,NULL),
 (9624,1,9513,9518,NULL,NULL,'related_to','suggested','derived', 5.100,'[{"signal":"shared_category","weight":3,"detail":"Reputational risk"},{"signal":"shared_control","weight":2,"detail":"Fairness monitoring"}]',NULL,NULL,NULL,NOW()-INTERVAL '2 days',NULL,NULL,NULL),
 (9625,1,9509,9530,NULL,NULL,'related_to','suggested','derived', 4.700,'[{"signal":"shared_category","weight":3,"detail":"Data privacy risk"}]',NULL,NULL,NULL,NOW()-INTERVAL '2 days',NULL,NULL,NULL),
 (9626,1,9517,9530,NULL,NULL,'related_to','confirmed','user',    0,'[]',                                                           1,1,NOW()-INTERVAL '3 days',NULL,NULL,NULL,NULL),
 (9627,1,9522,9523,NULL,NULL,'related_to','suggested','derived', 5.900,'[{"signal":"shared_project","weight":1},{"signal":"same_lifecycle_phase","weight":2,"detail":"Deployment & integration"}]',NULL,NULL,NULL,NOW()-INTERVAL '1 day',NULL,NULL,NULL),
 (9628,1,9511,9527,NULL,NULL,'related_to','suggested','derived', 3.800,'[{"signal":"shared_assessment","weight":2,"detail":"Incident readiness review"}]',NULL,NULL,NULL,NOW()-INTERVAL '1 day',NULL,NULL,NULL),
 (9629,1,9514,9528,NULL,NULL,'related_to','suggested','derived', 2.600,'[{"signal":"shared_framework_element","weight":1.26,"detail":"1 EU AI Act control"}]',NULL,NULL,NULL,NOW()-INTERVAL '1 day',NULL,NULL,NULL),
-- F4: dismissed links. Every dismiss reason appears, and five carry a note --
-- the "Recent notes" block only shows rows whose dismiss_note is non-empty.
 (9630,1,9503,9524,NULL,NULL,'related_to','dismissed','derived', 4.200,'[{"signal":"shared_category","weight":3,"detail":"Operational risk"}]',NULL,1,NOW()-INTERVAL '8 days',NOW()-INTERVAL '9 days','not_related',NULL,NULL),
 (9631,1,9504,9521,NULL,NULL,'related_to','dismissed','derived', 3.100,'[{"signal":"shared_category","weight":3,"detail":"Legal risk"},{"signal":"shared_project","weight":1}]',NULL,1,NOW()-INTERVAL '7 days',NOW()-INTERVAL '8 days','too_weak',NULL,NULL),
 (9632,1,9506,9528,NULL,NULL,'related_to','dismissed','derived', 2.900,'[{"signal":"same_lifecycle_phase","weight":2,"detail":"Monitoring & maintenance"}]',NULL,1,NOW()-INTERVAL '6 days',NOW()-INTERVAL '7 days','duplicate',NULL,NULL),
 (9633,1,9512,9516,NULL,NULL,'related_to','dismissed','derived', 2.400,'[{"signal":"shared_control","weight":2,"detail":"Quality sampling"}]',NULL,1,NOW()-INTERVAL '6 days',NOW()-INTERVAL '7 days','not_related',NULL,NULL),
 (9634,1,9510,9520,NULL,NULL,'related_to','dismissed','derived', 2.100,'[{"signal":"shared_assessment","weight":2,"detail":"Human oversight review"}]',NULL,1,NOW()-INTERVAL '5 days',NOW()-INTERVAL '6 days','other','Same oversight questionnaire, but a failed handover and an unexplainable rejection are not the same problem.',NULL),
 (9635,1,9525,9522,NULL,NULL,'inherits_from','dismissed','agent', 0,'[{"signal":"hierarchy","detail":"Audit gaps sit under the missed red flag."}]',NULL,1,NOW()-INTERVAL '5 days',NOW()-INTERVAL '6 days','wrong_direction','Backwards. The missed red flag is the consequence, the audit gap is not its parent.',NULL),
 (9636,1,9528,9501,NULL,NULL,'inherits_from','dismissed','agent', 0,'[{"signal":"hierarchy","detail":"Documentation drift under the fairness finding."}]',NULL,1,NOW()-INTERVAL '4 days',NOW()-INTERVAL '5 days','wrong_parent',NULL,NULL),
 (9637,1,9521,9518,NULL,NULL,'inherits_from','dismissed','agent', 0,'[{"signal":"hierarchy","detail":"Both concern the screening vendor."}]',NULL,1,NOW()-INTERVAL '4 days',NOW()-INTERVAL '5 days','not_hierarchical','Vendor lock-in is a procurement issue. It sits beside the bias finding, not under it.',NULL),
 (9638,1,9524,NULL,9202,NULL,'inherits_from','dismissed','agent', 0,'[{"signal":"cross_entity_hierarchy","detail":"Toxicity thresholds and off-label use share a model."}]',NULL,1,NOW()-INTERVAL '3 days',NOW()-INTERVAL '4 days','not_related',NULL,NULL),
 (9639,1,9516,NULL,NULL,9402,'inherits_from','dismissed','agent', 0,'[{"signal":"cross_entity_hierarchy","detail":"Same vendor as the scoring stack."}]',NULL,1,NOW()-INTERVAL '3 days',NOW()-INTERVAL '4 days','too_weak','Same vendor, yes, but the review queue has nothing to do with a missing SOC 2 report.',NULL),
 (9640,1,9528,NULL,9207,NULL,'inherits_from','dismissed','agent', 0,'[{"signal":"cross_entity_hierarchy","detail":"Both track undocumented model behaviour."}]',NULL,1,NOW()-INTERVAL '2 days',NOW()-INTERVAL '3 days','duplicate',NULL,NULL),
 (9641,1,9505,NULL,9205,NULL,'inherits_from','dismissed','agent', 0,'[{"signal":"cross_entity_hierarchy","detail":"Retention and fine-tune corpus overlap."}]',NULL,1,NOW()-INTERVAL '2 days',NOW()-INTERVAL '3 days','other','Already covered by the retention risk. Adding a parent here would double-count it.',NULL),
 (9642,1,9502,9527,NULL,NULL,'related_to','dismissed','user',     0,'[]',                                                          1,1,NOW()-INTERVAL '2 days',NULL,'wrong_direction',NULL,NULL),
 (9643,1,9507,9530,NULL,NULL,'related_to','confirmed','user',     0,'[]',                                                          1,1,NOW()-INTERVAL '1 day',NULL,NULL,NULL,NULL),
 (9644,1,9515,9529,NULL,NULL,'related_to','dismissed','derived', 1.900,'[{"signal":"shared_framework_element","weight":1.26,"detail":"1 EU AI Act control"}]',NULL,1,NOW()-INTERVAL '1 day',NOW()-INTERVAL '2 days','too_weak',NULL,NULL);

-- ------------------------------------------------- Feature 5: evidence freshness
-- Freshness is OR'd across every evidence mapped to a risk, so each risk id below
-- appears in exactly one row. Mapping 9503 anywhere else destroys the control case.
INSERT INTO evidence_hub (id, organization_id, evidence_name, evidence_type, description,
                          expiry_date, mapped_risk_ids, created_at, updated_at)
VALUES
 -- expired, but edited today: must flag on the expiry branch alone
 (9701,1,'Model card - lending scorecard','Documentation','Expired evidence, recently edited.',
  NOW() - INTERVAL '5 days',   ARRAY[9501], NOW() - INTERVAL '200 days', NOW()),
 -- not expired, untouched 91 days: must flag on the 90-day branch alone
 (9702,1,'Fairness test report Q1','Test result','Stale by age, expiry still far out.',
  NOW() + INTERVAL '200 days', ARRAY[9502], NOW() - INTERVAL '200 days', NOW() - INTERVAL '91 days'),
 -- 89 days: the control. Risk 9503 must stay CLEAN. If it flags, the boundary is off by one.
 (9703,1,'Data lineage attestation','Attestation','Fresh - one day inside the window.',
  NOW() + INTERVAL '200 days', ARRAY[9503], NOW() - INTERVAL '200 days', NOW() - INTERVAL '89 days'),
 -- one stale evidence mapped to two risks: both must flag, two notifications
 (9704,1,'Vendor SOC 2 report','Certification','Stale, shared across two risks.',
  NOW() + INTERVAL '200 days', ARRAY[9504,9505], NOW() - INTERVAL '200 days', NOW() - INTERVAL '120 days');

-- Sequences must clear the seeded block so app-created rows never collide.
SELECT setval('verifywise.projects_id_seq',          GREATEST((SELECT COALESCE(MAX(id),0) FROM projects),          9099));
SELECT setval('verifywise.model_inventories_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM model_inventories), 9199));
SELECT setval('verifywise.model_risks_id_seq',       GREATEST((SELECT COALESCE(MAX(id),0) FROM model_risks),       9299));
SELECT setval('verifywise.vendors_id_seq',           GREATEST((SELECT COALESCE(MAX(id),0) FROM vendors),           9399));
SELECT setval('verifywise.vendorrisks_id_seq',       GREATEST((SELECT COALESCE(MAX(id),0) FROM vendorrisks),       9499));
SELECT setval('verifywise.risks_id_seq',             GREATEST((SELECT COALESCE(MAX(id),0) FROM risks),             9599));
SELECT setval('verifywise.risk_links_id_seq',        GREATEST((SELECT COALESCE(MAX(id),0) FROM risk_links),        9699));
SELECT setval('verifywise.evidence_hub_id_seq',      GREATEST((SELECT COALESCE(MAX(id),0) FROM evidence_hub),      9799));
SELECT setval('verifywise.model_inventories_projects_frameworks_id_seq',
              GREATEST((SELECT COALESCE(MAX(id),0) FROM model_inventories_projects_frameworks), 1));
SELECT setval('verifywise.projects_frameworks_id_seq',
              GREATEST((SELECT COALESCE(MAX(id),0) FROM projects_frameworks), 1));

COMMIT;
