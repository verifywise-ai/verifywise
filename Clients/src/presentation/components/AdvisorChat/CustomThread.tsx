import { useEffect, useRef, memo, useCallback } from "react";
import { Stack, Box, useTheme, Chip } from "@mui/material";
import { ThreadPrimitive } from "@assistant-ui/react";
import { CustomMessage } from "./CustomMessage";
import { CustomComposer } from "./CustomComposer";
import { AdvisorDomain, AdvisorSuggestion, getSuggestions } from "./advisorConfig";

interface CustomThreadProps {
  pageContext?: AdvisorDomain;
}

interface SuggestionChipsProps {
  suggestions: AdvisorSuggestion[];
}

const SuggestionChipsComponent = ({ suggestions }: SuggestionChipsProps) => {
  const theme = useTheme();

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <Box
      role="navigation"
      aria-label="Suggested prompts"
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: theme.spacing(2),
        marginTop: theme.spacing(1),
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          justifyContent: "center",
          maxWidth: 400,
        }}
      >
        {suggestions.map((suggestion) => (
          <ThreadPrimitive.Suggestion
            key={suggestion.label}
            prompt={suggestion.prompt}
            method="replace"
            autoSend
            asChild
          >
            <Chip
              label={suggestion.label}
              variant="outlined"
              clickable
              aria-label={`Ask: ${suggestion.label}`}
              sx={{
                "fontSize": theme.typography.caption.fontSize,
                "height": 28,
                "borderColor": theme.palette.border?.light ?? theme.palette.divider,
                "color": "text.primary",
                "&:hover": {
                  bgcolor: theme.palette.background.fill ?? theme.palette.action.hover,
                  borderColor: "primary.main",
                },
              }}
            />
          </ThreadPrimitive.Suggestion>
        ))}
      </Box>
    </Box>
  );
};

const SuggestionChips = memo(SuggestionChipsComponent);

const CustomThreadComponent = ({ pageContext }: CustomThreadProps) => {
  const theme = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestions = getSuggestions(pageContext);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [scrollToBottom]);

  return (
    <ThreadPrimitive.Root
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Messages Area */}
      <Box
        sx={{
          "flex": 1,
          "overflowY": "auto",
          "bgcolor": theme.palette.background.alt ?? theme.palette.background.paper,
          "&::-webkit-scrollbar": {
            width: 8,
          },
          "&::-webkit-scrollbar-track": {
            bgcolor: theme.palette.background.fill ?? theme.palette.grey[100],
          },
          "&::-webkit-scrollbar-thumb": {
            "bgcolor": theme.palette.border?.dark ?? theme.palette.grey[400],
            "borderRadius": 1,
            "&:hover": {
              bgcolor: theme.palette.text.accent ?? theme.palette.grey[500],
            },
          },
        }}
      >
        <ThreadPrimitive.Viewport
          style={{
            padding: theme.spacing(2),
          }}
        >
          <Stack gap="16px">
            <ThreadPrimitive.Messages
              components={{
                UserMessage: CustomMessage,
                AssistantMessage: CustomMessage,
              }}
            />

            {/* Show suggestion chips after welcome message */}
            <SuggestionChips suggestions={suggestions} />

            <div ref={messagesEndRef} aria-hidden="true" />
          </Stack>
        </ThreadPrimitive.Viewport>
      </Box>

      {/* Input Area */}
      <CustomComposer pageContext={pageContext} />
    </ThreadPrimitive.Root>
  );
};

export const CustomThread = memo(CustomThreadComponent);
