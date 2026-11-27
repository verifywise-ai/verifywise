import React, { useEffect, useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { Unplug, UserRound, Wrench } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import VerifyWiseLogo from "../../assets/imgs/verifywise-logo.svg";
import Alert from "../../components/Alert";
import { CustomizableButton } from "../../components/button/customizable-button";
import { background, border, brand, icon, radiusPx, text } from "../../themes/palette";
import { fontWeight, textStyles } from "../../themes/typography";
import { useAuth } from "../../../application/hooks/useAuth";
import { useMcpAuthorizationRequest } from "../../../application/hooks/useMcpOAuth";
import { useMcpTools } from "../../../application/hooks/useMcpTools";
import { decideMcpAuthorizationRequest } from "../../../application/repository/mcpOAuth.repository";
import { rememberMcpAuthorization } from "../../../application/utils/mcpAuthorizeReturn";

/**
 * Where an MCP client such as Claude Code sends the browser to sign in
 * (Servers/mcp/oauth.ts). The signed-in user allows or declines; either way
 * the browser goes back to the client's own address, which the page names
 * before the user answers.
 *
 * Not behind ProtectedRoute: a user who is not signed in is sent to log in and
 * brought back here (mcpAuthorizeReturn), and a super admin without an
 * organization must not be redirected to /super-admin first.
 */
const McpAuthorize: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestToken = searchParams.get("request");
  const { isAuthenticated, userToken } = useAuth();
  const {
    data: request,
    error,
    isLoading,
  } = useMcpAuthorizationRequest(requestToken, isAuthenticated);
  const canAllow = request?.canAllow === true;
  const { data: tools } = useMcpTools(canAllow);
  const [isAnswering, setIsAnswering] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated && requestToken) {
      rememberMcpAuthorization(`${location.pathname}${location.search}`);
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, requestToken, location.pathname, location.search, navigate]);

  const answer = async (allow: boolean) => {
    if (!requestToken) return;
    setIsAnswering(true);
    setAnswerError(null);
    try {
      window.location.assign(await decideMcpAuthorizationRequest(requestToken, allow));
    } catch (err) {
      setAnswerError(err instanceof Error ? err.message : "Could not send your answer.");
      setIsAnswering(false);
    }
  };

  const clientName = request?.clientName || "An MCP client";
  const unusable = !requestToken
    ? "This page needs a sign-in request. Start again from your MCP client."
    : error instanceof Error
      ? error.message
      : null;

  const abilities = [
    {
      Icon: Wrench,
      text: tools
        ? `Use the ${tools.length} VerifyWise tools your account has`
        : "Use the VerifyWise tools your account has",
    },
    {
      Icon: UserRound,
      text: `Act as you in ${request?.organizationName ?? "VerifyWise"}`,
    },
    { Icon: Unplug, text: "Stay connected until you disconnect it in Settings → MCP" },
  ];

  return (
    <Stack sx={{ minHeight: "100vh", backgroundColor: "background.main" }}>
      <Stack
        sx={{
          width: 440,
          maxWidth: "calc(100% - 32px)",
          mx: "auto",
          py: theme.spacing(40),
          gap: theme.spacing(16),
        }}
      >
        <Box
          component="img"
          src={VerifyWiseLogo}
          alt="VerifyWise"
          sx={{ height: 32, alignSelf: "flex-start" }}
        />

        {unusable ? (
          <Alert variant="error" body={unusable} isToast={false} inline />
        ) : isLoading || !request ? (
          <Typography sx={{ ...textStyles.body, color: text.tertiary }}>
            Loading the sign-in request…
          </Typography>
        ) : (
          <>
            <Typography sx={{ ...textStyles.pageTitle, color: text.primary }}>
              Allow {clientName}
              <br />
              to use VerifyWise
            </Typography>

            <Stack
              direction="row"
              alignItems="center"
              gap={theme.spacing(6)}
              sx={{
                p: theme.spacing(8),
                border: `1px solid ${border.dark}`,
                borderRadius: radiusPx.sm,
              }}
            >
              <Stack
                alignItems="center"
                justifyContent="center"
                sx={{
                  width: 36,
                  height: 36,
                  flexShrink: 0,
                  borderRadius: radiusPx.pill,
                  backgroundColor: background.fill,
                  color: brand.primary,
                  ...textStyles.subsectionTitle,
                }}
              >
                {userToken?.email?.charAt(0).toUpperCase()}
              </Stack>
              <Stack sx={{ minWidth: 0 }}>
                <Typography
                  noWrap
                  sx={{ ...textStyles.body, fontWeight: fontWeight.medium, color: text.primary }}
                >
                  {userToken?.email}
                </Typography>
                <Typography sx={{ ...textStyles.body, color: text.tertiary }}>
                  {request.organizationName ?? "Super admin, no organization"}
                </Typography>
              </Stack>
            </Stack>

            {canAllow ? (
              <Stack sx={{ gap: theme.spacing(6) }}>
                <Typography sx={{ ...textStyles.subsectionTitle, color: text.primary }}>
                  {clientName} will be able to
                </Typography>
                {abilities.map(({ Icon, text: ability }) => (
                  <Stack key={ability} direction="row" alignItems="center" gap={theme.spacing(6)}>
                    <Icon size={16} color={icon.default} style={{ flexShrink: 0 }} />
                    <Typography sx={{ ...textStyles.body, color: text.secondary }}>
                      {ability}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Alert
                variant="warning"
                body="Only Admins and super admins can connect an MCP client. Log in with such an account, or cancel."
                isToast={false}
                inline
              />
            )}

            <Stack sx={{ gap: theme.spacing(8) }}>
              <Typography sx={{ ...textStyles.body, color: text.tertiary }}>
                Allow only if you started this in your MCP client. Your browser then goes back to{" "}
                <Box component="span" sx={{ fontWeight: fontWeight.semibold, color: text.primary }}>
                  {request.redirectHost}
                </Box>
                .
              </Typography>

              {answerError && <Alert variant="error" body={answerError} isToast={false} inline />}

              <Stack direction="row" gap={theme.spacing(6)}>
                <CustomizableButton
                  variant="outlined"
                  text="Cancel"
                  onClick={() => answer(false)}
                  isDisabled={isAnswering}
                  sx={{ flex: 1 }}
                />
                {canAllow && (
                  <CustomizableButton
                    variant="contained"
                    text={isAnswering ? "Allowing..." : "Allow"}
                    onClick={() => answer(true)}
                    isDisabled={isAnswering}
                    sx={{ flex: 2 }}
                  />
                )}
              </Stack>
            </Stack>
          </>
        )}
      </Stack>
    </Stack>
  );
};

export default McpAuthorize;
