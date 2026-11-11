import { Box, Button, Stack, Typography, useTheme } from "@mui/material";
import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ReactComponent as Background } from "../../../assets/imgs/background-grid.svg";
import Field from "../../../components/Inputs/Field";
import Alert from "../../../components/Alert";
import CustomizableToast from "../../../components/Toast";
import singleTheme from "../../../themes/v1SingleTheme";
import { background } from "../../../themes/palette";
import { extractUserToken } from "../../../../application/tools/extractToken";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { acceptInvitation } from "../../../../application/repository/user.repository";
import { useStartLoginSession } from "../../../../application/hooks/useStartLoginSession";
import type { AlertProps } from "../../../types/alert.types";

/**
 * Where an invitation to an address that already has an account leads: the
 * user confirms the account with their own password, joins the inviting
 * organization with the invited role, and is logged in to it.
 */
const JoinOrganization: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const startLoginSession = useStartLoginSession();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("token");
  const invitation = inviteToken ? extractUserToken(inviteToken) : null;
  // Checked once, when the page opens; the server checks again on submit.
  const [isInvitationValid] = useState(
    () => !!invitation && Date.now() < Number(invitation.expire),
  );

  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteToken || !invitation || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const response = await acceptInvitation({
        inviteToken,
        body: {
          email: invitation.email,
          password,
          roleId: Number(invitation.roleId),
          organizationId: Number(invitation.organizationId),
        },
      });
      setIsSubmitting(false);
      if (response.status === 202) {
        startLoginSession(response.data.data, false);
      }
    } catch (error) {
      setIsSubmitting(false);
      handleAlert({
        variant: "error",
        body:
          (error instanceof Error && error.message) ||
          "Could not join the organization. Please try again.",
        setAlert,
      });
    }
  };

  const fieldStyles = {
    width: 360,
    backgroundColor: `${background.main}`,
  };

  return (
    <Stack className="reg-user-page" sx={{ minHeight: "100vh" }}>
      {alert && (
        <Box>
          <Alert
            variant={alert.variant}
            title={alert.title}
            body={alert.body}
            isToast={true}
            onClick={() => setAlert(null)}
          />
        </Box>
      )}

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
          <Typography sx={{ fontSize: 40 }}>
            Verify
            <span style={{ color: singleTheme.textColors.theme }}>Wise</span>
          </Typography>
          {isInvitationValid ? (
            <Stack sx={{ gap: theme.spacing(4), alignItems: "center" }}>
              <Typography sx={{ fontSize: 16, fontWeight: "bold" }}>
                Join an organization
              </Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary", textAlign: "center" }}>
                Log in with your existing account to accept the invitation.
              </Typography>
            </Stack>
          ) : (
            <Typography sx={{ fontSize: 16, fontWeight: "semi-bold", color: "error.main" }}>
              This invitation link is expired. You need to be invited again to gain access to the
              dashboard
            </Typography>
          )}

          <Stack sx={{ gap: theme.spacing(7.5) }}>
            <Field
              label="Email"
              isRequired
              sx={fieldStyles}
              type="email"
              value={invitation?.email ?? ""}
              disabled
            />
            <Field
              label="Password"
              isRequired
              placeholder="Enter your password"
              sx={fieldStyles}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!isInvitationValid}
            />
            <Typography
              sx={{
                color: singleTheme.buttons.primary.contained.backgroundColor,
                fontSize: 13,
                fontWeight: "bold",
                cursor: "pointer",
                alignSelf: "flex-end",
              }}
              onClick={() => {
                navigate("/forgot-password", { state: { email: invitation?.email } });
              }}
            >
              Forgot password
            </Typography>
            <Button
              type="submit"
              disableRipple
              variant="contained"
              sx={singleTheme.buttons.primary.contained}
              disabled={!isInvitationValid || !password || isSubmitting}
            >
              Join organization
            </Button>
          </Stack>
        </Stack>
      </form>
    </Stack>
  );
};

export default JoinOrganization;
