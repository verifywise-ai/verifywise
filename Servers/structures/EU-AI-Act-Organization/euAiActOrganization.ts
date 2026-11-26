/**
 * EU AI Act (organization), framework 29: the EU AI Act obligations that fall
 * on the organization rather than on one AI system. It is not a separate
 * structure: it holds these EU AI Act controls and assessment questions, kept
 * in the EU AI Act's own tables (controls_struct_eu / questions_struct_eu
 * moved_to_framework_id = 29) and shown with the EU AI Act's own screens and
 * numbers, once on the organizational project instead of on each use case.
 */

/** Added to the organizational project automatically, never by hand. */
export const EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID = 29;

/**
 * EU AI Act controls that are organization-wide obligations, keyed by category
 * order_no, then control order_no, as in
 * EU-AI-Act/compliance-tracker/controlCategories.struct.ts.
 */
export const EU_AI_ACT_ORGANIZATION_CONTROLS: Record<number, number[]> = {
  0: [1, 2, 3, 4, 5, 6, 7, 8], // Prohibited AI practices (Art. 5)
  1: [1, 2], // AI literacy (Art. 4)
  6: [1, 2], // AI Act compliance policies and guidelines; AI risk response planning
  7: [1], // Fundamental rights impact assessment process development
  10: [2], // Process to respond to national authority requests
  15: [1, 2, 3], // Quality management system (Art. 17)
  17: [1], // Authorized representative in the Union
};

/**
 * EU AI Act assessment questions about the organization as a whole, keyed by
 * topic order_no, then subtopic order_no, then question order_no, as in
 * EU-AI-Act/assessment-tracker.
 */
export const EU_AI_ACT_ORGANIZATION_QUESTIONS: Record<number, Record<number, number[]>> = {
  5: { 1: [2] }, // How the organization communicates its AI values externally
  8: { 1: [1, 2, 3] }, // AI values, AI governance framework, self-assessment schedule
  11: { 1: [1] }, // Who ensures AI systems adhere to the organization's values
};
