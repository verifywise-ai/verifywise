import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar, TextField, Select as MuiSelect, MenuItem, InputAdornment } from "@mui/material";
import { Copy, Search, ChevronDown, Eye, EyeOff } from "lucide-react";
import CodeBlock from "../CodeBlock";

// Mock Components - Standalone versions that mimic VerifyWise components

interface MockFieldProps {
  id: string;
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  type?: "text" | "password" | "url" | "description";
  isRequired?: boolean;
  isOptional?: boolean;
  error?: string;
  disabled?: boolean;
}

const MockField: React.FC<MockFieldProps> = ({
  id,
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  isRequired,
  isOptional,
  error,
  disabled,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const isMultiline = type === "description";

  return (
    <Box sx={{ width: "100%" }}>
      {label && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            mb: "4px",
            height: "22px",
          }}
        >
          <Typography
            component="label"
            htmlFor={id}
            sx={{
              fontSize: 13,
              fontWeight: 500,
              color: "#344054",
            }}
          >
            {label}
          </Typography>
          {isRequired && (
            <Typography sx={{ fontSize: 13, color: "#F04438" }}>*</Typography>
          )}
          {isOptional && (
            <Typography sx={{ fontSize: 13, color: "#344054", opacity: 0.6 }}>
              (optional)
            </Typography>
          )}
        </Box>
      )}
      <TextField
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        type={isPassword && !showPassword ? "password" : "text"}
        disabled={disabled}
        multiline={isMultiline}
        rows={isMultiline ? 4 : undefined}
        error={!!error}
        fullWidth
        InputProps={{
          endAdornment: isPassword ? (
            <InputAdornment position="end">
              <Box
                onClick={() => setShowPassword(!showPassword)}
                sx={{
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  color: "#475467",
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </Box>
            </InputAdornment>
          ) : undefined,
        }}
        sx={{
          "& .MuiInputBase-root": {
            height: isMultiline ? "auto" : "34px",
            fontSize: 13,
            backgroundColor: disabled ? "#F9FAFB" : "#FFFFFF",
            borderRadius: "2px",
          },
          "& .MuiOutlinedInput-root": {
            "& fieldset": {
              borderColor: error ? "#FDA29B" : "#d0d5dd",
              borderWidth: "1px",
            },
            "&:hover fieldset": {
              borderColor: error ? "#FDA29B" : "#5FA896",
            },
            "&.Mui-focused fieldset": {
              borderColor: error ? "#FDA29B" : "#13715B",
              borderWidth: error ? "2px" : "2px",
            },
            "&.Mui-focused": {
              boxShadow: error
                ? "0 0 0 3px rgba(253,162,155,0.1)"
                : "0 0 0 3px rgba(19,113,91,0.1)",
            },
          },
          "& input:-webkit-autofill": {
            WebkitBoxShadow: "0 0 0 100px #F4F4F4 inset",
          },
        }}
      />
      {error && (
        <Typography
          sx={{
            fontSize: 11,
            color: "#F04438",
            opacity: 0.8,
            mt: "4px",
          }}
        >
          {error}
        </Typography>
      )}
    </Box>
  );
};

interface MockSelectProps {
  id: string;
  label?: string;
  placeholder?: string;
  value: string;
  items: Array<{ _id: string; name: string }>;
  onChange: (e: any) => void;
  getOptionValue: (item: any) => string;
  isRequired?: boolean;
  error?: string;
  disabled?: boolean;
}

const MockSelect: React.FC<MockSelectProps> = ({
  id,
  label,
  placeholder,
  value,
  items,
  onChange,
  isRequired,
  error,
  disabled,
}) => {
  return (
    <Box sx={{ width: "100%", minWidth: "125px" }}>
      {label && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            mb: "4px",
            height: "22px",
          }}
        >
          <Typography
            component="label"
            htmlFor={id}
            sx={{
              fontSize: 13,
              fontWeight: 500,
              color: "#344054",
            }}
          >
            {label}
          </Typography>
          {isRequired && (
            <Typography sx={{ fontSize: 13, color: "#F04438" }}>*</Typography>
          )}
        </Box>
      )}
      <MuiSelect
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        displayEmpty
        fullWidth
        IconComponent={() => (
          <Box
            sx={{
              position: "absolute",
              right: "12px",
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              color: "#475467",
            }}
          >
            <ChevronDown size={16} />
          </Box>
        )}
        renderValue={(selected) => {
          if (!selected) {
            return (
              <Typography sx={{ fontSize: 13, color: "#98A2B3" }}>
                {placeholder}
              </Typography>
            );
          }
          const selectedItem = items.find((item) => item._id === selected);
          return (
            <Typography sx={{ fontSize: 13 }}>
              {selectedItem?.name || placeholder}
            </Typography>
          );
        }}
        sx={{
          height: "34px",
          fontSize: 13,
          backgroundColor: disabled ? "#F9FAFB" : value ? "#F4F4F4" : "#FFFFFF",
          borderRadius: "2px",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: error ? "#FDA29B" : "#d0d5dd",
            borderWidth: "1px",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: error ? "#FDA29B" : "#5FA896",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: error ? "#FDA29B" : "#13715B",
            borderWidth: "2px",
          },
          "&.Mui-focused": {
            boxShadow: error
              ? "0 0 0 3px rgba(253,162,155,0.1)"
              : "0 0 0 3px rgba(19,113,91,0.1)",
          },
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              mt: "4px",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              "& .MuiMenuItem-root": {
                fontSize: 13,
                minWidth: "100px",
                padding: "4px 6px",
                margin: "2px",
                borderRadius: "2px",
                "&:hover": {
                  backgroundColor: "#f9fafb",
                  color: "#13715B",
                },
              },
            },
          },
        }}
      >
        {items.map((item) => (
          <MenuItem key={item._id} value={item._id}>
            {item.name}
          </MenuItem>
        ))}
      </MuiSelect>
      {error && (
        <Typography
          sx={{
            fontSize: 11,
            color: "#F04438",
            opacity: 0.8,
            mt: "4px",
          }}
        >
          {error}
        </Typography>
      )}
    </Box>
  );
};

interface MockSearchBoxProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  sx?: any;
  fullWidth?: boolean;
}

const MockSearchBox: React.FC<MockSearchBoxProps> = ({
  placeholder = "Search...",
  value,
  onChange,
  disabled,
  sx,
  fullWidth = true,
}) => {
  return (
    <TextField
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      fullWidth={fullWidth}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Search size={16} color="#6b7280" />
          </InputAdornment>
        ),
      }}
      sx={{
        ...sx,
        "& .MuiInputBase-root": {
          height: "34px",
          fontSize: 13,
          backgroundColor: "#fff",
          borderRadius: "2px",
          paddingLeft: "10px",
          paddingRight: "10px",
        },
        "& .MuiOutlinedInput-root": {
          "& fieldset": {
            borderColor: "#d0d5dd",
            borderWidth: "1px",
          },
          "&:hover fieldset": {
            borderColor: "#5FA896",
          },
          "&.Mui-focused fieldset": {
            borderColor: "#13715B",
            borderWidth: "2px",
          },
          "&.Mui-focused": {
            boxShadow: "0 0 0 3px rgba(19,113,91,0.1)",
            "& .MuiInputBase-input": {
              padding: "9px",
            },
          },
        },
        "& .MuiInputAdornment-root": {
          marginRight: "8px",
        },
      }}
    />
  );
};

// Code snippets for each component example
const fieldCodeSnippets = {
  default: `<Field
  id="my-field"
  label="Label"
  placeholder="Enter text..."
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>`,
  required: `<Field
  id="my-field"
  label="Required field"
  placeholder="Required input"
  isRequired
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>`,
  optional: `<Field
  id="my-field"
  label="Optional field"
  placeholder="Optional input"
  isOptional
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>`,
  error: `<Field
  id="my-field"
  label="With error"
  placeholder="Error state"
  value={value}
  error="This field has an error"
  onChange={(e) => setValue(e.target.value)}
/>`,
  disabled: `<Field
  id="my-field"
  label="Disabled"
  placeholder="Disabled input"
  value=""
  disabled
/>`,
  password: `<Field
  id="my-field"
  type="password"
  label="Password"
  placeholder="Enter password"
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>`,
};

const selectCodeSnippets = {
  default: `<Select
  id="my-select"
  label="Label"
  placeholder="Choose option"
  value={value}
  items={[
    { _id: "1", name: "Option 1" },
    { _id: "2", name: "Option 2" },
  ]}
  onChange={(e) => setValue(e.target.value)}
  getOptionValue={(item) => item._id}
/>`,
  required: `<Select
  id="my-select"
  label="Required select"
  placeholder="Choose option"
  value={value}
  items={items}
  isRequired
  onChange={(e) => setValue(e.target.value)}
  getOptionValue={(item) => item._id}
/>`,
  error: `<Select
  id="my-select"
  label="With error"
  placeholder="Choose option"
  value={value}
  items={items}
  error="Please select an option"
  onChange={(e) => setValue(e.target.value)}
  getOptionValue={(item) => item._id}
/>`,
  disabled: `<Select
  id="my-select"
  label="Disabled"
  placeholder="Choose option"
  value=""
  items={items}
  disabled
  onChange={() => {}}
  getOptionValue={(item) => item._id}
/>`,
  withValue: `<Select
  id="status-filter"
  label="With value selected"
  placeholder="Status: All"
  value={filterValue}
  items={items}
  onChange={(e) => setFilterValue(e.target.value)}
  getOptionValue={(item) => item._id}
/>`,
};

const searchBoxCodeSnippets = {
  default: `<SearchBox
  placeholder="Search..."
  value={searchValue}
  onChange={setSearchValue}
/>`,
  customWidth: `<SearchBox
  placeholder="Search..."
  value={searchValue}
  onChange={setSearchValue}
  sx={{ width: "200px" }}
  fullWidth={false}
/>`,
  disabled: `<SearchBox
  placeholder="Disabled search"
  value=""
  onChange={() => {}}
  disabled
/>`,
};

const FormInputsSection: React.FC = () => {
  const theme = useTheme();

  // Demo state for live examples
  const [selectValue, setSelectValue] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [searchValue, setSearchValue] = useState("");

  // Copy feedback state
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const selectItems = [
    { _id: "1", name: "Option 1" },
    { _id: "2", name: "Option 2" },
    { _id: "3", name: "Option 3" },
  ];

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <Box sx={{ p: "32px 40px" }}>
      {/* Copy feedback snackbar */}
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
          Form inputs
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Text fields, selects, and search boxes used throughout VerifyWise.
          All inputs share consistent sizing, spacing, and interaction states.
          Click any value to copy it to clipboard.
        </Typography>
      </Box>

      {/* Shared Specifications */}
      <SpecSection title="Shared specifications">
        <SpecGrid>
          <SpecCard title="Height" value="34px" note="Standard input height" onCopy={handleCopy} />
          <SpecCard title="Font size" value="13px" note="Input text and labels" onCopy={handleCopy} />
          <SpecCard title="Border radius" value="2px" note="theme.shape.borderRadius" onCopy={handleCopy} />
          <SpecCard title="Label gap" value="4px" note="Space between label and input" onCopy={handleCopy} />
          <SpecCard title="Border color" value="#d0d5dd" note="Default border" onCopy={handleCopy} />
          <SpecCard title="Hover border" value="#5FA896" note="On mouse hover" onCopy={handleCopy} />
          <SpecCard title="Focus border" value="#13715B" note="Primary color" onCopy={handleCopy} />
          <SpecCard title="Focus ring" value="0 0 0 3px rgba(19,113,91,0.1)" note="Box shadow on focus" onCopy={handleCopy} />
          <SpecCard title="Error border" value="#FDA29B" note="Error state" onCopy={handleCopy} />
          <SpecCard title="Background" value="#FFFFFF" note="Default background" onCopy={handleCopy} />
          <SpecCard title="Disabled bg" value="#F9FAFB" note="Disabled state" onCopy={handleCopy} />
          <SpecCard title="Label color" value="#344054" note="text.secondary" onCopy={handleCopy} />
        </SpecGrid>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Field Component */}
      <SpecSection title="Field (Text input)">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Used for single-line and multi-line text input. Supports types: text, password, url, description.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          {/* Live Examples with Code */}
          <Box sx={{ flex: "1 1 400px", minWidth: 320 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Live examples
            </Typography>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Default"
                code={fieldCodeSnippets.default}
                onCopy={handleCopy}
              >
                <MockField
                  id="demo-field-default"
                  label="Default"
                  placeholder="Enter text..."
                  value={fieldValue}
                  onChange={(e) => setFieldValue(e.target.value)}
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Required"
                code={fieldCodeSnippets.required}
                onCopy={handleCopy}
              >
                <MockField
                  id="demo-field-required"
                  label="Required field"
                  placeholder="Required input"
                  isRequired
                  value=""
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Optional"
                code={fieldCodeSnippets.optional}
                onCopy={handleCopy}
              >
                <MockField
                  id="demo-field-optional"
                  label="Optional field"
                  placeholder="Optional input"
                  isOptional
                  value=""
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Error"
                code={fieldCodeSnippets.error}
                onCopy={handleCopy}
              >
                <MockField
                  id="demo-field-error"
                  label="With error"
                  placeholder="Error state"
                  value="Invalid value"
                  error="This field has an error"
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Disabled"
                code={fieldCodeSnippets.disabled}
                onCopy={handleCopy}
              >
                <MockField
                  id="demo-field-disabled"
                  label="Disabled"
                  placeholder="Disabled input"
                  value=""
                  disabled
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Password"
                code={fieldCodeSnippets.password}
                onCopy={handleCopy}
              >
                <MockField
                  id="demo-field-password"
                  type="password"
                  label="Password"
                  placeholder="Enter password"
                  value=""
                />
              </ExampleWithCode>
            </Stack>
          </Box>

          {/* Specifications */}
          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Component specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Height", value: "34px" },
                { property: "Multiline rows", value: "4" },
                { property: "Label font size", value: "13px" },
                { property: "Label font weight", value: "500" },
                { property: "Label height", value: "22px" },
                { property: "Label-input gap", value: "4px" },
                { property: "Required indicator", value: "*" },
                { property: "Optional opacity", value: "0.6" },
                { property: "Error font size", value: "11px" },
                { property: "Error opacity", value: "0.8" },
                { property: "Error margin-top", value: "4px" },
                { property: "Password icon", value: "16px" },
                { property: "Autofill bg", value: "#F4F4F4" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Select Component */}
      <SpecSection title="Select (Dropdown)">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Dropdown select for choosing from predefined options. Uses ChevronDown icon as indicator.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          {/* Live Examples with Code */}
          <Box sx={{ flex: "1 1 400px", minWidth: 320 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Live examples
            </Typography>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Default"
                code={selectCodeSnippets.default}
                onCopy={handleCopy}
              >
                <MockSelect
                  id="demo-select-default"
                  label="Default select"
                  placeholder="Choose option"
                  value={selectValue}
                  items={selectItems}
                  onChange={(e) => setSelectValue(e.target.value as string)}
                  getOptionValue={(item) => item._id}
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Required"
                code={selectCodeSnippets.required}
                onCopy={handleCopy}
              >
                <MockSelect
                  id="demo-select-required"
                  label="Required select"
                  placeholder="Choose option"
                  value=""
                  items={selectItems}
                  isRequired
                  onChange={() => {}}
                  getOptionValue={(item) => item._id}
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Error"
                code={selectCodeSnippets.error}
                onCopy={handleCopy}
              >
                <MockSelect
                  id="demo-select-error"
                  label="With error"
                  placeholder="Choose option"
                  value=""
                  items={selectItems}
                  error="Please select an option"
                  onChange={() => {}}
                  getOptionValue={(item) => item._id}
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Disabled"
                code={selectCodeSnippets.disabled}
                onCopy={handleCopy}
              >
                <MockSelect
                  id="demo-select-disabled"
                  label="Disabled"
                  placeholder="Choose option"
                  value=""
                  items={selectItems}
                  disabled
                  onChange={() => {}}
                  getOptionValue={(item) => item._id}
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="With value selected"
                code={selectCodeSnippets.withValue}
                onCopy={handleCopy}
              >
                <MockSelect
                  id="demo-select-filter"
                  label="With value selected"
                  placeholder="Status: All"
                  value="1"
                  items={selectItems}
                  onChange={() => {}}
                  getOptionValue={(item) => item._id}
                />
              </ExampleWithCode>
            </Stack>
          </Box>

          {/* Specifications */}
          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Component specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Min width", value: "125px" },
                { property: "Font size", value: "13px" },
                { property: "Icon size", value: "16px" },
                { property: "Icon position", value: "right: 12px" },
                { property: "Icon color", value: "#475467" },
                { property: "Menu margin-top", value: "4px" },
                { property: "Menu item padding", value: "4px 6px" },
                { property: "Menu item margin", value: "2px" },
                { property: "Menu item min-width", value: "100px" },
                { property: "Menu hover bg", value: "#f9fafb" },
                { property: "Menu hover color", value: "#13715B" },
                { property: "Filter applied bg", value: "#F4F4F4" },
                { property: "Email size", value: "11px" },
                { property: "Menu z-index", value: "10001" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* SearchBox Component */}
      <SpecSection title="SearchBox">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Search input with icon prefix. Used for filtering tables and lists.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          {/* Live Examples with Code */}
          <Box sx={{ flex: "1 1 400px", minWidth: 320 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Live examples
            </Typography>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Default"
                code={searchBoxCodeSnippets.default}
                onCopy={handleCopy}
              >
                <MockSearchBox
                  placeholder="Search..."
                  value={searchValue}
                  onChange={setSearchValue}
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Custom width"
                code={searchBoxCodeSnippets.customWidth}
                onCopy={handleCopy}
              >
                <MockSearchBox
                  placeholder="Search with custom width"
                  value=""
                  onChange={() => {}}
                  sx={{ width: "200px" }}
                  fullWidth={false}
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Disabled"
                code={searchBoxCodeSnippets.disabled}
                onCopy={handleCopy}
              >
                <MockSearchBox
                  placeholder="Disabled search"
                  value=""
                  onChange={() => {}}
                  disabled
                />
              </ExampleWithCode>
            </Stack>
          </Box>

          {/* Specifications */}
          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Component specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Height", value: "34px" },
                { property: "Padding horizontal", value: "10px" },
                { property: "Background", value: "#fff" },
                { property: "Font size", value: "13px" },
                { property: "Icon size", value: "16px" },
                { property: "Icon color", value: "#6b7280" },
                { property: "Icon margin-right", value: "8px" },
                { property: "Border", value: "1px solid #d0d5dd" },
                { property: "Border radius", value: "2px" },
                { property: "Focus border", value: "2px" },
                { property: "Focus padding", value: "9px" },
                { property: "Full width", value: "true" },
                { property: "Transition", value: "150ms" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Interaction States */}
      <SpecSection title="Interaction states">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          All form inputs share consistent interaction states defined in inputStyles.ts
        </Typography>

        <SpecGrid columns={2}>
          <StateCard
            title="Default"
            borderColor="#d0d5dd"
            description="Standard resting state"
            onCopy={handleCopy}
          />
          <StateCard
            title="Hover"
            borderColor="#5FA896"
            description="Mouse over the input"
            onCopy={handleCopy}
          />
          <StateCard
            title="Focus"
            borderColor="#13715B"
            borderWidth={2}
            boxShadow="0 0 0 3px rgba(19,113,91,0.1)"
            description="Input is focused"
            onCopy={handleCopy}
          />
          <StateCard
            title="Error"
            borderColor="#FDA29B"
            description="Validation failed"
            onCopy={handleCopy}
          />
          <StateCard
            title="Error + Focus"
            borderColor="#FDA29B"
            borderWidth={2}
            boxShadow="0 0 0 3px rgba(253,162,155,0.1)"
            description="Error state while focused"
            onCopy={handleCopy}
          />
          <StateCard
            title="Disabled"
            borderColor="#E5E7EB"
            backgroundColor="#F9FAFB"
            description="Input is disabled"
            onCopy={handleCopy}
          />
        </SpecGrid>
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
            "Use getInputStyles() or getSelectStyles() from inputStyles.ts for consistent hover/focus states",
            "Always include a label with fontSize: 13px, fontWeight: 500",
            "Set input height to 34px for single-line inputs",
            "Use theme.spacing(2) (4px) for label-to-input gap",
            "Error messages: fontSize 11px, opacity 0.8, margin-top 4px",
            "Required fields: show * in theme.palette.error.text color",
            "Use ChevronDown (16px) for select icons, Search (16px) for search inputs",
            "Use SearchBox component for search inputs, not custom TextField",
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
            {hoveredIndex === index && (
              <Copy size={12} color={theme.palette.primary.main} />
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

const StateCard: React.FC<{
  title: string;
  borderColor: string;
  borderWidth?: number;
  boxShadow?: string;
  backgroundColor?: string;
  description: string;
  onCopy: (text: string) => void;
}> = ({
  title,
  borderColor,
  borderWidth = 1,
  boxShadow,
  backgroundColor = "#FFFFFF",
  description,
  onCopy,
}) => {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Box
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        p: "16px",
        backgroundColor: theme.palette.background.alt,
        borderRadius: "4px",
        border: `1px solid ${theme.palette.border.light}`,
      }}
    >
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 600,
          color: theme.palette.text.primary,
          mb: "12px",
        }}
      >
        {title}
      </Typography>
      <Box
        sx={{
          height: 34,
          borderRadius: "2px",
          border: `${borderWidth}px solid ${borderColor}`,
          boxShadow: boxShadow || "none",
          backgroundColor,
          mb: "12px",
        }}
      />
      <Typography
        sx={{
          fontSize: 11,
          color: theme.palette.text.tertiary,
        }}
      >
        {description}
      </Typography>
      <Box
        onClick={() => onCopy(borderColor)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          mt: "4px",
          cursor: "pointer",
          "&:hover": {
            "& .copy-icon": {
              opacity: 1,
            },
          },
        }}
      >
        <Typography
          sx={{
            fontSize: 11,
            fontFamily: "monospace",
            color: theme.palette.text.accent,
          }}
        >
          {borderColor}
        </Typography>
        <Copy
          className="copy-icon"
          size={10}
          style={{
            color: theme.palette.primary.main,
            opacity: isHovered ? 1 : 0,
            transition: "opacity 150ms ease",
          }}
        />
      </Box>
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
      {/* Header */}
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
        <Box sx={{ display: "flex", gap: "8px" }}>
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
      </Box>

      {/* Live Example */}
      <Box sx={{ p: "16px", backgroundColor: theme.palette.background.main }}>
        {children}
      </Box>

      {/* Code Panel with Syntax Highlighting */}
      {showCode && (
        <Box sx={{ borderTop: `1px solid ${theme.palette.border.light}` }}>
          <CodeBlock code={code} language="tsx" onCopy={onCopy} />
        </Box>
      )}
    </Box>
  );
};

export default FormInputsSection;
