import { ReactNode } from "react";
import { Box, Link, Typography, type SxProps, type Theme } from "@mui/material";
import { useNavigate } from "react-router";
import { useAuth } from "../../../application/hooks/useAuth";
import allowedRoles from "../../../application/constants/permissions";
import { LLM_KEY_CREATE_PATH } from "../../../application/constants/llmKeyDeepLink";
import { fontSize } from "../../themes/typography";

interface LLMKeyRequiredNoticeProps {
  /** Shown to roles that can add a key, followed by a "Go to settings" link. */
  adminMessage: string;
  /** Shown to everyone else, who has to ask an administrator. */
  memberMessage: string;
  icon: ReactNode;
  /** Background of the icon tile. */
  iconBackground: string;
  /** The outer box: a card on Start here, a bar under the Advisor thread. */
  sx?: SxProps<Theme>;
}

/**
 * "This needs an LLM API key" for screens that cannot work without one.
 * Roles that can manage keys get a link straight to the add-key form; others
 * are told to ask an administrator.
 */
const LLMKeyRequiredNotice = ({
  adminMessage,
  memberMessage,
  icon,
  iconBackground,
  sx,
}: LLMKeyRequiredNoticeProps) => {
  const navigate = useNavigate();
  const { userRoleName } = useAuth();
  const canManageKeys = allowedRoles.llmKeys.manage.includes(userRoleName);

  return (
    <Box
      role="status"
      sx={[
        { display: "flex", alignItems: "center", gap: "12px" },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: "4px",
          backgroundColor: iconBackground,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Typography sx={{ fontSize: fontSize.base, color: "text.secondary", lineHeight: 1.5 }}>
        {canManageKeys ? (
          <>
            {adminMessage}{" "}
            <Link
              component="button"
              type="button"
              onClick={() => navigate(LLM_KEY_CREATE_PATH)}
              sx={{ fontSize: "inherit", verticalAlign: "baseline" }}
            >
              Go to settings
            </Link>
            .
          </>
        ) : (
          memberMessage
        )}
      </Typography>
    </Box>
  );
};

export default LLMKeyRequiredNotice;
