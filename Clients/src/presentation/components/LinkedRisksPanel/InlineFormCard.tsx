import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { textStyles } from "../../themes/typography";

interface InlineFormCardProps {
  title: string;
  /** One line under the title saying what the form does. */
  description?: string;
  children: ReactNode;
}

/**
 * The frame around a form that opens inside the Linked risks tab. Without it
 * the picker, its hint and its buttons read as part of the list underneath.
 */
export default function InlineFormCard({ title, description, children }: InlineFormCardProps) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "border.light",
        borderRadius: "4px",
        bgcolor: "background.alt",
        p: "16px",
      }}
    >
      <Typography sx={{ ...textStyles.subsectionTitle, color: "text.primary" }}>{title}</Typography>
      {description && (
        <Typography sx={{ ...textStyles.body, color: "text.tertiary" }}>{description}</Typography>
      )}
      <Stack spacing="16px" sx={{ mt: "12px" }}>
        {children}
      </Stack>
    </Box>
  );
}

/** Cancel, then the primary action, on the right: the order the modals use. */
export function InlineFormActions({ children }: { children: ReactNode }) {
  return (
    <Stack direction="row" spacing="8px" justifyContent="flex-end">
      {children}
    </Stack>
  );
}
