import { Button, Stack, Typography, useTheme, Box } from "@mui/material";
import React, { useState, useEffect, lazy, Suspense } from "react";
import { ReactComponent as Background } from "../../../assets/imgs/background-grid.svg";
import { Check } from "../../../components/Checks";
import Field from "../../../components/Inputs/Field";
import singleTheme from "../../../themes/v1SingleTheme";
import { validatePassword, validateForm } from "../../../../application/validations/formValidation";
import type { FormValues, FormErrors } from "../../../../application/validations/formValidation";
import useRegisterUser from "../../../../application/hooks/useRegisterUser";
import { useNavigate } from "react-router-dom";
import { logEngine } from "../../../../application/tools/log.engine";
import CustomizableToast from "../../../components/Toast";
import { extractUserToken } from "../../../../application/tools/extractToken";
import { useSearchParams } from "react-router-dom";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { background } from "../../../themes/palette";
const Alert = lazy(() => import("../../../components/Alert"));

export interface AlertType {
  variant: "success" | "info" | "warning" | "error";
  title?: string;
  body: string;
}

// Initial state for form values
const initialState: FormValues = {
  name: "",
  surname: "",
  email: "",
  password: "",
  confirmPassword: "",
};

const RegisterUser: React.FC = () => {
  const navigate = useNavigate();
  const { registerUser } = useRegisterUser();
  // Extract user token
  const [searchParams] = useSearchParams();
  const userToken = searchParams.get("token");
  const [isInvitationValid, setIsInvitationValid] = useState<boolean>(true);
  const [alert, setAlert] = useState<AlertType | null>(null);

  // State for form values
  const [values, setValues] = useState<FormValues>(initialState);
  // State for form errors
  const [errors, setErrors] = useState<FormErrors>({});
  // Password checks based on the password input
  const passwordChecks = validatePassword(values);

  //disabled overlay modal state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle input field changes
  const handleChange = (prop: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues({ ...values, [prop]: event.target.value });
    setErrors({ ...errors, [prop]: "" });
  };

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const user = {
      id: "At register level as user",
      firstname: values.name || "",
      lastname: values.surname || "",
      roleId: Number(values.roleId) || 1,
      organizationId: Number(values.organizationId),
    };
    const { isFormValid, errors } = validateForm(values);
    if (!isFormValid) {
      setErrors(errors);
      setIsSubmitting(false);
    } else {
      const { isSuccess, response } = await registerUser(
        {
          values,
          user,
          setIsSubmitting,
        },
        userToken,
      );
      if (isSuccess === 201) {
        setValues(initialState);
        setErrors({});
        handleAlert({
          variant: "success",
          body: "Registration successful. Redirecting to login page...",
          setAlert,
        });
        setTimeout(() => {
          navigate("/login");
          setIsSubmitting(false);
        }, 2000);
      } else {
        logEngine({
          type: "error",
          message: "Registration failed.",
        });
        setIsSubmitting(false);

        // Extract error message from server response
        let errorMessage = "Registration failed. Please check your information and try again.";

        if (response?.data) {
          errorMessage = response.data;
        } else if (response?.response?.data?.data) {
          errorMessage = response.response.data.data;
        } else if (response?.response?.data?.message) {
          errorMessage = response.response.data.message;
        } else if (response?.message) {
          errorMessage = response.message;
        } else if (isSuccess === 409) {
          errorMessage =
            "An account with this email address already exists. Please try logging in instead, or contact your administrator if you believe this is an error.";
        }

        handleAlert({
          variant: "error",
          body: errorMessage,
          setAlert,
        });
      }
    }
  };

  const theme = useTheme();

  // Styles for input fields
  const fieldStyles = {
    width: 360,
    backgroundColor: `${background.main}`,
  };

  const checkValidInvitation = (expDate: any) => {
    const todayDate = new Date();
    const currentTime = todayDate.getTime();

    if (currentTime < expDate) {
      setIsInvitationValid(true);
    } else {
      setIsInvitationValid(false);
    }
    return isInvitationValid;
  };

  useEffect(() => {
    if (userToken !== null) {
      const userInfo = extractUserToken(userToken);
      if (userInfo !== null) {
        const isValidLink = checkValidInvitation(userInfo?.expire);

        if (isValidLink) {
          const userData: FormValues = {
            ...initialState,
            name: userInfo.name ?? "",
            surname: userInfo.surname ?? "",
            email: userInfo.email ?? "",
            roleId: Number(userInfo.roleId) || 1,
            organizationId: Number(userInfo.organizationId),
          };
          setValues(userData);
        }
      }
    }
  }, [userToken]);

  return (
    <Stack
      className="reg-user-page"
      sx={{
        minHeight: "100vh",
      }}
    >
      {alert && (
        <Suspense fallback={<div>Loading...</div>}>
          <Box>
            <Alert
              variant={alert.variant}
              title={alert.title}
              body={alert.body}
              isToast={true}
              onClick={() => setAlert(null)}
            />
          </Box>
        </Suspense>
      )}

      {/* Toast component */}
      {isSubmitting && <CustomizableToast title="Processing your request. Please wait..." />}
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
          className="reg-user-form"
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
          {isInvitationValid === true ? (
            <Typography sx={{ fontSize: 16, fontWeight: "bold" }}>
              Create VerifyWise user account
            </Typography>
          ) : (
            <Typography
              sx={{
                fontSize: 16,
                fontWeight: "semi-bold",
                color: "error.main",
              }}
            >
              This invitation link is expired. You need to be invited again to gain access to the
              dashboard
            </Typography>
          )}

          <Stack sx={{ gap: theme.spacing(7.5) }}>
            <Field
              label="Name"
              isRequired
              placeholder="Your name"
              sx={fieldStyles}
              value={values.name}
              onChange={handleChange("name")}
              error={errors.name}
              disabled={!isInvitationValid}
            />
            <Field
              label="Surname"
              isRequired
              placeholder="Your surname"
              sx={fieldStyles}
              value={values.surname}
              onChange={handleChange("surname")}
              error={errors.surname}
              disabled={!isInvitationValid}
            />
            <Field
              label="Email"
              isRequired
              placeholder="name.surname@companyname.com"
              sx={fieldStyles}
              type="email"
              value={values.email}
              onChange={handleChange("email")}
              error={errors.email}
              disabled
            />
            <Field
              label="Password"
              isRequired
              placeholder="Create a password"
              sx={fieldStyles}
              type="password"
              value={values.password}
              onChange={handleChange("password")}
              error={errors.password}
              disabled={!isInvitationValid}
            />
            <Field
              label="Confirm password"
              isRequired
              placeholder="Confirm your password"
              sx={fieldStyles}
              type="password"
              value={values.confirmPassword}
              onChange={handleChange("confirmPassword")}
              error={errors.confirmPassword}
              disabled={!isInvitationValid}
            />
            <Stack
              sx={{
                gap: theme.spacing(6),
              }}
            >
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
              sx={singleTheme.buttons.primary.contained}
              disabled={!isInvitationValid}
            >
              Get started
            </Button>
          </Stack>
        </Stack>
      </form>
    </Stack>
  );
};

export default RegisterUser;
