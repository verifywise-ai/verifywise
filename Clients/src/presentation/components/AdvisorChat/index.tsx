import { Box, useTheme, Typography, Paper, CircularProgress, SxProps, Theme } from "@mui/material";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAdvisorRuntime } from "./useAdvisorRuntime";
import { CustomThread } from "./CustomThread";
import { AdvisorHeader } from "./AdvisorHeader";
import { AdvisorDomain } from "./advisorConfig";
import { useAdvisorConversationSafe } from "../../../application/contexts/AdvisorConversation.context";
import { useEffect, useRef, useMemo, memo } from "react";
import { useAuth } from "../../../application/hooks/useAuth";
import { Settings } from "lucide-react";
import { useNavigate } from "react-router";

// Extracted style functions for performance (created once per theme)
const createPaperStyles = (theme: Theme): SxProps<Theme> => ({
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  border: 1,
  borderColor: theme.palette.border?.light ?? theme.palette.divider,
  borderRadius: 3,
  bgcolor: theme.palette.background.main ?? theme.palette.background.default,
});

const createCenteredBoxStyles = (theme: Theme): SxProps<Theme> => ({
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  bgcolor: theme.palette.background.alt ?? theme.palette.background.paper,
});

interface AdvisorChatProps {
  selectedLLMKeyId?: number;
  pageContext?: AdvisorDomain;
  hasLLMKeys?: boolean | null;
  isLoadingLLMKeys?: boolean;
}

// Inner component that uses the runtime - only rendered when conversation is loaded.
// Keyed by (pageContext, activeId) upstream so switching conversations forces a
// clean remount of the assistant-ui runtime with fresh initial messages.
const AdvisorChatInner = ({
  selectedLLMKeyId,
  pageContext,
}: {
  selectedLLMKeyId?: number;
  pageContext?: AdvisorDomain;
}) => {
  const theme = useTheme();
  const runtime = useAdvisorRuntime(selectedLLMKeyId, pageContext);

  return (
    <Box
      sx={{
        flex: 1,
        overflow: "hidden",
        bgcolor: theme.palette.background.alt ?? theme.palette.background.paper,
      }}
    >
      {runtime ? (
        <AssistantRuntimeProvider runtime={runtime}>
          <CustomThread pageContext={pageContext} />
        </AssistantRuntimeProvider>
      ) : (
        <Box
          sx={{
            padding: theme.spacing(3),
            textAlign: "center",
            color: "text.secondary",
          }}
        >
          <Typography variant="body2" sx={{ fontSize: theme.typography.body2.fontSize }}>
            Initializing chat...
          </Typography>
        </Box>
      )}
    </Box>
  );
};

const AdvisorChat = ({
  selectedLLMKeyId,
  pageContext,
  hasLLMKeys,
  isLoadingLLMKeys,
}: AdvisorChatProps) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { userRoleName } = useAuth();
  const conversationContext = useAdvisorConversationSafe();
  const loadAttemptedRef = useRef<Set<string>>(new Set());

  const isAdmin = userRoleName?.toLowerCase() === "admin";

  // Memoize styles to prevent recreation on each render
  const paperStyles = useMemo(() => createPaperStyles(theme), [theme]);
  const centeredBoxStyles = useMemo(() => createCenteredBoxStyles(theme), [theme]);

  // Trigger domain load (list + most-recent conversation) on first mount
  // for this domain. Fire-and-forget — context tracks its own loading flag.
  useEffect(() => {
    if (!conversationContext || !pageContext) return;
    if (conversationContext.isLoaded(pageContext)) return;
    if (loadAttemptedRef.current.has(pageContext)) return;

    loadAttemptedRef.current.add(pageContext);
    void conversationContext.loadDomain(pageContext);
  }, [conversationContext, pageContext]);

  // Derive readiness from context state — no local isReady state to go stale
  const isConversationReady =
    !conversationContext || !pageContext || conversationContext.isLoaded(pageContext);

  // Active conversation id is used as part of the inner component key so
  // switching conversations or starting a new one forces a clean remount
  // of the assistant-ui runtime with fresh initial messages.
  const activeId =
    conversationContext && pageContext ? conversationContext.getActiveId(pageContext) : null;

  // Show message when no LLM keys are configured (only after loading completes)
  if (!isLoadingLLMKeys && hasLLMKeys === false) {
    return (
      <Paper elevation={0} sx={paperStyles}>
        <Box sx={centeredBoxStyles}>
          <Box sx={{ textAlign: "center", maxWidth: 320, px: 3 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                bgcolor: theme.palette.background.fill ?? theme.palette.grey[100],
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <Settings size={24} color={theme.palette.text.secondary} />
            </Box>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                color: "text.primary",
                mb: 1,
              }}
            >
              AI advisor not configured
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontSize: theme.typography.body2.fontSize,
                color: "text.secondary",
                lineHeight: 1.5,
              }}
            >
              {isAdmin ? (
                <>
                  To use the AI advisor, you need to configure an LLM API key.{" "}
                  <Box
                    component="span"
                    onClick={() => navigate("/settings/apikeys")}
                    sx={{
                      "color": "primary.main",
                      "cursor": "pointer",
                      "textDecoration": "underline",
                      "&:hover": {
                        textDecoration: "none",
                      },
                    }}
                  >
                    Go to settings
                  </Box>{" "}
                  to add your API key.
                </>
              ) : (
                "The AI advisor requires an LLM API key to be configured. Please contact your administrator to set this up."
              )}
            </Typography>
          </Box>
        </Box>
      </Paper>
    );
  }

  const isLoading = !isConversationReady || conversationContext?.isLoading(pageContext);

  if (isLoading) {
    return (
      <Paper elevation={0} sx={paperStyles}>
        <Box sx={centeredBoxStyles}>
          <Box sx={{ textAlign: "center" }}>
            <CircularProgress size={24} sx={{ color: "primary.main", mb: 1 }} />
            <Typography
              variant="body2"
              sx={{ fontSize: theme.typography.body2.fontSize, color: "text.secondary" }}
            >
              Loading conversation...
            </Typography>
          </Box>
        </Box>
      </Paper>
    );
  }

  // Only render the inner component (with runtime) after everything is ready.
  // The key includes `activeId` so that switching between past conversations
  // or starting a new chat remounts the runtime with fresh initial messages.
  const innerKey = `${pageContext ?? "none"}:${activeId ?? "new"}`;

  return (
    <Paper elevation={0} sx={paperStyles}>
      <AdvisorHeader pageContext={pageContext} />
      <AdvisorChatInner
        key={innerKey}
        selectedLLMKeyId={selectedLLMKeyId}
        pageContext={pageContext}
      />
    </Paper>
  );
};

export default memo(AdvisorChat);
