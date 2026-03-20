import {
  Stack,
  useTheme,
  Box,
  CircularProgress,
  Typography,
  Button as MUIButton,
} from "@mui/material";
import Field from "../../../components/Inputs/Field";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { Save as SaveIcon } from "lucide-react";
import { useState, useCallback, ChangeEvent, useEffect, useRef } from "react";
import {
  CreateMyOrganization,
  GetMyOrganization,
  UpdateMyOrganization,
} from "../../../../application/repository/organization.repository";
import Alert from "../../../components/Alert";
import allowedRoles from "../../../../application/constants/permissions";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import {
  uploadAITrustCentreLogo,
  deleteAITrustCentreLogo,
} from "../../../../application/repository/aiTrustCentre.repository";
import { extractUserToken } from "../../../../application/tools/extractToken";
import { getAuthToken } from "../../../../application/redux/auth/getAuthToken";
import { useAuth } from "../../../../application/hooks/useAuth";
import { useLogoFetch } from "../../../../application/hooks/useLogoFetch";
import { OrganizationModel } from "../../../../domain/models/Common/organization/organization.model";

interface AlertState {
  variant: "success" | "info" | "warning" | "error";
  title?: string;
  body: string;
  isToast?: boolean;
}

const Organization = () => {
  const { userRoleName, organizationId } = useAuth();
  const { fetchLogoAsBlobUrl } = useLogoFetch();
  const isEditingDisabled =
    !allowedRoles.organizations.edit.includes(userRoleName);
  const isCreatingDisabled =
    !allowedRoles.organizations.create.includes(userRoleName);

  // Organization states
  const [isSaveDisabled, setIsSaveDisabled] = useState(true);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationNameError, setOrganizationNameError] = useState<
    string | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [organizationExists, setOrganizationExists] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Logo states
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);
  const [logoRemoving, setLogoRemoving] = useState(false);
  const [isRemoveLogoModalOpen, setIsRemoveLogoModalOpen] = useState(false);
  const [selectedLogoPreview, setSelectedLogoPreview] = useState<string | null>(
    null
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoLoadError, setLogoLoadError] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const theme = useTheme();
  const [alert, setAlert] = useState<AlertState | null>(null);

  // Utility function to show alerts
  const showAlert = useCallback(
    (variant: AlertState["variant"], title: string, body: string) => {
      setAlert({ variant, title, body, isToast: false });
    },
    []
  );

  // Utility function to clear preview and revoke URLs
  const clearLogoPreview = useCallback(() => {
    if (selectedLogoPreview) {
      URL.revokeObjectURL(selectedLogoPreview);
      setSelectedLogoPreview(null);
    }
  }, [selectedLogoPreview]);

  // Handle logo load error
  const handleLogoError = useCallback(() => {
    setLogoLoadError(true);
    console.warn("Logo failed to load, displaying placeholder");
  }, []);

  // Handle logo load success
  const handleLogoLoad = useCallback(() => {
    setLogoLoadError(false);
  }, []);

  // Fetch organization data and logo
  const fetchOrganization = useCallback(async () => {
    try {
      const organizations = await GetMyOrganization({
        routeUrl: `/organizations/${organizationId}`,
      });
      const org = organizations.data.data;
      const organizationModel = OrganizationModel.fromApiData(org);
      setOrganizationName(organizationModel.name || "");
      setOrganizationExists(true);
      setHasChanges(false);

      // Fetch logo if organization exists
      if (org.id) {
        setLogoLoading(true);
        setLogoLoadError(false); // Reset error state
        try {
          const authToken = getAuthToken();
          const tokenData = extractUserToken(authToken);
          const tenantId = tokenData?.tenantId;

          if (tenantId) {
            const logoBlobUrl = await fetchLogoAsBlobUrl(tenantId);
            if (logoBlobUrl) {
              setLogoLoadError(false); // Reset error state
              setLogoUrl(logoBlobUrl);
            } else {
              setLogoLoadError(true);
            }
          }
        } catch (_error) {
          setLogoLoadError(true);
        } finally {
          setLogoLoading(false);
        }
      }
    } catch (_error) {
      setOrganizationExists(false);
      setOrganizationName("");
      setHasChanges(false);
      setLogoLoadError(false);
    }
  }, [organizationId, fetchLogoAsBlobUrl]);

  // Handle organization name changes
  const handleOrganizationNameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setOrganizationName(value);
      setHasChanges(true);

      const tempOrganization = OrganizationModel.createNewOrganization({
        name: value,
        logo: "",
      } as OrganizationModel);

      const validation = tempOrganization.validateName();
      setOrganizationNameError(
        validation.accepted
          ? null
          : validation.message || "Invalid organization name"
      );
      setIsSaveDisabled(!value.trim() || !validation.accepted);
    },
    []
  );

  // Handle logo file selection and upload
  const handleLogoChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file using OrganizationModel business logic
      const validation = OrganizationModel.validateLogoFile(file);
      if (!validation.isValid) {
        showAlert("error", "Invalid File", validation.errorMessage!);
        return;
      }

      // Create preview and upload
      const previewUrl = URL.createObjectURL(file);
      setSelectedLogoPreview(previewUrl);
      setLogoUploading(true);

      try {
        const response = await uploadAITrustCentreLogo(file);

        if (response?.data?.logo) {
          const authToken = getAuthToken();
          const tokenData = extractUserToken(authToken);
          const tenantId = tokenData?.tenantId;

          if (tenantId) {
            // Clear any existing logo URL before setting new one
            if (logoUrl && logoUrl.startsWith("blob:")) {
              URL.revokeObjectURL(logoUrl);
              setLogoUrl(null);
            }

            // Add a small delay to ensure the upload is processed
            await new Promise((resolve) => setTimeout(resolve, 500));

            const logoBlobUrl = await fetchLogoAsBlobUrl(tenantId);
            if (logoBlobUrl) {
              setLogoLoadError(false); // Reset error state
              setLogoUrl(logoBlobUrl);
              showAlert(
                "success",
                "Logo Uploaded",
                response.data.message ||
                  "Organization logo uploaded successfully"
              );
            } else {
              showAlert(
                "error",
                "Upload Failed",
                "Failed to load uploaded logo. Please try again."
              );
            }
          } else {
            showAlert(
              "error",
              "Upload Failed",
              "Failed to get tenant information"
            );
          }
        }
      } catch (error: any) {
        console.error("Error uploading logo:", error);
        showAlert(
          "error",
          "Upload Failed",
          error.message || "Failed to upload logo"
        );
      } finally {
        setLogoUploading(false);
        clearLogoPreview();
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [fetchLogoAsBlobUrl, showAlert, clearLogoPreview]
  );

  // Logo removal handlers
  const handleRemoveLogo = useCallback(
    () => setIsRemoveLogoModalOpen(true),
    []
  );
  const handleRemoveLogoCancel = useCallback(
    () => setIsRemoveLogoModalOpen(false),
    []
  );

  const handleRemoveLogoConfirm = useCallback(async () => {
    setLogoRemoving(true);
    try {
      await deleteAITrustCentreLogo();

      // Clear logo and previews
      if (logoUrl && logoUrl.startsWith("blob:")) {
        URL.revokeObjectURL(logoUrl);
      }
      setLogoUrl(null);
      setLogoLoadError(false); // Reset error state
      clearLogoPreview();

      setIsRemoveLogoModalOpen(false);
      showAlert(
        "success",
        "Logo Removed",
        "Organization logo removed successfully"
      );
    } catch (error) {
      console.error("Error removing logo:", error);
      showAlert(
        "error",
        "Remove Failed",
        "Failed to remove logo. Please try again."
      );
    } finally {
      setLogoRemoving(false);
    }
  }, [logoUrl, clearLogoPreview, showAlert]);

  // Organization CRUD handlers
  const handleCreate = useCallback(async () => {
    if (!organizationName.trim() || organizationNameError) {
      console.error(
        "Validation error: Organization name is required or invalid"
      );
      return;
    }

    setIsLoading(true);
    try {
      const organizationData = OrganizationModel.createNewOrganization({
        name: organizationName,
        logo: "",
      } as OrganizationModel);

      const response = await CreateMyOrganization({
        routeUrl: "/organizations",
        body: { name: organizationData.name },
      });

      showAlert(
        "success",
        "Organization Created",
        "The organization was created successfully."
      );

      if (response?.data && response.data.id) {
        setOrganizationName(response.data.name || "");
        setOrganizationExists(true);
        setHasChanges(false);
      }
      await fetchOrganization();
    } catch (_error) {
      showAlert("error", "Error", "Failed to create organization.");
    } finally {
      setTimeout(() => setIsLoading(false), 1500);
    }
  }, [organizationName, organizationNameError, fetchOrganization, showAlert]);

  const handleUpdate = useCallback(async () => {
    if (!organizationName.trim() || organizationNameError || !organizationId) {
      console.error(
        "Validation error: Organization name is required, invalid, or no organization ID"
      );
      return;
    }

    setIsLoading(true);
    try {
      const organizationData = OrganizationModel.createNewOrganization({
        id: organizationId,
        name: organizationName,
        logo: "",
      } as OrganizationModel);

      const response = await UpdateMyOrganization({
        routeUrl: `/organizations/${organizationId}`,
        body: { name: organizationData.name },
      });

      showAlert(
        "success",
        "Organization Updated",
        "The organization was updated successfully."
      );

      if (response && response.id) {
        setOrganizationName(response.name || "");
        setHasChanges(false);
      }
      await fetchOrganization();
    } catch (_error) {
      showAlert("error", "Error", "Failed to update organization.");
    } finally {
      setTimeout(() => setIsLoading(false), 1500);
    }
  }, [
    organizationName,
    organizationNameError,
    organizationId,
    fetchOrganization,
    showAlert,
  ]);

  // Effects
  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  // Cleanup function to revoke object URLs when component unmounts
  useEffect(() => {
    return () => {
      clearLogoPreview();
      if (logoUrl && logoUrl.startsWith("blob:")) {
        URL.revokeObjectURL(logoUrl);
      }
    };
  }, [clearLogoPreview, logoUrl]);

  return (
    <Stack className="organization-container" sx={{ mt: 3, maxWidth: 790 }}>
      {alert && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={false}
          onClick={() => setAlert(null)}
        />
      )}
      <Stack className="organization-form" sx={{ pt: theme.spacing(20) }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            flexDirection: { xs: "column", md: "row" },
            mb: 3,
            width: "100%",
          }}
        >
          {/* Organization Name Section */}
          <Stack sx={{ width: { xs: "100%", md: "40%" } }}>
            <Field
              id="Organization name"
              label="Organization name"
              value={organizationName}
              onChange={handleOrganizationNameChange}
              sx={{ mb: 2, backgroundColor: "background.main" }}
              error={organizationNameError || undefined}
              disabled={isEditingDisabled}
              placeholder="e.g. My Organization"
            />
            <CustomizableButton
              variant="contained"
              text="Save"
              sx={{
                width: 90,
                backgroundColor: "brand.primary",
                border: "1px solid",
                gap: 2,
                mt: 3,
              }}
              icon={
                isLoading ? (
                  <CircularProgress size={20} />
                ) : (
                  <SaveIcon size={16} />
                )
              }
              onClick={organizationExists ? handleUpdate : handleCreate}
              isDisabled={
                isSaveDisabled ||
                !!organizationNameError ||
                (organizationExists ? isEditingDisabled : isCreatingDisabled) ||
                (!hasChanges && organizationExists) ||
                isLoading
              }
            />
          </Stack>

          {/* Organization Logo Section */}
          <Stack
            sx={{ width: { xs: "100%", md: "40%", alignItems: "center" } }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 1 }}>
              Organization Logo
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <Box
                sx={{
                  width: 100,
                  height: 100,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  border: "2px dashed #ddd",
                  backgroundColor: "#fafafa",
                  position: "relative",
                  overflow: "hidden",
                  "&:hover": {
                    borderColor: "#999",
                    backgroundColor: "background.surface",
                  },
                }}
              >
                {logoUploading || logoLoading ? (
                  <CircularProgress size={24} />
                ) : selectedLogoPreview ? (
                  <Box
                    component="img"
                    src={selectedLogoPreview}
                    alt="Selected Logo Preview"
                    onError={handleLogoError}
                    onLoad={handleLogoLoad}
                    sx={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      borderRadius: 1,
                      display: logoLoadError ? "none" : "block",
                    }}
                  />
                ) : logoUrl && !logoLoadError ? (
                  <Box
                    component="img"
                    src={logoUrl}
                    alt="Organization Logo"
                    onError={handleLogoError}
                    onLoad={handleLogoLoad}
                    sx={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      borderRadius: 1,
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    <Typography
                      sx={{ fontSize: 10, color: "#888", textAlign: "center" }}
                    >
                      {logoLoadError ? "Failed to load logo" : "Logo"}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
            <Box sx={{ display: "flex", gap: 1 }}>
              <MUIButton
                variant="text"
                sx={{
                  fontSize: 12,
                  textTransform: "none",
                  color: logoUrl ? "#666" : "#ccc",
                  "&:hover": {
                    backgroundColor: logoUrl
                      ? "rgba(102, 102, 102, 0.04)"
                      : "transparent",
                  },
                }}
                onClick={handleRemoveLogo}
                disabled={
                  !logoUrl || logoRemoving || logoUploading || logoLoading
                }
              >
                {logoRemoving ? (
                  <>
                    <CircularProgress size={16} sx={{ mr: 1 }} />
                    Removing...
                  </>
                ) : (
                  "Delete"
                )}
              </MUIButton>
              <MUIButton
                variant="text"
                component="label"
                disableRipple
                sx={{
                  fontSize: 12,
                  textTransform: "none",
                  color: "brand.primary",
                  "&:hover": {
                    backgroundColor: "transparent !important",
                  },
                  "&:active": {
                    backgroundColor: "transparent !important",
                  },
                }}
                disabled={logoUploading || logoLoading}
              >
                {logoUploading ? (
                  <>
                    <CircularProgress size={16} sx={{ mr: 1 }} />
                    Uploading...
                  </>
                ) : logoLoading ? (
                  <>
                    <CircularProgress size={16} sx={{ mr: 1 }} />
                    Loading...
                  </>
                ) : (
                  "Change"
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml"
                  hidden
                  ref={fileInputRef}
                  onChange={handleLogoChange}
                />
              </MUIButton>
            </Box>
            {/* Logo requirements info */}
            <Typography
              sx={{
                fontSize: 11,
                color: "#666",
                textAlign: "center",
                mt: 1,
                lineHeight: 1.4,
              }}
            >
              Recommended: 200×200px • Max size: 5MB • Formats: PNG, JPG, GIF,
              SVG
            </Typography>
          </Stack>
        </Box>
      </Stack>

      {/* Remove Logo Confirmation Modal */}
      {isRemoveLogoModalOpen && (
        <ConfirmationModal
          title="Confirm logo removal"
          body={
            <Typography fontSize={13}>
              Are you sure you want to remove the organization logo? This action
              cannot be undone.
            </Typography>
          }
          cancelText="Cancel"
          proceedText={logoRemoving ? "Removing..." : "Remove"}
          onCancel={handleRemoveLogoCancel}
          onProceed={handleRemoveLogoConfirm}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          TitleFontSize={0}
        />
      )}
    </Stack>
  );
};

export default Organization;
