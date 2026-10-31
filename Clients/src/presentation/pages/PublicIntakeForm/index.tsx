import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { Box, Collapse, Typography, useMediaQuery } from "@mui/material";
import { Send, Loader2, Info, AlertCircle, Sparkles, ChevronDown } from "lucide-react";
import Field from "../../components/Inputs/Field";
import { CustomizableButton } from "../../components/button/customizable-button";
import { FormFieldRenderer, FormFieldHint, FieldLabel } from "./FormFieldRenderer";
import { CalculatedFieldDisplay } from "./CalculatedFieldDisplay";
import { LiveCheckHints, fieldToneFor } from "./LiveCheckHints";
import { IntakeAssistantPanel } from "./IntakeAssistantPanel";
import { VendorPrefillCard } from "./VendorPrefillCard";
import { TierSuggestionCard, type TierResponseState } from "./TierSuggestionCard";
import {
  postTierExplanation,
  postTierSuggestion,
  submitPublicFormWithTierResponse,
  type TierSuggestion,
} from "../../../application/repository/intakeTierSuggestion.repository";
import { PrefillLine } from "./PrefillLine";
import { PreviewBanner } from "./PreviewBanner";
import { PreviewSubmitMenu, TestSubmitPassed, type PreviewSubmitMode } from "./PreviewSubmitMenu";
import { PUBLIC_PREVIEW_PARAM } from "../../../application/utils/intakeRouting/previewRole";
import {
  cleanSubmission,
  evaluateForm,
  firstMissingVisibleInput,
  isEmptyAnswer,
  sortFields,
} from "../../../application/utils/intakeFormLogic";
import { useIntakeLiveChecks } from "../../../application/hooks/useIntakeLiveChecks";
import { getLanguage } from "../../../i18n/domTranslator";
import type { PrefillSubmitEntry, PrefillSuggestion } from "../../../domain/types/intakeLiveChecks";
import { MathCaptcha } from "./MathCaptcha";
import EuAiActQuestionnaire from "../../components/EuAiActQuestionnaire";
import { pruneHiddenAnswers } from "../../../application/utils/euAiActQuestionnaire";
import type { Answers, Questionnaire } from "../../../domain/types/euAiActClassification";
import {
  getPublicForm,
  getPublicFormById,
  submitPublicForm,
  submitPublicFormById,
  postPrefill,
  FormSchema,
  IntakeEntityType,
  type PublicFormRef,
} from "../../../application/repository/intakeForm.repository";
import { FormDesignSettings, DEFAULT_DESIGN_SETTINGS } from "../IntakeFormBuilder/types";
import { brand } from "../../themes/palette";

/**
 * Public form data structure
 */
interface PublicFormData {
  id: number;
  name: string;
  description: string;
  slug: string;
  entityType: IntakeEntityType;
  schema: FormSchema;
  submitButtonText: string;
  designSettings?: FormDesignSettings;
}

/** An answer filled from the vendor document, with the file it came from. */
interface PrefillEntry {
  suggestion: PrefillSuggestion;
  fileName: string;
  confirmed: boolean;
}

const NO_LIVE_CHECKS = { enabled: false, aiAvailable: false };
const EMPTY_SCHEMA: FormSchema = { version: "1.0", fields: [] };

/** A prefilled answer stays the document's only while the field still holds the suggested value. */
const stillPrefilled = (entry: PrefillEntry, value: unknown) =>
  typeof value === "string" && value.trim() === entry.suggestion.value.trim();

/**
 * Build a gradient from a hex color (darken by ~20% for the second stop)
 */
function buildGradient(hex: string): string {
  return `linear-gradient(135deg, ${hex} 0%, ${hex}dd 100%)`;
}

/**
 * Reusable gradient banner component with optional logo
 */
function GradientBanner({
  height = 160,
  colorTheme,
  logoSrc,
  children,
}: {
  height?: number;
  colorTheme?: string;
  logoSrc?: string | null;
  children?: React.ReactNode;
}) {
  const gradient = buildGradient(colorTheme || brand.primary);
  return (
    <Box
      sx={{
        background: gradient,
        minHeight: height,
        borderRadius: "12px 12px 0 0",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        px: "32px",
        pb: "24px",
        pt: logoSrc ? "24px" : "32px",
      }}
    >
      {logoSrc && (
        <Box
          sx={{
            width: 56,
            height: 56,
            backgroundColor: "background.main",
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            mb: "16px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
            flexShrink: 0,
          }}
        >
          <Box
            component="img"
            src={logoSrc}
            alt="Organization logo"
            sx={{
              maxWidth: 40,
              maxHeight: 40,
              objectFit: "contain",
            }}
          />
        </Box>
      )}
      {children}
    </Box>
  );
}

/**
 * Powered-by footer
 */
function PoweredByFooter() {
  return (
    <Typography
      sx={{
        textAlign: "center",
        color: "#b0b8c4",
        fontSize: "12px",
        mt: 4,
        pb: 4,
      }}
    >
      Powered by VerifyWise
    </Typography>
  );
}

/**
 * Public intake form page - accessible without authentication
 */
export function PublicIntakeForm() {
  const { tenantSlug, formSlug, publicId } = useParams<{
    publicId?: string;
    tenantSlug?: string;
    formSlug?: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const resubmissionToken = searchParams.get("token") || undefined;
  // A builder's preview adds a notice and asks, on Submit, whether to test
  // (check the answers, send nothing) or submit for real. It unlocks nothing.
  const isPreview = searchParams.get(PUBLIC_PREVIEW_PARAM) === "1";
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const showPreviewBanner = isPreview && !previewDismissed;
  const [submitMenuAnchor, setSubmitMenuAnchor] = useState<HTMLElement | null>(null);
  const [testSubmitPassed, setTestSubmitPassed] = useState(false);

  // State
  const [formData, setFormData] = useState<PublicFormData | null>(null);
  const [organizationLogo, setOrganizationLogo] = useState<string | null>(null);
  const [previousData, setPreviousData] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaValue, setCaptchaValue] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [captchaRefreshTrigger, setCaptchaRefreshTrigger] = useState(0);
  const [riskStep, setRiskStep] = useState<{ questionnaire: Questionnaire } | null>(null);
  const [riskAnswers, setRiskAnswers] = useState<Answers>({});
  const [step, setStep] = useState<"risk" | "form">("form");
  // The risk level suggested from the risk step answers, and the applicant's response (#5190).
  const [tierSuggestion, setTierSuggestion] = useState<TierSuggestion | null>(null);
  const [tierLoading, setTierLoading] = useState(false);
  const [tierResponse, setTierResponse] = useState<TierResponseState>({
    choice: null,
    context: "",
  });
  const [liveChecks, setLiveChecks] = useState(NO_LIVE_CHECKS);
  const [prefill, setPrefill] = useState<Record<string, PrefillEntry>>({});
  const wideScreen = useMediaQuery("(min-width:1100px)");

  // Form state
  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    unregister,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    defaultValues: {},
  });

  // Show/hide rules and calculated values, recomputed on every change.
  const watchedValues = watch();
  const evaluation = formData ? evaluateForm(formData.schema, watchedValues) : null;

  const formRef = useMemo<PublicFormRef>(
    () => (publicId ? { publicId } : { tenantSlug: tenantSlug ?? "", formSlug: formSlug ?? "" }),
    [publicId, tenantSlug, formSlug],
  );
  // Checks run on the form step only; the EU AI Act risk step is unchanged.
  const checksOn = Boolean(formData) && liveChecks.enabled && step === "form";
  const aiOn = checksOn && liveChecks.aiAvailable;

  // Suggest a risk level once the risk step is done, from the answers it will
  // submit. A changed level asks the applicant again; a failure shows nothing.
  const prunedRiskAnswers = useMemo(
    () => (riskStep ? pruneHiddenAnswers(riskStep.questionnaire, riskAnswers) : null),
    [riskStep, riskAnswers],
  );
  const riskAnswersKey = prunedRiskAnswers ? JSON.stringify(prunedRiskAnswers) : "";
  useEffect(() => {
    if (!prunedRiskAnswers || step !== "form") return;
    const controller = new AbortController();
    setTierLoading(true);
    postTierSuggestion(formRef, prunedRiskAnswers, controller.signal)
      .then((suggestion) => {
        setTierSuggestion((prev) => {
          if (prev?.level !== suggestion.level) setTierResponse({ choice: null, context: "" });
          return suggestion;
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setTierSuggestion(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setTierLoading(false);
      });
    return () => controller.abort();
    // riskAnswersKey stands for prunedRiskAnswers' content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riskAnswersKey, step, formRef]);
  const { hints, hintsFor, staleQuestionIds, aiPaused, checkWithAi, aiCheck } = useIntakeLiveChecks(
    {
      ref: formRef,
      schema: formData?.schema ?? EMPTY_SCHEMA,
      values: watchedValues,
      enabled: checksOn,
      aiAvailable: liveChecks.aiAvailable,
    },
  );

  // Editing a prefilled answer makes it the submitter's own: drop its line.
  const editedPrefillKey = Object.entries(prefill)
    .filter(([id, entry]) => !stillPrefilled(entry, watchedValues[id]))
    .map(([id]) => id)
    .join("|");
  useEffect(() => {
    if (!editedPrefillKey) return;
    const edited = new Set(editedPrefillKey.split("|"));
    setPrefill((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => !edited.has(id))),
    );
  }, [editedPrefillKey]);

  const unconfirmedCount = Object.values(prefill).filter((entry) => !entry.confirmed).length;

  const handlePrefillUpload = async (file: File): Promise<number> => {
    if (!formData) return 0;
    const result = await postPrefill(formRef, file, getValues(), getLanguage());
    const current = getValues();
    const added: Record<string, PrefillEntry> = {};
    for (const suggestion of result.suggestions) {
      // A suggestion never overwrites an answer the submitter already gave.
      if (!isEmptyAnswer(current[suggestion.questionId])) continue;
      setValue(suggestion.questionId, suggestion.value, { shouldDirty: true });
      added[suggestion.questionId] = { suggestion, fileName: result.fileName, confirmed: false };
    }
    setPrefill((existing) => ({ ...existing, ...added }));
    return Object.keys(added).length;
  };

  const focusQuestion = (questionId: string) => {
    const container = document.getElementById(`question-${questionId}`);
    container?.scrollIntoView({ behavior: "smooth", block: "center" });
    const control =
      document.getElementById(`field-${questionId}`) ??
      container?.querySelector<HTMLElement>("input, textarea, [role='combobox']");
    control?.focus({ preventScroll: true });
  };
  const hiddenFieldKey = formData
    ? formData.schema.fields
        .filter((field) => !evaluation?.visibleIds.has(field.id))
        .map((field) => field.id)
        .join("|")
    : "";

  // Fields present when the form step first renders appear at once; only
  // fields a rule reveals later animate in. Re-armed each time the form step
  // is entered (it follows the EU AI Act risk step when that is on).
  const [fieldsShown, setFieldsShown] = useState(false);
  useEffect(() => {
    setFieldsShown(Boolean(formData) && step === "form");
  }, [formData, step]);

  // A hidden field must not block submit: drop its validation but keep the
  // typed value, so showing it again restores the answer.
  useEffect(() => {
    if (!hiddenFieldKey) return;
    for (const id of hiddenFieldKey.split("|")) {
      unregister(id, { keepValue: true, keepDefaultValue: true });
    }
  }, [hiddenFieldKey, unregister]);

  // Submitter info
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const loadForm = useCallback(async () => {
    const isNewFormat = !!publicId;
    const isLegacyFormat = !!tenantSlug && !!formSlug;
    if (!isNewFormat && !isLegacyFormat) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = isNewFormat
        ? await getPublicFormById(publicId!, resubmissionToken)
        : await getPublicForm(tenantSlug!, formSlug!, resubmissionToken);
      if (response.data) {
        setFormData(response.data.form as PublicFormData);
        setLiveChecks(response.data.liveChecks ?? NO_LIVE_CHECKS);
        const definition = response.data.euAiActRiskStep ?? null;
        setRiskStep(definition);
        setStep(definition ? "risk" : "form");
        if (definition && response.data.previousRiskAnswers) {
          setRiskAnswers(
            pruneHiddenAnswers(definition.questionnaire, response.data.previousRiskAnswers),
          );
        }
        if (response.data.organizationLogo) {
          setOrganizationLogo(response.data.organizationLogo);
        }
        if (response.data.previousData) {
          setPreviousData(response.data.previousData);
          // Pre-fill form with previous data
          reset(response.data.previousData);
          // Pre-fill submitter info for resubmissions
          if (response.data.previousSubmitterName) {
            setSubmitterName(response.data.previousSubmitterName);
          }
          if (response.data.previousSubmitterEmail) {
            setSubmitterEmail(response.data.previousSubmitterEmail);
          }
        }
      }
    } catch (err: unknown) {
      console.error("Failed to load form:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      if (errorMessage.includes("404") || errorMessage.includes("not found")) {
        setError("This form is no longer available or has expired.");
      } else if (errorMessage.includes("expired")) {
        setError("This form has expired and is no longer accepting submissions.");
      } else {
        setError("Failed to load form. Please try again later.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [publicId, tenantSlug, formSlug, resubmissionToken, reset]);

  // Load form
  useEffect(() => {
    if (publicId || (tenantSlug && formSlug)) {
      loadForm();
    }
  }, [publicId, tenantSlug, formSlug, loadForm]);

  const handleCaptchaChange = (value: string, token: string) => {
    setCaptchaValue(value);
    setCaptchaToken(token);
    setCaptchaError(null);
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const onSubmit = async (data: Record<string, unknown>, mode: PreviewSubmitMode = "real") => {
    if (!formData) return;
    setTestSubmitPassed(false);
    const isNewFormat = !!publicId;
    if (!isNewFormat && (!tenantSlug || !formSlug)) return;

    // Validate email (only when contact info is collected)
    if (collectContactInfo) {
      if (!submitterEmail.trim()) {
        setEmailError("Email is required");
        return;
      }
      if (!validateEmail(submitterEmail)) {
        setEmailError("Please enter a valid email address");
        return;
      }
    }
    setEmailError(null);

    // Validate captcha
    const captchaNum = Number(captchaValue.trim());
    if (!captchaValue.trim() || isNaN(captchaNum)) {
      setCaptchaError("Please enter a valid number");
      return;
    }

    // Every check above has passed; a test stops here and sends nothing.
    if (mode === "test") {
      setTestSubmitPassed(true);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Only answers that still hold the document's value carry its provenance.
      const prefillPayload: Record<string, PrefillSubmitEntry> = {};
      for (const [id, entry] of Object.entries(prefill)) {
        if (stillPrefilled(entry, data[id])) {
          prefillPayload[id] = { token: entry.suggestion.token, confirmed: entry.confirmed };
        }
      }
      const payload = {
        formData: cleanSubmission(formData.schema, data).data,
        ...(Object.keys(prefillPayload).length > 0 ? { prefill: prefillPayload } : {}),
        submitterEmail: collectContactInfo ? submitterEmail || "" : "",
        submitterName: collectContactInfo ? submitterName || undefined : undefined,
        captchaToken,
        captchaAnswer: captchaNum,
        resubmissionToken,
        ...(riskStep
          ? { euAiActRiskAnswers: pruneHiddenAnswers(riskStep.questionnaire, riskAnswers) }
          : {}),
      };

      // With a response to the suggested level, submit through v1, which stores it.
      const response =
        tierSuggestion && tierResponse.choice
          ? await submitPublicFormWithTierResponse(formRef, {
              ...payload,
              tierSuggestionResponse: {
                accepted: tierResponse.choice === "accept",
                ...(tierResponse.choice === "context" && tierResponse.context.trim()
                  ? { context: tierResponse.context.trim() }
                  : {}),
              },
            })
          : isNewFormat
            ? await submitPublicFormById(publicId!, payload)
            : await submitPublicForm(tenantSlug!, formSlug!, payload);

      if (response.data) {
        const successPath = isNewFormat
          ? `/${publicId}/use-case-form-intake/success`
          : `/intake/${tenantSlug}/${formSlug}/success`;

        navigate(successPath, {
          state: {
            submissionId: response.data.submissionId,
            resubmissionToken: response.data.resubmissionToken,
            formName: formData.name,
            submitterEmail: collectContactInfo ? submitterEmail : undefined,
          },
        });
      }
    } catch (err: unknown) {
      console.error("Failed to submit form:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      // apiServices throws CustomException: status on the error, the server envelope
      // ({ message, data: { message, errors } }) on `response`.
      const status = (err as { status?: number })?.status;
      const detail = (err as { response?: { data?: { message?: string; step?: string } } })
        ?.response?.data;
      if (riskStep && status === 400 && detail?.step === "eu_ai_act_risk") {
        // The server rejected the risk answers: send the submitter back to that step.
        setError(detail.message || "Please review your risk classification answers.");
        setStep("risk");
        setCaptchaValue("");
        setCaptchaRefreshTrigger((prev) => prev + 1);
      } else if (errorMessage.includes("captcha") || errorMessage.includes("incorrect")) {
        setCaptchaError("Incorrect answer. Please try again.");
        setCaptchaValue("");
        setCaptchaRefreshTrigger((prev) => prev + 1);
      } else if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
        setError("Too many submissions. Please try again later.");
      } else {
        setError("Failed to submit form. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Box
        component="main"
        aria-busy="true"
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fafafa",
        }}
      >
        <Typography
          component="h1"
          sx={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
          }}
        >
          Loading...
        </Typography>
        <Loader2 size={32} color={brand.primary} style={{ animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </Box>
    );
  }

  // Error state
  if (error && !formData) {
    return (
      <Box
        component="main"
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fafafa",
          p: 3,
        }}
      >
        <Box
          sx={{
            p: 4,
            maxWidth: 500,
            textAlign: "center",
            borderRadius: "12px",
            backgroundColor: "background.main",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <Typography
            component="h1"
            sx={{ fontWeight: 600, color: "#1e293b", fontSize: "18px", mb: 2 }}
          >
            Form unavailable
          </Typography>
          <Typography sx={{ color: "#64748b", fontSize: "14px" }}>{error}</Typography>
        </Box>
      </Box>
    );
  }

  if (!formData) {
    return null;
  }

  // Form order. Rules and formulas are settled in dependency order (evaluateForm).
  const sortedFields = sortFields(formData.schema.fields);

  // Resolve design settings; a key missing from the saved settings takes its default.
  const ds = { ...DEFAULT_DESIGN_SETTINGS, ...formData.designSettings };
  const collectContactInfo = true;
  const maxWidth = ds.format === "wide" ? 820 : 620;
  const formMargin =
    ds.alignment === "left"
      ? { ml: 0, mr: "auto" }
      : ds.alignment === "right"
        ? { ml: "auto", mr: 0 }
        : { mx: "auto" };

  const labelById = new Map(formData.schema.fields.map((field) => [field.id, field.label]));
  const assistantPanel = checksOn ? (
    <IntakeAssistantPanel
      hints={hints}
      unconfirmedCount={unconfirmedCount}
      aiPaused={aiOn && aiPaused}
      ai={aiOn ? { ...aiCheck, onCheck: checkWithAi } : undefined}
      questionLabel={(id) => labelById.get(id) ?? ""}
      onSelect={focusQuestion}
    />
  ) : null;
  // Beside the questions on wide screens; above the submit button otherwise.
  const panelBeside = Boolean(assistantPanel) && wideScreen;
  const PANEL_WIDTH = 280;
  const PANEL_GAP = 24;

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        backgroundColor: ds.backgroundColor,
        pt: "64px",
        pb: { xs: 3, sm: 5 },
        px: { xs: 2, sm: 8 },
        fontFamily: `'${ds.fontFamily}', sans-serif`,
      }}
    >
      <Box
        sx={{
          maxWidth: panelBeside ? maxWidth + PANEL_WIDTH + PANEL_GAP : maxWidth,
          ...formMargin,
        }}
      >
        {showPreviewBanner && <PreviewBanner onDismiss={() => setPreviewDismissed(true)} />}
        <Box sx={{ display: "flex", gap: `${PANEL_GAP}px`, alignItems: "flex-start" }}>
          {/* Card with banner + form body */}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              borderRadius: "12px",
              overflow: "hidden",
              backgroundColor: "background.main",
              border: "1px solid #d0d5dd",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            {/* Banner */}
            <GradientBanner height={160} colorTheme={ds.colorTheme} logoSrc={organizationLogo}>
              <Typography
                component="h1"
                sx={{
                  color: "background.main",
                  fontSize: "28px",
                  fontWeight: 700,
                  lineHeight: 1.2,
                }}
              >
                {formData.name}
              </Typography>
              {formData.description && (
                <Typography
                  sx={{
                    color: "rgba(255, 255, 255, 0.85)",
                    fontSize: "15px",
                    lineHeight: 1.6,
                    mt: "8px",
                  }}
                >
                  {formData.description}
                </Typography>
              )}
            </GradientBanner>

            {/* Risk classification step */}
            {riskStep && step === "risk" && (
              <Box sx={{ p: "32px" }}>
                <Typography
                  component="h2"
                  sx={{ fontWeight: 600, color: "#1e293b", mb: "8px", fontSize: "16px" }}
                >
                  Risk classification
                </Typography>
                <Typography sx={{ fontSize: "13px", color: "#475569", mb: "24px" }}>
                  Answer these questions about the AI system first. They follow the EU AI Act.
                </Typography>
                {error && (
                  <Box
                    sx={{
                      mb: "24px",
                      p: "12px 16px",
                      fontSize: "13px",
                      borderRadius: "8px",
                      border: "1px solid #fecaca",
                      backgroundColor: "#fef2f2",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
                    <Typography sx={{ fontSize: "13px", color: "#991b1b" }}>{error}</Typography>
                  </Box>
                )}
                <EuAiActQuestionnaire
                  questionnaire={riskStep.questionnaire}
                  answers={riskAnswers}
                  onAnswersChange={setRiskAnswers}
                  onComplete={() => {
                    setError(null);
                    setStep("form");
                  }}
                  completeLabel="Continue"
                />
              </Box>
            )}

            {/* Form body */}
            {(!riskStep || step === "form") && (
              <Box
                component="form"
                // In a preview, Submit (and Enter, which clicks it) opens the
                // test / real menu instead; a stray submit there only tests.
                onSubmit={handleSubmit((data) => onSubmit(data, isPreview ? "test" : "real"))}
                onChange={() => setTestSubmitPassed(false)}
                sx={{ p: "32px" }}
              >
                {/* Back to the risk step */}
                {riskStep && (
                  <Box sx={{ mb: "16px" }}>
                    <CustomizableButton
                      variant="text"
                      text="Back to risk classification"
                      onClick={() => setStep("risk")}
                    />
                  </Box>
                )}

                {riskStep && (
                  <TierSuggestionCard
                    suggestion={tierSuggestion}
                    loading={tierLoading}
                    aiAvailable={Boolean(formData) && liveChecks.enabled && liveChecks.aiAvailable}
                    onExplain={() =>
                      postTierExplanation(formRef, prunedRiskAnswers ?? {}, getLanguage())
                    }
                    response={tierResponse}
                    onResponseChange={setTierResponse}
                  />
                )}

                {/* Answers leave the page before submit when AI checks are on: say so. */}
                {aiOn && (
                  <Box
                    data-testid="live-checks-ai-notice"
                    sx={{ mb: "24px", display: "flex", alignItems: "center", gap: "8px" }}
                  >
                    <Sparkles size={14} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                    <Typography sx={{ fontSize: "13px", color: "text.secondary" }}>
                      AI can point out vague or conflicting answers when you select Check my
                      answers. Your answers go to AI only when you ask.
                    </Typography>
                  </Box>
                )}

                {/* Resubmission alert */}
                {previousData && (
                  <Box
                    sx={{
                      mb: 3,
                      p: "12px 16px",
                      fontSize: "13px",
                      borderRadius: "8px",
                      border: "1px solid #bfdbfe",
                      backgroundColor: "#eff6ff",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <Info size={18} color="#3b82f6" style={{ flexShrink: 0 }} />
                    <Typography sx={{ fontSize: "13px", color: "#1e40af" }}>
                      Your previous submission data has been pre-filled. You can update and
                      resubmit.
                    </Typography>
                  </Box>
                )}

                {/* Error alert */}
                {error && (
                  <Box
                    sx={{
                      mb: 3,
                      p: "12px 16px",
                      fontSize: "13px",
                      borderRadius: "8px",
                      border: "1px solid #fecaca",
                      backgroundColor: "#fef2f2",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
                    <Typography sx={{ fontSize: "13px", color: "#991b1b" }}>{error}</Typography>
                  </Box>
                )}

                {/* Contact info section */}
                {collectContactInfo && (
                  <>
                    <Typography
                      component="h2"
                      sx={{
                        fontWeight: 600,
                        color: "#1e293b",
                        mb: 2,
                        fontSize: "16px",
                      }}
                    >
                      Your contact information
                    </Typography>
                    {/* Laid out like the question fields below: label, input, hint. */}
                    <Box sx={{ display: "flex", flexDirection: "column", gap: "24px", mb: 3 }}>
                      <Box>
                        <FieldLabel label="Name" htmlFor="submitter-name" />
                        <Field
                          id="submitter-name"
                          placeholder="Your name"
                          value={submitterName}
                          onChange={(e) => setSubmitterName(e.target.value)}
                        />
                      </Box>
                      <Box>
                        <FieldLabel label="Email" required htmlFor="submitter-email" />
                        <Field
                          id="submitter-email"
                          type="email"
                          value={submitterEmail}
                          onChange={(e) => {
                            setSubmitterEmail(e.target.value);
                            setEmailError(null);
                          }}
                          error={emailError || undefined}
                        />
                        <FormFieldHint text="We'll send you updates about your submission" />
                      </Box>
                    </Box>

                    <Box sx={{ my: 4, borderTop: "1px solid #e2e8f0" }} />
                  </>
                )}

                {aiOn && <VendorPrefillCard onUpload={handlePrefillUpload} />}

                {/* Form fields */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                  {sortedFields.map((field) => {
                    // A hidden field unmounts at once (react-hook-form re-registers a
                    // mounted Controller with its rules on every render, so an exit
                    // animation would keep a hidden required field blocking submit);
                    // only showing a field is animated.
                    if (evaluation && !evaluation.visibleIds.has(field.id)) return null;
                    const fieldHints = checksOn ? hintsFor(field.id) : [];
                    const prefillEntry = prefill[field.id];
                    return (
                      <Collapse
                        key={field.id}
                        id={`question-${field.id}`}
                        in
                        appear={fieldsShown}
                        timeout={150}
                      >
                        {field.type === "calculated" ? (
                          <CalculatedFieldDisplay
                            field={field}
                            value={evaluation?.calculated[field.id] ?? null}
                            missingLabel={
                              evaluation
                                ? firstMissingVisibleInput(formData.schema, evaluation, field.id)
                                : null
                            }
                          />
                        ) : (
                          <>
                            <FormFieldRenderer
                              field={field}
                              control={control}
                              errors={errors}
                              tone={fieldToneFor(fieldHints)}
                            />
                            {prefillEntry &&
                              stillPrefilled(prefillEntry, watchedValues[field.id]) && (
                                <PrefillLine
                                  suggestion={prefillEntry.suggestion}
                                  fileName={prefillEntry.fileName}
                                  confirmed={prefillEntry.confirmed}
                                  onConfirm={() =>
                                    setPrefill((current) => ({
                                      ...current,
                                      [field.id]: { ...prefillEntry, confirmed: true },
                                    }))
                                  }
                                />
                              )}
                            <LiveCheckHints
                              hints={fieldHints}
                              staleQuestionIds={staleQuestionIds}
                            />
                          </>
                        )}
                      </Collapse>
                    );
                  })}
                </Box>

                {/* Captcha */}
                <Box sx={{ mt: "32px", mb: "32px" }}>
                  <MathCaptcha
                    value={captchaValue}
                    onChange={handleCaptchaChange}
                    error={captchaError || undefined}
                    refreshTrigger={captchaRefreshTrigger}
                  />
                </Box>

                {assistantPanel && !panelBeside && <Box sx={{ mb: "24px" }}>{assistantPanel}</Box>}

                {testSubmitPassed && <TestSubmitPassed />}

                {/* Submit button. In a preview it opens the test / real choice. */}
                <CustomizableButton
                  type="submit"
                  onClick={
                    isPreview
                      ? (event) => {
                          event.preventDefault();
                          setTestSubmitPassed(false);
                          setSubmitMenuAnchor(event.currentTarget);
                        }
                      : undefined
                  }
                  endIcon={isPreview ? <ChevronDown size={16} /> : undefined}
                  testId="public-form-submit"
                  variant="contained"
                  isDisabled={isSubmitting}
                  startIcon={
                    isSubmitting ? (
                      <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                    ) : (
                      <Send size={16} />
                    )
                  }
                  text={isSubmitting ? "Submitting..." : formData.submitButtonText}
                  sx={{
                    "width": "100%",
                    "height": 48,
                    "backgroundColor": ds.colorTheme,
                    "fontSize": "15px",
                    "fontWeight": 600,
                    "borderRadius": "8px",
                    "textTransform": "none",
                    "boxShadow": "none",
                    "&:hover": {
                      backgroundColor: `${ds.colorTheme}dd`,
                      boxShadow: `0 2px 8px ${ds.colorTheme}40`,
                    },
                    "&:disabled": {
                      backgroundColor: "#cbd5e1",
                      color: "background.main",
                    },
                    "& .MuiButton-startIcon": {
                      marginRight: "8px",
                    },
                  }}
                />
                {isPreview && (
                  <PreviewSubmitMenu
                    anchor={submitMenuAnchor}
                    onClose={() => setSubmitMenuAnchor(null)}
                    onChoose={(mode) => {
                      setSubmitMenuAnchor(null);
                      void handleSubmit((data) => onSubmit(data, mode))();
                    }}
                  />
                )}
              </Box>
            )}
          </Box>
          {panelBeside && (
            <Box sx={{ width: PANEL_WIDTH, flexShrink: 0, position: "sticky", top: "24px" }}>
              {assistantPanel}
            </Box>
          )}
        </Box>

        <PoweredByFooter />
      </Box>
    </Box>
  );
}

export default PublicIntakeForm;
