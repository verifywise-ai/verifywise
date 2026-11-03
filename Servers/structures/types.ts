/**
 * Runtime + migration registry for the 21 migrated frameworks (SOC2, GDPR,
 * HIPAA, ...). Each framework lives in its own folder under this directory
 * and exports a FrameworkStructure describing table names, columns, entity
 * types, and the seed structure the initial migration inserts.
 *
 * Built-in frameworks (EU AI Act, ISO 42001, ISO 27001, NIST AI RMF) are
 * not registered here — they have their own hand-written struct files under
 * Servers/structures/{Framework}/ that predate this registry.
 */

export interface StructTables {
  l1_struct: string;
  l2_struct: string;
  l3_struct?: string;
  l2_impl: string;
  l3_impl?: string;
  l2_risks: string;
  l3_risks?: string;
}

export interface StructCols {
  l2_struct_parent: string;
  l3_struct_parent?: string;
  l2_impl_meta: string;
  l3_impl_meta?: string;
  l3_impl_parent?: string;
  l2_risks_impl: string;
  l3_risks_impl?: string;
}

export interface StructEntityTypes {
  l2_impl: string;
  l3_impl?: string;
}

export interface SeedLevel3 {
  title: string;
  description?: string | null;
  summary?: string | null;
  questions?: string[];
  evidence_examples?: string[];
  order_no?: number;
}

export interface SeedLevel2 extends SeedLevel3 {
  items?: SeedLevel3[];
}

export interface SeedLevel1 {
  title: string;
  description?: string | null;
  order_no?: number;
  items?: SeedLevel2[];
}

export interface FrameworkSeed {
  name: string;
  description?: string;
  version?: string;
  is_organizational?: boolean;
  hierarchy: {
    type: "two_level" | "three_level";
    /** Documentation-only labels (level1_name, level2_name, level3_name). */
    level1_name?: string;
    level2_name?: string;
    level3_name?: string;
  };
  structure: SeedLevel1[];
}

import type { FileSource } from "../domain.layer/models/file/file.model";

export interface FrameworkStructure {
  /** Numeric framework id used by projects_frameworks / dispatch maps. */
  id: number;
  /** Kebab-case key (soc2, pci-dss, nyc-local-law-144, ...). Used for
   *  file-entity-links keys and folder naming.
   */
  key: string;
  /** Value stored in file_entity_links.framework_type. Snake_case. */
  framework_type: string;
  /** Human-readable display name (falls back to seed.name if omitted). */
  displayName?: string;
  tables: StructTables;
  cols: StructCols;
  entity_types: StructEntityTypes;
  /** Label written into `files.source` (and derived by
   *  FILE_GROUP_LABEL_CASE_SQL for file_entity_links) per entity_type.
   *  Keys must cover every value in `entity_types` — the file-upload
   *  path and the SQL CASE both look up by entity_type. Values must be
   *  present in the FileSource union in file.model.ts. */
  source_labels: Record<string, FileSource>;
  seed: FrameworkSeed;
}
