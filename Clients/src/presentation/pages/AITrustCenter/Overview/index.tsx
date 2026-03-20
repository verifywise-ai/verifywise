/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { Suspense } from "react";
import {
  Box,
  Typography,
  Stack,
  FormControlLabel,
  useTheme,
  CircularProgress,
  TextField,
} from "@mui/material";
import Alert from "../../../components/Alert";
import Toggle from "../../../components/Inputs/Toggle";
import ToggleCard from "../../../components/Inputs/ToggleCard";
import Checkbox from "../../../components/Inputs/Checkbox";
import { CustomizableButton } from "../../../components/button/customizable-button";
import {
  useAITrustCentreOverviewQuery,
  useAITrustCentreOverviewMutation,
} from "../../../../application/hooks/useAITrustCentreOverviewQuery";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { Save as SaveIcon } from "lucide-react";
import Field from "../../../components/Inputs/Field";

import {
  SectionPaper,
  PrivacyFields,
  styles,
  getFormControlLabelStyles,
} from "./styles";

import { COMPLIANCE_BADGES, SUCCESS_MESSAGE } from "./constants";

// Using standard TextField with theme styling for consistency

interface OverviewFormDataErrors {
  terms_text_error?: string;
  privacy_contact_error?: string;
  email_error?: string;
}

// Helper component for Section Header
const SectionHeader: React.FC<{
  title: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  label?: string;
}> = ({ title, checked, onToggle, label = "Enabled and visible" }) => {
  const theme = useTheme();
  const formControlLabelStyles = getFormControlLabelStyles(theme);

  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography sx={styles.sectionTitle}>{title}</Typography>
      <FormControlLabel
        control={
          <Toggle
            checked={checked}
            onChange={(_, checked) => onToggle(checked)}
          />
        }
        label={label}
        sx={formControlLabelStyles}
      />
    </Stack>
  );
};

// Helper component for Compliance Badge
const ComplianceBadge: React.FC<{
  badge: { key: string; label: string };
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
}> = ({ badge, checked, onChange, disabled }) => (
  <Checkbox
    id={`compliance-badge-${badge.key}`}
    label={badge.label}
    size="small"
    isChecked={checked}
    value={checked.toString()}
    onChange={(event) => onChange(event.target.checked)}
    isDisabled={disabled}
  />
);

const AITrustCenterOverview: React.FC = () => {
  const {
    data: formData,
    isLoading: loading,
    error,
  } = useAITrustCentreOverviewQuery();
  const updateOverviewMutation = useAITrustCentreOverviewMutation();

  // Local state for form data and notifications
  const [alert, setAlert] = React.useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [originalData, setOriginalData] = React.useState<any>(null);
  const [localFormData, setLocalFormData] = React.useState<any>(null);
  const [errors, setErrors] = React.useState<OverviewFormDataErrors>({});


  // Update local form data when query data changes
  React.useEffect(() => {
    if (formData) {
      setLocalFormData(formData);
      setOriginalData(formData);
    }
  }, [formData]);

  // Check for unsaved changes
  React.useEffect(() => {
    const hasChanges =
      JSON.stringify(localFormData) !== JSON.stringify(originalData);
    setHasUnsavedChanges(hasChanges);
  }, [localFormData, originalData]);

  // Generic handler for form field changes
  const handleFieldChange = (
    section: string,
    field: string,
    value: boolean | string,
    errorKey?: string // optional key for clearing error
  ) => {
    setLocalFormData((prev: any) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
     // Clear the corresponding error if provided
  if (errorKey) {
    setErrors((prev) => ({ ...prev, [errorKey]: "" }));
  }
  };

  // Helper function to safely get compliance badge value
  const getComplianceBadgeValue = (badgeKey: string): boolean => {
    if (!localFormData?.compliance_badges) return false;
    return (localFormData.compliance_badges[badgeKey] as boolean) || false;
  };

  const validateForm = (): boolean => {
    const newErrors: OverviewFormDataErrors = {};
  
    const { terms_and_contact } = localFormData;
    const minLength = 10;
  
    // --- Terms ---
    if (terms_and_contact.terms_visible) {
      if (!terms_and_contact.terms_text || terms_and_contact.terms_text.trim().length < minLength) {
        newErrors.terms_text_error = `Terms text must be at least ${minLength} characters long.`;
      }
    }
  
    // --- Privacy ---
    if (terms_and_contact.privacy_visible) {
      if (!terms_and_contact.privacy_text || terms_and_contact.privacy_text.trim().length < minLength) {
        newErrors.privacy_contact_error = `Privacy text must be at least ${minLength} characters long.`;
      }
    }
  
    // --- Email ---
    if (terms_and_contact.email_visible) {
      const email = terms_and_contact.email_text?.trim() || "";
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email) {
        newErrors.email_error = "Email is required.";
      } else if (!emailPattern.test(email)) {
        newErrors.email_error = "Email must be a valid email address.";
      }
    }
  
    setErrors(newErrors);
  
    // Return true if no errors
    return Object.keys(newErrors).length === 0;
  };
  

  // Handle save
  const handleSave = async () => {
    try {
    
      if(validateForm()){

      // Prepare the data to send, ensuring all sections are included
      const dataToSave = {
        intro: localFormData.intro,
        compliance_badges: localFormData.compliance_badges,
        company_description: localFormData.company_description,
        terms_and_contact: localFormData.terms_and_contact,
        info: localFormData.info,
      };

      // Call the updateOverview mutation
      await updateOverviewMutation.mutateAsync(dataToSave);

      // Update local state to reflect the saved data
      setOriginalData({ ...localFormData }); // Create a deep copy
      setHasUnsavedChanges(false);

      handleAlert({
        variant: "success",
        body: SUCCESS_MESSAGE,
        setAlert,
      });

        }
   } catch (error) {
      console.error("Save failed:", error);
    }
  };

  if (loading || !localFormData) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Suspense fallback={<div>Loading...</div>}>
          <Alert
            variant="error"
            body={error.message || "An error occurred"}
            isToast={true}
            onClick={() => {}}
          />
        </Suspense>
      )}

      {/* Introduction Section */}
      <SectionPaper
        sx={{ opacity: localFormData.info?.intro_visible ? 1 : 0.5 }}
      >
        <SectionHeader
          title="Introduction"
          checked={localFormData.info?.intro_visible || false}
          onToggle={(checked) =>
            handleFieldChange("info", "intro_visible", checked)
          }
        />
        <Box display="flex" flexWrap="wrap" gap={8} mt={2}>
          <ToggleCard
            label="Purpose of our trust center"
            checked={localFormData.intro?.purpose_visible || false}
            onToggle={(_, checked) =>
              handleFieldChange("intro", "purpose_visible", checked)
            }
            disabled={!localFormData.info?.intro_visible}
          >
            <TextField
              multiline
              minRows={3}
              maxRows={8}
              fullWidth
              placeholder="Include a section to summarize the purpose of the Trust Center. Clearly communicate the company's commitment to responsible AI use, data privacy, and ethical AI practices."
              value={localFormData.intro?.purpose_text || ""}
              onChange={(e) =>
                localFormData.info?.intro_visible &&
                localFormData.intro?.purpose_visible &&
                handleFieldChange("intro", "purpose_text", e.target.value)
              }
              disabled={
                !localFormData.info?.intro_visible ||
                !localFormData.intro?.purpose_visible
              }
              variant="standard"
              size="small"
              sx={{
                '& .MuiInput-underline:before': {
                  borderBottom: 'none',
                },
                '& .MuiInput-underline:after': {
                  borderBottom: 'none',
                },
                '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
                  borderBottom: 'none',
                },
                '& .MuiInputBase-input': {
                  fontSize: '13px',
                  outline: 'none',
                },
                '& .MuiInputBase-input:focus': {
                  outline: 'none',
                },
                '& .MuiInputBase-input:disabled': {
                  outline: 'none',
                },
              }}
            />
          </ToggleCard>
          <ToggleCard
            label="Our statement"
            checked={localFormData.intro?.our_statement_visible || false}
            onToggle={(_, checked) =>
              handleFieldChange("intro", "our_statement_visible", checked)
            }
            disabled={!localFormData.info?.intro_visible}
          >
            <TextField
              multiline
              minRows={3}
              maxRows={8}
              fullWidth
              placeholder="Provide a brief statement about the company's AI applications and their significance. Mention the main objectives, like data security, ethical AI, and trust-building with customers."
              value={localFormData.intro?.our_statement_text || ""}
              onChange={(e) =>
                localFormData.info?.intro_visible &&
                localFormData.intro?.our_statement_visible &&
                handleFieldChange("intro", "our_statement_text", e.target.value)
              }
              disabled={
                !localFormData.info?.intro_visible ||
                !localFormData.intro?.our_statement_visible
              }
              variant="standard"
              size="small"
              sx={{
                '& .MuiInput-underline:before': {
                  borderBottom: 'none',
                },
                '& .MuiInput-underline:after': {
                  borderBottom: 'none',
                },
                '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
                  borderBottom: 'none',
                },
                '& .MuiInputBase-input': {
                  fontSize: '13px',
                  outline: 'none',
                },
                '& .MuiInputBase-input:focus': {
                  outline: 'none',
                },
                '& .MuiInputBase-input:disabled': {
                  outline: 'none',
                },
              }}
            />
          </ToggleCard>
          <ToggleCard
            label="Our mission"
            checked={localFormData.intro?.our_mission_visible || false}
            onToggle={(_, checked) =>
              handleFieldChange("intro", "our_mission_visible", checked)
            }
            disabled={!localFormData.info?.intro_visible}
          >
            <TextField
              multiline
              minRows={3}
              maxRows={8}
              fullWidth
              placeholder="Input a mission statement reflecting your values related to AI governance and ethics."
              value={localFormData.intro?.our_mission_text || ""}
              onChange={(e) =>
                localFormData.info?.intro_visible &&
                localFormData.intro?.our_mission_visible &&
                handleFieldChange("intro", "our_mission_text", e.target.value)
              }
              disabled={
                !localFormData.info?.intro_visible ||
                !localFormData.intro?.our_mission_visible
              }
              variant="standard"
              size="small"
              sx={{
                '& .MuiInput-underline:before': {
                  borderBottom: 'none',
                },
                '& .MuiInput-underline:after': {
                  borderBottom: 'none',
                },
                '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
                  borderBottom: 'none',
                },
                '& .MuiInputBase-input': {
                  fontSize: '13px',
                  outline: 'none',
                },
                '& .MuiInputBase-input:focus': {
                  outline: 'none',
                },
                '& .MuiInputBase-input:disabled': {
                  outline: 'none',
                },
              }}
            />
          </ToggleCard>
        </Box>
      </SectionPaper>

      {/* Compliance Badges Section */}
      <SectionPaper
        sx={{
          opacity: localFormData.info?.compliance_badges_visible ? 1 : 0.5,
        }}
      >
        <SectionHeader
          title="Compliance and certification badges"
          checked={localFormData.info?.compliance_badges_visible || false}
          onToggle={(checked) =>
            handleFieldChange("info", "compliance_badges_visible", checked)
          }
        />
        <Typography sx={{ ...styles.sectionDescription, mb: 8 }}>
          Compliance badges for certifications and standards (e.g., EU AI Act,
          NIST, SOC2, ISO 27001, GDPR).
        </Typography>
        <Box
          display="flex"
          flexWrap="wrap"
          gap={12}
          mt={3}
          sx={{
            maxWidth: '100%',
            '& > *': {
              flex: '0 0 auto',
              minWidth: 'fit-content',
            }
          }}
        >
          {COMPLIANCE_BADGES.map((badge) => (
            <ComplianceBadge
              key={badge.key}
              badge={badge}
              checked={getComplianceBadgeValue(badge.key)}
              onChange={(checked) =>
                handleFieldChange("compliance_badges", badge.key, checked)
              }
              disabled={!localFormData.info?.compliance_badges_visible}
            />
          ))}
        </Box>
      </SectionPaper>

      {/* Company Info Section */}
      <SectionPaper
        sx={{
          opacity: localFormData.info?.company_description_visible ? 1 : 0.5,
        }}
      >
        <SectionHeader
          title="Company description and values"
          checked={localFormData.info?.company_description_visible || false}
          onToggle={(checked) =>
            handleFieldChange("info", "company_description_visible", checked)
          }
        />
        <Box display="flex" flexWrap="wrap" gap={8} mt={2}>
          <ToggleCard
            label="Background"
            checked={
              localFormData.company_description?.background_visible || false
            }
            onToggle={(_, checked) =>
              handleFieldChange(
                "company_description",
                "background_visible",
                checked
              )
            }
            disabled={!localFormData.info?.company_description_visible}
          >
            <TextField
              multiline
              minRows={3}
              maxRows={8}
              fullWidth
              placeholder="Explain your company, what you do, and why trust in AI is essential to you."
              value={localFormData.company_description?.background_text || ""}
              onChange={(e) =>
                localFormData.info?.company_description_visible &&
                localFormData.company_description?.background_visible &&
                handleFieldChange(
                  "company_description",
                  "background_text",
                  e.target.value
                )
              }
              disabled={
                !localFormData.info?.company_description_visible ||
                !localFormData.company_description?.background_visible
              }
              variant="standard"
              size="small"
              sx={{
                '& .MuiInput-underline:before': {
                  borderBottom: 'none',
                },
                '& .MuiInput-underline:after': {
                  borderBottom: 'none',
                },
                '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
                  borderBottom: 'none',
                },
                '& .MuiInputBase-input': {
                  fontSize: '13px',
                  outline: 'none',
                },
                '& .MuiInputBase-input:focus': {
                  outline: 'none',
                },
                '& .MuiInputBase-input:disabled': {
                  outline: 'none',
                },
              }}
            />
          </ToggleCard>
          <ToggleCard
            label="Core benefits"
            checked={
              localFormData.company_description?.core_benefits_visible || false
            }
            onToggle={(_, checked) =>
              handleFieldChange(
                "company_description",
                "core_benefits_visible",
                checked
              )
            }
            disabled={!localFormData.info?.company_description_visible}
          >
            <TextField
              multiline
              minRows={3}
              maxRows={8}
              fullWidth
              placeholder="Explain key benefits like efficiency, security, customer support, and ethical AI practices. You can also detail your AI offering functionality, use cases, and benefits to users."
              value={
                localFormData.company_description?.core_benefits_text || ""
              }
              onChange={(e) =>
                localFormData.info?.company_description_visible &&
                localFormData.company_description?.core_benefits_visible &&
                handleFieldChange(
                  "company_description",
                  "core_benefits_text",
                  e.target.value
                )
              }
              disabled={
                !localFormData.info?.company_description_visible ||
                !localFormData.company_description?.core_benefits_visible
              }
              variant="standard"
              size="small"
              sx={{
                '& .MuiInput-underline:before': {
                  borderBottom: 'none',
                },
                '& .MuiInput-underline:after': {
                  borderBottom: 'none',
                },
                '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
                  borderBottom: 'none',
                },
                '& .MuiInputBase-input': {
                  fontSize: '13px',
                  outline: 'none',
                },
                '& .MuiInputBase-input:focus': {
                  outline: 'none',
                },
                '& .MuiInputBase-input:disabled': {
                  outline: 'none',
                },
              }}
            />
          </ToggleCard>
          <ToggleCard
            label="Compliance documentation"
            checked={
              localFormData.company_description?.compliance_doc_visible || false
            }
            onToggle={(_, checked) =>
              handleFieldChange(
                "company_description",
                "compliance_doc_visible",
                checked
              )
            }
            disabled={!localFormData.info?.company_description_visible}
          >
            <TextField
              multiline
              minRows={3}
              maxRows={8}
              fullWidth
              value={
                localFormData.company_description?.compliance_doc_text || ""
              }
              onChange={(e) =>
                localFormData.info?.company_description_visible &&
                localFormData.company_description?.compliance_doc_visible &&
                handleFieldChange(
                  "company_description",
                  "compliance_doc_text",
                  e.target.value
                )
              }
              placeholder="Access our comprehensive compliance documentation and certifications."
              disabled={
                !localFormData.info?.company_description_visible ||
                !localFormData.company_description?.compliance_doc_visible
              }
              variant="standard"
              size="small"
              sx={{
                '& .MuiInput-underline:before': {
                  borderBottom: 'none',
                },
                '& .MuiInput-underline:after': {
                  borderBottom: 'none',
                },
                '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
                  borderBottom: 'none',
                },
                '& .MuiInputBase-input': {
                  fontSize: '13px',
                  outline: 'none',
                },
                '& .MuiInputBase-input:focus': {
                  outline: 'none',
                },
                '& .MuiInputBase-input:disabled': {
                  outline: 'none',
                },
              }}
            />
          </ToggleCard>
        </Box>
      </SectionPaper>

      {/* Privacy Policy Section */}
      <SectionPaper
        sx={{
          opacity: localFormData.info?.terms_and_contact_visible ? 1 : 0.5,
        }}
      >
        <SectionHeader
          title="Privacy policy, terms of service, and contact information"
          checked={localFormData.info?.terms_and_contact_visible || false}
          onToggle={(checked) =>
            handleFieldChange("info", "terms_and_contact_visible", checked)
          }
        />
        <Typography sx={styles.sectionDescription}>
          Include links to essential documents like the Privacy Policy and Terms
          of Service. Also include email address for privacy/security related
          questions and incidents.
        </Typography>
        <PrivacyFields>
          <Stack direction="column" spacing={3} sx={{ width: "100%", mt: 3 }}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={2}
              sx={{ width: "100%" }}
            >
              <Box sx={{ minWidth: "160px" }}>
                <Checkbox
                  id="terms-visible"
                  label="Terms of service"
                  isChecked={
                    localFormData.terms_and_contact?.terms_visible || false
                  }
                  value={
                    localFormData.terms_and_contact?.terms_visible ? "true" : "false"
                  }
                  onChange={(event) =>
                    handleFieldChange(
                      "terms_and_contact",
                      "terms_visible",
                      event.target.checked
                    )
                  }
                  isDisabled={!localFormData.info?.terms_and_contact_visible}
                />
              </Box>
              <Field
                id="terms-of-service-input"
                placeholder="Enter terms of service URL..."
                width={458}
                value={localFormData.terms_and_contact?.terms_text || ""}
                error={errors.terms_text_error}
                onChange={(e) =>
                  localFormData.info?.terms_and_contact_visible &&
                  handleFieldChange(
                    "terms_and_contact",
                    "terms_text",
                    e.target.value,
                    "terms_text_error"
                  )
                }
                disabled={
                  !localFormData.terms_and_contact?.terms_visible ||
                  !localFormData.info?.terms_and_contact_visible
                }
                sx={styles.privacyField}
              />
            </Stack>
            <Stack
              direction="row"
              alignItems="center"
              spacing={2}
              sx={{ width: "100%" }}
            >
              <Box sx={{ minWidth: "160px" }}>
                <Checkbox
                  id="privacy-visible"
                  label="Privacy policy"
                  isChecked={
                    localFormData.terms_and_contact?.privacy_visible || false
                  }
                  value={
                    localFormData.terms_and_contact?.privacy_visible ? "true" : "false"
                  }
                  onChange={(event) =>
                    handleFieldChange(
                      "terms_and_contact",
                      "privacy_visible",
                      event.target.checked
                    )
                  }
                  isDisabled={!localFormData.info?.terms_and_contact_visible}
                />
              </Box>
              <Field
                id="privacy-policy-input"
                placeholder="Enter privacy policy URL..."
                width={458}
                value={localFormData.terms_and_contact?.privacy_text || ""}
                error={errors.privacy_contact_error}
                onChange={(e) =>
                  localFormData.info?.terms_and_contact_visible &&
                  handleFieldChange(
                    "terms_and_contact",
                    "privacy_text",
                    e.target.value,
                    "privacy_contact_error"
                  )
                }
                disabled={
                  !localFormData.terms_and_contact?.privacy_visible ||
                  !localFormData.info?.terms_and_contact_visible
                }
                sx={styles.privacyField}
              />
            </Stack>
            <Stack
              direction="row"
              alignItems="center"
              spacing={2}
              sx={{ width: "100%" }}
            >
              <Box sx={{ minWidth: "160px" }}>
                <Checkbox
                  id="email-visible"
                  label="Company email"
                  isChecked={
                    localFormData.terms_and_contact?.email_visible || false
                  }
                  value={
                    localFormData.terms_and_contact?.email_visible ? "true" : "false"
                  }
                  onChange={(event) =>
                    handleFieldChange(
                      "terms_and_contact",
                      "email_visible",
                      event.target.checked
                    )
                  }
                  isDisabled={!localFormData.info?.terms_and_contact_visible}
                />
              </Box>
              <Field
                id="company-email-input"
                placeholder="Enter company email..."
                width={458}
                value={localFormData.terms_and_contact?.email_text || ""}
                error={errors.email_error}
                onChange={(e) =>
                  localFormData.info?.terms_and_contact_visible &&
                  handleFieldChange(
                    "terms_and_contact",
                    "email_text",
                    e.target.value,
                    "email_error"
                  )
                }
                disabled={
                  !localFormData.terms_and_contact?.email_visible ||
                  !localFormData.info?.terms_and_contact_visible
                }
                sx={styles.privacyField}
              />
            </Stack>
          </Stack>
        </PrivacyFields>
      </SectionPaper>

      {/* Save Button */}
      <Stack>
        <CustomizableButton
          sx={{
            ...styles.saveButton,
            backgroundColor: hasUnsavedChanges ? "brand.primary" : "#ccc",
            border: `1px solid ${hasUnsavedChanges ? "#13715B" : "#ccc"}`,
          }}
          icon={<SaveIcon size={16} />}
          variant="contained"
          onClick={handleSave}
          isDisabled={!hasUnsavedChanges}
          text="Save"
        />

      </Stack>

      {alert && (
        <Suspense fallback={<div>Loading...</div>}>
          <Alert
            variant={alert.variant}
            title={alert.title}
            body={alert.body}
            isToast={true}
            onClick={() => setAlert(null)}
          />
        </Suspense>
      )}
    </Box>
  );
};

export default AITrustCenterOverview;
