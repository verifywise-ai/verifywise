import { FC, forwardRef } from "react";
import { Stack, IconButton, useTheme } from "@mui/material";
import { ComposerPrimitive } from "@assistant-ui/react";
import { Send } from "lucide-react";
import { AdvisorDomain, getPlaceholder } from "./advisorConfig";

const CustomTextField = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>((props, ref) => {
  const theme = useTheme();

  // Using basic textarea instead of MUI TextField for better integration with ComposerPrimitive
  // (ComposerPrimitive.Input expects a HTMLTextAreaElement which MUI TextField does not directly provide)
  return (
    <textarea
      ref={ref}
      {...props}
      data-composer-input
      aria-label="Type your message"
      rows={3}
      style={{
        width: "100%",
        resize: "none",
        border: `1px solid ${theme.palette.border?.light ?? theme.palette.divider}`,
        borderRadius: Number(theme.shape.borderRadius) * 1.25,
        padding: "8px",
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.body2.fontSize as string,
        lineHeight: 1.5,
        backgroundColor: theme.palette.background.main ?? theme.palette.background.default,
        color: theme.palette.text.primary,
        outline: "none",
        boxSizing: "border-box",
      }}
    />
  );
});

interface CustomComposerProps {
  pageContext?: AdvisorDomain;
}

export const CustomComposer: FC<CustomComposerProps> = ({ pageContext }) => {
  const theme = useTheme();
  const placeholder = getPlaceholder(pageContext);

  return (
    <ComposerPrimitive.Root
      style={{
        borderTop: `1px solid ${theme.palette.border?.light ?? theme.palette.divider}`,
        backgroundColor: theme.palette.background.main ?? theme.palette.background.default,
        padding: "8px",
      }}
    >
      <Stack direction="row" gap="8px" alignItems="flex-end">
        <ComposerPrimitive.Input
          asChild
          autoFocus
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const form = e.currentTarget.form;
              if (form) {
                form.requestSubmit();
              }
            }
          }}
        >
          <CustomTextField />
        </ComposerPrimitive.Input>

        <ComposerPrimitive.Send asChild>
          <IconButton
            data-composer-submit
            type="submit"
            aria-label="Send message"
            sx={{
              "width": 40,
              "height": 40,
              "backgroundColor": theme.palette.primary.main,
              "color": theme.palette.primary.contrastText,
              "&:hover": {
                backgroundColor: theme.palette.primary.dark,
              },
              "&.Mui-disabled": {
                backgroundColor:
                  theme.palette.background.fill ?? theme.palette.action.disabledBackground,
                color: theme.palette.text.accent ?? theme.palette.action.disabled,
              },
            }}
          >
            <Send size={18} />
          </IconButton>
        </ComposerPrimitive.Send>
      </Stack>

      <Stack
        direction="row"
        justifyContent="center"
        sx={{
          marginTop: theme.spacing(0.75),
          fontSize: theme.typography.caption.fontSize,
          color: theme.palette.text.accent ?? theme.palette.text.secondary,
          textAlign: "center",
        }}
      >
        Press Enter to send • Shift+Enter for new line
      </Stack>
      <Stack
        direction="row"
        justifyContent="center"
        sx={{
          paddingTop: "8px",
          paddingBottom: "0px",
          fontSize: 10,
          color: theme.palette.text.accent ?? theme.palette.text.disabled,
          textAlign: "center",
        }}
      >
        AI advisor can make mistakes. Please double-check responses.
      </Stack>
    </ComposerPrimitive.Root>
  );
};
