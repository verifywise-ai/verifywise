/**
 * @fileoverview Merges per-target framework sections into one payload.
 *
 * A report covers a set of projects_frameworks pairings (see reportScope.ts).
 * The framework sections are collected once per pairing and merged here, since
 * the renderers take exactly one payload per section key.
 *
 * Rows carry a `useCase` label as soon as more than one pairing contributes:
 * every EU AI Act project has a control C1 and every ISO project has a clause
 * 4, so an unlabelled merged table cannot be read. A single-pairing report —
 * which is every project-scoped report with one framework — is returned
 * untouched and renders exactly as it did before.
 *
 * @module services/reporting/mergeSections
 */

import {
  AssessmentSectionData,
  ClausesAndAnnexesSectionData,
  ComplianceSectionData,
  NistSubcategoriesSectionData,
} from "../../domain.layer/interfaces/i.reportGeneration";

/** One pairing's contribution to a section. */
export interface SectionContribution<T> {
  /** projects.project_title of the pairing this came from. */
  useCase: string;
  /** frameworks.name, used to disambiguate two frameworks of one project. */
  framework?: string;
  data: T;
}

/**
 * The label a merged row carries. Two ISO frameworks can sit on one project and
 * both render into clausesAndAnnexes, so the use case alone is not unique —
 * qualify with the framework name whenever the contributions disagree on it.
 */
function labelsFor<T>(items: SectionContribution<T>[]): string[] {
  const frameworks = new Set(items.map((i) => i.framework).filter(Boolean));
  const qualify = frameworks.size > 1;
  return items.map((i) => (qualify && i.framework ? `${i.useCase} — ${i.framework}` : i.useCase));
}

/** Tags every row with its label, leaving the rows otherwise untouched. */
function tag<R>(rows: R[], label: string): R[] {
  return rows.map((row) => ({ ...row, useCase: label }));
}

export function mergeCompliance(
  items: SectionContribution<ComplianceSectionData>[],
): ComplianceSectionData | undefined {
  if (items.length === 0) return undefined;
  if (items.length === 1) return items[0].data;

  const labels = labelsFor(items);
  const totalControls = items.reduce((sum, i) => sum + (i.data.totalControls ?? 0), 0);
  const completedControls = items.reduce((sum, i) => sum + (i.data.completedControls ?? 0), 0);

  return {
    // Re-derived rather than averaged: averaging per-project percentages gives
    // a four-control project the same weight as a forty-control one.
    overallProgress: totalControls > 0 ? Math.round((completedControls / totalControls) * 100) : 0,
    totalControls,
    completedControls,
    controls: items.flatMap((item, i) => tag(item.data.controls ?? [], labels[i])),
  };
}

export function mergeAssessment(
  items: SectionContribution<AssessmentSectionData>[],
): AssessmentSectionData | undefined {
  if (items.length === 0) return undefined;
  if (items.length === 1) return items[0].data;

  const labels = labelsFor(items);
  return {
    totalQuestions: items.reduce((sum, i) => sum + (i.data.totalQuestions ?? 0), 0),
    answeredQuestions: items.reduce((sum, i) => sum + (i.data.answeredQuestions ?? 0), 0),
    topics: items.flatMap((item, i) => tag(item.data.topics ?? [], labels[i])),
  };
}

export function mergeClausesAndAnnexes(
  items: SectionContribution<ClausesAndAnnexesSectionData>[],
): ClausesAndAnnexesSectionData | undefined {
  if (items.length === 0) return undefined;
  if (items.length === 1) return items[0].data;

  const labels = labelsFor(items);
  return {
    clauses: items.flatMap((item, i) => tag(item.data.clauses ?? [], labels[i])),
    annexes: items.flatMap((item, i) => tag(item.data.annexes ?? [], labels[i])),
  };
}

export function mergeNistSubcategories(
  items: SectionContribution<NistSubcategoriesSectionData>[],
): NistSubcategoriesSectionData | undefined {
  if (items.length === 0) return undefined;
  if (items.length === 1) return items[0].data;

  const labels = labelsFor(items);
  // Govern/Map/Measure/Manage are the framework's own fixed top level, not a
  // per-project one — concatenating would print "Govern" once per project.
  const byName = new Map<string, { name: string; categories: any[] }>();
  items.forEach((item, i) => {
    (item.data.functions ?? []).forEach((fn) => {
      const existing = byName.get(fn.name) ?? { name: fn.name, categories: [] };
      existing.categories.push(...tag(fn.categories ?? [], labels[i]));
      byName.set(fn.name, existing);
    });
  });

  return { functions: Array.from(byName.values()) };
}
