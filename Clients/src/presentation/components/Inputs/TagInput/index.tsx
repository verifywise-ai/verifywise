import React, { useState, useCallback } from "react";
import { Stack, Typography, Chip, TextField, Box, useTheme } from "@mui/material";
import { X as RemoveIcon } from "lucide-react";

interface TagInputProps {
  label?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  error?: string;
  maxTags?: number;
  maxLength?: number;
  suggestions?: string[];
  isRequired?: boolean;
}

const TAG_REGEX = /^[\w\s-]+$/u;

function TagInput({
  label,
  value = [],
  onChange,
  placeholder = "Type and press Enter to add a tag",
  error,
  maxTags = 50,
  maxLength = 100,
  suggestions = [],
  isRequired = false,
}: TagInputProps) {
  const theme = useTheme();
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState("");

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) return;

      if (trimmed.length > maxLength) {
        setInputError(`Tag must be ${maxLength} characters or less`);
        return;
      }

      if (!TAG_REGEX.test(trimmed)) {
        setInputError("Tags can only contain letters, numbers, spaces, hyphens, and underscores");
        return;
      }

      if (value.includes(trimmed)) {
        setInputError("Tag already exists");
        return;
      }

      if (value.length >= maxTags) {
        setInputError(`Maximum ${maxTags} tags allowed`);
        return;
      }

      setInputError("");
      onChange([...value, trimmed]);
      setInputValue("");
    },
    [value, onChange, maxTags, maxLength],
  );

  const removeTag = useCallback(
    (tagToRemove: string) => {
      onChange(value.filter((t) => t !== tagToRemove));
    },
    [value, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    }
    if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  const filteredSuggestions = suggestions.filter(
    (s) =>
      !value.includes(s) &&
      s.toLowerCase().includes(inputValue.toLowerCase()) &&
      inputValue.length > 0,
  );

  const displayError = error || inputError;

  return (
    <Stack spacing={1}>
      {label && (
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 500,
            color: theme.palette.text.secondary,
          }}
        >
          {label}
          {isRequired && <span style={{ color: theme.palette.status.error.text }}> *</span>}
        </Typography>
      )}

      <Box
        sx={{
          "border": `1px solid ${displayError ? theme.palette.status.error.text : theme.palette.border.dark}`,
          "borderRadius": "4px",
          "padding": "6px 12px",
          "display": "flex",
          "flexWrap": "wrap",
          "gap": "4px",
          "alignItems": "center",
          "minHeight": "34px",
          "&:focus-within": {
            borderColor: theme.palette.primary.main,
          },
        }}
      >
        {value.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            size="small"
            onDelete={() => removeTag(tag)}
            deleteIcon={<RemoveIcon size={12} />}
            sx={{
              "height": "22px",
              "fontSize": 12,
              "fontWeight": 500,
              "backgroundColor": theme.palette.status.success.bg,
              "color": theme.palette.status.success.text,
              "& .MuiChip-deleteIcon": {
                "fontSize": 12,
                "color": theme.palette.status.success.text,
                "&:hover": {
                  color: theme.palette.status.error.text,
                },
              },
            }}
          />
        ))}

        <TextField
          variant="standard"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setInputError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          InputProps={{
            disableUnderline: true,
            sx: {
              fontSize: 13,
              padding: 0,
              minWidth: "120px",
            },
          }}
          sx={{ flex: 1, minWidth: "120px" }}
        />
      </Box>

      {filteredSuggestions.length > 0 && (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
          }}
        >
          {filteredSuggestions.slice(0, 5).map((suggestion) => (
            <Chip
              key={suggestion}
              label={suggestion}
              size="small"
              onClick={() => addTag(suggestion)}
              sx={{
                "height": "22px",
                "fontSize": 11,
                "cursor": "pointer",
                "backgroundColor": theme.palette.background.accent,
                "color": theme.palette.text.tertiary,
                "&:hover": {
                  backgroundColor: theme.palette.background.fill,
                },
              }}
            />
          ))}
        </Box>
      )}

      {displayError && (
        <Typography
          sx={{
            fontSize: 11,
            color: theme.palette.status.error.text,
            fontWeight: 400,
          }}
        >
          {displayError}
        </Typography>
      )}
    </Stack>
  );
}

export default TagInput;
