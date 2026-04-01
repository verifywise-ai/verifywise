import { forwardRef } from "react";
import { Stack, IconButton, useTheme } from "@mui/material";
import { ComposerPrimitive } from "@assistant-ui/react";
import { Send } from "lucide-react";
import palette from "../../../themes/palette";

const ComposerInput = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>((props, ref) => {
  const theme = useTheme();

  return (
    <textarea
      ref={ref}
      {...props}
      data-composer-input
      aria-label="Type your message"
      rows={2}
      style={{
        width: "100%",
        resize: "none",
        border: "none",
        outline: "none",
        fontFamily: theme.typography.fontFamily as string,
        fontSize: 13,
        lineHeight: 1.5,
        backgroundColor: "transparent",
        color: theme.palette.text.primary,
        padding: 0,
      }}
    />
  );
});

interface PlaygroundComposerProps {
  disabled?: boolean;
}

export function PlaygroundComposer({ disabled }: PlaygroundComposerProps) {
  return (
    <ComposerPrimitive.Root
      style={{
        borderTop: `1px solid ${palette.border.light}`,
        backgroundColor: palette.background.main,
        padding: "12px 16px",
      }}
    >
      <Stack direction="row" gap="8px" alignItems="flex-end">
        <ComposerPrimitive.Input
          asChild
          placeholder={disabled ? "Select an endpoint first" : "Type a message... (Enter to send, Shift+Enter for new line)"}
        >
          <ComposerInput disabled={disabled} />
        </ComposerPrimitive.Input>
        <ComposerPrimitive.Send asChild>
          <IconButton
            disabled={disabled}
            sx={{
              backgroundColor: palette.brand.primary,
              color: palette.background.main,
              width: 36,
              height: 36,
              borderRadius: "4px",
              "&:hover": { backgroundColor: palette.brand.primaryHover },
              "&:disabled": {
                backgroundColor: palette.border.light,
                color: palette.text.disabled,
              },
            }}
          >
            <Send size={16} strokeWidth={1.5} />
          </IconButton>
        </ComposerPrimitive.Send>
      </Stack>
    </ComposerPrimitive.Root>
  );
}
