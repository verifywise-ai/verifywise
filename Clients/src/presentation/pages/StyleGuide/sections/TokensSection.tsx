import React from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { useNavigate } from "react-router";
import CodeBlock from "../components/CodeBlock";

const usageExample = `import { brand } from "../../../themes/palette";
import { textStyles } from "../../../themes/typography";

<Box
  sx={{
    color: brand.primary,
    ...textStyles.body,
    p: (theme) => theme.spacing(4),
    borderColor: "border.dark",
  }}
/>`;

const links = [
  { id: "colors", label: "Colors", detail: "Scales in primitives.ts and the semantic palette." },
  { id: "typography", label: "Typography", detail: "fontSize, fontWeight, and textStyles." },
  { id: "spacing", label: "Spacing & layout", detail: "theme.spacing(), where 4 is 8px." },
];

const TokensSection: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  return (
    <Box sx={{ p: "32px 40px" }}>
      <Box sx={{ mb: "32px" }}>
        <Typography
          sx={{
            fontSize: 24,
            fontWeight: 600,
            color: theme.palette.text.primary,
            mb: "8px",
          }}
        >
          Tokens
        </Typography>
        <Typography sx={{ fontSize: 14, color: theme.palette.text.tertiary, maxWidth: 640 }}>
          Scale hex lives in{" "}
          <Box component="span" sx={{ fontFamily: "monospace", fontSize: 13 }}>
            shared/design-tokens/primitives.ts
          </Box>
          . The shared palette.ts builds brand, text, background, border, and status from them. The
          client palette.ts re-exports that palette so existing imports stay valid.
        </Typography>
      </Box>

      <Box
        sx={{
          mb: "32px",
          p: "16px 20px",
          border: `1px solid ${theme.palette.border.dark}`,
          borderRadius: "4px",
          backgroundColor: theme.palette.background.accent,
        }}
      >
        <Typography
          sx={{ fontSize: 14, fontWeight: 600, color: theme.palette.text.primary, mb: "8px" }}
        >
          Do not add a new color or spacing literal
        </Typography>
        <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary, lineHeight: 1.5 }}>
          A hex color in a screen style is an ESLint warning. Use theme.palette, a palette export,
          textStyles or fontSize, and theme.spacing(). Color scales are defined in
          shared/design-tokens/primitives.ts. Author-chosen text colors in the policy editor are the
          exception.
        </Typography>
      </Box>

      <Stack spacing={1.5} sx={{ mb: "32px" }}>
        {links.map((link) => (
          <Box
            key={link.id}
            onClick={() => navigate(`/style-guide/${link.id}`)}
            sx={{
              "p": "12px 16px",
              "border": `1px solid ${theme.palette.border.dark}`,
              "borderRadius": "4px",
              "cursor": "pointer",
              "&:hover": { backgroundColor: theme.palette.background.fill },
            }}
          >
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.palette.primary.main }}>
              {link.label}
            </Typography>
            <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary }}>
              {link.detail}
            </Typography>
          </Box>
        ))}
      </Stack>

      <Typography
        sx={{ fontSize: 16, fontWeight: 600, color: theme.palette.text.primary, mb: "12px" }}
      >
        Usage
      </Typography>
      <CodeBlock code={usageExample} />
    </Box>
  );
};

export default TokensSection;
