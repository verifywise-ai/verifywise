/**
 * Profiles are append-only once attested.
 *
 * A run records the profile version it ran against, so editing an attested
 * profile in place would silently change what an existing run describes.
 * Changing an answer creates version N+1 with the prior answers carried
 * forward, and the old version stays readable beside the runs that cite it.
 */
import { sequelize } from "../../database/db";
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";
import {
  attestProfileQuery,
  createProfileVersionQuery,
  getAttestedProfileQuery,
  getCurrentProfileQuery,
  getProfileAnswersQuery,
  listProfileStancesQuery,
  upsertAnswerQuery,
  type ProfileStanceRow,
} from "../../utils/biasAudit.utils";
import {
  LL144_QUESTION_SET_VERSION,
  LL144_QUESTIONS,
  VETO_KEYS,
} from "../../structures/NYC-Local-Law-144/intake.questions";
import { assertProjectAccess, type Viewer } from "./projectAccess";
import { answerMapFromRows, assertProject, isUniqueViolation } from "./serviceHelpers";
import { applicableQuestions, type AnswerWithNotes } from "./applicability";
import { computeReadiness, type ReadinessResult } from "./readinessScore";
import { decideProfile, type ProfileDecision } from "./profileDecision";
import type { IntakeQuestion } from "../../structures/NYC-Local-Law-144/intake.types";

export type AnswerInput = {
  questionKey: string;
  value: string | null;
  notes: string | null;
  dontKnow: boolean;
};

interface ProfileScope {
  projectId: number;
  frameworkId: number;
  userId: number;
  /** The caller's role, for the project-member rule (projectAccess.ts). */
  role: string;
  organizationId: number;
}

interface ProfileRef {
  profileId: number;
  version: number;
}

const QUESTIONS_BY_KEY = new Map(LL144_QUESTIONS.map((q) => [q.key, q]));

/**
 * Validation order is part of the contract: unknown key, option membership,
 * don't-know permission, then notes. A don't-know is exempt from the option
 * and notes checks because it records the absence of an answer.
 */
function validateAnswer(a: AnswerInput): void {
  const q = QUESTIONS_BY_KEY.get(a.questionKey);
  if (!q) {
    throw new ValidationException(
      `Unknown question: ${a.questionKey}`,
      "questionKey",
      a.questionKey,
    );
  }
  if (!a.dontKnow && !q.options.some((o) => o.value === a.value)) {
    throw new ValidationException(
      `"${a.value}" is not a valid option for ${a.questionKey}`,
      "value",
      a.value,
    );
  }
  if (a.dontKnow && !q.allowDontKnow) {
    throw new ValidationException(
      `Question ${a.questionKey} does not allow "I don't know"`,
      "dontKnow",
      a.dontKnow,
    );
  }
  if (!a.dontKnow && q.notesRequired && (a.notes ?? "").trim() === "") {
    throw new ValidationException(
      `Notes are required for ${a.questionKey}: describe the answer in your own words`,
      "notes",
      a.notes,
    );
  }
}

/** Who first gave an answer and when, so a carried-forward answer keeps its author. */
type Authorship = { userId: number; answeredAt: Date | null };

function toAuthorship(rows: Awaited<ReturnType<typeof getProfileAnswersQuery>>) {
  const out = new Map<string, Authorship>();
  for (const r of rows) {
    if (r.answered_by_user_id != null) {
      out.set(r.question_key, { userId: r.answered_by_user_id, answeredAt: r.answered_at ?? null });
    }
  }
  return out;
}

export async function saveAnswers(
  args: ProfileScope & { answers: AnswerInput[] },
): Promise<ProfileRef> {
  const { projectId, frameworkId, userId, role, organizationId, answers } = args;
  await assertProjectAccess(projectId, organizationId, { userId, role });
  answers.forEach(validateAnswer);

  return sequelize.transaction(async (transaction) => {
    // The current profile is locked before its answers are read, so a
    // concurrent attestation or save on the same row finishes first and is
    // seen here. When that row is a draft, another save's answers are read
    // and carried forward rather than lost. When it is attested, two saves
    // both read the same attested row and both try to create the next
    // version: the second hits the unique version constraint and gets the
    // 409 "Another save created this profile version first", which the
    // client can retry against the new draft. upsertAnswerQuery refuses any
    // profile that is no longer a draft as the backstop.
    const current = await getCurrentProfileQuery(projectId, frameworkId, organizationId, {
      transaction,
    });
    const existingRows = current
      ? await getProfileAnswersQuery(current.id!, organizationId, transaction)
      : [];
    const existing = answerMapFromRows(existingRows, "with_notes");
    const authors = toAuthorship(existingRows);

    const merged: AnswerWithNotes = { ...existing };
    const changed = new Set<string>();
    for (const a of answers) {
      changed.add(a.questionKey);
      merged[a.questionKey] = {
        value: a.dontKnow ? null : a.value,
        notes: a.notes,
        dontKnow: a.dontKnow,
      };
    }

    // A draft is edited in place; an attested profile is never touched.
    let target;
    if (current && current.status === "draft") {
      target = current;
    } else {
      try {
        target = await createProfileVersionQuery(
          {
            projectId,
            frameworkId,
            version: current ? current.version + 1 : 1,
            questionSetVersion: LL144_QUESTION_SET_VERSION,
            createdBy: userId,
          },
          organizationId,
          transaction,
        );
      } catch (error: unknown) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            "Another save created this profile version first. Reload and retry.",
            "AedtProfile",
            "version",
          );
        }
        throw error;
      }
    }

    // Applicability depends on the other answers, so it is recomputed for
    // every stored answer, not just the ones in this request. A not-applicable
    // answer is flagged, never deleted, so it returns if the scope changes back.
    // Only answers in this request are attributed to the current user; the rest
    // keep their author and timestamp, since per-veto attestation reads them.
    const applicable = new Set(applicableQuestions(merged).map((q) => q.key));
    for (const [questionKey, a] of Object.entries(merged)) {
      const prior = changed.has(questionKey) ? undefined : authors.get(questionKey);
      await upsertAnswerQuery(
        {
          profileId: target.id!,
          questionKey,
          questionSetVersion: LL144_QUESTION_SET_VERSION,
          answerValue: a.value,
          answerNotes: a.notes,
          isDontKnow: a.dontKnow,
          isNotApplicable: !applicable.has(questionKey),
          answeredByUserId: prior ? prior.userId : userId,
          answeredAt: prior ? prior.answeredAt : null,
        },
        organizationId,
        transaction,
      );
    }
    return { profileId: target.id!, version: target.version };
  });
}

export async function attestProfile(args: ProfileScope): Promise<ProfileRef> {
  const { projectId, frameworkId, userId, role, organizationId } = args;
  await assertProjectAccess(projectId, organizationId, { userId, role });
  const current = await getCurrentProfileQuery(projectId, frameworkId, organizationId);
  if (!current) {
    throw new NotFoundException("No profile exists to attest for this project", "AedtProfile");
  }

  return sequelize.transaction(async (transaction) => {
    // attestProfileQuery locks the row and refuses a non-draft, so the veto
    // check below reads answers after the lock is held. Throwing rolls the
    // attestation back, so a veto flipped to don't-know by a concurrent edit
    // cannot slip through.
    const attested = await attestProfileQuery(current.id!, userId, organizationId, transaction);
    const answers = answerMapFromRows(
      await getProfileAnswersQuery(current.id!, organizationId, transaction),
      "with_notes",
    );

    const unanswered = VETO_KEYS.filter((k) => answers[k] === undefined);
    const dontKnow = VETO_KEYS.filter(
      (k) => answers[k] && (answers[k].dontKnow || answers[k].value === null),
    );
    if (unanswered.length > 0 || dontKnow.length > 0) {
      const parts: string[] = [];
      if (unanswered.length > 0) parts.push(`unanswered: ${unanswered.join(", ")}`);
      if (dontKnow.length > 0) parts.push(`answered "I don't know": ${dontKnow.join(", ")}`);
      throw new ConflictException(
        `Cannot attest while a deciding question is open (${parts.join("; ")})`,
        "AedtProfile",
        "answers",
      );
    }
    return { profileId: attested.id!, version: attested.version };
  });
}

// ------------------------------------------------------------------ reads

interface ReadScope {
  projectId: number;
  frameworkId: number;
  organizationId: number;
}

/**
 * The whole question set, each question with its `appliesWhen` predicate.
 * It is not filtered by the saved answers: the wizard applies the predicates
 * to the answers on screen, so a follow-up an unsaved answer makes applicable
 * appears at once. The server still decides applicability on every save.
 * Asked per project so the member rule refuses a non-member as on every read.
 */
export async function getQuestionSet(
  scope: ReadScope & Viewer,
): Promise<{ questions: IntakeQuestion[] }> {
  await assertProject(scope.projectId, scope.organizationId, scope);
  return { questions: LL144_QUESTIONS };
}

export interface ProfileAnswerView {
  questionKey: string;
  value: string | null;
  notes: string | null;
  dontKnow: boolean;
  notApplicable: boolean;
  answeredByUserId: number | null;
  answeredAt: Date | null;
}

export interface ProfileView {
  project: { id: number; title: string };
  /** The version being edited: the latest draft, else the attested one. */
  profile: { id: number; version: number; status: string } | null;
  /** The attested version runs are recorded against, if any. */
  attested: {
    id: number;
    version: number;
    attestedByUserId: number | null;
    attestedAt: Date | null;
  } | null;
  answers: ProfileAnswerView[];
  /** Readiness of the version being edited, which may be a draft ahead of the attested one. */
  readiness: ReadinessResult;
  /**
   * What the attested profile decides: its readiness (and so its scope) and
   * the rate a run computes. Runs and scope determinations act on this, not
   * on a draft. Null when no version is attested.
   */
  attestedDecision: ProfileDecision | null;
  /**
   * Scope determinations generated from this project's attested profiles,
   * newest first. They have no run, so no run's stance list carries them;
   * each downloads through GET /stances/:id/download like any stance.
   * `isCurrent` is true only for one that cites the currently attested
   * profile; an earlier one records a determination since re-attested.
   */
  scopeDeterminations: Array<ProfileStanceRow & { isCurrent: boolean }>;
}

export async function getProfileView(
  scope: ReadScope & { userId: number; role: string },
): Promise<ProfileView> {
  const project = await assertProject(scope.projectId, scope.organizationId, {
    userId: scope.userId,
    role: scope.role,
  });
  const { projectId, frameworkId, organizationId } = scope;
  // The member check above stays first. Two concurrent rounds follow: the
  // versions and stances, then the answers of the edited and the attested
  // version together. The edited version is often the attested one; its
  // answers are then read once.
  const [current, attested, stances] = await Promise.all([
    getCurrentProfileQuery(projectId, frameworkId, organizationId),
    getAttestedProfileQuery(projectId, frameworkId, organizationId),
    listProfileStancesQuery(projectId, frameworkId, organizationId),
  ]);
  const attestedIsCurrent = attested != null && current?.id === attested.id;
  const [rows, separateAttestedRows] = await Promise.all([
    current ? getProfileAnswersQuery(current.id!, organizationId) : Promise.resolve([]),
    attested && !attestedIsCurrent
      ? getProfileAnswersQuery(attested.id!, organizationId)
      : Promise.resolve(null),
  ]);
  const answers = answerMapFromRows(rows, "with_notes");
  const attestedRows = attestedIsCurrent ? rows : separateAttestedRows;
  const attestedDecision: ProfileDecision | null = attestedRows
    ? decideProfile(answerMapFromRows(attestedRows, "without_notes"))
    : null;
  return {
    project: { id: project.id, title: project.project_title },
    profile: current ? { id: current.id!, version: current.version, status: current.status } : null,
    attested: attested
      ? {
          id: attested.id!,
          version: attested.version,
          attestedByUserId: attested.attested_by_user_id ?? null,
          attestedAt: attested.attested_at ?? null,
        }
      : null,
    answers: rows.map((r) => ({
      questionKey: r.question_key,
      value: r.answer_value ?? null,
      notes: r.answer_notes ?? null,
      dontKnow: Boolean(r.is_dont_know),
      notApplicable: Boolean(r.is_not_applicable),
      answeredByUserId: r.answered_by_user_id ?? null,
      answeredAt: r.answered_at ?? null,
    })),
    readiness: computeReadiness(answers),
    attestedDecision,
    scopeDeterminations: stances.map((s) => ({
      ...s,
      isCurrent: attested?.id != null && s.profile_id === attested.id,
    })),
  };
}
