/**
 * Helpers the profile, run and stance services share.
 *
 * I/O layer only through assertProject, which reads the project through
 * utils/biasAudit.utils; the other two are pure.
 */
import { NotFoundException } from "../../domain.layer/exceptions/custom.exception";
import { getProjectQuery } from "../../utils/biasAudit.utils";
import type { AedtProfileAnswer } from "../../domain.layer/models/biasAudit/aedtProfileAnswer.model";
import type { AnswerMap, AnswerWithNotes } from "./applicability";
import { assertProjectAccess, type Viewer } from "./projectAccess";

type AnswerRow = Pick<
  AedtProfileAnswer,
  "question_key" | "answer_value" | "answer_notes" | "is_dont_know"
>;

/**
 * Stored answer rows keyed by question. The profile and the stance quote the
 * customer's notes, so they ask for "with_notes"; a run reads values only and
 * asks for "without_notes", so no notes enter what the run computes from.
 */
export function answerMapFromRows(rows: AnswerRow[], notes: "with_notes"): AnswerWithNotes;
export function answerMapFromRows(rows: AnswerRow[], notes: "without_notes"): AnswerMap;
export function answerMapFromRows(
  rows: AnswerRow[],
  notes: "with_notes" | "without_notes",
): AnswerWithNotes | AnswerMap {
  const out: AnswerWithNotes | AnswerMap = {};
  for (const r of rows) {
    const value = r.answer_value ?? null;
    const dontKnow = Boolean(r.is_dont_know);
    out[r.question_key] =
      notes === "with_notes"
        ? { value, notes: r.answer_notes ?? null, dontKnow }
        : { value, dontKnow };
  }
  return out;
}

/** A concurrent write that took the same version number loses to a unique index. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { name?: string; original?: { code?: string } } | null | undefined;
  return e?.original?.code === "23505" || e?.name === "SequelizeUniqueConstraintError";
}

/**
 * The project, after the project-member rule (projectAccess.ts) lets the
 * viewer in. A project missing from the organization is a not-found.
 */
export async function assertProject(projectId: number, organizationId: number, viewer: Viewer) {
  await assertProjectAccess(projectId, organizationId, viewer);
  const project = await getProjectQuery(projectId, organizationId);
  if (!project) {
    throw new NotFoundException(`Project ${projectId} was not found`, "Project", projectId);
  }
  return project;
}
