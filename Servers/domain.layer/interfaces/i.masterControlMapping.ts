/**
 * Master Control Framework Mapping — junction row that binds a master_control
 * to a concrete row in a framework struct/implementation table.
 *
 * framework is the slug of the originating framework. framework_entity_type
 * discriminates which struct table the framework_entity_id belongs to.
 * The allowed tuples are enumerated below and enforced by the domain model.
 */

export type Framework =
  | "eu_ai_act"
  | "iso_42001"
  | "iso_27001"
  | "nist_ai_rmf";

/**
 * Supported framework entity types. Each pairs with a specific framework.
 * See `services/masterControlPropagation.service.ts` for the concrete
 * tenant-implementation table that gets propagated.
 */
export type FrameworkEntityType =
  | "control_eu"
  | "subcontrol_eu"
  | "subclause_struct_iso"
  | "annex_category_iso"
  | "subcategory_nist"
  | "iso27001_subclause"
  | "iso27001_annex_category";

export interface IMasterControlFrameworkMapping {
  id?: number;
  master_control_id: number;
  framework: Framework;
  framework_entity_type: FrameworkEntityType;
  framework_entity_id: number;
  created_at?: Date;
}

/**
 * Static lookup: which entity types are valid for each framework.
 * Used by the mapping model's validator and by the seed loader.
 */
export const FRAMEWORK_ENTITY_TYPES: Record<Framework, readonly FrameworkEntityType[]> = {
  eu_ai_act: ["control_eu", "subcontrol_eu"],
  iso_42001: ["subclause_struct_iso", "annex_category_iso"],
  iso_27001: ["iso27001_subclause", "iso27001_annex_category"],
  nist_ai_rmf: ["subcategory_nist"],
};
