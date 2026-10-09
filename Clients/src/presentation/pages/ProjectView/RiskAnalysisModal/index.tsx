import { useCallback, useEffect, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import Alert from "../../../components/Alert";
import StandardModal from "../../../components/Modals/StandardModal";
import EuAiActQuestionnaire from "../../../components/EuAiActQuestionnaire";
import Result from "./Result";
import {
  getLatestUseCaseClassification,
  saveUseCaseClassification,
  scoreEuAiActAnswers,
} from "../../../../application/repository/euAiActClassification.repository";
import { useFetchEuAiActQuestionnaire } from "../../../../application/hooks/useEuAiActQuestionnaire";
import { pruneHiddenAnswers } from "../../../../application/utils/euAiActQuestionnaire";
import CustomException from "../../../../infrastructure/exceptions/customeException";
import type {
  Answers,
  ClassificationResult,
  Questionnaire,
} from "../../../../domain/types/euAiActClassification";

/** The 4xx status phrases the server's envelope uses when there is no specific reason. */
const HTTP_STATUS_PHRASES = new Set([
  "Bad Request",
  "Unauthorized",
  "Payment Required",
  "Forbidden",
  "Not Found",
  "Method Not Allowed",
  "Not Acceptable",
  "Proxy Authentication Required",
  "Request Timeout",
  "Conflict",
  "Gone",
  "Payload Too Large",
  "Content Too Large",
  "Unsupported Media Type",
  "Unprocessable Entity",
  "Unprocessable Content",
  "Too Many Requests",
]);

/** True when an error message is a reason the user can act on, not a status phrase. */
const isActionableReason = (message: string | undefined): message is string => {
  const text = message?.trim();
  return (
    !!text && !HTTP_STATUS_PHRASES.has(text) && !/^Request failed with status code \d+$/.test(text)
  );
};

interface RiskAnalysisModalProps {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  projectId: string;
  setAlert: (
    alert: {
      variant: "success" | "info" | "warning" | "error";
      title?: string;
      body: string;
      isToast: boolean;
      visible: boolean;
    } | null,
  ) => void;
  /** Called with the saved result; the server has already stored its level and role. */
  updateClassification: (result: ClassificationResult) => void;
}

const RiskAnalysisModal: React.FC<RiskAnalysisModalProps> = ({
  isOpen,
  setIsOpen,
  projectId,
  setAlert,
  updateClassification,
}) => {
  // Extract numeric ID for API calls (handles plugin-sourced IDs like "prefix-123")
  const numericProjectId = projectId.includes("-")
    ? parseInt(projectId.substring(projectId.lastIndexOf("-") + 1), 10) || 0
    : parseInt(projectId, 10) || 0;
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const STORAGE_KEY = `riskAnalysis_v2_${projectId}`;
  const fetchQuestionnaire = useFetchEuAiActQuestionnaire();

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setResult(null);
    setIsBusy(false);
    setLoadError(null);
    (async () => {
      try {
        const [definition, latest] = await Promise.all([
          fetchQuestionnaire(),
          getLatestUseCaseClassification(numericProjectId),
        ]);
        if (cancelled) return;
        setLoadError(null);
        setQuestionnaire(definition);
        let draft: Answers | null = null;
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          draft = saved ? (JSON.parse(saved) as Answers) : null;
        } catch {
          draft = null;
        }
        setAnswers(pruneHiddenAnswers(definition, draft ?? latest?.answers ?? {}));
      } catch {
        if (!cancelled) setLoadError("Could not load the questionnaire. Try again later.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, numericProjectId, STORAGE_KEY, fetchQuestionnaire]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  const changeAnswers = (next: Answers) => {
    setAnswers(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Draft persistence is a convenience only.
    }
  };

  const viewResults = async () => {
    setIsBusy(true);
    try {
      setResult(await scoreEuAiActAnswers(answers));
    } catch {
      setAlert({
        variant: "error",
        body: "Could not score the answers. Try again.",
        isToast: true,
        visible: true,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const save = async () => {
    setIsBusy(true);
    try {
      const saved = await saveUseCaseClassification(numericProjectId, answers);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      setAlert({ variant: "success", body: "Classification saved", isToast: true, visible: true });
      updateClassification(saved.result);
      setIsOpen(false);
    } catch (error) {
      // A 4xx carries a message the user can act on (e.g. the use case lacks the
      // EU AI Act framework); anything else gets the generic retry message.
      const isClientError =
        error instanceof CustomException &&
        error.status !== undefined &&
        error.status >= 400 &&
        error.status < 500;
      setAlert({
        variant: "error",
        body:
          isClientError && isActionableReason(error.message)
            ? error.message
            : "Could not save the classification. Try again.",
        isToast: true,
        visible: true,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const restart = () => {
    changeAnswers({});
    setResult(null);
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="EU AI Act risk classification"
      description="Determine your AI system's regulatory classification."
      maxWidth="900px"
      hideFooter
    >
      {loadError ? (
        <Alert variant="error" body={loadError} isToast={false} sx={{ position: "static" }} />
      ) : !questionnaire ? (
        <Box sx={{ display: "flex", justifyContent: "center", padding: "24px" }}>
          <CircularProgress size={24} />
        </Box>
      ) : result ? (
        <Result result={result} onRestart={restart} onSave={save} isSaving={isBusy} />
      ) : (
        <EuAiActQuestionnaire
          questionnaire={questionnaire}
          answers={answers}
          onAnswersChange={changeAnswers}
          onComplete={viewResults}
          completeLabel="View results"
          isCompleting={isBusy}
        />
      )}
    </StandardModal>
  );
};

export default RiskAnalysisModal;
