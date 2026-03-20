import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar, Skeleton, CircularProgress } from "@mui/material";
import { Copy } from "lucide-react";
import CustomizableSkeleton from "../../../components/Skeletons";
import CodeBlock from "../components/CodeBlock";

const loadingSnippets = {
  skeleton: `import CustomizableSkeleton from "../Skeletons";

// Text skeleton
<CustomizableSkeleton variant="text" width={200} />

// Rectangular skeleton
<CustomizableSkeleton variant="rectangular" width={200} height={100} />

// Circular skeleton
<CustomizableSkeleton variant="circular" width={40} height={40} />`,
  muiSkeleton: `import { Skeleton } from "@mui/material";

<Skeleton variant="text" width={200} />
<Skeleton variant="rectangular" width={200} height={100} />
<Skeleton variant="circular" width={40} height={40} />
<Skeleton variant="rounded" width={200} height={60} />`,
  spinner: `import { CircularProgress } from "@mui/material";

// Default spinner
<CircularProgress />

// Small spinner
<CircularProgress size={20} />

// Custom color
<CircularProgress sx={{ color: "#13715B" }} />`,
  toast: `import CustomizableToast from "../Toast";

// Full-page loading overlay
<CustomizableToast title="Processing your request..." />`,
};

const LoadingStatesSection: React.FC = () => {
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
          Loading states
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Skeleton loaders, spinners, and loading indicators for async operations.
        </Typography>
      </Box>

      {/* Skeleton Loaders */}
      <SpecSection title="Skeleton loaders">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Placeholder content that mimics the shape of actual content while loading.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Skeleton variants"
                code={loadingSnippets.muiSkeleton}
                onCopy={handleCopy}
              >
                <Stack spacing="16px">
                  <Box>
                    <Typography sx={{ fontSize: 11, color: theme.palette.text.accent, mb: "4px" }}>
                      Text
                    </Typography>
                    <Skeleton variant="text" width={200} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 11, color: theme.palette.text.accent, mb: "4px" }}>
                      Rectangular
                    </Typography>
                    <Skeleton variant="rectangular" width={200} height={60} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 11, color: theme.palette.text.accent, mb: "4px" }}>
                      Rounded
                    </Typography>
                    <Skeleton variant="rounded" width={200} height={60} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 11, color: theme.palette.text.accent, mb: "4px" }}>
                      Circular
                    </Typography>
                    <Skeleton variant="circular" width={40} height={40} />
                  </Box>
                </Stack>
              </ExampleWithCode>

              <ExampleWithCode
                label="CustomizableSkeleton component"
                code={loadingSnippets.skeleton}
                onCopy={handleCopy}
              >
                <Stack spacing="8px">
                  <CustomizableSkeleton variant="text" width={200} />
                  <CustomizableSkeleton variant="rectangular" width={200} height={40} />
                </Stack>
              </ExampleWithCode>
            </Stack>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Skeleton variants
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "text", value: "Single line of text" },
                { property: "rectangular", value: "Sharp corners" },
                { property: "rounded", value: "Rounded corners" },
                { property: "circular", value: "Circle shape" },
              ]}
            />

            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", mt: "24px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              CustomizableSkeleton props
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "variant", value: "text | rectangular | circular | rounded" },
                { property: "width", value: "number | string" },
                { property: "height", value: "number | string" },
                { property: "maxWidth", value: "number | string" },
                { property: "minWidth", value: "number | string" },
                { property: "sx", value: "SxProps<Theme>" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Spinners */}
      <SpecSection title="Circular progress (spinners)">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Indeterminate spinners for actions with unknown duration.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Spinner sizes and colors"
              code={loadingSnippets.spinner}
              onCopy={handleCopy}
            >
              <Box sx={{ display: "flex", gap: "24px", alignItems: "center" }}>
                <Box sx={{ textAlign: "center" }}>
                  <CircularProgress size={16} />
                  <Typography sx={{ fontSize: 11, color: theme.palette.text.accent, mt: "8px" }}>
                    16px
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "center" }}>
                  <CircularProgress size={20} />
                  <Typography sx={{ fontSize: 11, color: theme.palette.text.accent, mt: "8px" }}>
                    20px
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "center" }}>
                  <CircularProgress size={24} />
                  <Typography sx={{ fontSize: 11, color: theme.palette.text.accent, mt: "8px" }}>
                    24px
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "center" }}>
                  <CircularProgress size={40} />
                  <Typography sx={{ fontSize: 11, color: theme.palette.text.accent, mt: "8px" }}>
                    40px (default)
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "center" }}>
                  <CircularProgress size={24} sx={{ color: "brand.primary" }} />
                  <Typography sx={{ fontSize: 11, color: theme.palette.text.accent, mt: "8px" }}>
                    Primary
                  </Typography>
                </Box>
              </Box>
            </ExampleWithCode>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Common spinner sizes
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Button spinner", value: "16px" },
                { property: "Inline spinner", value: "20px" },
                { property: "Small spinner", value: "24px" },
                { property: "Default", value: "40px" },
                { property: "Large", value: "60px" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Full Page Loading */}
      <SpecSection title="Full-page loading (CustomizableToast)">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Overlay component for blocking interactions during long operations.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Loading overlay preview"
              code={loadingSnippets.toast}
              onCopy={handleCopy}
            >
              <Box
                sx={{
                  position: "relative",
                  height: 200,
                  backgroundColor: theme.palette.background.fill,
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                {/* Mock content behind */}
                <Box sx={{ p: "16px", opacity: 0.3 }}>
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="text" width="80%" />
                  <Skeleton variant="rectangular" height={60} sx={{ mt: "8px" }} />
                </Box>

                {/* Overlay */}
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    backdropFilter: "blur(8px)",
                    background: "rgba(255, 255, 255, 0.37)",
                  }}
                >
                  <Box
                    sx={{
                      border: `1px solid ${theme.palette.border.light}`,
                      borderRadius: "4px",
                      backgroundColor: theme.palette.background.main,
                      padding: "20px 40px",
                      fontSize: 13,
                    }}
                  >
                    Processing your request...
                  </Box>
                </Box>
              </Box>
            </ExampleWithCode>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              CustomizableToast specs
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Position", value: "fixed, centered" },
                { property: "Z-index", value: "9999" },
                { property: "Backdrop", value: "blur(8px)" },
                { property: "Backdrop bg", value: "rgba(255, 255, 255, 0.37)" },
                { property: "Box padding", value: "20px 40px" },
                { property: "Box border", value: "1px solid #eaecf0" },
                { property: "Box border radius", value: "theme.shape.borderRadius" },
                { property: "Font size", value: "13px" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Button Loading State */}
      <SpecSection title="Button loading states">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          CustomizableButton has built-in loading state support via the loading prop.
        </Typography>

        <ExampleWithCode
          label="Button with loading"
          code={`<CustomizableButton
  variant="contained"
  color="primary"
  text="Saving..."
  loading={true}
/>`}
          onCopy={handleCopy}
        >
          <Box sx={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                px: "16px",
                py: "8px",
                backgroundColor: "brand.primary",
                color: "background.main",
                borderRadius: "4px",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              <CircularProgress size={16} sx={{ color: "background.main" }} />
              Saving...
            </Box>
            <Typography sx={{ fontSize: 12, color: theme.palette.text.accent }}>
              Spinner size: 16px, color matches button text
            </Typography>
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
            "Use Skeleton for content that will be replaced (tables, cards, text)",
            "Match skeleton dimensions to actual content dimensions",
            "Use CircularProgress for indeterminate waits (form submissions)",
            "Button loading: use loading={true} prop on CustomizableButton",
            "Full-page blocking: use CustomizableToast component",
            "Spinner in buttons should be 16px to fit height",
            "Prefer skeleton loaders over spinners when content shape is known",
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

export default LoadingStatesSection;
