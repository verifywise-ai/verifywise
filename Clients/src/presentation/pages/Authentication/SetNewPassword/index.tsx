/**
 * This file is currently in use
 */

import { Button, Stack, Typography, useTheme } from "@mui/material";
import React, { useEffect, useState, useCallback } from "react";
import { ReactComponent as Background } from "../../../assets/imgs/background-grid.svg";
import { Check } from "../../../components/Checks";
import Field from "../../../components/Inputs/Field";
import { ArrowLeft as LeftArrowLong } from "lucide-react";
import { Lock } from "lucide-react";
import singleTheme from "../../../themes/v1SingleTheme";
import { useNavigate, useSearchParams } from "react-router-dom";
import { validatePassword } from "../../../../application/validations/formValidation";
import type { FormErrors } from "../../../../application/validations/formValidation";
import { extractUserToken } from "../../../../application/tools/extractToken";
import { resetPassword } from "../../../../application/repository/auth.repository";
import CustomizableSkeleton from "../../../components/Skeletons";
import { background, border as borderPalette } from "../../../themes/palette";

interface ResetPasswordFormValues {
  password: string;
  confirmPassword: string;
}

interface UserInfo {
  name: string;
  email: string;
  expire: string | number; // Allow both string and number since token might provide string
  role?: string;
  id?: any;
  iat?: string;
}

// Initial state for form values
const initialState: ResetPasswordFormValues = {
  password: "",
  confirmPassword: "",
};

const SetNewPassword: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const [searchParams] = useSearchParams();
  const userToken = searchParams.get("token");

  // State management
  const [values, setValues] = useState<ResetPasswordFormValues>(initialState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetInvitationValid, setIsResetInvitationValid] =
    useState<boolean>(true);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  // Password validation
  const passwordChecks = validatePassword({
    ...values,
    name: "",
    surname: "",
    email: "",
  });

  // Validate password requirements
  const validatePasswordRequirements = (): string | null => {
    if (!isResetInvitationValid) {
      return "The link has expired already.";
    }

    if (!passwordChecks.length) {
      return "Password must be at least 8 characters long";
    }
    if (!passwordChecks.specialChar) {
      return "Password must contain at least one special character";
    }
    if (!passwordChecks.uppercase) {
      return "Password must contain at least one uppercase letter";
    }
    if (!passwordChecks.number) {
      return "Password must contain at least one number";
    }

    if (values.password !== values.confirmPassword) {
      return "Password confirmation does not match. Please re-enter.";
    }

    return null;
  };

  // Handle input field changes
  const handleChange = useCallback(
    (prop: keyof ResetPasswordFormValues) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setValues((prev) => ({ ...prev, [prop]: event.target.value }));
        setErrors((prev) => ({ ...prev, [prop]: "" }));
      },
    []
  );

  // Validate reset invitation
  const checkResetInvitation = useCallback(
    (expDate: string | number): boolean => {
      const currentTime = new Date().getTime();
      const expirationTime =
        typeof expDate === "string" ? parseInt(expDate, 10) : expDate;
      const isValid = currentTime < expirationTime;
      setIsResetInvitationValid(isValid);
      return isValid;
    },
    []
  );

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const validationError = validatePasswordRequirements();
      if (validationError) {
        setErrors({ password: validationError });
        return;
      }

      const response = await resetPassword(
        {
          email: userInfo?.email || "",
          newPassword: values.password,
        },
        userToken || ""
      );

      if (response.status === 202) {
        setValues(initialState);
        setErrors({});
        navigate("/login");
      } else {
        throw new Error("Failed to reset password");
      }
    } catch (error) {
      console.error("Password reset error:", error);
      setErrors({
        password: error instanceof Error ? error.message : "An error occurred",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Initialize user info from token
  useEffect(() => {
    if (!userToken) return;

    const extractedUserInfo = extractUserToken(userToken);
    if (!extractedUserInfo) return;

    setUserInfo(extractedUserInfo);
    checkResetInvitation(extractedUserInfo.expire);
  }, [userToken, checkResetInvitation]);

  const buttonStyle = {
    width: 360,
    backgroundColor: `${background.main}`,
  };

  return (
    <Stack className="reg-admin-page" sx={{ minHeight: "100vh" }}>
      {isSubmitting && (
        <Stack
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CustomizableSkeleton
            sx={{
              width: "100%",
              height: "100%",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          />
        </Stack>
      )}
      <Background
        style={{
          position: "absolute",
          top: "-40%",
          zIndex: -1,
          backgroundPosition: "center",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />
      <form onSubmit={handleSubmit}>
        <Stack
          className="reg-admin-form"
          sx={{
            width: 360,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
            margin: "auto",
            mt: 40,
            gap: theme.spacing(20),
            position: "relative",
            zIndex: isSubmitting ? 0 : 1,
            pointerEvents: isSubmitting ? "none" : "auto",
          }}
        >
          <Stack
            sx={{
              width: 56,
              height: 56,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              borderRadius: "12px",
              border: `2px solid ${borderPalette.light}`,
              gap: theme.spacing(12),
            }}
          >
            <Lock size={24} />
          </Stack>
          <Stack sx={{ gap: theme.spacing(6), textAlign: "center" }}>
            <Typography sx={{ fontSize: 16, fontWeight: "bold" }}>
              Set new password
            </Typography>
          </Stack>
          <Stack sx={{ gap: theme.spacing(12) }}>
            <Field
              label="Password"
              isRequired
              placeholder="••••••••"
              sx={buttonStyle}
              type="password"
              value={values.password}
              onChange={handleChange("password")}
              error={errors.password}
            />
            <Field
              label="Confirm password"
              isRequired
              placeholder="••••••••"
              sx={buttonStyle}
              type="password"
              value={values.confirmPassword}
              onChange={handleChange("confirmPassword")}
              error={errors.confirmPassword}
            />
            <Stack sx={{ gap: theme.spacing(6) }}>
              <Check
                text="Must be at least 8 characters"
                variant={passwordChecks.length ? "success" : "info"}
              />
              <Check
                text="Must contain one special character"
                variant={passwordChecks.specialChar ? "success" : "info"}
              />
              <Check
                text="Must contain at least one uppercase letter"
                variant={passwordChecks.uppercase ? "success" : "info"}
              />
              <Check
                text="Must contain atleast one number"
                variant={passwordChecks.number ? "success" : "info"}
              />
            </Stack>
            <Button
              type="submit"
              disableRipple
              variant="contained"
              disabled={isSubmitting}
              sx={singleTheme.buttons.primary.contained}
            >
              Reset password
            </Button>
          </Stack>
          <Stack
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Stack
              sx={{
                display: "flex",
                flexDirection: "row",
                gap: theme.spacing(5),
                alignItems: "center",
                cursor: "pointer",
              }}
              onClick={() => navigate("/login")}
            >
              <LeftArrowLong size={16} />
              <Typography sx={{ height: 22, fontSize: 13, fontWeight: 500 }}>
                Back to log in
              </Typography>
            </Stack>
          </Stack>
        </Stack>
      </form>
    </Stack>
  );
};

export default SetNewPassword;
