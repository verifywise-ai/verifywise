import { Box, Stack, Typography } from "@mui/material";
import { BookOpen } from "lucide-react";
import { palette } from "../../themes/palette";
import { EDUCATION } from "./education/content";

interface EducationPanelProps {
  /** A key of `EDUCATION`. An unknown key renders nothing. */
  pageKey: string;
}

/** "5-301(c)" reads as a section of the rule; "FAQ V.1" is DCWP's FAQ and keeps its own name. */
function formatRef(ref: string): string {
  return /^\d/.test(ref) ? `§ ${ref}` : `DCWP ${ref}`;
}

const headingSx = {
  fontSize: 12,
  fontWeight: 600,
  color: palette.text.secondary,
} as const;

const bodySx = {
  fontSize: 13,
  lineHeight: 1.6,
  color: palette.text.tertiary,
} as const;

/**
 * The three elements every page of the module explains: what the page
 * decides, why the law cares (with the provisions relied on), and what goes
 * wrong when it is answered carelessly. Rendered from the reviewed content in
 * `education/content.ts`; it adds no statement of the law of its own.
 */
const EducationPanel = ({ pageKey }: EducationPanelProps) => {
  const block = EDUCATION[pageKey];
  if (!block) return null;

  return (
    <Box
      component="aside"
      data-testid={`education-${pageKey}`}
      sx={{
        border: `1px solid ${palette.border.dark}`,
        borderRadius: "4px",
        backgroundColor: palette.background.accent,
        p: "16px",
      }}
    >
      <Stack direction="row" alignItems="center" gap="8px" sx={{ mb: "12px" }}>
        <BookOpen size={14} strokeWidth={1.5} color={palette.brand.primary} />
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>
          About this page
        </Typography>
      </Stack>

      <Stack gap="12px">
        <Box>
          <Typography sx={headingSx}>What this page decides</Typography>
          <Typography sx={bodySx}>{block.decides}</Typography>
        </Box>

        <Box>
          <Typography sx={headingSx}>Why the law cares</Typography>
          <Typography sx={bodySx}>{block.law.text}</Typography>
          {block.law.refs.length > 0 && (
            <Stack direction="row" flexWrap="wrap" gap="4px" sx={{ mt: "8px" }}>
              {block.law.refs.map((ref) => (
                <Box
                  key={ref}
                  component="span"
                  sx={{
                    fontSize: 11,
                    color: palette.brand.primary,
                    border: `1px solid ${palette.border.dark}`,
                    borderRadius: "4px",
                    backgroundColor: palette.background.main,
                    px: "6px",
                    py: "2px",
                  }}
                >
                  {formatRef(ref)}
                </Box>
              ))}
            </Stack>
          )}
        </Box>

        <Box>
          <Typography sx={headingSx}>What goes wrong</Typography>
          <Typography sx={bodySx}>{block.goesWrong}</Typography>
        </Box>
      </Stack>
    </Box>
  );
};

export default EducationPanel;
