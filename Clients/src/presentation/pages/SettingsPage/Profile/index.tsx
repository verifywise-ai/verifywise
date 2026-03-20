import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  ChangeEvent,
  useContext,
} from "react";
import {
  Box,
  CircularProgress,
  Divider,
  Stack,
  Typography,
  Button as MUIButton,
} from "@mui/material";
import { useTheme } from "@mui/material";
import Field from "../../../components/Inputs/Field";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import validator from "validator";
import { logEngine } from "../../../../application/tools/log.engine";
import localStorage from "redux-persist/es/storage";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import Alert from "../../../components/Alert";
import { store } from "../../../../application/redux/store";
import { extractUserToken } from "../../../../application/tools/extractToken";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { Save as SaveIcon, Trash2 as DeleteIcon } from "lucide-react";
import CustomizableSkeleton from "../../../components/Skeletons";
import CustomizableToast from "../../../components/Toast";
import useLogout from "../../../../application/hooks/useLogout";
import {
  deleteUserById,
  getUserById,
  updateUserById,
  uploadUserProfilePhoto,
  deleteUserProfilePhoto,
} from "../../../../application/repository/user.repository";
import { useAuth } from "../../../../application/hooks/useAuth";
import { useProfilePhotoFetch } from "../../../../application/hooks/useProfilePhotoFetch";
import Avatar from "../../../components/Avatar/VWAvatar";
import { VerifyWiseContext } from "../../../../application/contexts/VerifyWise.context";

/**
 * ProfileForm component for managing user profile information.
 *
 * This component allows users to view and update their profile information,
 * including their first name, last name, email, and profile photo. It also
 * provides functionality to delete the user's account.
 *
 * @component
 * @returns {JSX.Element} The rendered component.
 */
const ProfileForm: React.FC = () => {
  const state = store.getState();
  const userData = extractUserToken(state.auth.authToken);
  const { id } = userData || {};
  const { userRoleName } = useAuth();
  const isAdmin = userRoleName === "Admin";

  // State management
  const [firstname, setFirstname] = useState<string>("");
  const [lastname, setLastname] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [showToast, setShowToast] = useState(false);
  const [firstnameError, setFirstnameError] = useState<string | null>(null);
  const [lastnameError, setLastnameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false); // Separate saving state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  interface AlertState {
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
    isToast?: boolean;
  }

  const [alert, setAlert] = useState<AlertState | null>(null);

  const theme = useTheme();
  const initialStateRef = useRef({ firstname: "", lastname: "", email: "" });

  const { refreshUsers } = useContext(VerifyWiseContext);

  const isModified =
    firstname !== initialStateRef.current.firstname ||
    lastname !== initialStateRef.current.lastname ||
    email !== initialStateRef.current.email;

  const isSaveDisabled =
    !!firstnameError ||
    !!lastnameError ||
    !!emailError ||
    !isModified ||
    saving;

  const logout = useLogout();
  const { fetchProfilePhotoAsBlobUrl } = useProfilePhotoFetch();

  // Profile Image states
  const [imageUploading, setImageUploading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageRemoving, setImageRemoving] = useState(false);
  const [isRemoveImageModalOpen, setIsRemoveImageModalOpen] = useState(false);
  const [selectedImagePreview, setSelectedImagePreview] = useState<
    string | null
  >(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Update initial state reference when data changes
   */
  const updateInitialState = useCallback(
    (name: string, surname: string, emailAddr: string) => {
      initialStateRef.current = {
        firstname: name,
        lastname: surname,
        email: emailAddr,
      };
    },
    []
  );

  /**
   * Fetch user data on component mount.
   */
  const fetchUserData = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    try {
      const userData = await getUserById({ userId: id });

      // Try both direct access and .data access to see which works
      const actualUserData = userData?.data || userData;

      setFirstname(actualUserData?.name || "");
      setLastname(actualUserData?.surname || "");
      setEmail(actualUserData?.email || "");

      updateInitialState(
        actualUserData?.name || "",
        actualUserData?.surname || "",
        actualUserData?.email || ""
      );
    } catch (_error) {
      logEngine({
        type: "error",
        message: "Failed to fetch user data.",
      });
    } finally {
      setLoading(false);
    }
  }, [id, updateInitialState]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  /**
   * Fetch user profile photo on component mount
   */
  useEffect(() => {
    const fetchProfilePhoto = async () => {
      if (!id) return;

      setImageLoading(true);
      try {
        const photoUrl = await fetchProfilePhotoAsBlobUrl(id);
        if (photoUrl) {
          setImageUrl(photoUrl);
          setImageLoadError(false);
        }
      } catch (error) {
        console.error("Error fetching profile photo:", error);
        setImageLoadError(true);
      } finally {
        setImageLoading(false);
      }
    };

    fetchProfilePhoto();
  }, [id, fetchProfilePhotoAsBlobUrl]);

  /**
   * Show alert with auto-hide functionality
   */
  const showAlert = useCallback(
    (variant: AlertState["variant"], title: string, body: string) => {
      setAlert({ variant, title, body, isToast: true });
    },
    []
  );

  // Auto-hide alert after 3 seconds
  React.useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  /**
   * Handle save button click with validation.
   */
  const handleSave = useCallback(async () => {
    // Early validation check
    if (firstnameError || lastnameError || emailError) {
      logEngine({
        type: "error",
        message: "Validation errors occurred while saving the profile.",
      });
      showAlert(
        "error",
        "Error",
        "Validation errors occurred while saving the profile."
      );
      return;
    }

    if (!id) {
      showAlert(
        "error",
        "Error",
        "User session not found. Please log in again."
      );
      return;
    }

    setSaving(true);
    setShowToast(true);

    try {
      const updatedUser = {
        name: firstname,
        surname: lastname,
        email,
      };

      const response = await updateUserById({
        userId: id,
        userData: updatedUser,
      });

      // Validate response before proceeding with success path
      if (response && response.status >= 200 && response.status < 300) {
        // Update the initial state to reflect the new saved values
        // This prevents the form from thinking it's still modified
        updateInitialState(firstname, lastname, email);
        refreshUsers();
        showAlert("success", "Success", "Profile updated successfully.");
      } else {
        // Handle failure response
        logEngine({
          type: "error",
          message: `Failed to update profile. Status: ${
            response?.status || "undefined"
          }, Response: ${JSON.stringify(response)}`,
        });
        showAlert(
          "error",
          "Error",
          "Failed to update profile. Please try again."
        );
      }
    } catch (error) {
      console.error("Update error:", error);
      logEngine({
        type: "error",
        message: `An error occurred while updating the profile: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
      showAlert(
        "error",
        "Error",
        "Failed to update profile. Please try again."
      );
    } finally {
      setSaving(false);
      setShowToast(false);
    }
  }, [
    firstname,
    lastname,
    email,
    firstnameError,
    lastnameError,
    emailError,
    id,
    updateInitialState,
    showAlert,
  ]);

  /**
   * Handle delete dialog open.
   */
  const handleOpenDeleteDialog = useCallback((): void => {
    setIsDeleteModalOpen(true);
  }, []);

  /**
   * Handle delete dialog close.
   */
  const handleCloseDeleteDialog = useCallback((): void => {
    setIsDeleteModalOpen(false);
  }, []);

  /**
   * Handle firstname input change with validation.
   */
  const handleFirstnameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const newFirstname = e.target.value;
      setFirstname(newFirstname);

      const validation = checkStringValidation(
        "First name",
        newFirstname,
        2,
        50,
        false,
        false
      );
      setFirstnameError(validation.accepted ? null : validation.message);
    },
    []
  );

  /**
   * Handle lastname input change with validation.
   */
  const handleLastnameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const newLastname = e.target.value;
      setLastname(newLastname);

      const validation = checkStringValidation(
        "Last name",
        newLastname,
        2,
        50,
        false,
        false
      );
      setLastnameError(validation.accepted ? null : validation.message);
    },
    []
  );

  /**
   * Handle email input change with validation.
   */
  const handleEmailChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);

    if (!validator.isEmail(newEmail)) {
      setEmailError("Invalid email address");
    } else {
      setEmailError(null);
    }
  }, []);

  /**
   * Handle delete confirmation.
   */
  const handleDeleteAccount = useCallback(async () => {
    setShowToast(true);
    try {
      const response = await deleteUserById({ userId: Number(id) });

      if (response?.status === 202) {
        // Clear storage only on success
        await localStorage.removeItem("userId");
        await localStorage.removeItem("authToken");

        logout();

        showAlert("success", "Success", "Account deleted successfully.");
      } else {
        // Handle failure case
        logEngine({
          type: "error",
          message: `Failed to delete account. Status: ${
            response?.status || "undefined"
          }, Response: ${JSON.stringify(response)}`,
        });
        showAlert(
          "error",
          "Error",
          "Failed to delete account. Please try again."
        );
      }
    } catch (error) {
      logEngine({
        type: "error",
        message: `An error occurred while deleting the account: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
      showAlert(
        "error",
        "Error",
        "Failed to delete account. Please try again."
      );
    } finally {
      setIsDeleteModalOpen(false);
      setShowToast(false);
    }
  }, [id, logout, showAlert]);

  // Utility function to clear preview and revoke URLs
  const clearImagePreview = useCallback(() => {
    if (selectedImagePreview) {
      URL.revokeObjectURL(selectedImagePreview);
      setSelectedImagePreview(null);
    }
  }, [selectedImagePreview]);

  const { setPhotoRefreshFlag } = useContext(VerifyWiseContext);

  // Handle Image file selection and upload
  const handleImageChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file
      if (!file.type.startsWith("image/")) {
        showAlert("error", "Invalid File", "Please select a valid image file");
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showAlert("error", "File Too Large", "File size must be less than 5MB");
        return;
      }

      if (!id) {
        showAlert(
          "error",
          "Error",
          "User session not found. Please log in again."
        );
        return;
      }

      // Create preview
      const previewUrl = URL.createObjectURL(file);
      setSelectedImagePreview(previewUrl);
      setImageUploading(true);

      try {
        // Upload the file
        const response = await uploadUserProfilePhoto(id, file);

        if (response && response.status === 200) {
          // Fetch the newly uploaded photo
          const photoUrl = await fetchProfilePhotoAsBlobUrl(id);
          if (photoUrl) {
            // Clear old imageUrl if it exists
            if (imageUrl && imageUrl.startsWith("blob:")) {
              URL.revokeObjectURL(imageUrl);
            }
            setPhotoRefreshFlag(prev => !prev);
            setImageUrl(photoUrl);
            setImageLoadError(false);
          }

          clearImagePreview();
          showAlert(
            "success",
            "Success",
            "Profile photo uploaded successfully"
          );
        } else {
          showAlert("error", "Error", "Failed to upload profile photo");
        }
      } catch (_error) {
        showAlert("error", "Error", "Failed to upload profile photo.");
      } finally {
        setImageUploading(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [id, showAlert, clearImagePreview, fetchProfilePhotoAsBlobUrl, imageUrl]
  );

  // Image removal handlers
  const handleRemoveImage = useCallback(
    () => setIsRemoveImageModalOpen(true),
    []
  );
  const handleRemoveImageCancel = useCallback(
    () => setIsRemoveImageModalOpen(false),
    []
  );

  const handleRemoveImageConfirm = useCallback(async () => {
    if (!id) {
      showAlert(
        "error",
        "Error",
        "User session not found. Please log in again."
      );
      return;
    }

    setImageRemoving(true);
    try {
      // Call API to delete profile photo
      const response = await deleteUserProfilePhoto(id);

      if (response && response.status === 200) {
        // Clear Image and previews
        if (imageUrl && imageUrl.startsWith("blob:")) {
          URL.revokeObjectURL(imageUrl);
        }
        setImageUrl(null);
        setImageLoadError(false); // Reset error state
        clearImagePreview();
        setPhotoRefreshFlag(prev => !prev);
        setIsRemoveImageModalOpen(false);
        showAlert(
          "success",
          "Image Removed",
          "Profile photo removed successfully"
        );
      } else {
        showAlert(
          "error",
          "Remove Failed",
          "Failed to remove profile photo. Please try again."
        );
      }
    } catch (_error) {
      showAlert(
        "error",
        "Remove Failed",
        "Failed to remove profile photo. Please try again."
      );
    } finally {
      setImageRemoving(false);
    }
  }, [id, imageUrl, clearImagePreview, showAlert]);

  return (
    <Box
      sx={{
        display: "flex",
        gap: 10,
      }}
    >
      <Box
        sx={{
          position: "relative",
          mt: 3,
          width: { xs: "90%", md: "70%" },
          maxWidth: "600px",
        }}
      >
        {showToast && <CustomizableToast />}

        {loading && (
          <CustomizableSkeleton
            variant="rectangular"
            width="100%"
            height="300px"
            minWidth={"100%"}
            minHeight={300}
            sx={{ borderRadius: 2 }}
          />
        )}

        {alert && (
          <Alert
            variant={alert.variant}
            title={alert.title}
            body={alert.body}
            isToast={alert.isToast}
            onClick={() => setAlert(null)}
          />
        )}

        {!loading && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              flexDirection: { xs: "column", md: "row" },
              mb: 3,
              width: "100%",
              mt: 20,
            }}
          >
            <Box sx={{ width: { xs: "100%", md: "100%" } }}>
              <Field
                id="First name"
                label="Name"
                value={firstname}
                onChange={handleFirstnameChange}
                sx={{ mb: 5, backgroundColor: "background.main", maxWidth: "600px" }}
                disabled={saving}
              />
              {firstnameError && (
                <Typography color="error" variant="caption">
                  {firstnameError}
                </Typography>
              )}

              <Field
                id="Last name"
                label="Surname"
                value={lastname}
                onChange={handleLastnameChange}
                sx={{ mb: 5, backgroundColor: "background.main", maxWidth: "600px" }}
                disabled={saving}
              />
              {lastnameError && (
                <Typography color="error" variant="caption">
                  {lastnameError}
                </Typography>
              )}

              <Field
                id="Email"
                label="Email"
                value={email}
                onChange={handleEmailChange}
                sx={{ mb: 5, backgroundColor: "background.main", maxWidth: "600px" }}
                disabled // Email is always disabled as mentioned in the original code
              />
              {emailError && (
                <Typography color="error" variant="caption">
                  {emailError}
                </Typography>
              )}

              <Typography
                variant="caption"
                sx={{
                  mt: 1,
                  mb: { xs: 5, md: 0 },
                  display: "block",
                  color: "text.icon",
                }}
              >
                This is your current email address — it cannot be changed.
              </Typography>
            </Box>
          </Box>
        )}

        {!loading && (
          <Stack
            sx={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
            <CustomizableButton
              variant="contained"
              text={saving ? "Saving..." : "Save"}
              sx={{
                backgroundColor: "brand.primary",
                border: isSaveDisabled
                  ? "1px solid rgba(0, 0, 0, 0.26)"
                  : "1px solid brand.primary",
                gap: 2,
              }}
              icon={<SaveIcon size={16} />}
              onClick={handleSave}
              isDisabled={isSaveDisabled}
            />
          </Stack>
        )}

        <Divider sx={{ borderColor: "#C2C2C2", mt: theme.spacing(3) }} />

        {loading && (
          <CustomizableSkeleton
            variant="rectangular"
            width="100%"
            height="200px"
            minWidth={"100%"}
            minHeight={200}
            sx={{ borderRadius: 2 }}
          />
        )}

        {!loading && (
          <Box>
            <Stack>
              <Typography
                fontWeight={"600"}
                gutterBottom
                sx={{ mb: 2, mt: 10 }}
              >
                Delete account
              </Typography>
              <Typography
                fontWeight={"400"}
                variant="body2"
                sx={{ mb: 8, mt: 4, color: "text.icon" }}
              >
                Note that deleting your account will remove all data from our
                system. This is permanent and non-recoverable.
              </Typography>
              <Stack
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  alignItems: "center",
                }}
              >
                <CustomizableButton
                  sx={{
                    width: { xs: "100%", sm: theme.spacing(80) },
                    mb: theme.spacing(4),
                    backgroundColor: "#DB504A",
                    color: "background.main",
                    border: `1px solid ${isAdmin ? "#C2C2C2" : "#DB504A"}`,
                    gap: 2,
                  }}
                  icon={<DeleteIcon size={16} />}
                  variant="contained"
                  onClick={handleOpenDeleteDialog}
                  text="Delete account"
                  isDisabled={isAdmin}
                />
              </Stack>
            </Stack>
          </Box>
        )}

        {isDeleteModalOpen && (
          <ConfirmationModal
            title="Confirm delete"
            body={
              <Typography fontSize={13}>
                Are you sure you want to delete your account? This action is
                permanent and cannot be undone.
              </Typography>
            }
            cancelText="Cancel"
            proceedText="Delete"
            onCancel={handleCloseDeleteDialog}
            onProceed={handleDeleteAccount}
            proceedButtonColor="error"
            proceedButtonVariant="contained"
          />
        )}
      </Box>
      {/* Profile Image Upload Section */}
      <Stack
        sx={{ width: { xs: "100%", md: "40%" }, alignItems: "center", mt: 32 }}
      >
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
            {imageUploading || imageLoading ? (
              <CircularProgress size={24} />
            ) : (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Avatar
                  user={{
                    firstname,
                    lastname,
                    pathToImage: !imageLoadError
                      ? selectedImagePreview ?? imageUrl ?? ""
                      : undefined,
                  }}
                  size="medium"
                  sx={{ width: 84, height: 84 }}
                />
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
              color: imageUrl ? "#666" : "#ccc",
              "&:hover": {
                backgroundColor: imageUrl
                  ? "rgba(102, 102, 102, 0.04)"
                  : "transparent",
              },
            }}
            onClick={handleRemoveImage}
            disabled={
              !imageUrl || imageRemoving || imageUploading || imageLoading
            }
          >
            {imageRemoving ? (
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
            disabled={imageUploading || imageLoading}
          >
            {imageUploading ? (
              <>
                <CircularProgress size={16} sx={{ mr: 1 }} />
                Uploading...
              </>
            ) : imageLoading ? (
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
              onChange={handleImageChange}
            />
          </MUIButton>
        </Box>
        {/* Profile Image requirements info */}
        <Typography
          sx={{
            fontSize: 11,
            color: "#666",
            textAlign: "center",
            mt: 1,
            lineHeight: 1.4,
          }}
        >
          Recommended: 200×200px • Max size: 5MB • Formats: PNG, JPG, GIF, SVG
        </Typography>
      </Stack>
      {isRemoveImageModalOpen && (
        <ConfirmationModal
          title="Remove profile photo"
          body={
            <Typography fontSize={13}>
              Are you sure you want to remove your profile photo?
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Remove"
          onCancel={handleRemoveImageCancel}
          onProceed={handleRemoveImageConfirm}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
        />
      )}
    </Box>
  );
};

export default ProfileForm;
