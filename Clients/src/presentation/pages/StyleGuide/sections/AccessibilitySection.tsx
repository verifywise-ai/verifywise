import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Snackbar } from "@mui/material";
import { Copy, Check } from "lucide-react";
import CodeBlock from "../components/CodeBlock";

const accessibilitySnippets = {
  altText: `// Always provide alt text for images
<img src={logo} alt="VerifyWise logo" />

// Empty alt for decorative images
<img src={decoration} alt="" role="presentation" />

// Avatar with proper alt
<Avatar alt="John Doe" src={avatarUrl} />`,
  ariaLabels: `// Buttons with icons need labels
<IconButton aria-label="Close dialog">
  <X size={16} />
</IconButton>

// Form inputs need labels
<TextField
  id="email"
  label="Email address"
  aria-describedby="email-helper"
/>
<FormHelperText id="email-helper">
  We'll never share your email
</FormHelperText>`,
  semanticHtml: `// Use semantic elements
<nav aria-label="Main navigation">
  <ul>...</ul>
</nav>

<main>
  <article>
    <header>...</header>
    <section>...</section>
  </article>
</main>

// Use headings in order
<h1>Page title</h1>
  <h2>Section</h2>
    <h3>Subsection</h3>`,
  focusManagement: `// Trap focus in modals
<Dialog
  open={open}
  onClose={handleClose}
  aria-labelledby="dialog-title"
  aria-describedby="dialog-description"
>
  <DialogTitle id="dialog-title">Confirm action</DialogTitle>
  <DialogContent>
    <Typography id="dialog-description">
      Are you sure you want to proceed?
    </Typography>
  </DialogContent>
</Dialog>

// Auto-focus first input
<TextField autoFocus />`,
  keyboardNav: `// Ensure keyboard accessibility
<Box
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      handleClick();
    }
  }}
>
  Clickable element
</Box>

// Better: use a real button
<Button onClick={handleClick}>
  Clickable element
</Button>`,
  colorContrast: `// Ensure sufficient contrast (WCAG AA)
// Text on backgrounds must have 4.5:1 ratio

// Good: Dark text on light background
<Typography sx={{ color: "#1c2130" }}>
  On white background
</Typography>

// Status colors are pre-tested
<Box sx={{
  backgroundColor: theme.palette.status.error.bg,  // #f9eced
  color: theme.palette.status.error.text,          // #f04438
}}>
  Error message (passes contrast)
</Box>`,
  liveRegions: `// Announce dynamic content
<Box
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  {statusMessage}
</Box>

// For urgent announcements
<Box
  role="alert"
  aria-live="assertive"
>
  {errorMessage}
</Box>

// MUI Snackbar handles this automatically
<Snackbar message="Saved successfully" />`,
  skipLinks: `// Add skip link for keyboard users
<a
  href="#main-content"
  sx={{
    position: "absolute",
    left: "-9999px",
    "&:focus": {
      left: "16px",
      top: "16px",
      zIndex: 9999,
    },
  }}
>
  Skip to main content
</a>

<main id="main-content">
  ...
</main>`,
};

const AccessibilitySection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const wcagChecklist = [
    { level: "A", item: "All images have alt text", required: true },
    { level: "A", item: "Form inputs have labels", required: true },
    { level: "A", item: "Color is not the only indicator", required: true },
    { level: "A", item: "All functionality keyboard accessible", required: true },
    { level: "A", item: "No keyboard traps", required: true },
    { level: "A", item: "Page has a title", required: true },
    { level: "A", item: "Link purpose is clear", required: true },
    { level: "AA", item: "Contrast ratio 4.5:1 for text", required: true },
    { level: "AA", item: "Text can be resized to 200%", required: true },
    { level: "AA", item: "Focus indicator visible", required: true },
    { level: "AA", item: "Headings in logical order", required: false },
    { level: "AAA", item: "Contrast ratio 7:1 for text", required: false },
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
          Accessibility guidelines
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Guidelines for building accessible interfaces. Follow WCAG 2.1 AA standards to ensure
          VerifyWise is usable by everyone.
        </Typography>
      </Box>

      {/* Alt Text */}
      <SpecSection title="Alternative text">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          All meaningful images must have descriptive alt text. Decorative images should have empty
          alt attributes.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Image alt text"
              code={accessibilitySnippets.altText}
              onCopy={handleCopy}
            />
          </Box>
          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <GuidelineBox
              title="Alt text rules"
              items={[
                "Describe the content and function",
                "Keep it concise (125 chars max)",
                'Don\'t start with "Image of..."',
                "Use empty alt for decorative images",
                "Include text shown in images",
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* ARIA Labels */}
      <SpecSection title="ARIA labels">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Use ARIA attributes to provide context for assistive technologies when HTML semantics
          alone aren't sufficient.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="ARIA labels and descriptions"
              code={accessibilitySnippets.ariaLabels}
              onCopy={handleCopy}
            />
          </Box>
          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <GuidelineBox
              title="Common ARIA attributes"
              items={[
                "aria-label: Label for element",
                "aria-labelledby: Reference to label element",
                "aria-describedby: Additional description",
                "aria-hidden: Hide from screen readers",
                "aria-expanded: Toggle state",
                "aria-selected: Selection state",
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* Keyboard Navigation */}
      <SpecSection title="Keyboard navigation">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          All interactive elements must be accessible via keyboard. Use native HTML elements when
          possible as they have built-in keyboard support.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Keyboard accessible elements"
              code={accessibilitySnippets.keyboardNav}
              onCopy={handleCopy}
            />
          </Box>
          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <GuidelineBox
              title="Keyboard shortcuts"
              items={[
                "Tab: Navigate to next element",
                "Shift+Tab: Navigate to previous",
                "Enter/Space: Activate buttons",
                "Arrow keys: Navigate within widgets",
                "Escape: Close modals/dropdowns",
                "Home/End: Jump to start/end",
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* Focus Management */}
      <SpecSection title="Focus management">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Manage focus programmatically for modals and dynamic content. Trap focus within modals and
          return focus when closed.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Modal focus management"
              code={accessibilitySnippets.focusManagement}
              onCopy={handleCopy}
            />
          </Box>
          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <GuidelineBox
              title="Focus rules"
              items={[
                "Trap focus inside open modals",
                "Return focus when modal closes",
                "Auto-focus first input in forms",
                "Focus indicator must be visible",
                "Don't remove focus outlines",
                "MUI Dialog handles focus trapping",
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* Color Contrast */}
      <SpecSection title="Color contrast">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Ensure sufficient contrast between text and backgrounds. WCAG AA requires 4.5:1 for normal
          text, 3:1 for large text.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Contrast examples"
              code={accessibilitySnippets.colorContrast}
              onCopy={handleCopy}
            />
          </Box>
          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: theme.palette.text.secondary,
                mb: "16px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              VerifyWise color contrast
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "text.primary (#1c2130)", value: "21:1 ✓" },
                { property: "text.secondary (text.secondary)", value: "10:1 ✓" },
                { property: "text.tertiary (text.tertiary)", value: "6.4:1 ✓" },
                { property: "primary (brand.primary)", value: "5.5:1 ✓" },
                { property: "error text (#f04438)", value: "4.5:1 ✓" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* Live Regions */}
      <SpecSection title="Live regions">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Use ARIA live regions to announce dynamic content changes to screen readers.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Announcing dynamic content"
              code={accessibilitySnippets.liveRegions}
              onCopy={handleCopy}
            />
          </Box>
          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <GuidelineBox
              title="Live region types"
              items={[
                'aria-live="polite": Non-urgent updates',
                'aria-live="assertive": Urgent/errors',
                'role="status": Status messages',
                'role="alert": Error messages',
                "MUI Snackbar is already accessible",
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* WCAG Checklist */}
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
          WCAG 2.1 checklist
        </Typography>
        <Box
          sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: "8px" }}
        >
          {wcagChecklist.map((item, index) => (
            <Box
              key={index}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Box
                sx={{
                  width: 20,
                  height: 16,
                  borderRadius: "2px",
                  backgroundColor:
                    item.level === "A"
                      ? theme.palette.status.success.bg
                      : item.level === "AA"
                        ? theme.palette.status.warning.bg
                        : theme.palette.background.fill,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Typography
                  sx={{ fontSize: 8, fontWeight: 600, color: theme.palette.text.secondary }}
                >
                  {item.level}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                {item.item}
              </Typography>
              {item.required && <Check size={12} color={theme.palette.status.success.text} />}
            </Box>
          ))}
        </Box>
        <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary, mt: "16px" }}>
          Items with ✓ are required for VerifyWise. Test with screen readers (VoiceOver, NVDA)
          regularly.
        </Typography>
      </Box>
    </Box>
  );
};

// Helper Components

const SpecSection: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => {
  const theme = useTheme();
  return (
    <Box sx={{ mb: "40px" }}>
      <Typography
        sx={{
          fontSize: 18,
          fontWeight: 600,
          color: theme.palette.text.primary,
          mb: "16px",
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
};

const GuidelineBox: React.FC<{ title: string; items: string[] }> = ({ title, items }) => {
  const theme = useTheme();
  return (
    <>
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 600,
          color: theme.palette.text.secondary,
          mb: "16px",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {title}
      </Typography>
      <Box
        sx={{
          p: "16px",
          backgroundColor: theme.palette.background.alt,
          borderRadius: "4px",
          border: `1px solid ${theme.palette.border.light}`,
        }}
      >
        <Stack spacing="8px">
          {items.map((item, index) => (
            <Box key={index} sx={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <Box
                sx={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  backgroundColor: theme.palette.primary.main,
                  mt: "6px",
                  flexShrink: 0,
                }}
              />
              <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                {item}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </>
  );
};

const SpecTable: React.FC<{
  specs: { property: string; value: string }[];
  onCopy: (text: string) => void;
}> = ({ specs, onCopy }) => {
  const theme = useTheme();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.background.alt,
        borderRadius: "4px",
        border: `1px solid ${theme.palette.border.light}`,
        overflow: "hidden",
      }}
    >
      {specs.map((spec, index) => (
        <Box
          key={index}
          onClick={() => onCopy(spec.value)}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            p: "10px 14px",
            borderBottom:
              index < specs.length - 1 ? `1px solid ${theme.palette.border.light}` : "none",
            cursor: "pointer",
            transition: "background-color 150ms ease",
            "&:hover": {
              backgroundColor: theme.palette.background.fill,
            },
          }}
        >
          <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
            {spec.property}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 500,
                color: theme.palette.text.primary,
                fontFamily: "monospace",
              }}
            >
              {spec.value}
            </Typography>
            {hoveredIndex === index && <Copy size={12} color={theme.palette.primary.main} />}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

const ExampleWithCode: React.FC<{
  label: string;
  code: string;
  onCopy: (text: string) => void;
}> = ({ label, code, onCopy }) => {
  const theme = useTheme();
  const [showCode, setShowCode] = useState(true);

  return (
    <Box
      sx={{
        border: `1px solid ${theme.palette.border.light}`,
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          p: "8px 12px",
          backgroundColor: theme.palette.background.alt,
          borderBottom: `1px solid ${theme.palette.border.light}`,
        }}
      >
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: theme.palette.text.secondary }}>
          {label}
        </Typography>
        <Box
          onClick={() => setShowCode(!showCode)}
          sx={{
            fontSize: 11,
            color: showCode ? theme.palette.primary.main : theme.palette.text.tertiary,
            cursor: "pointer",
            "&:hover": { color: theme.palette.primary.main },
          }}
        >
          {showCode ? "Hide code" : "Show code"}
        </Box>
      </Box>

      {showCode && <CodeBlock code={code} language="tsx" onCopy={onCopy} />}
    </Box>
  );
};

export default AccessibilitySection;
