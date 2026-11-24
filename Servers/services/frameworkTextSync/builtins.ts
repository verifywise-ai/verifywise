/**
 * The four built-in frameworks as keyed text sources (./keyed.ts): which of
 * their struct tables hold text, how a row is identified, and the text each
 * row should hold according to the TS structures under Servers/structures.
 *
 * Keys follow how 20260302111132-seed-framework-struct-data.js (and the later
 * built-in migrations) identified each row, so a freshly migrated database
 * needs no change:
 * - EU AI Act: order_no at every level, within its parent.
 * - ISO 42001: clause_no; subclause code ("6.2", stored as subclause_id);
 *   annex_no; annex category by annex and order_no.
 * - ISO 27001: clause code; subclause by title within its clause (clause 6
 *   has no stable index: three items share index 1); annex group and
 *   category by annex number; annex control by annex and order_no. The
 *   control key also corrects the 24 Annex A controls that installs created
 *   after 20260420113913 hold under the wrong title.
 * - NIST AI RMF: function and category number; subcategory by its category
 *   and order_no (subcategory_id was DECIMAL(4,1) until 20261123170316, which
 *   could not tell 2.1 from 2.10).
 *
 * Only text is synced. Demo answers and implementation text in the TS files,
 * EU roles and risk tiers, applicability, status and every per-organization
 * table are never touched.
 *
 * Each source has a textRevision, like the bundled frameworks: bump it with
 * any text change here or in the TS it reads, then run
 * npm run framework-text:record.
 */
import { Topics } from "../../structures/EU-AI-Act/assessment-tracker/topics.struct";
import { ControlCategories } from "../../structures/EU-AI-Act/compliance-tracker/controlCategories.struct";
import { Clauses } from "../../structures/ISO-42001/clauses/clauses.struct";
import { Annex } from "../../structures/ISO-42001/annex/annex.struct";
import { ISO27001Clause } from "../../structures/ISO-27001/clauses/iso27001.clause.struct";
import { ISO27001Annex } from "../../structures/ISO-27001/annexes/iso27001.annex.struct";
import { NIST_AI_RMF_Structure } from "../../structures/NIST-AI-RMF/nist-ai-rmf.structure";
import type { KeyedTarget, TextValue } from "./keyed";

export interface BuiltinTextSource {
  id: number;
  key: string;
  textRevision: number;
  /** The `frameworks` row description. Names are never synced: code looks frameworks up by name. */
  description: string;
  /** Struct tables that must exist before this source can sync. */
  tables: string[];
  targets: () => KeyedTarget[];
}

type Entries = Array<[string, Record<string, TextValue>]>;
// Two TS items with one key would silently give both rows one item's text,
// so a repeated key is a programming error, caught by the unit tests.
const target = (t: Omit<KeyedTarget, "expected"> & { entries: Entries }): KeyedTarget => {
  const expected = new Map(t.entries);
  if (expected.size !== t.entries.length) {
    const seen = new Set<string>();
    const repeated = t.entries.find(([key]) => seen.has(key) || !seen.add(key));
    throw new Error(`${t.label}: the key "${repeated?.[0]}" is used by more than one item`);
  }
  return {
    label: t.label,
    table: t.table,
    select: t.select,
    columns: t.columns,
    guardMovesOn: t.guardMovesOn,
    reportTitleChanges: t.reportTitleChanges,
    expected,
  };
};

/** The `frameworks` row of any framework, keyed by its id. */
export function descriptionTarget(frameworkId: number, description: string | null): KeyedTarget {
  return target({
    label: "framework description",
    table: "frameworks",
    select: `SELECT id, id::text AS key, description FROM frameworks WHERE id = :frameworkId`,
    columns: { description: "text" },
    entries: [[String(frameworkId), { description }]],
  });
}

// ---------------------------------------------------------------- EU AI Act

function euTargets(): KeyedTarget[] {
  const topics: Entries = [];
  const subtopics: Entries = [];
  const questions: Entries = [];
  for (const t of Topics) {
    topics.push([`${t.order_no}`, { title: t.title }]);
    for (const s of t.subtopics ?? []) {
      subtopics.push([`${t.order_no}/${s.order_no}`, { title: s.title }]);
      for (const q of s.questions ?? []) {
        questions.push([
          `${t.order_no}/${s.order_no}/${q.order_no}`,
          { question: q.question, hint: q.hint ?? null },
        ]);
      }
    }
  }

  const categories: Entries = [];
  const controls: Entries = [];
  const subcontrols: Entries = [];
  for (const c of ControlCategories) {
    const categoryArticle = c.article ?? null;
    categories.push([`${c.order_no}`, { title: c.title, article: categoryArticle }]);
    for (const ctl of c.controls ?? []) {
      // The article falls back from subcontrol to control to category, as
      // 20260417150653-reseed-eu-act-struct-with-metadata.js stored it.
      const controlArticle = ctl.article ?? categoryArticle;
      controls.push([
        `${c.order_no}/${ctl.order_no}`,
        { title: ctl.title, description: ctl.description ?? null, article: controlArticle },
      ]);
      for (const sc of ctl.subControls ?? []) {
        subcontrols.push([
          `${c.order_no}/${ctl.order_no}/${sc.order_no}`,
          {
            title: sc.title,
            description: sc.description ?? null,
            article: sc.article ?? controlArticle,
          },
        ]);
      }
    }
  }

  return [
    target({
      label: "EU AI Act topics",
      table: "topics_struct_eu",
      select: `SELECT id, order_no::text AS key, title FROM topics_struct_eu WHERE framework_id = :frameworkId`,
      columns: { title: "text" },
      guardMovesOn: "title",
      entries: topics,
    }),
    target({
      label: "EU AI Act subtopics",
      table: "subtopics_struct_eu",
      select: `SELECT s.id, t.order_no || '/' || s.order_no AS key, s.title
                 FROM subtopics_struct_eu s JOIN topics_struct_eu t ON t.id = s.topic_id
                WHERE t.framework_id = :frameworkId`,
      columns: { title: "text" },
      guardMovesOn: "title",
      entries: subtopics,
    }),
    target({
      label: "EU AI Act questions",
      table: "questions_struct_eu",
      select: `SELECT q.id, t.order_no || '/' || s.order_no || '/' || q.order_no AS key, q.question, q.hint
                 FROM questions_struct_eu q
                 JOIN subtopics_struct_eu s ON s.id = q.subtopic_id
                 JOIN topics_struct_eu t ON t.id = s.topic_id
                WHERE t.framework_id = :frameworkId`,
      columns: { question: "text", hint: "text" },
      guardMovesOn: "question",
      entries: questions,
    }),
    target({
      label: "EU AI Act control categories",
      table: "controlcategories_struct_eu",
      select: `SELECT id, order_no::text AS key, title, article
                 FROM controlcategories_struct_eu WHERE framework_id = :frameworkId`,
      columns: { title: "text", article: "text" },
      guardMovesOn: "title",
      entries: categories,
    }),
    target({
      label: "EU AI Act controls",
      table: "controls_struct_eu",
      select: `SELECT ctl.id, c.order_no || '/' || ctl.order_no AS key, ctl.title, ctl.description, ctl.article
                 FROM controls_struct_eu ctl JOIN controlcategories_struct_eu c ON c.id = ctl.control_category_id
                WHERE c.framework_id = :frameworkId`,
      columns: { title: "text", description: "text", article: "text" },
      guardMovesOn: "title",
      entries: controls,
    }),
    target({
      label: "EU AI Act subcontrols",
      table: "subcontrols_struct_eu",
      select: `SELECT sc.id, c.order_no || '/' || ctl.order_no || '/' || sc.order_no AS key,
                      sc.title, sc.description, sc.article
                 FROM subcontrols_struct_eu sc
                 JOIN controls_struct_eu ctl ON ctl.id = sc.control_id
                 JOIN controlcategories_struct_eu c ON c.id = ctl.control_category_id
                WHERE c.framework_id = :frameworkId`,
      columns: { title: "text", description: "text", article: "text" },
      guardMovesOn: "title",
      entries: subcontrols,
    }),
  ];
}

// ---------------------------------------------------------------- ISO 42001

function iso42001Targets(): KeyedTarget[] {
  const clauses: Entries = [];
  const subclauses: Entries = [];
  for (const c of Clauses) {
    clauses.push([`${c.clause_no}`, { title: c.title }]);
    for (const s of c.subclauses ?? []) {
      subclauses.push([
        `${c.clause_no}.${s.order_no}`,
        {
          title: s.title ?? null,
          summary: s.summary ?? null,
          questions: s.questions ?? [],
          evidence_examples: s.evidence_examples ?? [],
        },
      ]);
    }
  }
  const annexes: Entries = [];
  const categories: Entries = [];
  for (const a of Annex) {
    annexes.push([`${a.annex_no}`, { title: a.title || `Annex ${a.annex_no}` }]);
    for (const cat of a.annexcategories ?? []) {
      categories.push([
        `${a.annex_no}/${cat.order_no}`,
        {
          title: cat.title ?? null,
          description: cat.description ?? null,
          guidance: cat.guidance ?? null,
        },
      ]);
    }
  }

  return [
    target({
      label: "ISO 42001 clauses",
      table: "clauses_struct_iso",
      select: `SELECT id, clause_no::text AS key, title FROM clauses_struct_iso WHERE framework_id = :frameworkId`,
      columns: { title: "text" },
      entries: clauses,
    }),
    target({
      label: "ISO 42001 subclauses",
      table: "subclauses_struct_iso",
      select: `SELECT s.id, s.subclause_id AS key, s.title, s.summary, s.questions, s.evidence_examples
                 FROM subclauses_struct_iso s JOIN clauses_struct_iso c ON c.id = s.clause_id
                WHERE c.framework_id = :frameworkId`,
      columns: { title: "text", summary: "text", questions: "array", evidence_examples: "array" },
      entries: subclauses,
    }),
    target({
      label: "ISO 42001 annexes",
      table: "annex_struct_iso",
      select: `SELECT id, annex_no::text AS key, title FROM annex_struct_iso WHERE framework_id = :frameworkId`,
      columns: { title: "text" },
      entries: annexes,
    }),
    target({
      label: "ISO 42001 annex categories",
      table: "annexcategories_struct_iso",
      select: `SELECT cat.id, a.annex_no || '/' || cat.order_no AS key, cat.title, cat.description, cat.guidance
                 FROM annexcategories_struct_iso cat JOIN annex_struct_iso a ON a.id = cat.annex_id
                WHERE a.framework_id = :frameworkId`,
      columns: { title: "text", description: "text", guidance: "text" },
      guardMovesOn: "title",
      entries: categories,
    }),
  ];
}

// ---------------------------------------------------------------- ISO 27001

function iso27001Targets(): KeyedTarget[] {
  const clauses: Entries = [];
  const subclauses: Entries = [];
  for (const c of ISO27001Clause) {
    clauses.push([`${c.arrangement}`, { title: c.title }]);
    for (const s of c.subclauses ?? []) {
      // Keyed by title: the title itself is not rewritten.
      subclauses.push([
        `${c.arrangement}/${s.title}`,
        {
          requirement_summary: s.requirement_summary ?? null,
          key_questions: s.key_questions ?? [],
          evidence_examples: s.evidence_examples ?? [],
        },
      ]);
    }
  }
  const groups: Entries = [];
  const categories: Entries = [];
  const controls: Entries = [];
  for (const a of ISO27001Annex) {
    groups.push([`${a.index}`, { title: a.category_name }]);
    categories.push([`A.${a.index}`, { title: a.category_name }]);
    for (const ctl of a.controls ?? []) {
      controls.push([
        `A.${a.index}/${ctl.index}`,
        {
          title: ctl.title,
          requirement_summary: ctl.requirement_summary ?? null,
          key_questions: ctl.key_questions ?? [],
          evidence_examples: ctl.evidence_examples ?? [],
        },
      ]);
    }
  }

  return [
    target({
      label: "ISO 27001 clauses",
      table: "clauses_struct_iso27001",
      select: `SELECT id, clause_id AS key, title FROM clauses_struct_iso27001 WHERE framework_id = :frameworkId`,
      columns: { title: "text" },
      entries: clauses,
    }),
    target({
      label: "ISO 27001 subclauses",
      table: "subclauses_struct_iso27001",
      select: `SELECT s.id, c.clause_id || '/' || s.title AS key,
                      s.requirement_summary, s.key_questions, s.evidence_examples
                 FROM subclauses_struct_iso27001 s JOIN clauses_struct_iso27001 c ON c.id = s.clause_id
                WHERE c.framework_id = :frameworkId`,
      columns: { requirement_summary: "text", key_questions: "array", evidence_examples: "array" },
      entries: subclauses,
    }),
    target({
      label: "ISO 27001 annex groups",
      table: "annex_struct_iso27001",
      select: `SELECT id, order_no::text AS key, title FROM annex_struct_iso27001 WHERE framework_id = :frameworkId`,
      columns: { title: "text" },
      entries: groups,
    }),
    target({
      label: "ISO 27001 annex categories",
      table: "annexcategories_struct_iso27001",
      select: `SELECT id, annex_id AS key, title FROM annexcategories_struct_iso27001 WHERE framework_id = :frameworkId`,
      columns: { title: "text" },
      entries: categories,
    }),
    // No moved-title guard: realigning titles to their control numbers is the
    // fix for installs created after 20260420113913.
    target({
      label: "ISO 27001 annex controls",
      reportTitleChanges: true,
      table: "annexcontrols_struct_iso27001",
      select: `SELECT ac.id, cat.annex_id || '/' || ac.order_no AS key,
                      ac.title, ac.requirement_summary, ac.key_questions, ac.evidence_examples
                 FROM annexcontrols_struct_iso27001 ac
                 JOIN annexcategories_struct_iso27001 cat ON cat.id = ac.category_id
                WHERE cat.framework_id = :frameworkId`,
      columns: {
        title: "text",
        requirement_summary: "text",
        key_questions: "array",
        evidence_examples: "array",
      },
      entries: controls,
    }),
  ];
}

// -------------------------------------------------------------- NIST AI RMF

function nistTargets(): KeyedTarget[] {
  const categories: Entries = [];
  const subcategories: Entries = [];
  for (const f of NIST_AI_RMF_Structure.functions) {
    for (const c of f.categories ?? []) {
      categories.push([`${f.type}/${c.index}`, { description: c.description ?? null }]);
      for (const s of c.subcategories ?? []) {
        subcategories.push([
          `${f.type}/${c.index}/${s.index}`,
          { description: s.description ?? null },
        ]);
      }
    }
  }
  return [
    target({
      label: "NIST AI RMF categories",
      table: "nist_ai_rmf_categories_struct",
      select: `SELECT id, function || '/' || category_id AS key, description
                 FROM nist_ai_rmf_categories_struct WHERE framework_id = :frameworkId`,
      columns: { description: "text" },
      entries: categories,
    }),
    target({
      label: "NIST AI RMF subcategories",
      table: "nist_ai_rmf_subcategories_struct",
      select: `SELECT s.id, c.function || '/' || c.category_id || '/' || s.order_no AS key, s.description
                 FROM nist_ai_rmf_subcategories_struct s
                 JOIN nist_ai_rmf_categories_struct c ON c.id = s.category_struct_id
                WHERE c.framework_id = :frameworkId`,
      columns: { description: "text" },
      entries: subcategories,
    }),
  ];
}

export const BUILTIN_TEXT_SOURCES: BuiltinTextSource[] = [
  {
    id: 1,
    key: "eu-ai-act",
    textRevision: 1,
    description: "European Union Artificial Intelligence Act",
    tables: [
      "topics_struct_eu",
      "subtopics_struct_eu",
      "questions_struct_eu",
      "controlcategories_struct_eu",
      "controls_struct_eu",
      "subcontrols_struct_eu",
    ],
    targets: euTargets,
  },
  {
    id: 2,
    key: "iso-42001",
    textRevision: 1,
    description: "AI Management System Standard",
    tables: [
      "clauses_struct_iso",
      "subclauses_struct_iso",
      "annex_struct_iso",
      "annexcategories_struct_iso",
    ],
    targets: iso42001Targets,
  },
  {
    id: 3,
    key: "iso-27001",
    textRevision: 1,
    description: "Information Security Management",
    tables: [
      "clauses_struct_iso27001",
      "subclauses_struct_iso27001",
      "annex_struct_iso27001",
      "annexcategories_struct_iso27001",
      "annexcontrols_struct_iso27001",
    ],
    targets: iso27001Targets,
  },
  {
    id: 4,
    key: "nist-ai-rmf",
    textRevision: 1,
    description: "NIST AI Risk Management Framework",
    tables: ["nist_ai_rmf_categories_struct", "nist_ai_rmf_subcategories_struct"],
    targets: nistTargets,
  },
];
