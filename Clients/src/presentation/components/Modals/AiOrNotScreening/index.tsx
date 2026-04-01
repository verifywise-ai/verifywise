import React, { useState, useCallback, useMemo } from "react";
import {
  Stack,
  Box,
  Typography,
  useTheme,
  RadioGroup,
  FormControlLabel,
  Radio,
} from "@mui/material";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import StepperModal from "../StepperModal";
import { CustomizableButton } from "../../button/customizable-button";
import { brand } from "../../../themes/palette";

interface AiOrNotScreeningProps {
  isOpen: boolean;
  onClose: () => void;
  onSkip: () => void;
  onComplete: (isAi: boolean) => void;
}

type Answer = "yes" | "no" | null;

interface Answers {
  q1: Answer;
  q2: Answer;
  q3: Answer;
  q4: Answer;
  q5: Answer;
  q6: Answer;
  q7: Answer;
}

const initialAnswers: Answers = {
  q1: null,
  q2: null,
  q3: null,
  q4: null,
  q5: null,
  q6: null,
  q7: null,
};

const STEPS = ["Introduction", "Screening questions", "Result"];

const AiOrNotScreening: React.FC<AiOrNotScreeningProps> = ({
  isOpen,
  onClose,
  onSkip,
  onComplete,
}) => {
  const theme = useTheme();
  const [activeStep, setActiveStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);

  const handleClose = useCallback(() => {
    setActiveStep(0);
    setAnswers(initialAnswers);
    onClose();
  }, [onClose]);

  const handleSkip = useCallback(() => {
    setActiveStep(0);
    setAnswers(initialAnswers);
    onSkip();
  }, [onSkip]);

  const setAnswer = useCallback(
    (key: keyof Answers, value: Answer) => {
      setAnswers((prev) => {
        const updated = { ...prev, [key]: value };
        if (key === "q1" && value === "no") {
          updated.q2 = null;
          updated.q3 = null;
          updated.q4 = null;
          updated.q5 = null;
          updated.q6 = null;
          updated.q7 = null;
        }
        return updated;
      });
    },
    []
  );

  const result = useMemo(() => {
    if (answers.q1 === null) return null;
    if (answers.q1 === "no") return { isAi: false, reason: "core" as const };

    const otherAnswers = [
      answers.q2,
      answers.q3,
      answers.q4,
      answers.q5,
      answers.q6,
      answers.q7,
    ];
    const anyYes = otherAnswers.some((a) => a === "yes");
    const allAnswered = otherAnswers.every((a) => a !== null);

    if (!allAnswered) return null;
    if (anyYes) return { isAi: true, reason: "full" as const };
    return { isAi: false, reason: "deterministic" as const };
  }, [answers]);

  const showEarlyExit = answers.q1 === "no";

  const canProceed = useMemo(() => {
    if (activeStep === 0) return true;
    if (activeStep === 1) {
      if (showEarlyExit) return true;
      return result !== null;
    }
    return true;
  }, [activeStep, showEarlyExit, result]);

  const handleNext = useCallback(() => {
    if (activeStep === 1 && showEarlyExit) {
      setActiveStep(2);
    } else {
      setActiveStep((prev) => prev + 1);
    }
  }, [activeStep, showEarlyExit]);

  const handleBack = useCallback(() => {
    setActiveStep((prev) => prev - 1);
  }, []);

  const handleSubmit = useCallback(() => {
    if (result) {
      handleClose();
      onComplete(result.isAi);
    }
  }, [result, handleClose, onComplete]);

  const radioSx = {
    color: theme.palette.border.dark,
    "&.Mui-checked": { color: `${brand.primary}` },
    padding: "4px 8px",
  };

  const labelSx = { fontSize: 13, color: theme.palette.text.primary };

  const renderQuestion = (
    key: keyof Answers,
    label: string,
    number: number
  ) => (
    <Box
      key={key}
      sx={{
        padding: "8px",
        borderRadius: "4px",
        backgroundColor:
          answers[key] !== null ? theme.palette.background.fill : "transparent",
      }}
    >
      <Typography sx={{ fontSize: 13, fontWeight: 500, mb: "8px" }}>
        Q{number}. {label}
      </Typography>
      <RadioGroup
        row
        value={answers[key] ?? ""}
        onChange={(e) => setAnswer(key, e.target.value as Answer)}
      >
        <FormControlLabel
          value="yes"
          control={<Radio size="small" sx={radioSx} />}
          label={<Typography sx={labelSx}>Yes</Typography>}
        />
        <FormControlLabel
          value="no"
          control={<Radio size="small" sx={radioSx} />}
          label={<Typography sx={labelSx}>No</Typography>}
        />
      </RadioGroup>
    </Box>
  );

  const renderIntro = () => (
    <Stack sx={{ gap: "24px" }}>
      <Box
        sx={{
          padding: "8px",
          borderRadius: "4px",
          backgroundColor: theme.palette.background.fill,
          border: `1px solid ${theme.palette.border.light}`,
        }}
      >
        <Stack sx={{ gap: "8px" }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
            Is your system an AI system?
          </Typography>
          <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
            This short screening (7 questions) helps determine whether your
            system qualifies as an AI system under the EU AI Act, NIST AI RMF,
            and ISO/IEC 42001.
          </Typography>
          <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
            If classified as AI, it should enter your AI inventory and follow
            your AI governance lifecycle.
          </Typography>
        </Stack>
      </Box>

      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <CustomizableButton
          variant="text"
          text="Skip screening and create use case"
          onClick={handleSkip}
          sx={{
            fontSize: 13,
            color: theme.palette.text.accent,
            textDecoration: "underline",
            "&:hover": {
              backgroundColor: "transparent",
              color: theme.palette.text.secondary,
            },
          }}
        />
      </Box>
    </Stack>
  );

  const renderQuestions = () => (
    <Stack sx={{ gap: "16px" }}>
      {/* Section 1: Core Definition */}
      <Stack sx={{ gap: "8px" }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
          Core definition test (EU AI Act)
        </Typography>
        {renderQuestion(
          "q1",
          "Does the system generate predictions, recommendations, classifications, or decisions from data?",
          1
        )}

        {!showEarlyExit && (
          <>
            {renderQuestion(
              "q2",
              "Does the system use models that learn patterns from data or apply statistical/logic-based methods beyond fixed rules?",
              2
            )}
            {renderQuestion(
              "q3",
              "Are the system's outputs not fully predetermined by explicit, hard-coded rules?",
              3
            )}
          </>
        )}

        {showEarlyExit && (
          <Box
            sx={{
              padding: "8px",
              borderRadius: "4px",
              backgroundColor: theme.palette.status.warning.bg,
              border: `1px solid ${theme.palette.status.warning.border}`,
            }}
          >
            <Typography
              sx={{
                fontSize: 13,
                color: theme.palette.status.warning.text,
                fontWeight: 500,
              }}
            >
              Based on your answer, this system does not meet the core AI
              definition. You can proceed to see the full result.
            </Typography>
          </Box>
        )}
      </Stack>

      {/* Section 2: Behaviour Test */}
      {answers.q1 === "yes" && (
        <Stack sx={{ gap: "8px" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            Behaviour test (NIST AI RMF)
          </Typography>
          {renderQuestion(
            "q4",
            "Does the system adapt or change behaviour based on new data or feedback?",
            4
          )}
          {renderQuestion(
            "q5",
            "Does the system perform tasks normally requiring human perception or judgement (e.g., language understanding, image recognition)?",
            5
          )}
        </Stack>
      )}

      {/* Section 3: Governance Trigger */}
      {answers.q1 === "yes" && (
        <Stack sx={{ gap: "8px" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            Governance trigger test (ISO/IEC 42001)
          </Typography>
          {renderQuestion(
            "q6",
            "Does the system require monitoring, validation, or periodic review of a model or dataset?",
            6
          )}
          {renderQuestion(
            "q7",
            "Could the system's outputs materially affect people, processes, or decisions?",
            7
          )}
        </Stack>
      )}
    </Stack>
  );

  const renderResult = () => {
    if (!result) return null;

    if (result.isAi) {
      return (
        <Stack sx={{ gap: "24px" }}>
          <Box
            sx={{
              padding: "8px",
              borderRadius: "4px",
              backgroundColor: theme.palette.status.success.bg,
              border: `1px solid ${theme.palette.status.success.border}`,
            }}
          >
            <Stack direction="row" sx={{ gap: "12px", alignItems: "flex-start" }}>
              <CheckCircle2
                size={20}
                color={theme.palette.status.success.text}
                style={{ flexShrink: 0, marginTop: 2 }}
              />
              <Stack sx={{ gap: "8px" }}>
                <Typography
                  sx={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: theme.palette.status.success.text,
                  }}
                >
                  This system qualifies as an AI system
                </Typography>
                <Typography
                  sx={{ fontSize: 13, color: theme.palette.text.secondary }}
                >
                  Based on your answers, this system meets the definition of an
                  AI system under one or more of the following: EU AI Act, NIST
                  AI RMF, or ISO/IEC 42001. It should be added to your AI
                  inventory and follow your governance lifecycle.
                </Typography>
              </Stack>
            </Stack>
          </Box>
          <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
            Click "Create use case" below to proceed with setting up this AI use
            case in VerifyWise.
          </Typography>
        </Stack>
      );
    }

    return (
      <Stack sx={{ gap: "24px" }}>
        <Box
          sx={{
            padding: "8px",
            borderRadius: "4px",
            backgroundColor: theme.palette.status.warning.bg,
            border: `1px solid ${theme.palette.status.warning.border}`,
          }}
        >
          <Stack direction="row" sx={{ gap: "12px", alignItems: "flex-start" }}>
            <AlertTriangle
              size={20}
              color={theme.palette.status.warning.text}
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            <Stack sx={{ gap: "8px" }}>
              <Typography
                sx={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: theme.palette.status.warning.text,
                }}
              >
                This system does not appear to be an AI system
              </Typography>
              <Typography
                sx={{ fontSize: 13, color: theme.palette.text.secondary }}
              >
                {result.reason === "core"
                  ? "The system does not generate predictions, recommendations, classifications, or decisions from data, which is the core requirement for an AI system."
                  : "While the system generates outputs from data, it appears to be deterministic software, a rules engine, workflow automation, or analytics tool rather than an AI system."}
              </Typography>
            </Stack>
          </Stack>
        </Box>

        <Stack sx={{ gap: "8px" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            Common signs a system is incorrectly labeled as "AI":
          </Typography>
          {[
            "No model, no training, no inference",
            "Fully deterministic outputs",
            "Vendor cannot describe the model type",
            "No monitoring or validation required",
            '"AI" used to describe simple automation',
            "No data beyond basic inputs/outputs",
          ].map((flag) => (
            <Typography
              key={flag}
              sx={{
                fontSize: 13,
                color: theme.palette.text.secondary,
                pl: "16px",
              }}
            >
              {"\u2022"} {flag}
            </Typography>
          ))}
        </Stack>

        <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
          You can still create a use case if needed. Proceed with caution and
          consider whether AI governance processes are appropriate for this
          system.
        </Typography>
      </Stack>
    );
  };

  const stepContent = [renderIntro, renderQuestions, renderResult];

  return (
    <StepperModal
      isOpen={isOpen}
      onClose={handleClose}
      title="AI or not? Screening tool"
      steps={STEPS}
      activeStep={activeStep}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={handleSubmit}
      canProceed={canProceed}
      submitButtonText={
        result?.isAi ? "Create use case" : "Proceed with caution"
      }
      maxWidth="680px"
    >
      {stepContent[activeStep]()}
    </StepperModal>
  );
};

export default AiOrNotScreening;
