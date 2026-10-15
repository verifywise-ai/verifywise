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
  getCurrentProfileQuery,
  getProfileAnswersQuery,
  upsertAnswerQuery,
} from "../../utils/biasAudit.utils";
import {
  LL144_QUESTION_SET_VERSION,
  LL144_QUESTIONS,
  VETO_KEYS,
} from "../../structures/NYC-Local-Law-144/intake.questions";
import { applicableQuestions, type AnswerWithNotes } from "./applicability";

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

/** Answers for a profile, keyed by question, in the service's working shape. */
function toWorkingSet(rows: Awaited<ReturnType<typeof getProfileAnswersQuery>>): AnswerWithNotes {
  const out: AnswerWithNotes = {};
  for (const r of rows) {
    out[r.question_key] = {
      value: r.answer_value ?? null,
      notes: r.answer_notes ?? null,
      dontKnow: Boolean(r.is_dont_know),
    };
  }
  return out;
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

/** A concurrent save that took the same version number loses to the unique index. */
function isUniqueViolation(error: unknown): boolean {
  const e = error as { name?: string; original?: { code?: string } };
  return e?.original?.code === "23505" || e?.name === "SequelizeUniqueConstraintError";
}

export async function saveAnswers(
  args: ProfileScope & { answers: AnswerInput[] },
): Promise<ProfileRef> {
  const { projectId, frameworkId, userId, organizationId, answers } = args;
  answers.forEach(validateAnswer);

  return sequelize.transaction(async (transaction) => {
    const current = await getCurrentProfileQuery(projectId, frameworkId, organizationId);
    const existingRows = current ? await getProfileAnswersQuery(current.id!, organizationId) : [];
    const existing = toWorkingSet(existingRows);
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
  const { projectId, frameworkId, userId, organizationId } = args;
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
    const answers = toWorkingSet(
      await getProfileAnswersQuery(current.id!, organizationId, transaction),
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
