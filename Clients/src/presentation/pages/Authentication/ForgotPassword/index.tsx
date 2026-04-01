/**
 * This file is currently in use
 */

import { Button, Stack, Typography, useTheme } from "@mui/material";
import React, { useState } from "react";
import { Key } from "lucide-react";
import { ArrowLeft as LeftArrowLong } from "lucide-react";
import { ReactComponent as Background } from "../../../assets/imgs/background-grid.svg";
import Field from "../../../components/Inputs/Field";
import singleTheme from "../../../themes/v1SingleTheme";
import { useNavigate, useLocation } from "react-router-dom";
import { sendPasswordResetEmail } from "../../../../application/repository/auth.repository";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { AlertProps } from "../../../types/alert.types";
import Alert from "../../../components/Alert";
import { background, border as borderPalette } from "../../../themes/palette";

// Define the shape of form values
interface FormValues {
  email: string;
}

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update initial state to use the email from navigation state if available
  const initialState: FormValues = {
    email: location.state?.email || "",
  };

  // State for form values
  const [values, setValues] = useState<FormValues>(initialState);

  // Handle changes in input fields
  const handleChange =
    (prop: keyof FormValues) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues({ ...values, [prop]: event.target.value });
    };

  // Handle form submission
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const formData = {
        to: values.email,
        email: values.email,
        name: values.email,
      };
      sendPasswordResetEmail(formData);
      navigate("/reset-password", { state: { email: values.email } });
    } catch (_error) {
      handleAlert({
        variant: "error",
        body: "Failed to send reset email. Please try again.",
        setAlert,
      });
    } finally {
      setIsSubmitting(false);
      setValues(initialState);
    }
  };

  const theme = useTheme();

  // Styles for input button
  const buttonStyle = {
    width: 360,
    backgroundColor: `${background.main}`,
  };

  return (
    <Stack
      className="reg-admin-page"
      sx={{
        minHeight: "100vh",
      }}
    >
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
      {alert && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={true}
          onClick={() => setAlert(null)}
        />
      )}
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
            <Key size={24} />
          </Stack>
          <Stack sx={{ gap: theme.spacing(6), textAlign: "center" }}>
            <Typography sx={{ fontSize: 16, fontWeight: "bold" }}>
              Forgot password?
            </Typography>
            <Typography fontSize={13}>
              No worries, we'll send you reset instructions.
            </Typography>
          </Stack>
          <Stack sx={{ gap: theme.spacing(12) }}>
            <Field
              label="Email"
              isRequired
              placeholder="Enter your email"
              sx={buttonStyle}
              type="email"
              value={values.email}
              onChange={handleChange("email")}
            />
            <Button
              type="submit"
              disableRipple
              variant="contained"
              disabled={isSubmitting || values.email === ""}
              sx={singleTheme.buttons.primary}
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
              onClick={() => {
                navigate("/login");
              }}
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

export default ForgotPassword;
