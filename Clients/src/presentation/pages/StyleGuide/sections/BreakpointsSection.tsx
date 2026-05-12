import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Snackbar } from "@mui/material";
import { Copy, Monitor, Tablet, Smartphone } from "lucide-react";
import CodeBlock from "../components/CodeBlock";

const breakpointSnippets = {
  muiBreakpoints: `// MUI default breakpoints (used in VerifyWise)
xs: 0       // Extra small (phones)
sm: 600     // Small (tablets portrait)
md: 900     // Medium (tablets landscape)
lg: 1200    // Large (desktops)
xl: 1536    // Extra large (wide screens)`,
  responsiveSx: `// Responsive sx prop (object syntax)
<Box
  sx={{
    width: { xs: "100%", sm: "50%", md: "33%" },
    padding: { xs: "16px", md: "24px", lg: "32px" },
    display: { xs: "block", md: "flex" },
  }}
>
  Responsive content
</Box>`,
  useMediaQuery: `import { useMediaQuery, useTheme } from "@mui/material";

const theme = useTheme();
const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
const isTablet = useMediaQuery(theme.breakpoints.between("sm", "md"));
const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

// Usage
{isMobile && <MobileView />}
{isDesktop && <DesktopView />}`,
  gridResponsive: `// Responsive Grid
<Grid container spacing={{ xs: 2, md: 3 }}>
  <Grid item xs={12} sm={6} md={4} lg={3}>
    <Card />
  </Grid>
</Grid>`,
  hiddenBreakpoints: `// Hide elements at breakpoints
<Box sx={{ display: { xs: "none", md: "block" } }}>
  Desktop only
</Box>

<Box sx={{ display: { xs: "block", md: "none" } }}>
  Mobile only
</Box>`,
  emptyStateResponsive: `// Empty state responsive example
<Box
  sx={{
    width: { xs: "90%", sm: "90%", md: "1056px" },
    height: { xs: "100%", md: "418px" },
    maxWidth: "100%",
  }}
>
  Content
</Box>`,
};

const BreakpointsSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const breakpoints = [
    {
      name: "xs",
      value: "0px",
      icon: <Smartphone size={16} />,
      description: "Extra small - Phones",
    },
    {
      name: "sm",
      value: "600px",
      icon: <Smartphone size={16} />,
      description: "Small - Tablets portrait",
    },
    {
      name: "md",
      value: "900px",
      icon: <Tablet size={16} />,
      description: "Medium - Tablets landscape",
    },
    { name: "lg", value: "1200px", icon: <Monitor size={16} />, description: "Large - Desktops" },
    {
      name: "xl",
      value: "1536px",
      icon: <Monitor size={16} />,
      description: "Extra large - Wide screens",
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
          Breakpoints & responsive
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          VerifyWise uses MUI's default breakpoint system. Use responsive sx props and useMediaQuery
          for adaptive layouts.
        </Typography>
      </Box>

      {/* Breakpoint Scale */}
      <SpecSection title="Breakpoint scale">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          MUI's default breakpoints are used throughout the application. These values define when
          layouts should adapt.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Breakpoint values"
              code={breakpointSnippets.muiBreakpoints}
              onCopy={handleCopy}
            >
              <Box
                sx={{
                  p: "24px",
                  backgroundColor: theme.palette.background.fill,
                  borderRadius: "4px",
                }}
              >
                <Stack spacing="12px">
                  {breakpoints.map((bp, index) => (
                    <Box
                      key={bp.name}
                      onClick={() => handleCopy(bp.value)}
                      sx={{
                        "display": "flex",
                        "alignItems": "center",
                        "gap": "16px",
                        "p": "12px 16px",
                        "backgroundColor": theme.palette.background.main,
                        "border": `1px solid ${theme.palette.border.light}`,
                        "borderRadius": "4px",
                        "cursor": "pointer",
                        "&:hover": {
                          borderColor: theme.palette.primary.main,
                        },
                      }}
                    >
                      <Box sx={{ color: theme.palette.text.tertiary }}>{bp.icon}</Box>
                      <Box
                        sx={{
                          width: 32,
                          height: 24,
                          backgroundColor: theme.palette.primary.main,
                          borderRadius: "4px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "white",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {bp.name}
                      </Box>
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontFamily: "monospace",
                          color: theme.palette.text.primary,
                          minWidth: 60,
                        }}
                      >
                        {bp.value}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: theme.palette.text.tertiary }}>
                        {bp.description}
                      </Typography>
                      {/* Visual bar showing relative size */}
                      <Box sx={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                        <Box
                          sx={{
                            height: 6,
                            width: `${20 + index * 20}%`,
                            backgroundColor: theme.palette.primary.main,
                            opacity: 0.3,
                            borderRadius: "3px",
                          }}
                        />
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </ExampleWithCode>
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
              Breakpoint helpers
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "breakpoints.up('md')", value: ">= 900px" },
                { property: "breakpoints.down('md')", value: "< 900px" },
                { property: "breakpoints.only('md')", value: "900-1199px" },
                { property: "breakpoints.between('sm','lg')", value: "600-1199px" },
              ]}
            />

            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: theme.palette.text.secondary,
                mb: "16px",
                mt: "24px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Common breakpoint usage
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Mobile", value: "xs, sm (< 900px)" },
                { property: "Tablet", value: "sm, md (600-1200px)" },
                { property: "Desktop", value: "md+ (>= 900px)" },
                { property: "Wide", value: "lg+ (>= 1200px)" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* Responsive Sx Prop */}
      <SpecSection title="Responsive sx prop">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Use object syntax in sx prop to define values at different breakpoints.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Responsive values"
                code={breakpointSnippets.responsiveSx}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    p: "24px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      gap: "16px",
                      flexWrap: "wrap",
                    }}
                  >
                    <Box
                      sx={{
                        width: { xs: "100%", sm: "calc(50% - 8px)", md: "calc(33.33% - 11px)" },
                        p: "16px",
                        backgroundColor: theme.palette.background.main,
                        border: `1px solid ${theme.palette.border.dark}`,
                        borderRadius: "4px",
                        textAlign: "center",
                      }}
                    >
                      <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
                        xs: 100% / sm: 50% / md: 33%
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        width: { xs: "100%", sm: "calc(50% - 8px)", md: "calc(33.33% - 11px)" },
                        p: "16px",
                        backgroundColor: theme.palette.background.main,
                        border: `1px solid ${theme.palette.border.dark}`,
                        borderRadius: "4px",
                        textAlign: "center",
                      }}
                    >
                      <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
                        Responsive box
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        width: { xs: "100%", sm: "calc(50% - 8px)", md: "calc(33.33% - 11px)" },
                        p: "16px",
                        backgroundColor: theme.palette.background.main,
                        border: `1px solid ${theme.palette.border.dark}`,
                        borderRadius: "4px",
                        textAlign: "center",
                      }}
                    >
                      <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
                        Responsive box
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </ExampleWithCode>

              <ExampleWithCode
                label="Show/hide by breakpoint"
                code={breakpointSnippets.hiddenBreakpoints}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    p: "24px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                    display: "flex",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <Box
                    sx={{
                      p: "12px 16px",
                      backgroundColor: theme.palette.background.main,
                      border: `1px solid ${theme.palette.border.dark}`,
                      borderRadius: "4px",
                      display: { xs: "none", md: "block" },
                    }}
                  >
                    <Typography sx={{ fontSize: 12 }}>Desktop only (md+)</Typography>
                  </Box>
                  <Box
                    sx={{
                      p: "12px 16px",
                      backgroundColor: theme.palette.background.main,
                      border: `1px solid ${theme.palette.border.dark}`,
                      borderRadius: "4px",
                      display: { xs: "block", md: "none" },
                    }}
                  >
                    <Typography sx={{ fontSize: 12 }}>Mobile only (&lt;md)</Typography>
                  </Box>
                  <Box
                    sx={{
                      p: "12px 16px",
                      backgroundColor: theme.palette.primary.main,
                      borderRadius: "4px",
                    }}
                  >
                    <Typography sx={{ fontSize: 12, color: "white" }}>Always visible</Typography>
                  </Box>
                </Box>
              </ExampleWithCode>
            </Stack>
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
              Responsive patterns
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "display: { xs: 'none', md: 'block' }", value: "Show md+" },
                { property: "display: { xs: 'block', md: 'none' }", value: "Hide md+" },
                { property: "flexDirection: { xs: 'column', md: 'row' }", value: "Stack→Row" },
                { property: "width: { xs: '100%', md: '50%' }", value: "Full→Half" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* useMediaQuery */}
      <SpecSection title="useMediaQuery hook">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          For JavaScript logic based on screen size, use MUI's useMediaQuery hook.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Media query hook"
              code={breakpointSnippets.useMediaQuery}
              onCopy={handleCopy}
            >
              <Box
                sx={{
                  p: "24px",
                  backgroundColor: theme.palette.background.fill,
                  borderRadius: "4px",
                }}
              >
                <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                  Use useMediaQuery when you need to:
                </Typography>
                <Stack spacing="8px" sx={{ mt: "12px" }}>
                  {[
                    "Conditionally render different components",
                    "Change component props based on screen size",
                    "Control animations or interactions",
                    "Fetch different data for mobile vs desktop",
                  ].map((item, index) => (
                    <Box key={index} sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Box
                        sx={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          backgroundColor: theme.palette.primary.main,
                        }}
                      />
                      <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                        {item}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </ExampleWithCode>
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
              When to use each approach
            </Typography>
            <Box
              sx={{
                p: "16px",
                backgroundColor: theme.palette.background.alt,
                borderRadius: "4px",
                border: `1px solid ${theme.palette.border.light}`,
              }}
            >
              <Stack spacing="12px">
                <Box>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: theme.palette.text.primary,
                      mb: "4px",
                    }}
                  >
                    Responsive sx prop
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
                    For CSS-only changes (padding, display, width). Simpler and more performant.
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: theme.palette.text.primary,
                      mb: "4px",
                    }}
                  >
                    useMediaQuery
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
                    For JS logic, conditional rendering, or prop changes. More flexible but causes
                    re-renders.
                  </Typography>
                </Box>
              </Stack>
            </Box>
          </Box>
        </Box>
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
            "Use responsive sx prop for CSS-only changes (preferred)",
            "Use useMediaQuery only when JS logic is needed",
            "md (900px) is the primary mobile/desktop breakpoint",
            "Test layouts at xs, sm, md, and lg breakpoints",
            "Use display: { xs: 'none', md: 'block' } to hide/show",
            "Prefer flexbox with wrap over grid for simple responsive layouts",
            "Always provide mobile-first values (xs) then override for larger",
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
            "display": "flex",
            "justifyContent": "space-between",
            "alignItems": "center",
            "p": "10px 14px",
            "borderBottom":
              index < specs.length - 1 ? `1px solid ${theme.palette.border.light}` : "none",
            "cursor": "pointer",
            "transition": "background-color 150ms ease",
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
            "fontSize": 11,
            "color": showCode ? theme.palette.primary.main : theme.palette.text.tertiary,
            "cursor": "pointer",
            "&:hover": { color: theme.palette.primary.main },
          }}
        >
          {showCode ? "Hide code" : "Show code"}
        </Box>
      </Box>

      <Box sx={{ backgroundColor: theme.palette.background.main }}>{children}</Box>

      {showCode && (
        <Box sx={{ borderTop: `1px solid ${theme.palette.border.light}` }}>
          <CodeBlock code={code} language="tsx" onCopy={onCopy} />
        </Box>
      )}
    </Box>
  );
};

export default BreakpointsSection;
