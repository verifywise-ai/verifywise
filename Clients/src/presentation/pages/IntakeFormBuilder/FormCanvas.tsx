import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Box, Typography, IconButton, Tooltip, useTheme } from "@mui/material";
import { Check, X, User, Mail, LayoutTemplate } from "lucide-react";
import { FormField } from "./types";
import { FieldCard } from "./FieldCard";

function EmptyState() {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: 300,
        p: 4,
        textAlign: "center",
      }}
    >
      <Box
        sx={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          backgroundColor: theme.palette.background.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 2,
        }}
      >
        <LayoutTemplate size={32} color={theme.palette.text.accent} />
      </Box>
      <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary, fontSize: "15px" }}>
        Start building your form
      </Typography>
    </Box>
  );
}

/**
 * Inline-editable form title with hover bounding box and Save/Cancel buttons
 */
function EditableFormTitle({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    onChange(draft);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Untitled form"
          style={{
            fontSize: "18px",
            fontWeight: 600,
            color: theme.palette.text.primary,
            border: `1px solid ${theme.palette.primary.main}`,
            borderRadius: "4px",
            padding: "4px 8px",
            outline: "none",
            fontFamily: "inherit",
            width: "100%",
            maxWidth: 400,
            backgroundColor: theme.palette.background.main,
          }}
        />
        <Tooltip title="Save" placement="top">
          <IconButton
            size="small"
            onClick={handleSave}
            sx={{
              p: "4px",
              color: theme.palette.background.main,
              backgroundColor: theme.palette.primary.main,
              borderRadius: "4px",
              "&:hover": { backgroundColor: "brand.primaryHover" },
            }}
          >
            <Check size={14} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Cancel" placement="top">
          <IconButton
            size="small"
            onClick={handleCancel}
            sx={{
              p: "4px",
              color: theme.palette.other.icon,
              backgroundColor: theme.palette.background.accent,
              borderRadius: "4px",
              "&:hover": { backgroundColor: theme.palette.border.light },
            }}
          >
            <X size={14} />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Box
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "4px",
        border: "1px solid transparent",
        px: "8px",
        py: "4px",
        mx: "-8px",
        cursor: "text",
        transition: "border-color 0.15s ease, background-color 0.15s ease",
        "&:hover": {
          borderColor: theme.palette.border.dark,
          backgroundColor: theme.palette.background.accent,
        },
      }}
    >
      <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary, fontSize: "18px" }}>
        {value || "Untitled form"}
      </Typography>
    </Box>
  );
}

/**
 * Inline-editable form description with hover bounding box and Save/Cancel buttons
 */
function EditableFormDescription({
  value,
  onChange,
}: {
  value: string;
  onChange: (description: string) => void;
}) {
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Place cursor at end
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const handleSave = () => {
    onChange(draft);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: "6px", mt: "4px" }}>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a description..."
          rows={2}
          style={{
            fontSize: "13px",
            color: theme.palette.other.icon,
            border: `1px solid ${theme.palette.primary.main}`,
            borderRadius: "4px",
            padding: "4px 8px",
            outline: "none",
            fontFamily: "inherit",
            width: "100%",
            maxWidth: 500,
            backgroundColor: theme.palette.background.main,
            resize: "vertical",
            lineHeight: "1.5",
          }}
        />
        <Tooltip title="Save" placement="top">
          <IconButton
            size="small"
            onClick={handleSave}
            sx={{
              p: "4px",
              color: theme.palette.background.main,
              backgroundColor: theme.palette.primary.main,
              borderRadius: "4px",
              "&:hover": { backgroundColor: "brand.primaryHover" },
            }}
          >
            <Check size={14} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Cancel" placement="top">
          <IconButton
            size="small"
            onClick={handleCancel}
            sx={{
              p: "4px",
              color: theme.palette.other.icon,
              backgroundColor: theme.palette.background.accent,
              borderRadius: "4px",
              "&:hover": { backgroundColor: theme.palette.border.light },
            }}
          >
            <X size={14} />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Box
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "4px",
        border: "1px solid transparent",
        px: "8px",
        py: "2px",
        mx: "-8px",
        mt: "4px",
        cursor: "text",
        transition: "border-color 0.15s ease, background-color 0.15s ease",
        "&:hover": {
          borderColor: theme.palette.border.dark,
          backgroundColor: theme.palette.background.accent,
        },
      }}
    >
      <Typography sx={{ color: theme.palette.other.icon, fontSize: "13px" }}>
        {value || "Add a description..."}
      </Typography>
    </Box>
  );
}

/**
 * Read-only preview of the built-in contact-info section (Name + Email).
 */
function ContactInfoPreview() {
  const theme = useTheme();
  return (
    <Box
      sx={{
        px: "24px",
        py: "16px",
        borderBottom: `1px solid ${theme.palette.border.light}`,
        backgroundColor: theme.palette.background.fill,
      }}
    >
      <Typography
        sx={{
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: theme.palette.text.accent,
          mb: "10px",
        }}
      >
        Contact information (always shown)
      </Typography>
      {[
        { icon: <User size={14} />, label: "Full name" },
        { icon: <Mail size={14} />, label: "Email address" },
      ].map(({ icon, label }) => (
        <Box
          key={label}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            mb: "8px",
            "&:last-child": { mb: 0 },
          }}
        >
          <Box sx={{ color: theme.palette.text.accent, display: "flex" }}>{icon}</Box>
          <Box
            sx={{
              flex: 1,
              height: 32,
              border: `1px solid ${theme.palette.border.light}`,
              borderRadius: "4px",
              backgroundColor: theme.palette.background.main,
              display: "flex",
              alignItems: "center",
              px: "10px",
            }}
          >
            <Typography sx={{ fontSize: "12px", color: theme.palette.text.accent }}>
              {label}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

interface FormCanvasProps {
  fields: FormField[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string | null) => void;
  onDeleteField: (fieldId: string) => void;
  onDuplicateField: (field: FormField) => void;
  onMoveUp: (fieldId: string) => void;
  onMoveDown: (fieldId: string) => void;
  formName: string;
  formDescription: string;
  onNameChange?: (name: string) => void;
  onDescriptionChange?: (description: string) => void;
  collectContactInfo?: boolean;
}

export interface FormCanvasHandle {
  scrollToBottom: () => void;
}

export const FormCanvas = forwardRef<FormCanvasHandle, FormCanvasProps>(function FormCanvas({
  fields,
  selectedFieldId,
  onSelectField,
  onDeleteField,
  onDuplicateField,
  onMoveUp,
  onMoveDown,
  formName,
  formDescription,
  onNameChange,
  onDescriptionChange,
  collectContactInfo,
}, ref) {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToBottom() {
      const el = scrollRef.current;
      if (!el) return;
      setTimeout(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }, 50);
    },
  }));

  const handleCanvasClick = () => {
    onSelectField(null);
  };

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: theme.palette.background.accent,
        overflow: "hidden",
      }}
    >
      {/* Canvas content */}
      <Box
        ref={scrollRef}
        onClick={handleCanvasClick}
        sx={{ flex: 1, overflowY: "auto", p: 3, minWidth: 0 }}
      >
        <Box
          sx={{
            maxWidth: 700,
            mx: "auto",
            mt: "16px",
            backgroundColor: theme.palette.background.main,
            border: `1px solid ${theme.palette.border.dark}`,
            borderRadius: "4px",
            minHeight: 400,
          }}
        >
          {/* Form header — editable title + description */}
          <Box
            sx={{
              px: "24px",
              pt: "24px",
              pb: "16px",
              borderBottom: fields.length > 0 ? `1px solid ${theme.palette.border.light}` : "none",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {onNameChange ? (
              <EditableFormTitle value={formName} onChange={onNameChange} />
            ) : (
              <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary, fontSize: "18px" }}>
                {formName || "Untitled form"}
              </Typography>
            )}
            {onDescriptionChange ? (
              <EditableFormDescription value={formDescription} onChange={onDescriptionChange} />
            ) : (
              formDescription && (
                <Typography sx={{ color: theme.palette.other.icon, fontSize: "13px", mt: "4px" }}>
                  {formDescription}
                </Typography>
              )
            )}
          </Box>

          {collectContactInfo && <ContactInfoPreview />}

          {fields.length === 0 ? (
            <EmptyState />
          ) : (
            <Box
              sx={{
                px: "24px",
                py: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              {fields.map((field, index) => (
                <FieldCard
                  key={field.id}
                  field={field}
                  isSelected={selectedFieldId === field.id}
                  isFirst={index === 0}
                  isLast={index === fields.length - 1}
                  onSelect={onSelectField}
                  onDelete={onDeleteField}
                  onDuplicate={onDuplicateField}
                  onMoveUp={onMoveUp}
                  onMoveDown={onMoveDown}
                />
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
});

export default FormCanvas;
