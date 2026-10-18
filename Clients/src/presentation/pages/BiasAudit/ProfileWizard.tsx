import { useMemo, useState } from "react";
import { Alert, Box, RadioGroup, Stack, Typography } from "@mui/material";
import Radio from "../../components/Inputs/Radio";
import Field from "../../components/Inputs/Field";
import { CustomizableButton } from "../../components/button/customizable-button";
import { palette } from "../../themes/palette";
import type {
  AedtAnswerInput,
  AedtProfileAnswer,
  AedtQuestion,
} from "../../../application/repository/aedtBiasAudit.repository";
import EducationPanel from "./EducationPanel";
import OpenVetoList from "./OpenVetoList";
import { evaluatePredicate, groupQuestions, hasUsableAnswer, questionTitle } from "./intakeLayout";
import { cardSx, titleSx } from "./styles";

const DONT_KNOW = "__dont_know__";
/** Held in a constant: the i18n audit's attribute scan stops at a straight apostrophe. */
const DONT_KNOW_LABEL = "I don't know";

const EMPTY_ANSWER: DraftAnswer = { value: null, notes: "", dontKnow: false };

interface DraftAnswer {
  value: string | null;
  notes: string;
  dontKnow: boolean;
}

export interface ProfileWizardProps {
  /**
   * The whole question set with each question's `appliesWhen`. The wizard
   * shows those that apply to the answers on screen, saved or not.
   */
  questions: AedtQuestion[];
  /** The saved answers of the profile being edited. */
  answers: AedtProfileAnswer[];
  /** The edited profile's status: null when nothing has been saved yet. */
  profileStatus: string | null;
  canEdit: boolean;
  canAttest: boolean;
  /** Saves the answers; the page calls `onSaved` once the server accepted them. */
  onSave: (answers: AedtAnswerInput[], onSaved: () => void) => void;
  onAttest: () => void;
  isSaving?: boolean;
  isAttesting?: boolean;
  /** The server's message for a refused save or attest. */
  errorMessage?: string | null;
}

/** Saved answers (from the server, or as just sent to it) in the draft's shape. */
function draftFrom(answers: AedtAnswerInput[]): Record<string, DraftAnswer> {
  const out: Record<string, DraftAnswer> = {};
  for (const a of answers) {
    out[a.questionKey] = { value: a.value, notes: a.notes ?? "", dontKnow: a.dontKnow };
  }
  return out;
}

const isAnswered = (a: DraftAnswer | undefined) => a !== undefined && (a.dontKnow || !!a.value);

/** Notes are compared trimmed, as Save sends them. */
const sameAnswer = (a: DraftAnswer, b: DraftAnswer) =>
  a.value === b.value && a.dontKnow === b.dontKnow && a.notes.trim() === b.notes.trim();

/**
 * The edits that still differ from the saved answers. Compared exactly, not
 * trimmed: dropping an edit must never change the text on screen, or a typed
 * space or newline would vanish mid-typing.
 */
function withoutSaved(
  edits: Record<string, DraftAnswer>,
  saved: Record<string, DraftAnswer>,
): Record<string, DraftAnswer> {
  const next: Record<string, DraftAnswer> = {};
  for (const [k, a] of Object.entries(edits)) {
    const s = saved[k] ?? EMPTY_ANSWER;
    if (a.value !== s.value || a.dontKnow !== s.dontKnow || a.notes !== s.notes) next[k] = a;
  }
  return next;
}

/** Shown beside "I don't know": what that answer does, before it is given. */
function dontKnowConsequence(q: AedtQuestion): string {
  return q.weight === "veto"
    ? "This is a deciding question. The profile cannot be attested while it is answered this way."
    : "Recorded as an open item in your readiness score.";
}

/**
 * The profile intake. Each option's consequence is printed beside it, so the
 * customer reads what an answer decides before giving it. Attest is withheld,
 * with the reason named, while a deciding question is open or answers are
 * unsaved, rather than failing on submit.
 *
 * Saved answers come from the `answers` prop; the wizard keeps only the edits
 * on top of them. Inputs, Save and Attest are locked while a save or attest
 * is pending.
 */
const ProfileWizard = ({
  questions,
  answers,
  profileStatus,
  canEdit,
  canAttest,
  onSave,
  onAttest,
  isSaving = false,
  isAttesting = false,
  errorMessage = null,
}: ProfileWizardProps) => {
  // Saved answers are whatever the profile query holds. Local state is only
  // the edits on top of them, so a refetch shows the server's answers for
  // every question the user has not touched.
  const savedDraft = useMemo(() => draftFrom(answers), [answers]);
  const [edits, setEdits] = useState<Record<string, DraftAnswer>>({});
  // When the saved answers change (a refetch, another version), an edit the
  // server now holds is dropped, so a later change by someone else is not
  // hidden under it. Render-time state adjustment, no effect.
  const [answersSeen, setAnswersSeen] = useState(answers);
  if (answers !== answersSeen) {
    setAnswersSeen(answers);
    setEdits((prev) => withoutSaved(prev, savedDraft));
  }
  const draft = useMemo(() => ({ ...savedDraft, ...edits }), [savedDraft, edits]);
  // While a save or attest is in flight nothing can change, so nothing on
  // screen can be lost when the result loads.
  const locked = isSaving || isAttesting;

  const visible = useMemo(
    () => questions.filter((q) => evaluatePredicate(q.appliesWhen, draft)),
    [questions, draft],
  );

  const groups = useMemo(() => groupQuestions(visible), [visible]);

  const update = (key: string, patch: Partial<DraftAnswer>) => {
    setEdits((prev) =>
      withoutSaved(
        { ...prev, [key]: { ...(prev[key] ?? savedDraft[key] ?? EMPTY_ANSWER), ...patch } },
        savedDraft,
      ),
    );
  };

  // ---- save

  // An edit that differs from the saved answer only by surrounding whitespace
  // in its notes is kept on screen but is not a change. Of the real changes,
  // Save sends the visible questions with an answer.
  const edited = Object.keys(edits).filter(
    (k) => !sameAnswer(edits[k], savedDraft[k] ?? EMPTY_ANSWER),
  );
  const pending = visible.filter((q) => edited.includes(q.key) && isAnswered(draft[q.key]));

  // Edits Save cannot send: notes on a question with no answer, or an answer
  // to a question a later answer has hidden. They are named, can be
  // discarded, and hold Save and Attest back until answered or discarded.
  const visibleKeys = new Set(visible.map((q) => q.key));
  const pendingKeys = new Set(pending.map((q) => q.key));
  const unsaveable = edited
    .filter((k) => !pendingKeys.has(k))
    .map((k) => ({ key: k, hidden: !visibleKeys.has(k) }));

  const discardUnsaveable = () => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const u of unsaveable) delete next[u.key];
      return next;
    });
  };
  const missingNotes = pending.filter(
    (q) => q.notesRequired && !draft[q.key].dontKnow && draft[q.key].notes.trim() === "",
  );
  const saveDisabled =
    !canEdit || locked || pending.length === 0 || missingNotes.length > 0 || unsaveable.length > 0;

  const handleSave = () => {
    if (saveDisabled) return;
    const sent = pending.map((q) => {
      const a = draft[q.key];
      const notes = a.notes.trim();
      return {
        questionKey: q.key,
        value: a.dontKnow ? null : a.value,
        notes: notes === "" ? null : notes,
        dontKnow: a.dontKnow,
      };
    });
    // Once saved, the server holds these; whatever it now says for them
    // (someone else's later answer included) is what shows.
    onSave(sent, () =>
      setEdits((prev) => {
        const next = { ...prev };
        for (const a of sent) delete next[a.questionKey];
        return next;
      }),
    );
  };

  // ---- attest: read from the saved answers, since attest records those.
  // Every deciding question counts, with no applicability, exactly as the
  // server's attest check does (VETO_KEYS in profileService.attestProfile).
  // The server is the authority: if a conditional deciding question is ever
  // added, change both sides together.

  const openVetoes = questions
    .filter((q) => q.weight === "veto")
    .filter((q) => !hasUsableAnswer(savedDraft[q.key]))
    .map((q) => ({ key: q.key, dontKnow: savedDraft[q.key]?.dontKnow ?? false }));

  let attestReason: string | null = null;
  if (!canAttest) attestReason = "Only an Admin can attest the profile.";
  else if (pending.length > 0 || profileStatus === null)
    attestReason = "Save your answers before attesting.";
  else if (unsaveable.length > 0)
    attestReason =
      "Some edits cannot be saved. Answer those questions or discard the edits before attesting.";
  else if (profileStatus === "attested")
    attestReason = "This version is attested. Change an answer to start a new version.";
  const attestDisabled = locked || attestReason !== null || openVetoes.length > 0;

  return (
    <Stack gap="16px">
      {groups.map(({ section, questions: sectionQuestions }) => (
        <Box key={section.id} component="section" data-testid={`section-${section.id}`} sx={cardSx}>
          <Typography sx={{ ...titleSx, mb: "12px" }}>{section.title}</Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", lg: section.educationKey ? "3fr 2fr" : "1fr" },
              gap: "16px",
              alignItems: "start",
            }}
          >
            <Stack gap="20px">
              {sectionQuestions.map((q) => (
                <QuestionBlock
                  key={q.key}
                  question={q}
                  answer={draft[q.key]}
                  disabled={!canEdit || locked}
                  onChange={(patch) => update(q.key, patch)}
                />
              ))}
            </Stack>
            {section.educationKey && <EducationPanel pageKey={section.educationKey} />}
          </Box>
        </Box>
      ))}

      {errorMessage && (
        <Alert severity="error" sx={{ borderRadius: "4px" }} data-testid="profile-error">
          {errorMessage}
        </Alert>
      )}

      <Box
        sx={{
          ...cardSx,
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: "16px",
        }}
      >
        <Stack gap="8px" alignItems="flex-start">
          <CustomizableButton
            variant="contained"
            text="Save answers"
            testId="aedt-save-answers"
            onClick={handleSave}
            isDisabled={saveDisabled}
            loading={isSaving}
          />
          {!canEdit && (
            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
              Only an Admin or Editor can change answers.
            </Typography>
          )}
          {canEdit && unsaveable.length > 0 && (
            <Typography
              sx={{ fontSize: 12, color: palette.status.error.text }}
              data-testid="save-blocked-unsaveable"
            >
              Answer or discard the edits below before saving.
            </Typography>
          )}
          {unsaveable.length > 0 && (
            <Box data-testid="unsaveable-edits">
              <Typography sx={{ fontSize: 12, color: palette.status.warning.text }}>
                These edits cannot be saved:
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: "18px", mb: "8px" }}>
                {unsaveable.map((u) => (
                  <Typography
                    component="li"
                    key={u.key}
                    sx={{ fontSize: 12, color: palette.status.warning.text }}
                  >
                    <span>{questionTitle(u.key)}</span>{" "}
                    <span>{u.hidden ? "(no longer applies)" : "(notes without an answer)"}</span>
                  </Typography>
                ))}
              </Box>
              <CustomizableButton
                variant="outlined"
                size="small"
                text="Discard these edits"
                testId="aedt-discard-unsaveable"
                onClick={discardUnsaveable}
                isDisabled={locked}
              />
            </Box>
          )}
          {canEdit && missingNotes.length > 0 && (
            <Box data-testid="save-blocked-reason">
              <Typography sx={{ fontSize: 12, color: palette.status.error.text }}>
                Notes are required before these answers can be saved:
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: "18px" }}>
                {missingNotes.map((q) => (
                  <Typography
                    component="li"
                    key={q.key}
                    sx={{ fontSize: 12, color: palette.status.error.text }}
                  >
                    {questionTitle(q.key)}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}
        </Stack>

        <Stack gap="8px" alignItems="flex-start">
          <CustomizableButton
            variant="outlined"
            text="Attest profile"
            testId="aedt-attest-profile"
            onClick={() => {
              if (!attestDisabled) onAttest();
            }}
            isDisabled={attestDisabled}
            loading={isAttesting}
          />
          {(attestReason !== null || openVetoes.length > 0) && (
            <Box data-testid="attest-blocked-reason">
              {attestReason && (
                <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                  {attestReason}
                </Typography>
              )}
              {openVetoes.length > 0 && (
                <>
                  <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                    These deciding questions need a saved answer before you can attest:
                  </Typography>
                  <OpenVetoList vetoes={openVetoes} color={palette.text.tertiary} />
                </>
              )}
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mt: "4px" }}>
                Attesting records these answers as your own statement of your position.
              </Typography>
            </Box>
          )}
        </Stack>
      </Box>
    </Stack>
  );
};

interface QuestionBlockProps {
  question: AedtQuestion;
  answer: DraftAnswer | undefined;
  disabled: boolean;
  onChange: (patch: Partial<DraftAnswer>) => void;
}

const QuestionBlock = ({ question: q, answer, disabled, onChange }: QuestionBlockProps) => {
  const selected = answer?.dontKnow ? DONT_KNOW : (answer?.value ?? "");
  const notesMissing =
    q.notesRequired && isAnswered(answer) && !answer?.dontKnow && answer?.notes.trim() === "";

  return (
    <Box data-testid={`question-${q.key}`}>
      <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap" sx={{ mb: "4px" }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>
          {questionTitle(q.key)}
        </Typography>
        {q.weight === "veto" && (
          <Box
            component="span"
            sx={{
              fontSize: 11,
              color: palette.status.warning.text,
              backgroundColor: palette.status.warning.bg,
              border: `1px solid ${palette.status.warning.border}`,
              borderRadius: "4px",
              px: "6px",
            }}
          >
            Deciding question
          </Box>
        )}
        {q.statutoryRef && (
          <Typography component="span" sx={{ fontSize: 11, color: palette.text.accent }}>
            § {q.statutoryRef}
          </Typography>
        )}
      </Stack>
      <Typography sx={{ fontSize: 13, color: palette.text.secondary, mb: "12px" }}>
        {q.prompt}
      </Typography>

      <Box component="fieldset" disabled={disabled} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
        <RadioGroup name={q.key} aria-label={questionTitle(q.key)} sx={{ gap: "12px", pl: "10px" }}>
          {q.options.map((o) => (
            <Radio
              key={o.value}
              id={`${q.key}-${o.value}`}
              value={o.value}
              size="small"
              checked={selected === o.value}
              onChange={() => onChange({ value: o.value, dontKnow: false })}
              title={o.label}
              desc={o.consequence ?? ""}
            />
          ))}
          {q.allowDontKnow && (
            <Radio
              id={`${q.key}-dont-know`}
              value={DONT_KNOW}
              size="small"
              checked={selected === DONT_KNOW}
              onChange={() => onChange({ value: null, dontKnow: true })}
              title={DONT_KNOW_LABEL}
              desc={dontKnowConsequence(q)}
            />
          )}
        </RadioGroup>

        <Box sx={{ mt: "16px" }}>
          <Field
            id={`${q.key}-notes`}
            label={q.notesPrompt ?? "Notes"}
            isRequired={q.notesRequired}
            isOptional={!q.notesRequired}
            multiline
            rows={2}
            value={answer?.notes ?? ""}
            onChange={(e) => onChange({ notes: e.target.value })}
            error={notesMissing ? "Describe the answer in your own words." : undefined}
            disabled={disabled}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default ProfileWizard;
