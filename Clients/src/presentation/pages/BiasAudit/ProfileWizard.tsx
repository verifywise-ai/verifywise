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
  onSave: (answers: AedtAnswerInput[]) => void;
  onAttest: () => void;
  isSaving?: boolean;
  isAttesting?: boolean;
  /** The server's message for a refused save or attest. */
  errorMessage?: string | null;
}

function draftFrom(answers: AedtProfileAnswer[]): Record<string, DraftAnswer> {
  const out: Record<string, DraftAnswer> = {};
  for (const a of answers) {
    out[a.questionKey] = { value: a.value, notes: a.notes ?? "", dontKnow: a.dontKnow };
  }
  return out;
}

const isAnswered = (a: DraftAnswer | undefined) => a !== undefined && (a.dontKnow || !!a.value);

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
 * Mount it with a `key` that changes when the saved profile changes, so the
 * draft restarts from what the server holds.
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
  const [draft, setDraft] = useState<Record<string, DraftAnswer>>(() => draftFrom(answers));
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());

  const visible = useMemo(
    () => questions.filter((q) => evaluatePredicate(q.appliesWhen, draft)),
    [questions, draft],
  );

  const groups = useMemo(() => groupQuestions(visible), [visible]);

  const update = (key: string, patch: Partial<DraftAnswer>) => {
    setDraft((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? EMPTY_ANSWER), ...patch },
    }));
    setDirty((prev) => new Set(prev).add(key));
  };

  // ---- save

  // Only these changes can be saved. An edit that cannot (notes typed on an
  // unanswered question, or a question hidden by a later answer) is not one.
  const pending = visible.filter((q) => dirty.has(q.key) && isAnswered(draft[q.key]));
  const missingNotes = pending.filter(
    (q) => q.notesRequired && !draft[q.key].dontKnow && draft[q.key].notes.trim() === "",
  );
  const saveDisabled = !canEdit || isSaving || pending.length === 0 || missingNotes.length > 0;

  const handleSave = () => {
    if (saveDisabled) return;
    onSave(
      pending.map((q) => {
        const a = draft[q.key];
        const notes = a.notes.trim();
        return {
          questionKey: q.key,
          value: a.dontKnow ? null : a.value,
          notes: notes === "" ? null : notes,
          dontKnow: a.dontKnow,
        };
      }),
    );
  };

  // ---- attest: read from the saved answers, since attest records those

  const saved = useMemo(() => new Map(answers.map((a) => [a.questionKey, a])), [answers]);
  const openVetoes = questions
    .filter((q) => q.weight === "veto")
    .filter((q) => !hasUsableAnswer(saved.get(q.key)))
    .map((q) => ({ key: q.key, dontKnow: saved.get(q.key)?.dontKnow ?? false }));

  let attestReason: string | null = null;
  if (!canAttest) attestReason = "Only an Admin can attest the profile.";
  else if (pending.length > 0 || profileStatus === null)
    attestReason = "Save your answers before attesting.";
  else if (profileStatus === "attested")
    attestReason = "This version is attested. Change an answer to start a new version.";
  const attestDisabled = isAttesting || attestReason !== null || openVetoes.length > 0;

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
                  disabled={!canEdit}
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
                  <Box component="ul" sx={{ m: 0, pl: "18px" }}>
                    {openVetoes.map((v) => (
                      <Typography
                        component="li"
                        key={v.key}
                        sx={{ fontSize: 12, color: palette.text.tertiary }}
                      >
                        <span>{questionTitle(v.key)}</span>
                        {v.dontKnow && <span> (answered &quot;I don&apos;t know&quot;)</span>}
                      </Typography>
                    ))}
                  </Box>
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
