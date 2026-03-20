import { Button, Stack, Typography, useTheme } from "@mui/material";
import React, { Suspense, useState, useEffect } from "react";
import { ReactComponent as Background } from "../../../assets/imgs/background-grid.svg";
import { Check } from "../../../components/Checks";
import Field from "../../../components/Inputs/Field";
import singleTheme from "../../../themes/v1SingleTheme";
import { useNavigate } from "react-router-dom";
import { logEngine } from "../../../../application/tools/log.engine";
import {
  validatePassword,
  validateForm,
  validateOrganizationForm,
} from "../../../../application/validations/formValidation";
import type {
  FormValues,
  FormErrors,
  OrganizationFormValues,
  OrganizationFormErrors,
} from "../../../../application/validations/formValidation";
import CustomizableToast from "../../../components/Toast";
import Alert from "../../../components/Alert";
import { useDispatch } from "react-redux";
import {
  setUserExists,
  setAuthToken,
  setExpiration,
} from "../../../../application/redux/auth/authSlice";
import { CreateMyOrganization } from "../../../../application/repository/organization.repository";
import useUsers from "../../../../application/hooks/useUsers";

// Initial state for form values
const initialState: FormValues = {
  name: "",
  surname: "",
  email: "",
  password: "",
  confirmPassword: "",
  roleId: 1,
};

// Initial state for organization form values
const initialOrganizationState: OrganizationFormValues = {
  organizationName: "",
};

const RegisterMultiTenant: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { users } = useUsers();

  // State for form values
  const [values, setValues] = useState<FormValues>(initialState);
  // State for form errors
  const [errors, setErrors] = useState<FormErrors>({});

  // State for organization form values
  const [organizationValues, setOrganizationValues] =
    useState<OrganizationFormValues>(initialOrganizationState);
  // State for organization form errors
  const [organizationErrors, setOrganizationErrors] =
    useState<OrganizationFormErrors>({});

  // State to track which form to show
  const [showOrganizationForm, setShowOrganizationForm] = useState(false);

  //state for overlay modal
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State to track password field focus
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  const passwordChecks = validatePassword(values);

  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);

  useEffect(() => {
    localStorage.clear();
    dispatch(setAuthToken(""));
  }, []);

  // Handle input field changes for user form
  const handleChange =
    (prop: keyof FormValues) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues({ ...values, [prop]: event.target.value });
      setErrors({ ...errors, [prop]: "" }); // Clear error for the specific field
    };

  // Handle password field focus
  const handlePasswordFocus = () => {
    setIsPasswordFocused(true);
  };

  // Handle password field blur (when input loses focus)
  const handlePasswordBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    // Hide indicators if field is empty when focus is lost
    if (!event.target.value) {
      setIsPasswordFocused(false);
    }
  };

  // Handle input field changes for organization form
  const handleOrganizationChange =
    (prop: keyof OrganizationFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setOrganizationValues({
        ...organizationValues,
        [prop]: event.target.value,
      });
      setOrganizationErrors({ ...organizationErrors, [prop]: "" }); // Clear error for the specific field
    };

  // Handle organization form submission (Next button)
  const handleOrganizationSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const { isFormValid, errors } =
      validateOrganizationForm(organizationValues);
    if (!isFormValid) {
      setOrganizationErrors(errors);
      return;
    }

    // Store organization data and proceed to user registration form
    setShowOrganizationForm(false);
  };

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const { isFormValid, errors } = validateForm(values);
    if (!isFormValid) {
      setErrors(errors);
      setIsSubmitting(false);
      return;
    }

    // Include organization data in the request
    const requestBody = {
      name: `${values.name}'s Organization`,
      userName: values.name,
      userSurname: values.surname,
      userEmail: values.email,
      userPassword: values.password,
      userRoleId: values.roleId,
    };

    const response = (await CreateMyOrganization({
      routeUrl: "/organizations",
      body: requestBody,
    })) as any;
    setValues(initialState);
    setErrors({});
    setOrganizationValues(initialOrganizationState);
    setOrganizationErrors({});

    if (response.status === 201) {
      logEngine({
        type: "info",
        message: "Organization and account created successfully.",
        users,
      });
      const token = response.data.data.token;
      const organizationName = response.data.data.organization?.name || `${values.name}'s Organization`;
      const expirationDate = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
      dispatch(setAuthToken(token));
      dispatch(setExpiration(expirationDate));
      // Store organization name and clear the flag so the modal shows on first login
      localStorage.setItem("initial_org_name", organizationName);
      localStorage.setItem("initial_org_id", response.data.data.organization?.id || -1);
      localStorage.removeItem("has_seen_org_name_modal");
      setTimeout(() => {
        setIsSubmitting(false);
        dispatch(setUserExists(true));
        localStorage.setItem("root_version", __APP_VERSION__);
        navigate("/");
      }, 3000);
    } else if (response.status === 400) {
      logEngine({
        type: "error",
        message: "Bad request. Please check your input.",
        users,
      });
      setIsSubmitting(false);
      setShowOrganizationForm(true);
      setAlert({
        variant: "error",
        body: "Bad request. Please check your input.",
      });
      setTimeout(() => setAlert(null), 3000);
    } else if (response.status === 409) {
      logEngine({
        type: "event",
        message: "Organization or account already exists.",
        users,
      });
      setIsSubmitting(false);
      setShowOrganizationForm(true);
      setAlert({
        variant: "error",
        body: "Organization or account already exists.",
      });
      setTimeout(() => setAlert(null), 3000);
    } else if (response.status === 500) {
      logEngine({
        type: "error",
        message: "Internal server error. Please try again later.",
        users,
      });
      setIsSubmitting(false);
      if (
        (response.data as { message: string; error: string })?.error ===
        "User with this email already exists"
      ) {
        setAlert({
          variant: "error",
          body: "User with this email already exists. Please use a different email.",
        });
        setTimeout(() => {
          setAlert(null);
          navigate("/login");
        }, 3000);
      } else {
        setShowOrganizationForm(true);
        setAlert({
          variant: "error",
          body: "Internal server error. Please try again later.",
        });
        setTimeout(() => setAlert(null), 3000);
      }
    } else {
      logEngine({
        type: "error",
        message: "Unexpected response. Please try again.",
        users,
      });
      setIsSubmitting(false);
      setShowOrganizationForm(true);
      setAlert({
        variant: "error",
        body: "Unexpected response. Please try again.",
      });
      setTimeout(() => setAlert(null), 3000);
    }
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
        marginBottom: theme.spacing(20),
      }}
    >
      {alert && (
        <Suspense fallback={<div>Loading...</div>}>
          <Alert
            variant={alert.variant}
            title={alert.title}
            body={alert.body}
            isToast={true}
            onClick={() => {
              setAlert(null);
              navigate("/login");
            }}
          />
        </Suspense>
      )}
      {isSubmitting && (
        <CustomizableToast title="Processing your request. Please wait..." />
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

      {/* Organization form */}
      {showOrganizationForm && (
        <form onSubmit={handleOrganizationSubmit}>
          <Stack
            className="org-form"
            sx={{
              width: 360,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
              margin: "auto",
              mt: 40,
              gap: theme.spacing(10),
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
            <Typography sx={{ fontSize: 16, fontWeight: "bold" }}>
              Create your organization
            </Typography>
            <Typography
              sx={{
                color: singleTheme.buttons.primary.contained.backgroundColor,
                fontSize: 14,
                fontWeight: "bold",
                cursor: "pointer",
                textAlign: "center",
              }}
              onClick={() => navigate("/login")}
            >
              ← Back to Login
            </Typography>
            <Stack sx={{ gap: theme.spacing(7.5) }}>
              <Field
                label="Organization name"
                isRequired
                placeholder="Your organization name"
                sx={fieldStyles}
                value={organizationValues.organizationName}
                onChange={handleOrganizationChange("organizationName")}
                error={organizationErrors.organizationName}
              />
              <Button
                type="submit"
                disableRipple
                variant="contained"
                sx={{
                  ...singleTheme.buttons.primary.contained,
                  mt: theme.spacing(5),
                }}
              >
                Next
              </Button>
            </Stack>
          </Stack>
        </form>
      )}

      {/* User registration form */}
      {!showOrganizationForm && (
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
              gap: theme.spacing(10),
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
            <Typography sx={{ fontSize: 16, fontWeight: "bold" }}>
              Create admin account
            </Typography>
            <Typography
              sx={{
                color: singleTheme.buttons.primary.contained.backgroundColor,
                fontSize: 14,
                fontWeight: "bold",
                cursor: "pointer",
                textAlign: "center",
              }}
              onClick={() => navigate("/login")}
            >
              ← Back to Login
            </Typography>
            <Stack sx={{ gap: theme.spacing(7.5) }}>
              <Field
                label="Name"
                isRequired
                placeholder="Your name"
                sx={fieldStyles}
                value={values.name}
                onChange={handleChange("name")}
                error={errors.name}
              />
              <Field
                label="Surname"
                isRequired
                placeholder="Your surname"
                sx={fieldStyles}
                value={values.surname}
                onChange={handleChange("surname")}
                error={errors.surname}
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
                onFocus={handlePasswordFocus}
                onBlur={handlePasswordBlur}
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
              />
              {(isPasswordFocused || values.password || errors.password) && (
                <Stack
                  sx={{
                    gap: theme.spacing(6),
                    mt: theme.spacing(2),
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
              )}
              <Button
                type="submit"
                disableRipple
                variant="contained"
                sx={{
                  marginTop: !(
                    isPasswordFocused ||
                    values.password ||
                    errors.password
                  )
                    ? 10
                    : 0,
                  ...singleTheme.buttons.primary.contained,
                }}
              >
                Get started
              </Button>
            </Stack>
          </Stack>
        </form>
      )}
    </Stack>
  );
};

export default RegisterMultiTenant;
