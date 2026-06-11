import { Button, useTheme } from "@mui/material";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { setAuthToken, setExpiration } from "../../../application/redux/auth/authSlice";
import { ReactComponent as MicrosoftIcon } from "../../assets/icons/microsoft-icon.svg";

interface MicrosoftSignInProps {
  isSubmitting: boolean;
  setIsSubmitting: (isSubmitting: boolean) => void;
  tenantId?: string;
  clientId?: string;
  organizationId?: number;
  onError?: (message: string) => void;
  text?: string;
}

export const MicrosoftSignIn: React.FC<MicrosoftSignInProps> = ({
  isSubmitting,
  setIsSubmitting,
  tenantId,
  clientId,
  organizationId,
  onError,
  text = "Sign in with Microsoft",
}) => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "MICROSOFT_AUTH_SUCCESS") {
        dispatch(setAuthToken(event.data.token));
        dispatch(setExpiration(event.data.expirationDate));
        localStorage.setItem("root_version", __APP_VERSION__);
        setIsSubmitting(false);
        navigate("/");
      } else if (event.data?.type === "MICROSOFT_AUTH_ERROR") {
        setIsSubmitting(false);
        onError?.(event.data.error || "SSO authentication failed");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [dispatch, navigate, setIsSubmitting, onError]);

  const handleClick = () => {
    if (!tenantId || !clientId || !organizationId) {
      onError?.("Microsoft Sign-In is not configured. Please contact your administrator.");
      return;
    }
    setIsSubmitting(true);
    sessionStorage.setItem("sso_organization_id", organizationId.toString());

    const redirectUri = `${window.location.origin}/auth/microsoft/callback`;
    const authUrl =
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
      `client_id=${clientId}&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent("openid profile email User.Read")}` +
      `&response_mode=query`;

    const popup = window.open(authUrl, "vw_microsoft_sso", "width=500,height=650");
    if (!popup) {
      setIsSubmitting(false);
      onError?.("Popup blocked. Please allow popups for this site and try again.");
    }
  };

  const disabled = isSubmitting || !tenantId || !clientId || !organizationId;

  return (
    <Button
      type="button"
      disableRipple
      variant="contained"
      sx={{
        "height": 34,
        "fontSize": "13px",
        "backgroundColor": "#2f2f2f",
        "color": "#ffffff",
        "boxShadow": "none",
        "textTransform": "none",
        "borderRadius": "4px",
        "position": "relative",
        "paddingLeft": theme.spacing(6),
        "&:hover": { backgroundColor: "#1a1a1a", boxShadow: "none" },
        "&:disabled": { backgroundColor: "#cccccc", color: "#666666" },
      }}
      onClick={handleClick}
      disabled={disabled}
    >
      <MicrosoftIcon
        style={{
          position: "absolute",
          left: theme.spacing(2.5),
          width: "20px",
          height: "20px",
          backgroundColor: "white",
          borderRadius: "2px",
          padding: "2px",
        }}
      />
      {disabled && !isSubmitting ? "Microsoft Sign-In Not Configured" : text}
    </Button>
  );
};
