import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { Box, Typography } from "@mui/material";
import { Send, Loader2, Info, AlertCircle } from "lucide-react";
import Field from "../../components/Inputs/Field";
import { CustomizableButton } from "../../components/button/customizable-button";
import { FormFieldRenderer } from "./FormFieldRenderer";
import { MathCaptcha } from "./MathCaptcha";
import {
  getPublicForm,
  getPublicFormById,
  submitPublicForm,
  submitPublicFormById,
  FormSchema,
  IntakeEntityType,
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

  // Form state
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    defaultValues: {},
  });

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

  const onSubmit = async (data: Record<string, unknown>) => {
    if (!formData) return;
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

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        formData: data,
        submitterEmail: collectContactInfo ? submitterEmail || "" : "",
        submitterName: collectContactInfo ? submitterName || undefined : undefined,
        captchaToken,
        captchaAnswer: captchaNum,
        resubmissionToken,
      };

      const response = isNewFormat
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
      if (errorMessage.includes("captcha") || errorMessage.includes("incorrect")) {
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
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fafafa",
        }}
      >
        <Loader2 size={32} color={brand.primary} style={{ animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </Box>
    );
  }

  // Error state
  if (error && !formData) {
    return (
      <Box
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
          <Typography sx={{ fontWeight: 600, color: "#1e293b", fontSize: "18px", mb: 2 }}>
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

  const sortedFields = [...formData.schema.fields].sort((a, b) => a.order - b.order);

  // Resolve design settings
  const ds = formData.designSettings ?? DEFAULT_DESIGN_SETTINGS;
  const collectContactInfo = true;
  const maxWidth = ds.format === "wide" ? 820 : 620;
  const formMargin =
    ds.alignment === "left"
      ? { ml: 0, mr: "auto" }
      : ds.alignment === "right"
        ? { ml: "auto", mr: 0 }
        : { mx: "auto" };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: ds.backgroundColor,
        pt: "64px",
        pb: { xs: 3, sm: 5 },
        px: { xs: 2, sm: 8 },
        fontFamily: `'${ds.fontFamily}', sans-serif`,
      }}
    >
      <Box sx={{ maxWidth, ...formMargin }}>
        {/* Card with banner + form body */}
        <Box
          sx={{
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

          {/* Form body */}
          <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ p: "32px" }}>
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
                  Your previous submission data has been pre-filled. You can update and resubmit.
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
                  sx={{
                    fontWeight: 600,
                    color: "#1e293b",
                    mb: 2,
                    fontSize: "16px",
                  }}
                >
                  Your contact information
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: "20px", mb: 3 }}>
                  <Field
                    id="submitter-name"
                    label="Name"
                    placeholder="Your name"
                    value={submitterName}
                    onChange={(e) => setSubmitterName(e.target.value)}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: "8px",
                        fontSize: "15px",
                        "& fieldset": { borderColor: "#e2e8f0" },
                        "&:hover fieldset": { borderColor: "#cbd5e1" },
                        "&.Mui-focused fieldset": { borderColor: ds.colorTheme },
                      },
                      "& .MuiOutlinedInput-input": {
                        padding: "12px 14px",
                      },
                    }}
                  />
                  <Field
                    id="submitter-email"
                    label="Email"
                    type="email"
                    value={submitterEmail}
                    onChange={(e) => {
                      setSubmitterEmail(e.target.value);
                      setEmailError(null);
                    }}
                    error={emailError || undefined}
                    helperText={emailError || "We'll send you updates about your submission"}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: "8px",
                        fontSize: "15px",
                        "& fieldset": { borderColor: "#e2e8f0" },
                        "&:hover fieldset": { borderColor: "#cbd5e1" },
                        "&.Mui-focused fieldset": { borderColor: ds.colorTheme },
                      },
                      "& .MuiOutlinedInput-input": {
                        padding: "12px 14px",
                      },
                    }}
                  />
                </Box>

                <Box sx={{ my: 4, borderTop: "1px solid #e2e8f0" }} />
              </>
            )}

            {/* Form fields */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {sortedFields.map((field) => (
                <FormFieldRenderer key={field.id} field={field} control={control} errors={errors} />
              ))}
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

            {/* Submit button */}
            <CustomizableButton
              type="submit"
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
                width: "100%",
                height: 48,
                backgroundColor: ds.colorTheme,
                fontSize: "15px",
                fontWeight: 600,
                borderRadius: "8px",
                textTransform: "none",
                boxShadow: "none",
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
          </Box>
        </Box>

        <PoweredByFooter />
      </Box>
    </Box>
  );
}

export default PublicIntakeForm;
