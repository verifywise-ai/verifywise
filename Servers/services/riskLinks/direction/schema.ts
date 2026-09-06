import { z } from "zod";

/**
 * One proposed grouping: a parent risk and the risks that sit under it.
 *
 * `.strict()` is deliberate. An extra key means the model invented a field, and
 * `generateObjectWithSelfCorrection` feeds that back as a Zod issue so the next
 * attempt drops it. Letting it through silently would hide the drift.
 */
export const hierarchyGroupSchema = z
  .object({
    parent_risk_id: z.number().int(),
    /**
     * Which table `parent_risk_id` points at. Required, with no default:
     * `risks.id = 7`, `model_risks.id = 7` and `vendorrisks.id = 7` all exist,
     * so a default would silently write the link to the wrong table. A missing
     * field becomes a Zod issue instead, which the self-correction loop feeds
     * back for a second attempt.
     */
    parent_entity_type: z.enum(["risk", "model_risk", "vendor_risk"]),
    child_risk_ids: z.array(z.number().int()).min(1).max(12),
    reason: z.string().min(15).max(120),
  })
  .strict();

export type HierarchyGroup = z.infer<typeof hierarchyGroupSchema>;

/**
 * The whole answer for one component. An empty `groups` array is valid and
 * expected: a cluster of genuinely peer-level risks has no hierarchy in it, and
 * a model that must invent one will.
 *
 * The `max(6)` and `max(12)` bounds are hallucination guards, not calibrated
 * expectations. Against the 25-risk component cap they cannot both bind at
 * once; nobody should tune them thinking they encode a measured distribution.
 */
export const hierarchyOutputSchema = z
  .object({
    groups: z.array(hierarchyGroupSchema).max(6),
  })
  .strict();
