import { Box, Button, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material";
import { Info } from "lucide-react";

export default function UpdateBanner() {
  const theme = useTheme();

  return (
    <Stack
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      direction="row"
      alignItems="center"
      gap={theme.spacing(4)}
      sx={{
        position: "fixed",
        top: theme.spacing(5),
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        padding: `${theme.spacing(3)} ${theme.spacing(6)}`,
        backgroundColor: theme.palette.background.fill,
        border: `1px solid ${theme.palette.primary.main}`,
        borderRadius: theme.shape.borderRadius,
        boxShadow: theme.boxShadow,
      }}
    >
      <Box
        sx={{ color: theme.palette.primary.main, maxHeight: "16px" }}
        aria-hidden="true"
      >
        <Info size={16} />
      </Box>
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 600,
          color: theme.palette.primary.main,
        }}
      >
        A new version of VerifyWise is available
      </Typography>
      <Button
        variant="contained"
        size="small"
        onClick={() => window.location.reload()}
        sx={{
          whiteSpace: "nowrap",
          flexShrink: 0,
          fontSize: 12,
          padding: "4px 12px",
          minHeight: 28,
        }}
      >
        Update now
      </Button>
    </Stack>
  );
}
