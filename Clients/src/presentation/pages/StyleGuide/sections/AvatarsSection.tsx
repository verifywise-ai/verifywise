import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Avatar as MuiAvatar, Snackbar } from "@mui/material";
import { Copy } from "lucide-react";
import CodeBlock from "../components/CodeBlock";
import VWAvatar from "../../../components/Avatar/VWAvatar";

const avatarSnippets = {
  basic: `import VWAvatar from "@/presentation/components/Avatar/VWAvatar";

// Display initials avatar for a user
<VWAvatar
  user={{ firstname: "John", lastname: "Doe" }}
  size="small"
/>`,
  withImage: `import VWAvatar from "@/presentation/components/Avatar/VWAvatar";

// Display avatar with profile image and initials fallback
<VWAvatar
  user={{
    firstname: "John",
    lastname: "Doe",
    pathToImage: "/path/to/image.jpg",
  }}
  size="small"
/>`,
  sizes: `import VWAvatar from "@/presentation/components/Avatar/VWAvatar";

// Small — 32px
<VWAvatar user={{ firstname: "John", lastname: "Doe" }} size="small" />

// Medium — 64px
<VWAvatar user={{ firstname: "Alice", lastname: "Brown" }} size="medium" />

// Large — 128px
<VWAvatar user={{ firstname: "Carlos", lastname: "Davis" }} size="large" />`,
  colorGeneration: `import VWAvatar from "@/presentation/components/Avatar/VWAvatar";

// VWAvatar uses the theme primary color automatically.
// No manual color calculation needed.
<VWAvatar user={{ firstname: "John", lastname: "Doe" }} size="small" />
<VWAvatar user={{ firstname: "Alice", lastname: "Brown" }} size="small" />
<VWAvatar user={{ firstname: "Carlos", lastname: "Davis" }} size="small" />`,
  withBorder: `import VWAvatar from "@/presentation/components/Avatar/VWAvatar";

// showBorder prop (default: true) adds a 2px primary-color border
// when an image is loaded, or no border when showing initials.
<VWAvatar
  user={{ firstname: "John", lastname: "Doe" }}
  size="small"
  showBorder
/>

// Disable border
<VWAvatar
  user={{ firstname: "Alice", lastname: "Brown" }}
  size="small"
  showBorder={false}
/>`,
  group: `import { AvatarGroup } from "@mui/material";
import VWAvatar from "@/presentation/components/Avatar/VWAvatar";

// Wrap multiple VWAvatars inside MUI AvatarGroup for overlap + overflow
<AvatarGroup
  max={4}
  sx={{ "& .MuiAvatar-root": { width: 32, height: 32, fontSize: 14 } }}
>
  <VWAvatar user={{ firstname: "John", lastname: "Doe" }} size="small" />
  <VWAvatar user={{ firstname: "Alice", lastname: "Brown" }} size="small" />
  <VWAvatar user={{ firstname: "Carlos", lastname: "Davis" }} size="small" />
  <VWAvatar user={{ firstname: "Emma", lastname: "Foster" }} size="small" />
  <VWAvatar user={{ firstname: "George", lastname: "Hill" }} size="small" />
</AvatarGroup>`,
};

const sampleUsers = [
  { firstname: "John", lastname: "Doe" },
  { firstname: "Alice", lastname: "Brown" },
  { firstname: "Carlos", lastname: "Davis" },
  { firstname: "Emma", lastname: "Foster" },
  { firstname: "George", lastname: "Hill" },
];

const AvatarsSection: React.FC = () => {
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
          Avatars
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          User avatars with automatic initials fallback and size support. Uses VWAvatar, the
          VerifyWise avatar component with built-in color generation and size support.
        </Typography>
      </Box>

      {/* Basic Avatars */}
      <SpecSection title="Basic avatars">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          VWAvatar displays user initials when no image is provided. Pass a <code>user</code> object
          with <code>firstname</code> and <code>lastname</code>. The component derives initials and
          applies theme-based colors automatically.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Initials avatar"
                code={avatarSnippets.basic}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    display: "flex",
                    gap: "16px",
                    alignItems: "center",
                    p: "24px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                  }}
                >
                  {sampleUsers.slice(0, 4).map((user) => (
                    <VWAvatar key={`${user.firstname}-${user.lastname}`} user={user} size="small" />
                  ))}
                </Box>
              </ExampleWithCode>

              <ExampleWithCode label="Avatar sizes" code={avatarSnippets.sizes} onCopy={handleCopy}>
                <Box
                  sx={{
                    display: "flex",
                    gap: "24px",
                    alignItems: "center",
                    p: "24px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                  }}
                >
                  <Box sx={{ textAlign: "center" }}>
                    <Box sx={{ display: "flex", justifyContent: "center", mb: "8px" }}>
                      <VWAvatar user={sampleUsers[0]} size="small" />
                    </Box>
                    <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
                      small (32px)
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "center" }}>
                    <Box sx={{ display: "flex", justifyContent: "center", mb: "8px" }}>
                      <VWAvatar user={sampleUsers[1]} size="medium" />
                    </Box>
                    <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
                      medium (64px)
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "center" }}>
                    <Box sx={{ display: "flex", justifyContent: "center", mb: "8px" }}>
                      <VWAvatar user={sampleUsers[2]} size="large" />
                    </Box>
                    <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
                      large (128px)
                    </Typography>
                  </Box>
                </Box>
              </ExampleWithCode>

              <ExampleWithCode
                label="With and without border"
                code={avatarSnippets.withBorder}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    display: "flex",
                    gap: "24px",
                    alignItems: "center",
                    p: "24px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                  }}
                >
                  <Box sx={{ textAlign: "center" }}>
                    <Box sx={{ display: "flex", justifyContent: "center", mb: "8px" }}>
                      <VWAvatar user={sampleUsers[0]} size="small" showBorder />
                    </Box>
                    <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
                      showBorder
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "center" }}>
                    <Box sx={{ display: "flex", justifyContent: "center", mb: "8px" }}>
                      <VWAvatar user={sampleUsers[1]} size="small" showBorder={false} />
                    </Box>
                    <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
                      no border
                    </Typography>
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
              Size reference
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "small", value: "32px (fontSize: 13px)" },
                { property: "medium", value: "64px (fontSize: 22px)" },
                { property: "large", value: "128px (fontSize: 44px)" },
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
              Props reference
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "user", value: "{ firstname, lastname, pathToImage? }" },
                { property: "size", value: '"small" | "medium" | "large"' },
                { property: "variant", value: '"circular" | "rounded" | "square"' },
                { property: "showBorder", value: "boolean (default: true)" },
                { property: "onClick", value: "() => void" },
                { property: "alt", value: "string (overrides auto alt text)" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* Color Generation */}
      <SpecSection title="Color generation">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          VWAvatar uses the theme's primary color for all initials avatars. Color generation is
          handled internally — no utility function is needed in consuming code. When a profile image
          is provided, the background becomes transparent and the border adopts the primary color.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Theme-based avatar colors"
              code={avatarSnippets.colorGeneration}
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
                  {sampleUsers.map((user) => (
                    <Box
                      key={`${user.firstname}-${user.lastname}`}
                      sx={{ display: "flex", alignItems: "center", gap: "12px" }}
                    >
                      <VWAvatar user={user} size="small" />
                      <Typography sx={{ fontSize: 13, color: theme.palette.text.primary }}>
                        {user.firstname} {user.lastname}
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
              How colors work
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
                <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                  1. Initials avatars use <code>theme.palette.primary.main</code>
                </Typography>
                <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                  2. Image avatars use transparent background
                </Typography>
                <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                  3. Border color follows primary when image is present
                </Typography>
                <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                  4. All color logic lives inside VWAvatar — no manual calculation needed
                </Typography>
              </Stack>
            </Box>
          </Box>
        </Box>
      </SpecSection>

      {/* Avatar Groups */}
      <SpecSection title="Avatar groups">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Wrap VWAvatar components inside MUI AvatarGroup to display multiple avatars with automatic
          overlap and overflow handling.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Avatar group with max limit"
              code={avatarSnippets.group}
              onCopy={handleCopy}
            >
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "24px",
                  p: "24px",
                  backgroundColor: theme.palette.background.fill,
                  borderRadius: "4px",
                }}
              >
                <Box>
                  <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary, mb: "8px" }}>
                    max=4 (shows +1 overflow)
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      "& .MuiAvatar-root": {
                        width: 32,
                        height: 32,
                        fontSize: 12,
                        border: `2px solid ${theme.palette.background.fill}`,
                        marginLeft: "-8px",
                        "&:first-of-type": { marginLeft: 0 },
                      },
                    }}
                  >
                    {sampleUsers.slice(0, 4).map((user) => (
                      <VWAvatar
                        key={`${user.firstname}-${user.lastname}`}
                        user={user}
                        size="small"
                        showBorder={false}
                      />
                    ))}
                    <MuiAvatar
                      sx={{
                        backgroundColor: theme.palette.grey[300],
                        color: theme.palette.text.primary,
                        fontSize: "11px !important",
                      }}
                    >
                      +1
                    </MuiAvatar>
                  </Box>
                </Box>

                <Box>
                  <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary, mb: "8px" }}>
                    max=3 (shows +2 overflow)
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      "& .MuiAvatar-root": {
                        width: 32,
                        height: 32,
                        fontSize: 12,
                        border: `2px solid ${theme.palette.background.fill}`,
                        marginLeft: "-8px",
                        "&:first-of-type": { marginLeft: 0 },
                      },
                    }}
                  >
                    {sampleUsers.slice(0, 3).map((user) => (
                      <VWAvatar
                        key={`${user.firstname}-${user.lastname}`}
                        user={user}
                        size="small"
                        showBorder={false}
                      />
                    ))}
                    <MuiAvatar
                      sx={{
                        backgroundColor: theme.palette.grey[300],
                        color: theme.palette.text.primary,
                        fontSize: "11px !important",
                      }}
                    >
                      +2
                    </MuiAvatar>
                  </Box>
                </Box>
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
              AvatarGroup props
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "max", value: "Number of visible avatars" },
                { property: "spacing", value: "Overlap spacing (default: medium)" },
                { property: "total", value: "Override total count for +N" },
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
              Group styling
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Overlap", value: "marginLeft: -8px" },
                { property: "Border", value: "2px solid (background color)" },
                { property: "Overflow background", value: "grey[300]" },
                { property: "Overflow font size", value: "11px" },
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
            "Use VWAvatar component (not raw MUI Avatar) for all user avatars",
            "VWAvatar handles color generation automatically from the theme — no manual stringToColor() needed",
            "Pass user as { firstname, lastname, pathToImage? } — never pass raw initials strings",
            'Use size="small" (32px) for compact lists, size="medium" (64px) for profiles, size="large" (128px) for hero displays',
            "Set showBorder={false} when composing into AvatarGroup to avoid double borders",
            "VWAvatar falls back to initials automatically when image fails to load",
            "Always provide meaningful alt text via the alt prop when the avatar context is not self-evident",
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

export default AvatarsSection;
