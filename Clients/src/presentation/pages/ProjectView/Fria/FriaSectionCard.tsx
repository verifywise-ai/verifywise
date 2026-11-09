import { ReactNode } from "react";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { accent, border, status } from "../../../themes/palette";

interface FriaSectionCardProps {
  title: string;
  subtitle: string;
  euActContent: ReactNode;
  children: ReactNode;
}

function FriaSectionCard({ title, subtitle, euActContent, children }: FriaSectionCardProps) {
  const theme = useTheme();

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: border.dark,
        borderRadius: "4px",
        boxShadow: "none",
      }}
    >
      <CardContent sx={{ "padding": 8, "&:last-child": { paddingBottom: 8 } }}>
        <Stack spacing={0} gap={8}>
          <Box>
            <Typography
              sx={{
                fontSize: 14,
                fontWeight: 600,
                color: theme.palette.text.primary,
                mb: 0.5,
              }}
            >
              {title}
            </Typography>
            <Typography
              sx={{
                fontSize: 13,
                color: theme.palette.text.secondary,
              }}
            >
              {subtitle}
            </Typography>
            <Box
              sx={{
                paddingY: 4,
                paddingX: 6,
                backgroundColor: accent.primary.bg,
                border: `1px solid ${status.success.border}`,
                borderRadius: "4px",
                fontSize: 12,
                color: theme.palette.text.secondary,
                lineHeight: 1.6,
              }}
            >
              {euActContent}
            </Box>
          </Box>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default FriaSectionCard;
