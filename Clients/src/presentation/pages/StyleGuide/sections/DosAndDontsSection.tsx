import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Snackbar } from "@mui/material";
import { Check, X, Copy } from "lucide-react";

const DosAndDontsSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const examples = [
    {
      category: "Buttons",
      items: [
        {
          do: {
            title: "Use sentence case for labels",
            example: "Save changes",
            code: `<Button>Save changes</Button>`,
          },
          dont: {
            title: "Don't use title case or all caps",
            example: "Save Changes / SAVE",
            code: `<Button>Save Changes</Button>`,
          },
        },
        {
          do: {
            title: "Use 34px height for standard buttons",
            example: null,
            code: `<Button sx={{ height: 34 }}>Action</Button>`,
          },
          dont: {
            title: "Don't use arbitrary button heights",
            example: null,
            code: `<Button sx={{ height: 42 }}>Action</Button>`,
          },
        },
        {
          do: {
            title: "Use primary for main actions",
            example: null,
            code: `<Button variant="contained" color="primary">
  Submit
</Button>`,
          },
          dont: {
            title: "Don't use multiple primary buttons",
            example: null,
            code: `<Button color="primary">Save</Button>
<Button color="primary">Cancel</Button>`,
          },
        },
      ],
    },
    {
      category: "Spacing",
      items: [
        {
          do: {
            title: "Use theme.spacing() for consistency",
            example: null,
            code: `<Box sx={{ p: theme.spacing(4), gap: theme.spacing(2) }}>`,
          },
          dont: {
            title: "Don't use arbitrary pixel values",
            example: null,
            code: `<Box sx={{ p: "17px", gap: "7px" }}>`,
          },
        },
        {
          do: {
            title: "Use gap for flex/grid spacing",
            example: null,
            code: `<Stack sx={{ gap: "16px" }}>
  <Item />
  <Item />
</Stack>`,
          },
          dont: {
            title: "Don't use margins between children",
            example: null,
            code: `<Stack>
  <Item sx={{ mb: "16px" }} />
  <Item />
</Stack>`,
          },
        },
      ],
    },
    {
      category: "Colors",
      items: [
        {
          do: {
            title: "Use theme palette tokens",
            example: null,
            code: `<Box sx={{
  color: theme.palette.text.primary,
  borderColor: theme.palette.border.dark,
}}>`,
          },
          dont: {
            title: "Don't hardcode color values",
            example: null,
            code: `<Box sx={{
  color: "#1c2130",
  borderColor: "#d0d5dd",
}}>`,
          },
        },
        {
          do: {
            title: "Use status colors for feedback",
            example: null,
            code: `<Alert severity="success">
  // Uses theme.palette.status.success
</Alert>`,
          },
          dont: {
            title: "Don't create custom status colors",
            example: null,
            code: `<Box sx={{ backgroundColor: "#22c55e" }}>
  Success message
</Box>`,
          },
        },
      ],
    },
    {
      category: "Typography",
      items: [
        {
          do: {
            title: "Use consistent font sizes (12, 13, 14, 16px)",
            example: null,
            code: `<Typography sx={{ fontSize: 13 }}>Body text</Typography>
<Typography sx={{ fontSize: 16 }}>Heading</Typography>`,
          },
          dont: {
            title: "Don't use non-standard sizes",
            example: null,
            code: `<Typography sx={{ fontSize: 15 }}>Text</Typography>
<Typography sx={{ fontSize: 17 }}>Heading</Typography>`,
          },
        },
        {
          do: {
            title: "Use sentence case for UI text",
            example: "Create new project",
            code: `<Typography>Create new project</Typography>`,
          },
          dont: {
            title: "Don't use title case",
            example: "Create New Project",
            code: `<Typography>Create New Project</Typography>`,
          },
        },
      ],
    },
    {
      category: "Borders",
      items: [
        {
          do: {
            title: "Use #d0d5dd for visible borders",
            example: null,
            code: `<Box sx={{ border: "1px solid #d0d5dd" }}>`,
          },
          dont: {
            title: "Don't use #EEEEEE for card borders",
            example: null,
            code: `<Box sx={{ border: "1px solid #EEEEEE" }}>`,
          },
        },
        {
          do: {
            title: "Use 4px border radius",
            example: null,
            code: `<Box sx={{ borderRadius: "4px" }}>`,
          },
          dont: {
            title: "Don't use large border radius",
            example: null,
            code: `<Box sx={{ borderRadius: "8px" }}>`,
          },
        },
      ],
    },
    {
      category: "Components",
      items: [
        {
          do: {
            title: "Use VerifyWise components when available",
            example: null,
            code: `import Select from "../components/Inputs/Select";

<Select items={options} />`,
          },
          dont: {
            title: "Don't use raw MUI when VW exists",
            example: null,
            code: `import { Select } from "@mui/material";

<Select>{options.map(...)}</Select>`,
          },
        },
        {
          do: {
            title: "Use StandardModal for dialogs",
            example: null,
            code: `import StandardModal from "../Modals/StandardModal";

<StandardModal open={open} onClose={onClose}>`,
          },
          dont: {
            title: "Don't create custom modal wrappers",
            example: null,
            code: `<Dialog>
  <Box sx={{ /* custom styling */ }}>`,
          },
        },
      ],
    },
    {
      category: "Icons",
      items: [
        {
          do: {
            title: "Use lucide-react icons",
            example: null,
            code: `import { User, Settings } from "lucide-react";

<User size={16} />`,
          },
          dont: {
            title: "Don't use MUI icons or other libraries",
            example: null,
            code: `import PersonIcon from "@mui/icons-material/Person";

<PersonIcon />`,
          },
        },
        {
          do: {
            title: "Use consistent icon sizes (14, 16, 18, 20px)",
            example: null,
            code: `<User size={16} />  // Buttons
<User size={18} />  // Navigation`,
          },
          dont: {
            title: "Don't use arbitrary icon sizes",
            example: null,
            code: `<User size={17} />
<User size={22} />`,
          },
        },
      ],
    },
  ];

  return (
    <Box sx={{ p: "32px 40px" }}>
      <Snackbar
        open={!!copiedText}
        autoHideDuration={2000}
        onClose={() => setCopiedText(null)}
        message="Copied to clipboard"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />

      {/* Page Header */}
      <Box sx={{ mb: "32px" }}>
        <Typography
          sx={{
            fontSize: 24,
            fontWeight: 600,
            color: theme.palette.text.primary,
            mb: "8px",
          }}
        >
          Do's and don'ts
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Visual examples of correct and incorrect patterns. Follow these guidelines to maintain
          consistency across the VerifyWise application.
        </Typography>
      </Box>

      {/* Examples by Category */}
      {examples.map((category) => (
        <Box key={category.category} sx={{ mb: "40px" }}>
          <Typography
            sx={{
              fontSize: 18,
              fontWeight: 600,
              color: theme.palette.text.primary,
              mb: "16px",
            }}
          >
            {category.category}
          </Typography>

          <Stack spacing="16px">
            {category.items.map((item, index) => (
              <Box
                key={index}
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  gap: "16px",
                }}
              >
                {/* Do */}
                <ExampleCard
                  type="do"
                  title={item.do.title}
                  example={item.do.example}
                  code={item.do.code}
                  onCopy={handleCopy}
                />
                {/* Don't */}
                <ExampleCard
                  type="dont"
                  title={item.dont.title}
                  example={item.dont.example}
                  code={item.dont.code}
                  onCopy={handleCopy}
                />
              </Box>
            ))}
          </Stack>
        </Box>
      ))}

      {/* Quick Reference */}
      <Box
        sx={{
          mt: "40px",
          p: "24px",
          backgroundColor: theme.palette.background.accent,
          borderRadius: "4px",
          border: `1px solid ${theme.palette.border.light}`,
        }}
      >
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 600,
            color: theme.palette.text.primary,
            mb: "16px",
          }}
        >
          Quick reference
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: "24px",
          }}
        >
          <Stack spacing="8px">
            <Typography
              sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.status.success.text }}
            >
              Always do
            </Typography>
            {[
              "Use sentence case for all UI text",
              "Use theme.palette for colors",
              "Use theme.spacing() for spacing",
              "Use VerifyWise components over MUI",
              "Use lucide-react for icons",
              "Use 4px border radius",
              "Use #d0d5dd for borders",
            ].map((item, index) => (
              <Box key={index} sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Check size={12} color={theme.palette.status.success.text} />
                <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                  {item}
                </Typography>
              </Box>
            ))}
          </Stack>
          <Stack spacing="8px">
            <Typography
              sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.status.error.text }}
            >
              Never do
            </Typography>
            {[
              "Use title case or ALL CAPS",
              "Hardcode color hex values",
              "Use arbitrary pixel values",
              "Create custom modal wrappers",
              "Use MUI icons",
              "Use border radius > 4px",
              "Use #EEEEEE for card borders",
            ].map((item, index) => (
              <Box key={index} sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <X size={12} color={theme.palette.status.error.text} />
                <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                  {item}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};

// Example Card Component
const ExampleCard: React.FC<{
  type: "do" | "dont";
  title: string;
  example: string | null;
  code: string;
  onCopy: (text: string) => void;
}> = ({ type, title, example, code, onCopy }) => {
  const theme = useTheme();
  const isDo = type === "do";

  return (
    <Box
      sx={{
        border: `1px solid ${isDo ? theme.palette.status.success.main : theme.palette.status.error.border}`,
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          p: "8px 12px",
          backgroundColor: isDo ? theme.palette.status.success.bg : theme.palette.status.error.bg,
          borderBottom: `1px solid ${isDo ? theme.palette.status.success.main : theme.palette.status.error.border}`,
        }}
      >
        {isDo ? (
          <Check size={14} color={theme.palette.status.success.text} />
        ) : (
          <X size={14} color={theme.palette.status.error.text} />
        )}
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 600,
            color: isDo ? theme.palette.status.success.text : theme.palette.status.error.text,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {isDo ? "Do" : "Don't"}
        </Typography>
      </Box>

      {/* Content */}
      <Box sx={{ p: "12px" }}>
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 500,
            color: theme.palette.text.primary,
            mb: example ? "8px" : "12px",
          }}
        >
          {title}
        </Typography>

        {example && (
          <Box
            sx={{
              display: "inline-block",
              px: "8px",
              py: "4px",
              backgroundColor: theme.palette.background.fill,
              borderRadius: "4px",
              mb: "12px",
            }}
          >
            <Typography
              sx={{
                fontSize: 12,
                fontFamily: "monospace",
                color: theme.palette.text.secondary,
              }}
            >
              {example}
            </Typography>
          </Box>
        )}

        {/* Code */}
        <Box
          onClick={() => onCopy(code)}
          sx={{
            position: "relative",
            p: "10px",
            backgroundColor: "#1e1e1e",
            borderRadius: "4px",
            cursor: "pointer",
            "&:hover .copy-icon": {
              opacity: 1,
            },
          }}
        >
          <Box
            className="copy-icon"
            sx={{
              position: "absolute",
              top: "8px",
              right: "8px",
              opacity: 0,
              transition: "opacity 150ms ease",
            }}
          >
            <Copy size={12} color="#888" />
          </Box>
          <Typography
            component="pre"
            sx={{
              fontSize: 10,
              fontFamily: "'Fira Code', 'Consolas', monospace",
              color: "#d4d4d4",
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {code}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default DosAndDontsSection;
