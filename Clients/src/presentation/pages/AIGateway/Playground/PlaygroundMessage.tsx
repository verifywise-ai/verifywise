import { Box, Typography } from "@mui/material";
import { MessagePrimitive } from "@assistant-ui/react";
import { Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import palette from "../../../themes/palette";

/**
 * Shared message component for both user and assistant messages
 * in the AI Gateway Playground. Uses assistant-ui MessagePrimitive
 * for content access.
 */
export function PlaygroundMessage() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.If user>
        <Box sx={{ display: "flex", gap: 1.5, py: 1.5 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              backgroundColor: palette.brand.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              mt: 0.25,
            }}
          >
            <User size={14} color={palette.background.main} strokeWidth={1.5} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, pt: 0.5 }}>
            <MessagePrimitive.Content
              components={{
                Text: ({ text }) => (
                  <Typography sx={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                    {text}
                  </Typography>
                ),
              }}
            />
          </Box>
        </Box>
      </MessagePrimitive.If>

      <MessagePrimitive.If assistant>
        <Box sx={{ display: "flex", gap: 1.5, py: 1.5 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              backgroundColor: palette.background.hover,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              mt: 0.25,
            }}
          >
            <Bot size={14} color={palette.text.tertiary} strokeWidth={1.5} />
          </Box>
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              pt: 0.25,
              fontSize: 13,
              lineHeight: 1.6,
              "& p": { margin: 0, mb: 1 },
              "& p:last-child": { mb: 0 },
              "& code": {
                backgroundColor: palette.background.hover,
                px: 0.5,
                borderRadius: "3px",
                fontSize: 12,
              },
              "& pre": {
                backgroundColor: palette.background.hover,
                p: 1.5,
                borderRadius: "4px",
                overflow: "auto",
                fontSize: 12,
              },
            }}
          >
            <MessagePrimitive.Content
              components={{
                Text: ({ text }) => <ReactMarkdown>{text}</ReactMarkdown>,
              }}
            />
          </Box>
        </Box>
      </MessagePrimitive.If>
    </MessagePrimitive.Root>
  );
}
