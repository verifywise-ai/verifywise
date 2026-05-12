import { Button, IconButton, Stack, Typography, useTheme, Box } from "@mui/material";
import React, { Suspense, useEffect, useState } from "react";
import { X } from "lucide-react";
import { ReactComponent as Background } from "../../../assets/imgs/background-grid.svg";
import Checkbox from "../../../components/Inputs/Checkbox";
import Field from "../../../components/Inputs/Field";
import singleTheme from "../../../themes/v1SingleTheme";
import { useNavigate } from "react-router-dom";
import { logEngine } from "../../../../application/tools/log.engine";
import { useDispatch } from "react-redux";
import {
  setAuthToken,
  setExpiration,
  setOnboardingStatus,
  setIsOrgCreator,
  setIsSuperAdmin,
  setActiveOrganizationId,
} from "../../../../application/redux/auth/authSlice";
import Alert from "../../../components/Alert";
import { ENV_VARs } from "../../../../../env.vars";
import { loginUser } from "../../../../application/repository/user.repository";
import { getOrganizations } from "../../../../application/repository/superAdmin.repository";
import { checkOrganizationExists } from "../../../../application/repository/organization.repository";

// Animated loading component specifically for login
const LoginLoadingOverlay: React.FC = () => {
  const theme = useTheme();
  const text = "Processing your request. Please wait...";
  const words = text.split(" ");

  return (
    <Stack
      sx={{
        width: "100%",
        maxWidth: "100%",
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 9999,
        backdropFilter: "blur(8px)",
        background: "rgba(255, 255, 255, 0.37)",
      }}
    >
      <Stack
        sx={{
          border: 1,
          borderColor: theme.palette.border.light,
          borderRadius: theme.shape.borderRadius,
          backgroundColor: theme.palette.background.main,
          width: "fit-content",
          height: "fit-content",
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9999,
          padding: "20px 40px",
          fontSize: 13,
        }}
      >
        <Box sx={{ display: "inline-block" }}>
          {words.map((word, wordIndex) => (
            <React.Fragment key={wordIndex}>
              {word.split("").map((char, charIndex) => {
                const totalIndex =
                  words.slice(0, wordIndex).join(" ").length + (wordIndex > 0 ? 1 : 0) + charIndex;

                return (
                  <Box
                    key={`${wordIndex}-${charIndex}`}
                    component="span"
                    sx={{
                      "display": "inline-block",
                      "animation": `colorWave 2s ease-in-out infinite`,
                      "animationDelay": `${totalIndex * 0.1}s`,
                      "@keyframes colorWave": {
                        "0%, 100%": {
                          color: "status.default.text",
                        },
                        "50%": {
                          color: "brand.primary",
                        },
                      },
                    }}
                  >
                    {char}
                  </Box>
                );
              })}
              {wordIndex < words.length - 1 && <span> </span>}
            </React.Fragment>
          ))}
        </Box>
      </Stack>
    </Stack>
  );
};

const isDemoApp = ENV_VARs.IS_DEMO_APP || false;

// Define the shape of form values
interface FormValues {
  email: string;
  password: string;
  rememberMe: boolean;
}

// Initial state for the form
const initialState: FormValues = {
  email: isDemoApp ? "verifywise@email.com" : "",
  password: isDemoApp ? "Verifywise#1" : "",
  rememberMe: false,
};

const Login: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  // State for form values
  const [values, setValues] = useState<FormValues>(initialState);

  const loginText = isDemoApp
    ? "Click on Sign in button directly to continue"
    : "Log in to your account";

  //disabled overlay state/modal
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);
  const [showSetupBanner, setShowSetupBanner] = useState(false);

  useEffect(() => {
    checkOrganizationExists()
      .then((exists) => {
        if (!exists) setShowSetupBanner(true);
      })
      .catch(() => {});
  }, []);

  // Handle changes in input fields
  const handleChange = (prop: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues({ ...values, [prop]: event.target.value });
  };

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    await loginUser({
      body: values,
    })
      .then(async (response) => {
        setValues(initialState);

        if (response.status === 202) {
          const token = response.data.data.token;
          const isSuperAdminFlag = response.data.data.isSuperAdmin || false;

          if (values.rememberMe) {
            const expirationDate = Date.now() + 30 * 24 * 60 * 60 * 1000;
            dispatch(setAuthToken(token));
            dispatch(setExpiration(expirationDate));
          } else {
            dispatch(setAuthToken(token));
            dispatch(setExpiration(null));
          }

          if (isSuperAdminFlag) {
            dispatch(setIsSuperAdmin(true));
            localStorage.setItem("root_version", __APP_VERSION__);
            logEngine({ type: "info", message: "Super-admin login successful." });

            // Auto-select the first organization so super-admin can view org data
            try {
              const orgsResponse = await getOrganizations();
              const orgsData = (orgsResponse.data as any)?.data || [];
              if (orgsData.length > 0) {
                dispatch(setActiveOrganizationId(orgsData[0].id));
              }
            } catch (err) {
              console.error("Failed to fetch organizations for auto-select:", err);
            }

            // Always go to super-admin panel
            setIsSubmitting(false);
            navigate("/super-admin");
            return;
          }

          const onboardingStatus = response.data.data.onboarding_status || "completed";
          const isOrgCreatorFlag = response.data.data.is_org_creator || false;

          // Store onboarding status from server
          dispatch(setOnboardingStatus(onboardingStatus));
          dispatch(setIsOrgCreator(isOrgCreatorFlag));

          localStorage.setItem("root_version", __APP_VERSION__);

          logEngine({
            type: "info",
            message: "Login successful.",
          });

          setIsSubmitting(false);
          navigate("/");
        }
      })
      .catch((error) => {
        setIsSubmitting(false);

        let message = "An error occurred. Please try again.";
        const status = error.status || error.response?.status;
        const responseData = error.response?.data;

        if (status === 401 || status === 429) {
          // Expected user errors - no logging needed, just show the message
          message = error.message || "Invalid email or password";
        } else if (status === 500) {
          // Backend returns: { message: "Internal Server Error", error: <error message> }
          const errorMessage = responseData?.error || responseData?.message;
          message = errorMessage
            ? `Server error: ${errorMessage}`
            : "Internal server error. Please try again later.";

          logEngine({
            type: "error",
            message: `Server error during login: ${errorMessage || "Unknown error"}`,
          });
        } else if (error.message === "Network Error" || !error.response) {
          message = "Network error. Please check your connection and try again.";

          logEngine({
            type: "error",
            message: "Network error during login.",
          });
        } else {
          // Handle other unexpected status codes - these are worth logging
          const errorMessage = responseData?.message || responseData?.error || error.message;
          message = errorMessage || "An unexpected error occurred. Please try again.";

          logEngine({
            type: "error",
            message: `Unexpected error during login: ${errorMessage}`,
          });
        }

        setAlert({ variant: "error", body: message });
        setTimeout(() => setAlert(null), 5000);
      });
  };

  const theme = useTheme();

  // Styles for input fields
  const fieldStyles = {
    width: 360,
    backgroundColor: "background.main",
  };

  return (
    <Stack
      className="reg-admin-page"
      sx={{
        minHeight: "100vh",
      }}
    >
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

      {isSubmitting && <LoginLoadingOverlay />}
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
          }}
        >
          <Typography
            sx={{
              fontSize: 40,
            }}
          >
            Verify
            <span style={{ color: singleTheme.textColors.theme }}>Wise</span>
          </Typography>
          <Typography sx={{ fontSize: 16, fontWeight: "bold" }}>{loginText}</Typography>
          {showSetupBanner && (
            <Stack
              direction="row"
              alignItems="flex-start"
              gap={theme.spacing(8)}
              sx={{
                width: 360,
                padding: theme.spacing(8),
                backgroundColor: singleTheme.alertStyles.info.bg,
                border: `1px solid ${singleTheme.alertStyles.info.border}`,
                borderRadius: theme.shape.borderRadius,
              }}
            >
              <Typography
                sx={{
                  fontSize: 13,
                  color: singleTheme.alertStyles.info.text,
                  flex: 1,
                }}
              >
                Welcome to VerifyWise! To get started, log in with your superadmin credentials to
                create an organization and invite users.
              </Typography>
              <IconButton
                disableRipple
                onClick={() => setShowSetupBanner(false)}
                aria-label="Close banner"
                sx={{ padding: 0 }}
              >
                <X size={16} color={singleTheme.alertStyles.info.text} />
              </IconButton>
            </Stack>
          )}
          <Stack sx={{ gap: theme.spacing(7.5) }}>
            <Field
              label="Email"
              isRequired
              placeholder="name.surname@companyname.com"
              sx={fieldStyles}
              type="email"
              value={values.email}
              onChange={handleChange("email")}
              disabled={isDemoApp}
            />
            <Field
              label="Password"
              isRequired
              placeholder="Enter your password"
              sx={fieldStyles}
              type="password"
              value={values.password}
              onChange={handleChange("password")}
              disabled={isDemoApp}
            />
            <Stack
              sx={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Checkbox
                id="30-days-memory"
                label="Remember for 30 days"
                isChecked={values.rememberMe}
                value={values.rememberMe ? "true" : "false"}
                onChange={(e) => {
                  setValues({ ...values, rememberMe: e.target.checked });
                }}
                size="small"
              />
              <Typography
                sx={{
                  color: singleTheme.buttons.primary.contained.backgroundColor,
                  fontSize: 13,
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
                onClick={() => {
                  navigate("/forgot-password", {
                    state: { email: values.email },
                  });
                }}
              >
                Forgot password
              </Typography>
            </Stack>
            <Button
              type="submit"
              disableRipple
              variant="contained"
              sx={singleTheme.buttons.primary.contained}
            >
              Sign in
            </Button>
          </Stack>
        </Stack>
      </form>
    </Stack>
  );
};

export default Login;
