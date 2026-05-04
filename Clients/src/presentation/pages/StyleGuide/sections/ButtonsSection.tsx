import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar } from "@mui/material";
import { Copy, Plus, Trash2 } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { ButtonToggle } from "../../../components/button-toggle";
import CodeBlock from "../components/CodeBlock";
import { brand, text, status } from "../../../themes/palette";

// Code snippets
const customizableButtonSnippets = {
  primaryContained: `<CustomizableButton
  variant="contained"
  color="primary"
  text="Primary button"
  onClick={handleClick}
/>`,
  primaryOutlined: `<CustomizableButton
  variant="outlined"
  color="primary"
  text="Outlined button"
  onClick={handleClick}
/>`,
  primaryText: `<CustomizableButton
  variant="text"
  color="primary"
  text="Text button"
  onClick={handleClick}
/>`,
  withIcon: `<CustomizableButton
  variant="contained"
  color="primary"
  text="Add item"
  icon={<Plus size={16} />}
  onClick={handleClick}
/>`,
  loading: `<CustomizableButton
  variant="contained"
  color="primary"
  text="Saving..."
  loading={true}
/>`,
  disabled: `<CustomizableButton
  variant="contained"
  color="primary"
  text="Disabled"
  isDisabled={true}
/>`,
  error: `<CustomizableButton
  variant="contained"
  color="error"
  text="Delete"
  icon={<Trash2 size={16} />}
  onClick={handleDelete}
/>`,
  secondary: `<CustomizableButton
  variant="contained"
  color="secondary"
  text="Cancel"
  onClick={handleCancel}
/>`,
};

const buttonToggleSnippets = {
  default: `<ButtonToggle
  options={[
    { label: "Option 1", value: "opt1" },
    { label: "Option 2", value: "opt2" },
    { label: "Option 3", value: "opt3" },
  ]}
  value={activeValue}
  onChange={setActiveValue}
/>`,
  twoOptions: `<ButtonToggle
  options={[
    { label: "List", value: "list" },
    { label: "Grid", value: "grid" },
  ]}
  value={view}
  onChange={setView}
  height={34}
/>`,
};

const ButtonsSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [toggleValue, setToggleValue] = useState("opt1");
  const [viewToggle, setViewToggle] = useState("list");

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
          Buttons
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Action buttons and toggles used throughout VerifyWise. CustomizableButton is the primary
          button component with support for variants, colors, icons, and loading states.
        </Typography>
      </Box>

      {/* Shared Specifications */}
      <SpecSection title="Shared specifications">
        <SpecGrid>
          <SpecCard title="Height" value="34px" note="Standard button height" onCopy={handleCopy} />
          <SpecCard title="Border radius" value="4px" note="All buttons" onCopy={handleCopy} />
          <SpecCard
            title="Font size"
            value="13px"
            note="Medium size (default)"
            onCopy={handleCopy}
          />
          <SpecCard title="Font weight" value="500" note="Medium weight" onCopy={handleCopy} />
          <SpecCard
            title="Primary color"
            value={brand.primary}
            note="Main action buttons"
            onCopy={handleCopy}
          />
          <SpecCard title="Primary hover" value="#0f604d" note="Hover state" onCopy={handleCopy} />
          <SpecCard
            title="Secondary color"
            value="#F4F4F4"
            note="Utility buttons (light bg)"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Error color"
            value={status.error.text}
            note="Destructive actions"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Disabled bg"
            value={status.default.border}
            note="Disabled state"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Disabled text"
            value={text.disabled}
            note="Disabled text"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Transition"
            value="0.2s ease"
            note="All interactions"
            onCopy={handleCopy}
          />
          <SpecCard title="Text transform" value="none" note="No uppercase" onCopy={handleCopy} />
        </SpecGrid>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* CustomizableButton */}
      <SpecSection title="CustomizableButton">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Primary button component with variants (contained, outlined, text), color themes, icons,
          and loading states.
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
              Variants
            </Typography>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Contained (default)"
                code={customizableButtonSnippets.primaryContained}
                onCopy={handleCopy}
              >
                <CustomizableButton variant="contained" color="primary" text="Primary button" />
              </ExampleWithCode>

              <ExampleWithCode
                label="Outlined"
                code={customizableButtonSnippets.primaryOutlined}
                onCopy={handleCopy}
              >
                <CustomizableButton variant="outlined" color="primary" text="Outlined button" />
              </ExampleWithCode>

              <ExampleWithCode
                label="Text"
                code={customizableButtonSnippets.primaryText}
                onCopy={handleCopy}
              >
                <CustomizableButton variant="text" color="primary" text="Text button" />
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
              With icons & states
            </Typography>
            <Stack spacing="24px">
              <ExampleWithCode
                label="With icon"
                code={customizableButtonSnippets.withIcon}
                onCopy={handleCopy}
              >
                <CustomizableButton
                  variant="contained"
                  color="primary"
                  text="Add item"
                  icon={<Plus size={16} />}
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Loading state"
                code={customizableButtonSnippets.loading}
                onCopy={handleCopy}
              >
                <CustomizableButton
                  variant="contained"
                  color="primary"
                  text="Saving..."
                  loading={true}
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Disabled"
                code={customizableButtonSnippets.disabled}
                onCopy={handleCopy}
              >
                <CustomizableButton
                  variant="contained"
                  color="primary"
                  text="Disabled"
                  isDisabled={true}
                />
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
              Color variants
            </Typography>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Error / Destructive"
                code={customizableButtonSnippets.error}
                onCopy={handleCopy}
              >
                <CustomizableButton
                  variant="contained"
                  color="error"
                  text="Delete"
                  icon={<Trash2 size={16} />}
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Secondary"
                code={customizableButtonSnippets.secondary}
                onCopy={handleCopy}
              >
                <CustomizableButton variant="contained" color="secondary" text="Cancel" />
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
              Component specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Min height", value: "34px" },
                { property: "Padding", value: "8px 16px" },
                { property: "Border radius", value: "4px" },
                { property: "Font size", value: "13px" },
                { property: "Font weight", value: "500" },
                { property: "Icon size", value: "16px" },
                { property: "Gap (icon-text)", value: "8px" },
                { property: "Loading spinner", value: "16px" },
                { property: "Ripple effect", value: "disabled" },
                { property: "Shadow", value: "none (default)" },
                { property: "Hover shadow", value: "0px 2px 4px rgba(...)" },
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
              Button sizes
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Small height", value: "28px" },
                { property: "Small font", value: "12px" },
                { property: "Small padding", value: "6px 12px" },
                { property: "Medium height", value: "32px" },
                { property: "Medium font", value: "13px" },
                { property: "Medium padding", value: "8px 16px" },
                { property: "Large height", value: "40px" },
                { property: "Large font", value: "14px" },
                { property: "Large padding", value: "10px 20px" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Color Palette for Buttons */}
      <SpecSection title="Button color palette">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Available color options for CustomizableButton. Each color has contained, outlined, and
          text variants.
        </Typography>

        <Box sx={{ display: "flex", gap: "16px", flexWrap: "wrap", mb: "24px" }}>
          <ColorSwatch
            label="Primary"
            color={brand.primary}
            hoverColor="#0f604d"
            onCopy={handleCopy}
          />
          <ColorSwatch label="Secondary" color="#F4F4F4" hoverColor="#e3e3e3" onCopy={handleCopy} />
          <ColorSwatch
            label="Success"
            color={status.success.text}
            hoverColor={brand.primaryHover}
            onCopy={handleCopy}
          />
          <ColorSwatch label="Warning" color="#795548" hoverColor="#5D4037" onCopy={handleCopy} />
          <ColorSwatch
            label="Error"
            color={status.error.text}
            hoverColor="#B71C1C"
            onCopy={handleCopy}
          />
          <ColorSwatch label="Info" color="#1565C0" hoverColor="#0D47A1" onCopy={handleCopy} />
        </Box>

        <Box sx={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <CustomizableButton variant="contained" color="primary" text="Primary" />
          <CustomizableButton variant="contained" color="secondary" text="Secondary" />
          <CustomizableButton variant="contained" color="success" text="Success" />
          <CustomizableButton variant="contained" color="warning" text="Warning" />
          <CustomizableButton variant="contained" color="error" text="Error" />
          <CustomizableButton variant="contained" color="info" text="Info" />
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* ButtonToggle */}
      <SpecSection title="ButtonToggle">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Segmented control for switching between options. Uses a sliding background indicator.
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
              Live examples
            </Typography>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Three options"
                code={buttonToggleSnippets.default}
                onCopy={handleCopy}
              >
                <ButtonToggle
                  options={[
                    { label: "Option 1", value: "opt1" },
                    { label: "Option 2", value: "opt2" },
                    { label: "Option 3", value: "opt3" },
                  ]}
                  value={toggleValue}
                  onChange={setToggleValue}
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Two options"
                code={buttonToggleSnippets.twoOptions}
                onCopy={handleCopy}
              >
                <ButtonToggle
                  options={[
                    { label: "List", value: "list" },
                    { label: "Grid", value: "grid" },
                  ]}
                  value={viewToggle}
                  onChange={setViewToggle}
                  height={34}
                />
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
              Component specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Height", value: "34px (default)" },
                { property: "Border radius", value: "4px" },
                { property: "Border", value: "1px solid divider" },
                { property: "Padding", value: "2px" },
                { property: "Gap", value: "2px" },
                { property: "Option min-width", value: "120px" },
                { property: "Option padding", value: "0 10px" },
                { property: "Font size", value: "13px" },
                { property: "Background", value: "action.hover" },
                { property: "Active bg", value: "background.paper" },
                { property: "Slider transition", value: "0.3s cubic-bezier" },
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
            "Use CustomizableButton for all action buttons (not MUI Button directly)",
            "Standard button height is 34px - maintain consistency across the app",
            "Use 'primary' color for main actions, 'secondary' for utility, 'error' for destructive",
            "Always include an icon for primary actions (Plus for add, Save for save, etc.)",
            "Use loading={true} prop when action is in progress",
            "Disable ripple effect is already set in the component",
            "Border radius is 4px for all buttons - do not override",
            "Use ButtonToggle for view switching or segmented controls",
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

// Helper Components (reused from FormInputsSection)

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

const SpecGrid: React.FC<{ children: React.ReactNode; columns?: number }> = ({
  children,
  columns = 4,
}) => {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: "16px",
        "@media (max-width: 1200px)": {
          gridTemplateColumns: "repeat(3, 1fr)",
        },
        "@media (max-width: 900px)": {
          gridTemplateColumns: "repeat(2, 1fr)",
        },
      }}
    >
      {children}
    </Box>
  );
};

const SpecCard: React.FC<{
  title: string;
  value: string;
  note?: string;
  onCopy: (text: string) => void;
}> = ({ title, value, note, onCopy }) => {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Box
      onClick={() => onCopy(value)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        p: "16px",
        backgroundColor: theme.palette.background.alt,
        borderRadius: "4px",
        border: `1px solid ${theme.palette.border.light}`,
        cursor: "pointer",
        transition: "border-color 150ms ease",
        position: "relative",
        "&:hover": {
          borderColor: theme.palette.primary.main,
        },
      }}
    >
      {isHovered && (
        <Box
          sx={{
            position: "absolute",
            top: "8px",
            right: "8px",
            color: theme.palette.primary.main,
          }}
        >
          <Copy size={14} />
        </Box>
      )}
      <Typography
        sx={{
          fontSize: 11,
          color: theme.palette.text.tertiary,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          mb: "4px",
        }}
      >
        {title}
      </Typography>
      <Typography
        sx={{
          fontSize: 16,
          fontWeight: 600,
          color: theme.palette.text.primary,
          fontFamily: "monospace",
        }}
      >
        {value}
      </Typography>
      {note && (
        <Typography
          sx={{
            fontSize: 11,
            color: theme.palette.text.accent,
            mt: "4px",
          }}
        >
          {note}
        </Typography>
      )}
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

const ColorSwatch: React.FC<{
  label: string;
  color: string;
  hoverColor?: string;
  onCopy: (text: string) => void;
}> = ({ label, color, onCopy }) => {
  const theme = useTheme();

  return (
    <Box
      onClick={() => onCopy(color)}
      sx={{
        cursor: "pointer",
        "&:hover": {
          "& .swatch": {
            transform: "scale(1.05)",
          },
        },
      }}
    >
      <Box
        className="swatch"
        sx={{
          width: 48,
          height: 48,
          borderRadius: "8px",
          backgroundColor: color,
          transition: "transform 150ms ease",
          mb: "8px",
        }}
      />
      <Typography sx={{ fontSize: 11, fontWeight: 500, color: theme.palette.text.secondary }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 10, fontFamily: "monospace", color: theme.palette.text.accent }}>
        {color}
      </Typography>
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

      {/* Code Panel with Syntax Highlighting */}
      {showCode && (
        <Box sx={{ borderTop: `1px solid ${theme.palette.border.light}` }}>
          <CodeBlock code={code} language="tsx" onCopy={onCopy} />
        </Box>
      )}
    </Box>
  );
};

export default ButtonsSection;
