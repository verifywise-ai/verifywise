import React, { useState, useCallback } from "react";
import {
  useTheme,
  Alert as MuiAlert,
  Box,
  Stack,
  Typography,
} from "@mui/material";
import Field from "../../../components/Inputs/Field";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import Alert from "../../../components/Alert";
import { store } from "../../../../application/redux/store";
import { extractUserToken } from "../../../../application/tools/extractToken";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { Save as SaveIcon } from "lucide-react";
import CustomizableSkeleton from "../../../components/Skeletons";
import CustomizableToast from "../../../components/Toast"; // Import CustomizableToast
import { updatePassword } from "../../../../application/repository/user.repository";
import { brand, background } from "../../../themes/palette";

const PasswordForm: React.FC = () => {
  const theme = useTheme();
  const state = store.getState();
  const userData = extractUserToken(state.auth.authToken); // Extract user data from token
  const { id } = userData || {};

  // State management
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");

  const [currentPasswordError, setCurrentPasswordError] = useState<
    string | null
  >(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<
    string | null
  >(null);

  const [isConfirmationModalOpen, setIsConfirmationModalOpen] =
    useState<boolean>(false);
  const [loading, _] = useState(false);
  const [showToast, setShowToast] = useState(false); // State for CustomizableToast visibility

  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title: string;
    body: string;
    isToast: boolean;
    visible: boolean;
  }>({
    variant: "info",
    title: "",
    body: "",
    isToast: true,
    visible: false,
  });

  // Handle current password validation
  const handleCurrentPasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setCurrentPassword(value);

      const validation = checkStringValidation(
        "Current password",
        value,
        8,
        128,
        true, // hasUpperCase
        true, // hasLowerCase
        true, // hasNumber
        true // hasSpecialCharacter
      );
      setCurrentPasswordError(validation.accepted ? null : validation.message);
    },
    []
  );

  // Handle new password validation
  const handleNewPasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setNewPassword(value);

      const validation = checkStringValidation(
        "New password",
        value,
        8,
        128,
        true,
        true,
        true,
        true
      );
      setNewPasswordError(validation.accepted ? null : validation.message);
    },
    []
  );

  // Handle confirm password validation
  const handleConfirmPasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setConfirmPassword(value);

      if (value !== newPassword) {
        setConfirmPasswordError("Password confirmation does not match. Please re-enter.");
      } else {
        setConfirmPasswordError(null);
      }
    },
    [newPassword]
  );

  // Handle save
  const handleSave = useCallback(async () => {
    setCurrentPasswordError(null);
    setNewPasswordError(null);
    setConfirmPasswordError(null);

    const validation = checkStringValidation(
      "New password",
      newPassword,
      8,
      128,
      true,
      true,
      true,
      true
    );
    if (!validation.accepted) {
      setNewPasswordError(validation.message);
      return;
    }

    if (newPassword !== confirmPassword) {
      setConfirmPasswordError("Password confirmation does not match. Please re-enter.");
      return;
    }

    if (!id) {
      setAlert({
        variant: "error",
        title: "Error",
        body: "User session not found. Please log in again.",
        isToast: false,
        visible: true,
      });
      return;
    }

    setShowToast(true); // Show CustomizableToast

    try {
      await updatePassword({
        userId: id,
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setAlert({
        variant: "success",
        title: "Success",
        body: "Password updated successfully.",
        isToast: true,
        visible: true,
      });
    } catch (error: any) {
      setAlert({
        variant: "error",
        title: "Error",
        body: error.message || "Failed to update password. Please try again.",
        isToast: true,
        visible: true,
      });
    } finally {
      setShowToast(false); // Hide CustomizableToast after response
      setTimeout(() => {
        setShowToast(false);
      }, 1000);
      setTimeout(() => {
        setAlert((prev) => ({ ...prev, visible: false }));
      }, 3000); // Alert will disappear after 3 seconds
    }
  }, [currentPassword, newPassword, confirmPassword]);

  const handleCloseConfirmationModal = useCallback(() => {
    setIsConfirmationModalOpen(false);
  }, []);

  const handleConfirmSave = useCallback(() => {
    handleSave();
    setIsConfirmationModalOpen(false);
  }, [handleSave]);

  const isSaveDisabled =
    !currentPassword ||
    !newPassword ||
    !confirmPassword ||
    !!currentPasswordError ||
    !!newPasswordError ||
    !!confirmPasswordError;

  return (
    <Box sx={{ mt: 3, width: { xs: "90%", md: "70%" }, position: "relative" }}>
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
      {alert.visible && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={alert.isToast}
          onClick={() => setAlert((prev) => ({ ...prev, visible: false }))}
        />
      )}
      {showToast && <CustomizableToast />}{" "}
      {/* Show CustomizableToast when showToast is true */}
      {!loading && (
        <Box sx={{ width: "100%", maxWidth: 600 }}>
          <Stack sx={{ marginTop: theme.spacing(20) }}>
            <Field
              id="Current password"
              label="Current password"
              value={currentPassword}
              onChange={handleCurrentPasswordChange}
              type="password"
              sx={{ mb: 5, backgroundColor: `${background.main}` }}
            />
            {currentPasswordError && (
              <Typography color="error" variant="caption">
                {currentPasswordError}
              </Typography>
            )}

            <Field
              id="New password"
              label="New password"
              value={newPassword}
              onChange={handleNewPasswordChange}
              type="password"
              sx={{ mb: 5, backgroundColor: `${background.main}` }}
            />
            {newPasswordError && (
              <Typography color="error" variant="caption">
                {newPasswordError}
              </Typography>
            )}

            <Field
              id="Confirm new password"
              label="Confirm new password"
              value={confirmPassword}
              onChange={handleConfirmPasswordChange}
              type="password"
              sx={{ mb: 5, backgroundColor: `${background.main}` }}
            />
            {confirmPasswordError && (
              <Typography color="error" variant="caption">
                {confirmPasswordError}
              </Typography>
            )}

            <MuiAlert severity="warning" sx={{ my: theme.spacing(5) }}>
              Password must contain at least eight characters and must include
              an uppercase letter, a lowercase letter, a number, and a symbol.
            </MuiAlert>

            <Stack
              sx={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "flex-end",
                alignItems: "center",
                paddingTop: theme.spacing(5),
              }}
            >
              <CustomizableButton
                variant="contained"
                text="Save"
                sx={{
                  backgroundColor: `${brand.primary}`,
                  border: isSaveDisabled
                    ? "1px solid rgba(0, 0, 0, 0.26)"
                    : `1px solid ${brand.primary}`,
                  gap: 2,
                }}
                icon={<SaveIcon size={16} />}
                onClick={() => setIsConfirmationModalOpen(true)}
                isDisabled={isSaveDisabled}
              />
            </Stack>
          </Stack>
        </Box>
      )}
      {isConfirmationModalOpen && (
        <ConfirmationModal
          title="Confirm save"
          body={
            <Typography fontSize={13}>
              Are you sure you want to save the changes?
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Save"
          onCancel={handleCloseConfirmationModal}
          onProceed={handleConfirmSave}
          proceedButtonColor="primary"
          proceedButtonVariant="contained"
        />
      )}
    </Box>
  );
};

export default PasswordForm;
