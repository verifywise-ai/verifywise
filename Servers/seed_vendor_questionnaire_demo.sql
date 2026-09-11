-- Demo data for roadmap item 6 (vendor questionnaire -> vendor risk suggestions),
-- org 1 / user 1. Idempotent: fixed id ranges, deleted and re-inserted on every run.
--
-- RUN ORDER: seed_risk_links_demo.sql MUST run first. That seed's clean slate
-- wipes the whole 9300-9399 vendor range and the whole 9400-9499 vendor-risk
-- range, which includes the rows below. This file's own clean slate is narrow
-- (9310-9319 / 9410-9419) so it never touches the Features 1-5 demo data.
SET search_path TO verifywise, public;
BEGIN;

-- ---------------------------------------------------------------- clean slate
-- Vendor risks first, then the junction, then the vendors. The FK is
-- vendorrisks.vendor_id -> vendors(id) ON DELETE CASCADE, but deleting
-- explicitly mirrors the base seed.
DELETE FROM vendorrisks      WHERE id BETWEEN 9410 AND 9419;
DELETE FROM vendors_projects WHERE vendor_id BETWEEN 9310 AND 9319;
DELETE FROM vendors          WHERE id BETWEEN 9310 AND 9319;

-- --------------------------------------------------------------------- vendors
-- 9310 is deliberately unassessed: all four questionnaire columns NULL, so the
-- report answers questionnaire_complete = false with no suggestions -- which is
-- not the same as 9311's completed "no exposure" answer.
INSERT INTO vendors (id, organization_id, order_no, vendor_name, vendor_provides, assignee,
                     website, vendor_contact_person, data_sensitivity, business_criticality,
                     past_issues, regulatory_exposure, is_demo)
VALUES
 (9310,1,4,'Demo Vendor - Unassessed',  'Onboarding not yet started', 1,'https://example.com/unassessed', 'Una Assigned', NULL,                                           NULL,                                            NULL,                                             NULL,        true),
 (9311,1,5,'Demo Vendor - No Exposure', 'Non-core scheduling tool',   1,'https://example.com/no-exposure','Noa Exposure', 'None',                                         'Low (vendor supports non-core functions)',      'None',                                           'None',      true),
 (9312,1,6,'Demo Vendor - Max Exposure','Health records processing',  1,'https://example.com/max-exposure','Max Exposure','Health data (e.g. HIPAA)',                    'High (critical to core services or products)',  'Major incident (e.g. data breach, legal issue)', 'HIPAA (US)', true);

-- ----------------------------------------------------------------- vendor risks
-- One risk against 9312 whose wording paraphrases archetype A's suggestion
-- (Jaccard 6/11 = 0.545 >= 0.25), so data_sensitivity is suppressed and 9312
-- returns 3 suggestions with 9410 named under `suppressed`. The text is a
-- paraphrase on purpose: an identical string would score 1.00 and prove
-- nothing about the tokeniser.
INSERT INTO vendorrisks (id, organization_id, vendor_id, order_no, risk_description, impact_description,
                         likelihood, risk_severity, action_plan, action_owner, risk_level, is_deleted, is_demo)
VALUES
 (9410,1,9312,1,'Health data processed by this vendor lacks documented safeguards','Health data could be exposed or transferred without the required safeguards.','Possible','Catastrophic','Request the vendor''s documented safeguards and attach the evidence.',1,'High Risk',false,true);

-- Sequences must clear the seeded block. The floor is the END of the reserved
-- range, not MAX(id): otherwise the next app-created row lands inside the
-- DELETE range above, and the next seed run cascades a real tenant's risks away.
SELECT setval('verifywise.vendors_id_seq',     GREATEST((SELECT COALESCE(MAX(id),0) FROM vendors),     9399));
SELECT setval('verifywise.vendorrisks_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM vendorrisks), 9499));

COMMIT;
