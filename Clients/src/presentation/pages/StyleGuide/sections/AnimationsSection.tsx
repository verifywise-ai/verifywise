import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Snackbar, Button } from "@mui/material";
import { Copy, RotateCcw } from "lucide-react";
import CodeBlock from "../components/CodeBlock";

const animationSnippets = {
  transitions: `// Standard transition patterns
transition: "all 0.2s ease"           // Default for most
transition: "all 0.2s ease-in-out"    // Hover states
transition: "background-color 0.2s ease-in-out"  // Specific property
transition: "background-color 0.3s ease-in-out"  // Slower bg change
transition: "none"                     // Disabled (buttons, ripple)`,
  noTransition: `// VerifyWise disables transitions on interactive elements
MuiButton: { transition: "none" }
MuiIconButton: { transition: "none" }
MuiListItemButton: { transition: "none" }`,
  hoverExample: `// Card hover transition
<Box
  sx={{
    transition: "all 0.2s ease-in-out",
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
      transform: "translateY(-2px)",
    },
  }}
>
  Interactive card
</Box>`,
  keyframes: `// Modal scale-in animation
animation: "scaleIn 0.2s"

@keyframes scaleIn {
  0% { transform: scale(0.95); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

// Skeleton pulse animation
animation: "pulse 1.6s ease-in-out infinite"

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.72; }
}

// Float animation (empty states)
animation: "float 3s ease-in-out 5"

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}`,
  fadeInOut: `// Fade in
@keyframes fadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
animation: "fadeIn 0.3s ease-in-out"

// Fade out
@keyframes fadeOut {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
animation: "fadeOut 0.2s ease-in-out"`,
};

const AnimationsSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [demoKey, setDemoKey] = useState(0);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const resetDemo = () => setDemoKey((k) => k + 1);

  const transitionDurations = [
    { duration: "0.15s", usage: "Micro interactions, tooltips" },
    { duration: "0.2s", usage: "Default, hover states, focus" },
    { duration: "0.3s", usage: "Background changes, larger elements" },
    { duration: "1.6s", usage: "Skeleton pulse (infinite)" },
    { duration: "3s", usage: "Float animation (decorative)" },
  ];

  const easingFunctions = [
    { name: "ease", usage: "Default for most transitions" },
    { name: "ease-in-out", usage: "Hover states, smooth animations" },
    { name: "ease-in", usage: "Entering animations" },
    { name: "ease-out", usage: "Exiting animations" },
    { name: "linear", usage: "Loading spinners" },
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
          Animations & transitions
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          VerifyWise uses subtle, fast transitions. Most button interactions have no transition for
          instant feedback. Animations are reserved for modals and loading states.
        </Typography>
      </Box>

      {/* Transition Durations */}
      <SpecSection title="Transition durations">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Standard duration values used across the application. Shorter durations provide snappier
          interactions.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Transition patterns"
              code={animationSnippets.transitions}
              onCopy={handleCopy}
            >
              <Box
                sx={{
                  p: "24px",
                  backgroundColor: theme.palette.background.fill,
                  borderRadius: "4px",
                }}
              >
                <Stack spacing="16px">
                  {transitionDurations.slice(0, 3).map((item) => (
                    <Box
                      key={item.duration}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: "16px",
                      }}
                    >
                      <Box
                        sx={{
                          width: 80,
                          height: 40,
                          backgroundColor: theme.palette.background.main,
                          border: `1px solid ${theme.palette.border.dark}`,
                          borderRadius: "4px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: `all ${item.duration} ease-in-out`,
                          cursor: "pointer",
                          "&:hover": {
                            backgroundColor: theme.palette.primary.main,
                            color: "white",
                            borderColor: theme.palette.primary.main,
                          },
                        }}
                      >
                        <Typography sx={{ fontSize: 11 }}>{item.duration}</Typography>
                      </Box>
                      <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                        {item.usage}
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
              Duration scale
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={transitionDurations.map((t) => ({
                property: t.duration,
                value: t.usage,
              }))}
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
              Easing functions
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={easingFunctions.map((e) => ({
                property: e.name,
                value: e.usage,
              }))}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* Disabled Transitions */}
      <SpecSection title="Disabled transitions">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          VerifyWise intentionally disables transitions on buttons and interactive elements for
          instant visual feedback.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="No transition on buttons"
              code={animationSnippets.noTransition}
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
                <Button
                  variant="contained"
                  sx={{
                    backgroundColor: theme.palette.primary.main,
                    transition: "none",
                    "&:hover": {
                      backgroundColor: "brand.primaryDark",
                    },
                  }}
                >
                  No transition
                </Button>
                <Button
                  variant="contained"
                  sx={{
                    backgroundColor: theme.palette.primary.main,
                    transition: "all 0.3s ease",
                    "&:hover": {
                      backgroundColor: "brand.primaryDark",
                    },
                  }}
                >
                  With transition
                </Button>
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
              Components with transition: none
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "MuiButton", value: "transition: none" },
                { property: "MuiIconButton", value: "transition: none" },
                { property: "MuiListItemButton", value: "transition: none" },
                { property: "MuiButtonBase", value: "disableRipple: true" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* Keyframe Animations */}
      <SpecSection title="Keyframe animations">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Named keyframe animations for modals, loading states, and decorative effects.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Modal & loading animations"
                code={animationSnippets.keyframes}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    p: "24px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: "24px", mb: "16px" }}>
                    <Button
                      size="small"
                      onClick={resetDemo}
                      startIcon={<RotateCcw size={14} />}
                      sx={{ fontSize: 11 }}
                    >
                      Reset demos
                    </Button>
                  </Box>

                  <Stack spacing="24px">
                    {/* Scale In Demo */}
                    <Box>
                      <Typography
                        sx={{ fontSize: 11, color: theme.palette.text.tertiary, mb: "8px" }}
                      >
                        scaleIn (modals)
                      </Typography>
                      <Box
                        key={`scale-${demoKey}`}
                        sx={{
                          width: 120,
                          height: 60,
                          backgroundColor: theme.palette.background.main,
                          border: `1px solid ${theme.palette.border.dark}`,
                          borderRadius: "4px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          animation: "scaleIn 0.2s ease-out",
                          "@keyframes scaleIn": {
                            "0%": { transform: "scale(0.95)", opacity: 0 },
                            "100%": { transform: "scale(1)", opacity: 1 },
                          },
                        }}
                      >
                        <Typography sx={{ fontSize: 11 }}>Modal</Typography>
                      </Box>
                    </Box>

                    {/* Pulse Demo */}
                    <Box>
                      <Typography
                        sx={{ fontSize: 11, color: theme.palette.text.tertiary, mb: "8px" }}
                      >
                        pulse (skeletons)
                      </Typography>
                      <Box
                        sx={{
                          width: 120,
                          height: 16,
                          backgroundColor: "#f2f4f7",
                          borderRadius: "4px",
                          animation: "pulse 1.6s ease-in-out infinite",
                          "@keyframes pulse": {
                            "0%, 100%": { opacity: 1 },
                            "50%": { opacity: 0.72 },
                          },
                        }}
                      />
                    </Box>

                    {/* Float Demo */}
                    <Box>
                      <Typography
                        sx={{ fontSize: 11, color: theme.palette.text.tertiary, mb: "8px" }}
                      >
                        float (empty states)
                      </Typography>
                      <Box
                        key={`float-${demoKey}`}
                        sx={{
                          width: 60,
                          height: 40,
                          backgroundColor: theme.palette.background.main,
                          border: `1px solid ${theme.palette.border.light}`,
                          borderRadius: "8px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                          animation: "float 3s ease-in-out infinite",
                          "@keyframes float": {
                            "0%, 100%": { transform: "translateY(0)" },
                            "50%": { transform: "translateY(-8px)" },
                          },
                        }}
                      />
                    </Box>
                  </Stack>
                </Box>
              </ExampleWithCode>

              <ExampleWithCode
                label="Fade in/out"
                code={animationSnippets.fadeInOut}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    p: "24px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                    display: "flex",
                    gap: "24px",
                  }}
                >
                  <Box
                    key={`fade-${demoKey}`}
                    sx={{
                      width: 80,
                      height: 40,
                      backgroundColor: theme.palette.primary.main,
                      borderRadius: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      animation: "fadeIn 0.3s ease-in-out",
                      "@keyframes fadeIn": {
                        "0%": { opacity: 0 },
                        "100%": { opacity: 1 },
                      },
                    }}
                  >
                    <Typography sx={{ fontSize: 11, color: "white" }}>Fade in</Typography>
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
              Animation reference
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "scaleIn", value: "0.2s - Modal entrance" },
                { property: "pulse", value: "1.6s infinite - Skeletons" },
                { property: "float", value: "3s × 5 - Empty states" },
                { property: "fadeIn", value: "0.3s - Page tours" },
                { property: "fadeOut", value: "0.2s - Dismissals" },
                { property: "colorWave", value: "2s infinite - Login page" },
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
              Animation counts
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "infinite", value: "Loading, skeletons" },
                { property: "5", value: "Float decoration" },
                { property: "1 (once)", value: "Modal entrance" },
              ]}
            />
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
            'Use transition: "none" for buttons - instant feedback is preferred',
            "Default transition duration is 0.2s with ease or ease-in-out",
            "Use 0.3s for larger elements or background color changes",
            "Modal animations should use scaleIn with 0.2s duration",
            "Skeleton loaders use pulse animation (1.6s infinite)",
            "Avoid animations longer than 0.3s for UI interactions",
            'Use animation: "animationName 0.2s" syntax, not animationDuration',
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

      <Box sx={{ backgroundColor: theme.palette.background.main }}>{children}</Box>

      {showCode && (
        <Box sx={{ borderTop: `1px solid ${theme.palette.border.light}` }}>
          <CodeBlock code={code} language="tsx" onCopy={onCopy} />
        </Box>
      )}
    </Box>
  );
};

export default AnimationsSection;
