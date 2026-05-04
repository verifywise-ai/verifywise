import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar, Chip } from "@mui/material";
import { Copy, Check, Clock, AlertTriangle, XCircle, Circle, AlertCircle, Zap } from "lucide-react";
import { statusColorSchemes, getStatusColor } from "../../../utils/statusColors";
import CodeBlock from "../components/CodeBlock";
import { background, status } from "../../../themes/palette";

// Code snippets
const statusColorsSnippet = `import { statusColorSchemes, getStatusColor } from "../utils/statusColors";

// Direct access to color schemes
const modelProductionColor = statusColorSchemes.models.production; // "#138A5E"

// Using helper function
const color = getStatusColor("models", "production"); // "#138A5E"
const vendorColor = getStatusColor("vendors", "in review"); // "#795548"`;

const chipSnippet = `<Chip
  label="Active"
  size="small"
  sx={{
    backgroundColor: "#E6F4EA",
    color: "#138A5E",
    fontSize: 12,
    height: 24,
    "& .MuiChip-label": { px: "8px" },
  }}
/>`;

const chipWithIconSnippet = `<Chip
  icon={<Check size={14} />}
  label="Completed"
  size="small"
  sx={{
    backgroundColor: "#E6F4EA",
    color: "#138A5E",
    fontSize: 12,
    height: 24,
    "& .MuiChip-icon": { color: "inherit", ml: "6px" },
    "& .MuiChip-label": { pl: "4px", pr: "8px" },
  }}
/>`;

const dotIndicatorSnippet = `// Status dot with label
<Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
  <Box sx={{
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#138A5E"
  }} />
  <Typography sx={{ fontSize: 13 }}>Active</Typography>
</Box>`;

const StatusSection: React.FC = () => {
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
          Status indicators
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Color schemes and components for displaying entity statuses across VerifyWise. Centralized
          in statusColors.ts for consistency.
        </Typography>
      </Box>

      {/* Status Color Schemes */}
      <SpecSection title="Status color schemes">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Predefined color schemes for different entity types. All colors are defined in
          <code
            style={{
              backgroundColor: theme.palette.background.fill,
              padding: "2px 6px",
              borderRadius: 4,
              marginLeft: 4,
              fontSize: 12,
            }}
          >
            src/presentation/utils/statusColors.ts
          </code>
        </Typography>

        <Box sx={{ display: "flex", gap: "24px", flexWrap: "wrap", mb: "32px" }}>
          {/* Models */}
          <StatusSchemeCard
            title="Models"
            entityType="models"
            statuses={[
              {
                name: "Development",
                color: statusColorSchemes.models.development,
                icon: <Zap size={14} />,
              },
              {
                name: "Training",
                color: statusColorSchemes.models.training,
                icon: <Clock size={14} />,
              },
              {
                name: "Validation",
                color: statusColorSchemes.models.validation,
                icon: <AlertCircle size={14} />,
              },
              {
                name: "Production",
                color: statusColorSchemes.models.production,
                icon: <Check size={14} />,
              },
            ]}
            onCopy={handleCopy}
          />

          {/* Vendors */}
          <StatusSchemeCard
            title="Vendors"
            entityType="vendors"
            statuses={[
              {
                name: "Active",
                color: statusColorSchemes.vendors.active,
                icon: <Check size={14} />,
              },
              {
                name: "In review",
                color: statusColorSchemes.vendors["in review"],
                icon: <Clock size={14} />,
              },
              {
                name: "Reviewed",
                color: statusColorSchemes.vendors.reviewed,
                icon: <Check size={14} />,
              },
              {
                name: "Requires follow up",
                color: statusColorSchemes.vendors["requires follow up"],
                icon: <AlertTriangle size={14} />,
              },
              {
                name: "Inactive",
                color: statusColorSchemes.vendors.inactive,
                icon: <Circle size={14} />,
              },
            ]}
            onCopy={handleCopy}
          />

          {/* Policies */}
          <StatusSchemeCard
            title="Policies"
            entityType="policies"
            statuses={[
              {
                name: "Draft",
                color: statusColorSchemes.policies.draft,
                icon: <Circle size={14} />,
              },
              {
                name: "In review",
                color: statusColorSchemes.policies["in review"],
                icon: <Clock size={14} />,
              },
              {
                name: "Approved",
                color: statusColorSchemes.policies.approved,
                icon: <Check size={14} />,
              },
              {
                name: "Published",
                color: statusColorSchemes.policies.published,
                icon: <Zap size={14} />,
              },
              {
                name: "Archived",
                color: statusColorSchemes.policies.archived,
                icon: <XCircle size={14} />,
              },
            ]}
            onCopy={handleCopy}
          />

          {/* Trainings */}
          <StatusSchemeCard
            title="Trainings"
            entityType="trainings"
            statuses={[
              {
                name: "Planned",
                color: statusColorSchemes.trainings.planned,
                icon: <Circle size={14} />,
              },
              {
                name: "In progress",
                color: statusColorSchemes.trainings["in progress"],
                icon: <Clock size={14} />,
              },
              {
                name: "Completed",
                color: statusColorSchemes.trainings.completed,
                icon: <Check size={14} />,
              },
            ]}
            onCopy={handleCopy}
          />

          {/* Vendor Risks */}
          <StatusSchemeCard
            title="Vendor risks"
            entityType="vendorRisks"
            statuses={[
              {
                name: "Very low",
                color: statusColorSchemes.vendorRisks["very low"],
                icon: <Check size={14} />,
              },
              { name: "Low", color: statusColorSchemes.vendorRisks.low, icon: <Check size={14} /> },
              {
                name: "Medium",
                color: statusColorSchemes.vendorRisks.medium,
                icon: <AlertCircle size={14} />,
              },
              {
                name: "High",
                color: statusColorSchemes.vendorRisks.high,
                icon: <AlertTriangle size={14} />,
              },
              {
                name: "Very high",
                color: statusColorSchemes.vendorRisks["very high"],
                icon: <XCircle size={14} />,
              },
            ]}
            onCopy={handleCopy}
          />

          {/* Incidents */}
          <StatusSchemeCard
            title="Incidents"
            entityType="incidents"
            statuses={[
              {
                name: "Open",
                color: statusColorSchemes.incidents.open,
                icon: <AlertTriangle size={14} />,
              },
              {
                name: "In progress",
                color: statusColorSchemes.incidents["in progress"],
                icon: <Clock size={14} />,
              },
              {
                name: "Resolved",
                color: statusColorSchemes.incidents.resolved,
                icon: <Check size={14} />,
              },
              {
                name: "Closed",
                color: statusColorSchemes.incidents.closed,
                icon: <Circle size={14} />,
              },
            ]}
            onCopy={handleCopy}
          />
        </Box>

        <ExampleWithCode label="Using status colors" code={statusColorsSnippet} onCopy={handleCopy}>
          <Box sx={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
              getStatusColor("models", "production"):
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: "4px",
                  backgroundColor: getStatusColor("models", "production"),
                }}
              />
              <Typography sx={{ fontSize: 13, fontFamily: "monospace" }}>
                {getStatusColor("models", "production")}
              </Typography>
            </Box>
          </Box>
        </ExampleWithCode>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Status Chip Patterns */}
      <SpecSection title="Status chip patterns">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Common patterns for displaying status indicators using MUI Chip component.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          {/* Live Examples */}
          <Box sx={{ flex: "1 1 400px", minWidth: 320 }}>
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
              Chip variants
            </Typography>
            <Stack spacing="24px">
              <ExampleWithCode label="Basic status chip" code={chipSnippet} onCopy={handleCopy}>
                <Box sx={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <StatusChip label="Active" status="success" />
                  <StatusChip label="Pending" status="warning" />
                  <StatusChip label="Failed" status="error" />
                  <StatusChip label="Draft" status="neutral" />
                  <StatusChip label="In review" status="info" />
                </Box>
              </ExampleWithCode>

              <ExampleWithCode
                label="Chip with icon"
                code={chipWithIconSnippet}
                onCopy={handleCopy}
              >
                <Box sx={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <StatusChip label="Completed" status="success" icon={<Check size={14} />} />
                  <StatusChip label="In progress" status="warning" icon={<Clock size={14} />} />
                  <StatusChip label="Failed" status="error" icon={<XCircle size={14} />} />
                  <StatusChip label="Pending" status="neutral" icon={<Circle size={14} />} />
                </Box>
              </ExampleWithCode>
            </Stack>

            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: theme.palette.text.secondary,
                mb: "16px",
                mt: "32px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Dot indicators
            </Typography>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Status dot with label"
                code={dotIndicatorSnippet}
                onCopy={handleCopy}
              >
                <Box sx={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                  <DotIndicator label="Active" color={status.success.text} />
                  <DotIndicator label="Pending" color="#795548" />
                  <DotIndicator label="Inactive" color={status.default.text} />
                  <DotIndicator label="Error" color={status.error.text} />
                </Box>
              </ExampleWithCode>
            </Stack>
          </Box>

          {/* Specifications */}
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
              Chip specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Height", value: "24px" },
                { property: "Font size", value: "12px" },
                { property: "Font weight", value: "500" },
                { property: "Border radius", value: "4px" },
                { property: "Padding", value: "0 8px" },
                { property: "Icon size", value: "14px" },
                { property: "Icon margin left", value: "6px" },
                { property: "Gap (icon-text)", value: "4px" },
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
              Dot specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Dot size", value: "8px" },
                { property: "Border radius", value: "50%" },
                { property: "Gap to label", value: "8px" },
                { property: "Label font size", value: "13px" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Semantic Colors */}
      <SpecSection title="Semantic status colors">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Standard colors used across all status types. Reference these for consistency.
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "16px",
          }}
        >
          <SemanticColorCard
            name="Success / Active"
            textColor={status.success.text}
            bgColor="#E6F4EA"
            usage="Completed, Active, Production, Low risk"
            onCopy={handleCopy}
          />
          <SemanticColorCard
            name="Warning / Pending"
            textColor="#795548"
            bgColor="#FFF8E1"
            usage="In progress, In review, Medium risk"
            onCopy={handleCopy}
          />
          <SemanticColorCard
            name="Error / Critical"
            textColor={status.error.text}
            bgColor="#FFD6D6"
            usage="Failed, Open incidents, High risk"
            onCopy={handleCopy}
          />
          <SemanticColorCard
            name="Info / Development"
            textColor="#1565C0"
            bgColor="#E3F2FD"
            usage="Development, Published, Info states"
            onCopy={handleCopy}
          />
          <SemanticColorCard
            name="Neutral / Inactive"
            textColor={status.default.text}
            bgColor={background.hover}
            usage="Draft, Inactive, Closed, Planned"
            onCopy={handleCopy}
          />
          <SemanticColorCard
            name="Purple / Validation"
            textColor="#8B5CF6"
            bgColor="#EDE9FE"
            usage="Validation phase, Special states"
            onCopy={handleCopy}
          />
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
            "Always use colors from statusColors.ts - never hardcode status colors",
            "Use getStatusColor() helper for dynamic status coloring",
            "Chip height should be 24px for consistency",
            'Use sentence case for status labels ("In progress" not "IN PROGRESS")',
            "For new entity types, add color scheme to statusColors.ts first",
            "Dot indicators are 8px with 50% border radius",
            "Status chips should have background color with 10-15% opacity of the text color",
            "Include appropriate icon when space permits (Check for success, Clock for pending, etc.)",
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

interface StatusSchemeCardProps {
  title: string;
  entityType: string;
  statuses: { name: string; color: string; icon: React.ReactNode }[];
  onCopy: (text: string) => void;
}

const StatusSchemeCard: React.FC<StatusSchemeCardProps> = ({
  title,
  entityType,
  statuses,
  onCopy,
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        flex: "1 1 280px",
        minWidth: 280,
        maxWidth: 320,
        backgroundColor: theme.palette.background.alt,
        borderRadius: "4px",
        border: `1px solid ${theme.palette.border.light}`,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          p: "12px 16px",
          borderBottom: `1px solid ${theme.palette.border.light}`,
          backgroundColor: theme.palette.background.fill,
        }}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.palette.text.primary }}>
          {title}
        </Typography>
        <Typography
          sx={{ fontSize: 11, color: theme.palette.text.accent, fontFamily: "monospace" }}
        >
          statusColorSchemes.{entityType}
        </Typography>
      </Box>
      <Stack spacing={0}>
        {statuses.map((status, index) => (
          <Box
            key={status.name}
            onClick={() => onCopy(status.color)}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              p: "10px 16px",
              borderBottom:
                index < statuses.length - 1 ? `1px solid ${theme.palette.border.light}` : "none",
              cursor: "pointer",
              transition: "background-color 150ms ease",
              "&:hover": {
                backgroundColor: theme.palette.background.fill,
              },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Box sx={{ color: status.color }}>{status.icon}</Box>
              <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                {status.name}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: "3px",
                  backgroundColor: status.color,
                }}
              />
              <Typography
                sx={{ fontSize: 11, fontFamily: "monospace", color: theme.palette.text.accent }}
              >
                {status.color}
              </Typography>
            </Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

const statusVariants = {
  success: { bg: "#E6F4EA", text: "status.success.text" },
  warning: { bg: "#FFF8E1", text: "#795548" },
  error: { bg: "#FFD6D6", text: "status.error.text" },
  info: { bg: "#E3F2FD", text: "#1565C0" },
  neutral: { bg: "background.hover", text: "status.default.text" },
};

interface StatusChipProps {
  label: string;
  status: keyof typeof statusVariants;
  icon?: React.ReactNode;
}

const StatusChip: React.FC<StatusChipProps> = ({ label, status, icon }) => {
  const variant = statusVariants[status];

  return (
    <Chip
      icon={icon as React.ReactElement | undefined}
      label={label}
      size="small"
      sx={{
        backgroundColor: variant.bg,
        color: variant.text,
        fontSize: 12,
        fontWeight: 500,
        height: 24,
        borderRadius: "4px",
        "& .MuiChip-icon": {
          color: "inherit",
          ml: "6px",
        },
        "& .MuiChip-label": {
          pl: icon ? "4px" : "8px",
          pr: "8px",
        },
      }}
    />
  );
};

const DotIndicator: React.FC<{ label: string; color: string }> = ({ label, color }) => {
  const theme = useTheme();

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
        }}
      />
      <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>{label}</Typography>
    </Box>
  );
};

interface SemanticColorCardProps {
  name: string;
  textColor: string;
  bgColor: string;
  usage: string;
  onCopy: (text: string) => void;
}

const SemanticColorCard: React.FC<SemanticColorCardProps> = ({
  name,
  textColor,
  bgColor,
  usage,
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: textColor }}>{name}</Typography>
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
            <Typography
              sx={{ fontSize: 11, fontFamily: "monospace", color: theme.palette.text.primary }}
            >
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
            <Typography
              sx={{ fontSize: 11, fontFamily: "monospace", color: theme.palette.text.primary }}
            >
              {bgColor}
            </Typography>
          </Box>
        </Box>
        <Typography sx={{ fontSize: 11, color: theme.palette.text.accent }}>{usage}</Typography>
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
              index < specs.length - 1 ? `1px solid ${theme.palette.border.light}` : "none",
            cursor: "pointer",
            transition: "background-color 150ms ease",
            "&:hover": {
              backgroundColor: theme.palette.background.fill,
            },
          }}
        >
          <Typography
            sx={{
              fontSize: 12,
              color: theme.palette.text.secondary,
            }}
          >
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
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 500,
            color: theme.palette.text.secondary,
          }}
        >
          {label}
        </Typography>
        <Box
          onClick={() => setShowCode(!showCode)}
          sx={{
            fontSize: 11,
            color: showCode ? theme.palette.primary.main : theme.palette.text.tertiary,
            cursor: "pointer",
            "&:hover": {
              color: theme.palette.primary.main,
            },
          }}
        >
          {showCode ? "Hide code" : "Show code"}
        </Box>
      </Box>

      <Box sx={{ p: "16px", backgroundColor: theme.palette.background.main }}>{children}</Box>

      {showCode && (
        <Box sx={{ borderTop: `1px solid ${theme.palette.border.light}` }}>
          <CodeBlock code={code} language="tsx" onCopy={onCopy} />
        </Box>
      )}
    </Box>
  );
};

export default StatusSection;
