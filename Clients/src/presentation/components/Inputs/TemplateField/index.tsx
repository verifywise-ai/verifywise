/**
 * TemplateField - A field component that shows variable suggestions when typing {{
 * Used for automation email templates with dynamic variable insertion
 */

import React, { useState, useRef, useEffect, forwardRef } from "react";
import {
  Stack,
  TextField,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemButton,
  useTheme,
  Box,
} from "@mui/material";
import { ForwardedRef } from "react";

interface TemplateVariable {
  var: string;
  desc: string;
}

interface TemplateFieldProps {
  id: string;
  label: string;
  type?: "text" | "description";
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  isRequired?: boolean;
  rows?: number;
  variables?: TemplateVariable[];
  disabled?: boolean;
}

const TemplateField = forwardRef(
  (
    {
      id,
      label,
      type = "text",
      value,
      onChange,
      onFocus,
      placeholder,
      isRequired,
      rows,
      variables = [],
      disabled = false,
    }: TemplateFieldProps,
    ref: ForwardedRef<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const theme = useTheme();
    const [showDropdown, setShowDropdown] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const [filteredVariables, setFilteredVariables] = useState<TemplateVariable[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [triggerPosition, setTriggerPosition] = useState<number | null>(null);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Combine refs
    const setRefs = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      inputRef.current = el;
      if (typeof ref === "function") {
        ref(el);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>).current = el;
      }
    };

    // Detect {{ and show dropdown
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPosition = e.target.selectionStart || 0;

      // Look for {{ before cursor
      const textBeforeCursor = newValue.slice(0, cursorPosition);
      const lastOpenBraces = textBeforeCursor.lastIndexOf("{{");
      const lastCloseBraces = textBeforeCursor.lastIndexOf("}}");

      // Show dropdown if we have {{ without closing }} and field is not disabled
      if (!disabled && lastOpenBraces > lastCloseBraces && lastOpenBraces !== -1) {
        const searchQuery = textBeforeCursor.slice(lastOpenBraces + 2).toLowerCase();

        // Filter variables based on search query
        const filtered = variables.filter(
          (v) =>
            v.var.toLowerCase().includes(searchQuery) || v.desc.toLowerCase().includes(searchQuery),
        );

        setFilteredVariables(filtered);
        setTriggerPosition(lastOpenBraces);
        setSelectedIndex(0);

        if (filtered.length > 0) {
          setShowDropdown(true);
          calculateDropdownPosition(e.target);
        } else {
          setShowDropdown(false);
        }
      } else {
        setShowDropdown(false);
        setTriggerPosition(null);
      }

      onChange(e);
    };

    // Calculate dropdown position below the cursor
    const calculateDropdownPosition = (element: HTMLInputElement | HTMLTextAreaElement) => {
      const rect = element.getBoundingClientRect();

      // For multiline, estimate line based on cursor position
      // For single line, just position below the input
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    };

    // Insert variable at cursor position
    const insertVariable = (variable: TemplateVariable) => {
      if (inputRef.current && triggerPosition !== null) {
        const cursorPosition = inputRef.current.selectionStart || 0;
        const textBeforeTrigger = value.slice(0, triggerPosition);
        const textAfterCursor = value.slice(cursorPosition);

        // Insert the variable (it already includes {{ and }})
        const newValue = textBeforeTrigger + variable.var + textAfterCursor;

        // Create synthetic event
        const syntheticEvent = {
          target: {
            value: newValue,
            selectionStart: triggerPosition + variable.var.length,
          },
        } as React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;

        onChange(syntheticEvent);

        // Set cursor position after the inserted variable
        setTimeout(() => {
          if (inputRef.current) {
            const newCursorPos = triggerPosition + variable.var.length;
            inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
            inputRef.current.focus();
          }
        }, 0);
      }

      setShowDropdown(false);
      setTriggerPosition(null);
    };

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!showDropdown) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev < filteredVariables.length - 1 ? prev + 1 : prev));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredVariables[selectedIndex]) {
            insertVariable(filteredVariables[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setShowDropdown(false);
          setTriggerPosition(null);
          break;
      }
    };

    // Close dropdown when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target as Node) &&
          inputRef.current &&
          !inputRef.current.contains(event.target as Node)
        ) {
          setShowDropdown(false);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Scroll selected item into view
    useEffect(() => {
      if (showDropdown && dropdownRef.current) {
        const selectedElement = dropdownRef.current.querySelector(
          `[data-index="${selectedIndex}"]`,
        );
        selectedElement?.scrollIntoView({ block: "nearest" });
      }
    }, [selectedIndex, showDropdown]);

    return (
      <Stack
        gap={theme.spacing(2)}
        className={`field field-${type}`}
        sx={{
          position: "relative",
          "& fieldset": {
            borderColor: theme.palette.border.dark,
            borderRadius: theme.shape.borderRadius,
          },
          "&:not(:has(.Mui-disabled)):not(:has(.input-error)) .MuiOutlinedInput-root:hover:not(:has(input:focus)):not(:has(textarea:focus)) fieldset":
            {
              borderColor: theme.palette.border.dark,
            },
          ".Mui-focused .MuiOutlinedInput-notchedOutline": {
            border: `1px solid ${theme.palette.border.dark}!important`,
          },
        }}
      >
        {label && (
          <Typography
            component="p"
            variant="body1"
            color={theme.palette.text.secondary}
            fontWeight={500}
            fontSize="13px"
            sx={{ margin: 0, height: "22px" }}
          >
            {label}
            {isRequired && (
              <Typography component="span" ml={theme.spacing(1)} color={theme.palette.error.text}>
                *
              </Typography>
            )}
          </Typography>
        )}

        <TextField
          className="field-input"
          id={id}
          value={value}
          onChange={handleInputChange}
          onFocus={onFocus}
          onKeyDown={handleKeyDown as React.KeyboardEventHandler<HTMLDivElement>}
          placeholder={placeholder}
          multiline={type === "description"}
          rows={type === "description" ? rows || 4 : 1}
          disabled={disabled}
          inputRef={setRefs}
          inputProps={{
            sx: {
              color: theme.palette.text.secondary,
              "&:-webkit-autofill": {
                WebkitBoxShadow: `0 0 0 100px ${theme.palette.background.fill} inset`,
                WebkitTextFillColor: theme.palette.text.secondary,
              },
              overflowY: "auto",
            },
          }}
        />

        {/* Variable Dropdown */}
        {showDropdown && filteredVariables.length > 0 && (
          <Paper
            ref={dropdownRef}
            sx={{
              position: "fixed",
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              zIndex: 9999,
              maxHeight: 200,
              width: 280,
              overflow: "auto",
              boxShadow: theme.shadows[2],
              border: `1px solid ${theme.palette.border.light}`,
            }}
          >
            <List sx={{ p: 0 }}>
              {filteredVariables.map((variable, index) => (
                <ListItem key={variable.var} disablePadding data-index={index}>
                  <ListItemButton
                    selected={index === selectedIndex}
                    onClick={() => insertVariable(variable)}
                    sx={{
                      "&.Mui-selected": {
                        backgroundColor: theme.palette.primary.main + "20",
                      },
                      "&:hover": {
                        backgroundColor: theme.palette.action.hover,
                      },
                      py: 0.5,
                      px: 1,
                    }}
                  >
                    <Stack spacing={0} sx={{ width: "100%" }}>
                      <Typography
                        sx={{
                          fontFamily: "monospace",
                          fontWeight: 600,
                          color: theme.palette.primary.main,
                          fontSize: "12px",
                        }}
                      >
                        {variable.var}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: theme.palette.text.secondary,
                          fontSize: "10px",
                        }}
                      >
                        {variable.desc}
                      </Typography>
                    </Stack>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>

            {/* Keyboard hint */}
            <Box
              sx={{
                borderTop: `1px solid ${theme.palette.border.light}`,
                px: 1,
                py: 0.5,
                backgroundColor: theme.palette.background.default,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: theme.palette.text.disabled,
                  fontStyle: "italic",
                  fontSize: "9px",
                }}
              >
                ↑↓ Navigate • Enter to select • Esc to close
              </Typography>
            </Box>
          </Paper>
        )}
      </Stack>
    );
  },
);

TemplateField.displayName = "TemplateField";

export default TemplateField;
