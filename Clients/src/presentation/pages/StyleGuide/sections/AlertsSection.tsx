import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar } from "@mui/material";
import { Copy, Info, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import CodeBlock from "../components/CodeBlock";
import { status } from "../../../themes/palette";

const alertSnippets = {
  success: `<Alert
  variant="success"
  title="Success"
  body="Your changes have been saved successfully."
  isToast={true}
  onClick={() => setShowAlert(false)}
/>`,
  error: `<Alert
  variant="error"
  title="Error"
  body="Something went wrong. Please try again."
  isToast={true}
  onClick={() => setShowAlert(false)}
/>`,
  warning: `<Alert
  variant="warning"
  title="Warning"
  body="This action cannot be undone."
  isToast={true}
  onClick={() => setShowAlert(false)}
/>`,
  info: `<Alert
  variant="info"
  title="Information"
  body="New features are available."
  isToast={true}
  onClick={() => setShowAlert(false)}
/>`,
  noIcon: `<Alert
  variant="info"
  body="Simple message without icon or title."
  hasIcon={false}
/>`,
};

const AlertsSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

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
          Alerts & toasts
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Notification components for displaying feedback messages to users.
          Alerts can be used as inline messages or toast notifications.
        </Typography>
      </Box>

      {/* Alert Variants */}
      <SpecSection title="Alert variants">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Four semantic variants for different message types. Each has a dedicated color scheme and icon.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <AlertPreview
                variant="success"
                title="Success"
                body="Your changes have been saved successfully."
                icon={<CheckCircle size={20} />}
                colors={{ text: "status.success.text", bg: "#E6F4EA" }}
                code={alertSnippets.success}
                onCopy={handleCopy}
              />
              <AlertPreview
                variant="error"
                title="Error"
                body="Something went wrong. Please try again."
                icon={<XCircle size={20} />}
                colors={{ text: "status.error.text", bg: "#FFD6D6" }}
                code={alertSnippets.error}
                onCopy={handleCopy}
              />
              <AlertPreview
                variant="warning"
                title="Warning"
                body="This action cannot be undone."
                icon={<AlertTriangle size={20} />}
                colors={{ text: "#795548", bg: "#FFF8E1" }}
                code={alertSnippets.warning}
                onCopy={handleCopy}
              />
              <AlertPreview
                variant="info"
                title="Information"
                body="New features are available."
                icon={<Info size={20} />}
                colors={{ text: "#1565C0", bg: "#E3F2FD" }}
                code={alertSnippets.info}
                onCopy={handleCopy}
              />
            </Stack>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Component specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Position", value: "fixed" },
                { property: "Top", value: "10px (theme.spacing(5))" },
                { property: "Right", value: "10px (theme.spacing(5))" },
                { property: "Z-index", value: "9999" },
                { property: "Padding", value: "16px" },
                { property: "Border radius", value: "theme.shape.borderRadius" },
                { property: "Border", value: "1px solid {variant.text}" },
                { property: "Icon size", value: "20px" },
                { property: "Gap (icon-content)", value: "16px" },
                { property: "Title font weight", value: "700" },
                { property: "Close icon size", value: "16px" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Color Reference */}
      <SpecSection title="Alert color reference">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Colors are defined in singleTheme.alertStyles and theme.palette.status
        </Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
          <AlertColorCard
            variant="Success"
            textColor={status.success.text}
            bgColor="#E6F4EA"
            themeKey="theme.palette.status.success"
            onCopy={handleCopy}
          />
          <AlertColorCard
            variant="Error"
            textColor={status.error.text}
            bgColor="#FFD6D6"
            themeKey="theme.palette.status.error"
            onCopy={handleCopy}
          />
          <AlertColorCard
            variant="Warning"
            textColor="#795548"
            bgColor="#FFF8E1"
            themeKey="theme.palette.status.warning"
            onCopy={handleCopy}
          />
          <AlertColorCard
            variant="Info"
            textColor="#1565C0"
            bgColor="#E3F2FD"
            themeKey="theme.palette.status.info"
            onCopy={handleCopy}
          />
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Toast Usage */}
      <SpecSection title="Toast notifications">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          When isToast=true, the alert displays a close button. Use onClick to handle dismissal.
        </Typography>

        <ExampleWithCode
          label="Toast with close button"
          code={alertSnippets.success}
          onCopy={handleCopy}
        >
          <Box
            sx={{
              position: "relative",
              p: "20px",
              backgroundColor: theme.palette.background.fill,
              borderRadius: "4px",
              minHeight: 80,
            }}
          >
            <Box
              sx={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: "16px",
                p: "16px",
                backgroundColor: "#E6F4EA",
                border: "1px solid status.success.text",
                borderRadius: "4px",
              }}
            >
              <Box sx={{ color: "status.success.text" }}>
                <CheckCircle size={20} />
              </Box>
              <Stack spacing="2px" sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 700, color: "status.success.text", fontSize: 13 }}>
                  Success
                </Typography>
                <Typography sx={{ color: "status.success.text", fontSize: 13 }}>
                  Your changes have been saved.
                </Typography>
              </Stack>
              <Box sx={{ color: "status.success.text", cursor: "pointer", ml: "16px" }}>
                <XCircle size={16} />
              </Box>
            </Box>
          </Box>
        </ExampleWithCode>
      </SpecSection>

      {/* Developer Checklist */}
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
          Developer checklist
        </Typography>
        <Stack spacing="8px">
          {[
            "Use Alert component from components/Alert for all notification messages",
            "Set isToast={true} when alert should be dismissible",
            "Always provide onClick handler when isToast is true",
            "Alert is position: fixed by default - appears in top-right corner",
            "Use appropriate variant for message type (success, error, warning, info)",
            "hasIcon={false} removes the icon and adjusts padding",
            "Alert auto-positions at z-index: 9999 to appear above other content",
          ].map((item, index) => (
            <Box
              key={index}
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: theme.palette.primary.main,
                  mt: "6px",
                  flexShrink: 0,
                }}
              />
              <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                {item}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
};

// Helper Components

interface AlertPreviewProps {
  variant: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  colors: { text: string; bg: string };
  code: string;
  onCopy: (text: string) => void;
}

const AlertPreview: React.FC<AlertPreviewProps> = ({
  variant,
  title,
  body,
  icon,
  colors,
  code,
  onCopy,
}) => {
  const theme = useTheme();
  const [showCode, setShowCode] = useState(false);

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
          {variant.charAt(0).toUpperCase() + variant.slice(1)}
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

      <Box sx={{ p: "16px", backgroundColor: theme.palette.background.main }}>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: "16px",
            p: "16px",
            backgroundColor: colors.bg,
            border: `1px solid ${colors.text}`,
            borderRadius: "4px",
          }}
        >
          <Box sx={{ color: colors.text }}>{icon}</Box>
          <Stack spacing="2px">
            <Typography sx={{ fontWeight: 700, color: colors.text, fontSize: 13 }}>
              {title}
            </Typography>
            <Typography sx={{ color: colors.text, fontSize: 13 }}>
              {body}
            </Typography>
          </Stack>
        </Box>
      </Box>

      {showCode && (
        <Box sx={{ borderTop: `1px solid ${theme.palette.border.light}` }}>
          <CodeBlock code={code} language="tsx" onCopy={onCopy} />
        </Box>
      )}
    </Box>
  );
};

interface AlertColorCardProps {
  variant: string;
  textColor: string;
  bgColor: string;
  themeKey: string;
  onCopy: (text: string) => void;
}

const AlertColorCard: React.FC<AlertColorCardProps> = ({
  variant,
  textColor,
  bgColor,
  themeKey,
  onCopy,
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.background.alt,
        borderRadius: "4px",
        border: `1px solid ${theme.palette.border.light}`,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          height: 40,
          backgroundColor: bgColor,
          border: `1px solid ${textColor}`,
          borderRadius: "4px 4px 0 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: textColor }}>
          {variant}
        </Typography>
      </Box>
      <Box sx={{ p: "12px" }}>
        <Box sx={{ display: "flex", gap: "8px", mb: "8px" }}>
          <Box
            onClick={() => onCopy(textColor)}
            sx={{
              flex: 1,
              p: "6px 8px",
              backgroundColor: theme.palette.background.fill,
              borderRadius: "4px",
              cursor: "pointer",
              textAlign: "center",
              "&:hover": { backgroundColor: theme.palette.border.light },
            }}
          >
            <Typography sx={{ fontSize: 10, color: theme.palette.text.accent, mb: "2px" }}>
              Text
            </Typography>
            <Typography sx={{ fontSize: 11, fontFamily: "monospace", color: theme.palette.text.primary }}>
              {textColor}
            </Typography>
          </Box>
          <Box
            onClick={() => onCopy(bgColor)}
            sx={{
              flex: 1,
              p: "6px 8px",
              backgroundColor: theme.palette.background.fill,
              borderRadius: "4px",
              cursor: "pointer",
              textAlign: "center",
              "&:hover": { backgroundColor: theme.palette.border.light },
            }}
          >
            <Typography sx={{ fontSize: 10, color: theme.palette.text.accent, mb: "2px" }}>
              Background
            </Typography>
            <Typography sx={{ fontSize: 11, fontFamily: "monospace", color: theme.palette.text.primary }}>
              {bgColor}
            </Typography>
          </Box>
        </Box>
        <Typography sx={{ fontSize: 10, color: theme.palette.text.accent, fontFamily: "monospace" }}>
          {themeKey}
        </Typography>
      </Box>
    </Box>
  );
};

const SpecSection: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => {
  const theme = useTheme();
  return (
    <Box sx={{ mb: "16px" }}>
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
              index < specs.length - 1
                ? `1px solid ${theme.palette.border.light}`
                : "none",
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
            {hoveredIndex === index && (
              <Copy size={12} color={theme.palette.primary.main} />
            )}
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
  children: React.ReactNode;
}> = ({ label, code, onCopy, children }) => {
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

      <Box sx={{ p: "16px", backgroundColor: theme.palette.background.main }}>
        {children}
      </Box>

      {showCode && (
        <Box sx={{ borderTop: `1px solid ${theme.palette.border.light}` }}>
          <CodeBlock code={code} language="tsx" onCopy={onCopy} />
        </Box>
      )}
    </Box>
  );
};

export default AlertsSection;
