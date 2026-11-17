import { accent, radiusPx } from "../../themes/palette";
import { Box, Stack, useTheme } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";

interface BottomChipProps {
  children: React.ReactNode;
  /** Forwarded to the inner pill Stack (role/aria for toolbars etc.). */
  role?: string;
  ariaLabel?: string;
  /** Extra sx merged onto the inner pill Stack. */
  sx?: SxProps<Theme>;
}

/**
 * Floating bottom-center "pill" container. Sits at `position: fixed` above the
 * page so it stays visible while the user scrolls. Pointer events are disabled
 * on the wrapper so the rest of the page stays interactive everywhere except on
 * the pill itself. Drop any content in as `children`.
 */
const BottomChip: React.FC<BottomChipProps> = ({ children, role, ariaLabel, sx }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: "48px",
        display: "flex",
        justifyContent: "center",
        zIndex: 1200,
        pointerEvents: "none",
        px: "8px",
      }}
    >
      <Stack
        role={role}
        aria-label={ariaLabel}
        direction="row"
        alignItems="center"
        sx={[
          {
            backgroundColor: accent.primary.bg,
            border: `1px solid ${accent.primary.border}`,
            pointerEvents: "auto",
            gap: "6px",
            pl: "16px",
            pr: "4px",
            py: "12px",
            boxShadow: theme.boxShadow,
            borderRadius: radiusPx.sm,
            maxWidth: "calc(100vw - 32px)",
            flexWrap: "wrap",
            rowGap: "2px",
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {children}
      </Stack>
    </Box>
  );
};

export default BottomChip;
