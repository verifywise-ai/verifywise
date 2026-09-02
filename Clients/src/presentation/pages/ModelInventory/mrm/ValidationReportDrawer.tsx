import { useEffect, useMemo, useState } from "react";
import { Box, Divider, Stack, Typography } from "@mui/material";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import Select from "../../../components/Inputs/Select";
import Field from "../../../components/Inputs/Field";
import StandardModal from "../../../components/Modals/StandardModal";
import { MrmValidationOutcome, MrmValidationStage } from "../../../../domain/enums/mrm.enum";
import { IMrmValidation, IMrmValidationReport } from "../../../../domain/interfaces/i.mrm";
import { useSignoffValidation, useUpdateValidation } from "../../../../application/hooks/useMrm";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import {
  mrmErrorMessage,
  REPORT_SECTIONS,
  ReportSectionKey,
  revalidationTriggerSourceLabel,
  VALIDATION_OUTCOME_OPTIONS,
  VALIDATION_STAGE_LABELS,
  VALIDATION_STAGE_OPTIONS,
  validationStageChipVariant,
} from "./constants";
import { mrmSubHeadingStyle, mrmTriggerBadgeStyle } from "./mrmStyles";

interface ValidationReportDrawerProps {
  validation: IMrmValidation | null;
  modelName: string;
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

type SectionText = Record<ReportSectionKey, string>;

const emptySections = (): SectionText => ({
  purpose_scope: "",
  conceptual_soundness: "",
  data_review: "",
  outcomes_analysis: "",
  findings_limitations: "",
  conclusion_signoff: "",
});

const readSections = (report: IMrmValidationReport): SectionText => {
  const next = emptySections();
  (Object.keys(next) as ReportSectionKey[]).forEach((key) => {
    next[key] = report?.[key]?.text ?? "";
  });
  return next;
};

const ValidationReportDrawer = ({
  validation,
  modelName,
  onClose,
  onError,
  onSuccess,
}: ValidationReportDrawerProps) => {
  const updateValidation = useUpdateValidation();
  const signoff = useSignoffValidation();

  const [sections, setSections] = useState<SectionText>(emptySections());
  const [stage, setStage] = useState<MrmValidationStage>(MrmValidationStage.IN_VALIDATION);
  const [signoffOpen, setSignoffOpen] = useState(false);
  const [outcome, setOutcome] = useState<MrmValidationOutcome | "">("");

  useEffect(() => {
    if (validation) {
      setSections(readSections(validation.report ?? {}));
      setStage(validation.stage);
      setSignoffOpen(false);
      setOutcome((validation.outcome ?? "") as MrmValidationOutcome | "");
    }
  }, [validation]);

  const isSignedOff = validation?.stage === MrmValidationStage.VALIDATED;
  const isNotStarted = validation?.stage === MrmValidationStage.NOT_STARTED;
  const reportReadOnly = isSignedOff || isNotStarted;

  /** Dated reasons this validation was triggered (Branch 3), newest first. */
  const revalidationTriggers = useMemo(
    () => validation?.report?.revalidation_triggers ?? [],
    [validation],
  );

  const reportPatch = useMemo<IMrmValidationReport>(() => {
    const patch: IMrmValidationReport = {};
    (Object.keys(sections) as ReportSectionKey[]).forEach((key) => {
      const existing = validation?.report?.[key]?.evidence_links ?? [];
      patch[key] = { text: sections[key], evidence_links: existing };
    });
    // Preserve the audit-trail trigger array — it is not editable in this form.
    if (validation?.report?.revalidation_triggers) {
      patch.revalidation_triggers = validation.report.revalidation_triggers;
    }
    return patch;
  }, [sections, validation]);

  const handleSave = async () => {
    if (!validation) return;
    try {
      await updateValidation.mutateAsync({
        id: validation.id,
        payload: {
          report: reportPatch,
          stage: stage !== validation.stage ? stage : undefined,
        },
      });
      onSuccess("Validation report saved");
      onClose();
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to save validation report"));
    }
  };

  const handleSignoff = async () => {
    if (!validation || !outcome) {
      onError("Select an outcome to sign off.");
      return;
    }
    try {
      await signoff.mutateAsync({
        id: validation.id,
        payload: { outcome, report_version: validation?.report_version ?? null },
      });
      onSuccess("Validation signed off");
      setSignoffOpen(false);
      onClose();
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to sign off validation"));
    }
  };

  return (
    <>
      <StandardModal
        isOpen={!!validation && !signoffOpen}
        onClose={onClose}
        title="Validation report"
        description={modelName}
        onSubmit={isSignedOff ? undefined : handleSave}
        submitButtonText="Save report"
        isSubmitting={updateValidation.isPending}
        hideSubmitButton={isSignedOff}
        maxWidth="820px"
        headerActions={
          validation ? (
            <Chip
              label={VALIDATION_STAGE_LABELS[validation.stage]}
              variant={validationStageChipVariant(validation.stage)}
              uppercase={false}
            />
          ) : undefined
        }
      >
        <Stack sx={{ gap: "48px" }}>
          {!isSignedOff && (
            <Select
              id="mrm-validation-stage"
              label="Stage"
              placeholder="Select stage"
              value={stage}
              items={VALIDATION_STAGE_OPTIONS.map((o) => ({ _id: o.value, name: o.label }))}
              onChange={(e) => setStage(e.target.value as MrmValidationStage)}
            />
          )}

          {revalidationTriggers.length > 0 && (
            <Box>
              <Typography sx={mrmSubHeadingStyle}>Triggered by</Typography>
              <Stack sx={{ gap: "8px" }}>
                {revalidationTriggers.map((entry, index) => (
                  <Stack
                    key={`${entry.source}-${entry.at}-${index}`}
                    direction="row"
                    sx={{
                      alignItems: "flex-start",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <Box component="span" sx={mrmTriggerBadgeStyle}>
                      {revalidationTriggerSourceLabel(entry.source)}
                    </Box>
                    <Typography sx={{ fontSize: "13px", color: "text.secondary", flex: 1 }}>
                      {entry.reason}
                      {entry.at ? ` · ${displayFormattedDate(entry.at)}` : ""}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {isNotStarted && (
            <Box
              sx={{
                padding: "8px 12px",
                marginBottom: "16px",
                borderRadius: "4px",
                backgroundColor: "background.accent",
                border: "1px solid",
                borderColor: "border.light",
              }}
            >
              <Typography sx={{ fontSize: "12px", color: "text.secondary" }}>
                Advance this validation to In validation to begin writing the report.
              </Typography>
            </Box>
          )}

          {REPORT_SECTIONS.map((section, index) => (
            <Box key={section.key}>
              <Stack
                direction="row"
                sx={{
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <Typography
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "20px",
                    height: "20px",
                    borderRadius: "4px",
                    backgroundColor: "background.accent",
                    color: "text.secondary",
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                >
                  {index + 1}
                </Typography>
                <Typography sx={{ fontSize: "13px", fontWeight: 600, color: "text.primary" }}>
                  {section.label}
                </Typography>
              </Stack>
              <Field
                id={`mrm-report-${section.key}`}
                value={sections[section.key]}
                onChange={(e) =>
                  setSections((prev) => ({ ...prev, [section.key]: e.target.value }))
                }
                multiline
                minRows={3}
                disabled={reportReadOnly}
                placeholder="Record the validator's assessment for this section."
              />
              {index < REPORT_SECTIONS.length - 1 && <Divider sx={{ marginTop: "16px" }} />}
            </Box>
          ))}

          {!isSignedOff && validation?.stage !== MrmValidationStage.NOT_STARTED && (
            <Box>
              <Divider sx={{ marginBottom: "16px" }} />
              <CustomizableButton
                variant="contained"
                text="Sign off validation"
                onClick={() => setSignoffOpen(true)}
                testId="mrm-signoff-btn"
              />
            </Box>
          )}
        </Stack>
      </StandardModal>

      <StandardModal
        isOpen={signoffOpen}
        onClose={() => setSignoffOpen(false)}
        title="Sign off validation"
        description="Record the validation outcome. This marks the validation as validated and closes the active cycle."
        onSubmit={handleSignoff}
        submitButtonText="Sign off"
        isSubmitting={signoff.isPending}
        fitContent
      >
        <Stack sx={{ gap: "48px" }}>
          <Select
            id="mrm-signoff-outcome"
            label="Outcome"
            placeholder="Select an outcome"
            isRequired
            value={outcome}
            items={VALIDATION_OUTCOME_OPTIONS.map((o) => ({ _id: o.value, name: o.label }))}
            onChange={(e) => setOutcome(e.target.value as MrmValidationOutcome)}
          />
        </Stack>
      </StandardModal>
    </>
  );
};

export default ValidationReportDrawer;
