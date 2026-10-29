import { useState } from "react";
import { Box, ButtonBase, Collapse, Stack, Typography } from "@mui/material";
import { ChevronDown, Info } from "lucide-react";
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

const headingSx = { fontSize: 13, fontWeight: 600, color: palette.text.secondary } as const;
const bodySx = { fontSize: 13, lineHeight: 1.6, color: palette.text.tertiary } as const;

/**
 * "Why this matters" under a section title: closed by default, so the page
 * shows the task first. Opened, it gives what the section decides, the rule
 * behind it and the usual mistake, from the reviewed content in
 * `education/content.ts`; it adds no statement of the law of its own. The
 * text stays mounted while closed.
 */
const EducationPanel = ({ pageKey }: EducationPanelProps) => {
  const [open, setOpen] = useState(false);
  const block = EDUCATION[pageKey];
  if (!block) return null;
  const panelId = `education-${pageKey.replace(/\W/g, "-")}-body`;

  return (
    <Box data-testid={`education-${pageKey}`}>
      <ButtonBase
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        sx={{
          "gap": "6px",
          "borderRadius": "4px",
          "color": palette.brand.primary,
          "fontSize": 13,
          "&:focus-visible": {
            outline: `2px solid ${palette.brand.primary}`,
            outlineOffset: "2px",
          },
        }}
      >
        <Info size={14} strokeWidth={1.5} />
        Why this matters
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        />
      </ButtonBase>

      <Collapse in={open}>
        <Stack
          id={panelId}
          gap="12px"
          sx={{
            mt: "8px",
            p: "12px 16px",
            borderRadius: "4px",
            backgroundColor: palette.background.accent,
            maxWidth: "760px",
          }}
        >
          <Box>
            <Typography sx={headingSx}>What it decides</Typography>
            <Typography sx={bodySx}>{block.decides}</Typography>
          </Box>
          <Box>
            <Typography sx={headingSx}>The rule</Typography>
            <Typography sx={bodySx}>{block.law.text}</Typography>
            {block.law.refs.length > 0 && (
              <Typography sx={{ ...bodySx, mt: "4px", color: palette.text.accent }}>
                {block.law.refs.map(formatRef).join(" · ")}
              </Typography>
            )}
          </Box>
          <Box>
            <Typography sx={headingSx}>Common mistakes</Typography>
            <Typography sx={bodySx}>{block.goesWrong}</Typography>
          </Box>
        </Stack>
      </Collapse>
    </Box>
  );
};

export default EducationPanel;
