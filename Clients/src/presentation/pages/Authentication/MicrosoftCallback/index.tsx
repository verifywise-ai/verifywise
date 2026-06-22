import { useEffect, useState } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import { setAuthToken, setExpiration } from "../../../../application/redux/auth/authSlice";
import { loginUserWithMicrosoft } from "../../../../application/repository/user.repository";

const MicrosoftCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const finishLogin = async () => {
      const code = searchParams.get("code");
      const errorParam = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      const fail = (msg: string) => {
        setError(msg);
        if (window.opener) {
          window.opener.postMessage(
            { type: "MICROSOFT_AUTH_ERROR", error: msg },
            window.location.origin,
          );
          setTimeout(() => window.close(), 3000);
        } else {
          setTimeout(() => navigate("/login", { state: { error: msg } }), 3000);
        }
      };

      if (errorParam) return fail(errorDescription || "Authentication failed");
      if (!code) return fail("No authorization code received");

      const orgIdRaw = sessionStorage.getItem("sso_organization_id");
      if (!orgIdRaw) return fail("Missing organization context for SSO callback");
      const organizationId = parseInt(orgIdRaw, 10);
      if (!organizationId) return fail("Invalid organization context for SSO callback");

      const redirectUri = `${window.location.origin}/auth/microsoft/callback`;
      try {
        const response = await loginUserWithMicrosoft({ code, organizationId, redirectUri });
        if (response.status !== 200 && response.status !== 202) {
          return fail("Authentication failed");
        }
        const token = response.data.data.token;
        const expirationDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

        if (window.opener) {
          window.opener.postMessage(
            { type: "MICROSOFT_AUTH_SUCCESS", token, expirationDate },
            window.location.origin,
          );
          window.close();
        } else {
          dispatch(setAuthToken(token));
          dispatch(setExpiration(expirationDate));
          localStorage.setItem("root_version", __APP_VERSION__);
          navigate("/");
        }
      } catch {
        fail("SSO authentication failed");
      }
    };

    finishLogin();
  }, [searchParams, navigate, dispatch]);

  return (
    <Box
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      height="100vh"
      gap={2}
    >
      {error ? (
        <>
          <Typography color="error" variant="h6">
            {error}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Redirecting to login...
          </Typography>
        </>
      ) : (
        <>
          <CircularProgress />
          <Typography variant="body1">Completing sign in...</Typography>
        </>
      )}
    </Box>
  );
};

export default MicrosoftCallback;
