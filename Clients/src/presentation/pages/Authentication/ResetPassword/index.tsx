/**
 * This file is currently in use
 */

import { Stack, Typography, useTheme } from "@mui/material";
import { ReactComponent as Background } from "../../../assets/imgs/background-grid.svg";
import { Mail as Email } from "lucide-react";
import { ArrowLeft as LeftArrowLong } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useState, lazy, Suspense } from "react";
import { sendPasswordResetEmail } from "../../../../application/repository/auth.repository";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { AlertProps } from "../../../types/alert.types";
import singleTheme from "../../../themes/v1SingleTheme";
import Field from "../../../components/Inputs/Field";
import { text, border as borderPalette } from "../../../themes/palette";

const Alert = lazy(() => import("../../../components/Alert"));

interface FormValues {
  email: string;
}

const ResetPassword = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const location = useLocation();
  const [alert, setAlert] = useState<AlertProps | null>(null);

  // Update initial state to use the email from navigation state if available
  const initialState: FormValues = {
    email: location.state?.email || "",
  };

  // State for form values
  const [values, setValues] = useState<FormValues>(initialState);

  const handleChange =
    (field: keyof FormValues) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues({ ...values, [field]: event.target.value });
    };

  const resendEmail = async () => {
    // Validate email before sending
    if (!values.email || !values.email.trim()) {
      handleAlert({
        variant: "error",
        body: "Please enter an email address",
        setAlert,
      });
      return;
    }

    const formData = {
      to: values.email,
      email: values.email,
      name: values.email,
    };
    const response = await sendPasswordResetEmail(formData);
    handleAlert({
      variant: response.status === 200 ? "success" : "error",
      body:
        response.status === 200 ? "If an account exists with this email, we'll send a password reset link" : "Request failed",
      setAlert,
    });
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
          <Email size={24} />
        </Stack>
        <Stack sx={{ gap: theme.spacing(6), textAlign: "center" }}>
          <Typography sx={{ fontSize: 16, fontWeight: "bold" }}>
            Check your email
          </Typography>
          <Typography fontSize={13} color={`${text.tertiary}`}>
            If an account exists with this email, we'll send a password reset link
          </Typography>
        </Stack>
        <Stack sx={{ width: "100%", gap: theme.spacing(6) }}>
          <Field
            label="Email"
            isRequired
            placeholder="Enter your email"
            type="email"
            value={values.email}
            onChange={handleChange("email")}
          />
        </Stack>
        <Stack sx={{ gap: theme.spacing(12) }} onClick={resendEmail}>
          <Typography sx={{ fontSize: 13, color: `${text.tertiary}` }}>
            Didn't receive the email?{" "}
            <span
              style={{
                fontWeight: "bold",
                color: singleTheme.buttons.primary.contained.backgroundColor,
                cursor: "pointer",
              }}
            >
              Click to resend
            </span>
          </Typography>
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
    </Stack>
  );
};

export default ResetPassword;
