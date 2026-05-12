import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Snackbar } from "@mui/material";
import {
  Copy,
  Check,
  Layers,
  Database,
  MousePointer2,
  Search,
  Layout,
  FileText,
} from "lucide-react";

interface PatternExample {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  code: string;
  notes?: string[];
}

const CommonPatternsSection: React.FC = () => {
  const theme = useTheme();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string, code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const patterns: PatternExample[] = [
    {
      id: "modal-pattern",
      title: "Modal with form submission",
      description:
        "Standard pattern for modals with form handling using useStandardModal hook and onSubmitRef.",
      icon: <Layers size={18} />,
      code: `import { useRef } from "react";
import StandardModal from "../Modals/StandardModal";
import useStandardModal from "../../../application/hooks/useStandardModal";

const MyComponent = () => {
  const { isOpen, openModal, closeModal } = useStandardModal();
  const onSubmitRef = useRef<(() => void) | null>(null);

  const handleConfirm = () => {
    if (onSubmitRef.current) {
      onSubmitRef.current();
    }
  };

  return (
    <>
      <Button onClick={openModal}>Open modal</Button>
      <StandardModal
        open={isOpen}
        onClose={closeModal}
        title="Modal title"
        onConfirm={handleConfirm}
      >
        <MyForm onSubmitRef={onSubmitRef} onSuccess={closeModal} />
      </StandardModal>
    </>
  );
};`,
      notes: [
        "Always use useStandardModal hook for modal state",
        "Pass onSubmitRef to child forms for submit handling",
        "Call closeModal in onSuccess callback",
      ],
    },
    {
      id: "dropdown-pattern",
      title: "Dropdown menu",
      description: "Standard pattern for dropdown menus using CustomizableButton with Popover.",
      icon: <MousePointer2 size={18} />,
      code: `import { useState, useRef } from "react";
import { Popover, MenuItem, Stack } from "@mui/material";
import { ChevronDown } from "lucide-react";

const MyDropdown = () => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelect = (value: string) => {
    // Handle selection
    handleClose();
  };

  return (
    <>
      <Button
        ref={buttonRef}
        onClick={handleOpen}
        endIcon={<ChevronDown size={14} />}
      >
        Select option
      </Button>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        sx={{ mt: "4px" }}
      >
        <Stack sx={{ py: "4px", minWidth: 160 }}>
          <MenuItem onClick={() => handleSelect("option1")}>
            Option 1
          </MenuItem>
          <MenuItem onClick={() => handleSelect("option2")}>
            Option 2
          </MenuItem>
        </Stack>
      </Popover>
    </>
  );
};`,
      notes: [
        "Use Popover instead of Menu for more control",
        "Add mt: 4px for proper spacing from trigger",
        "Use sentence case for menu items",
      ],
    },
    {
      id: "search-pattern",
      title: "Search with debounce",
      description: "Standard pattern for search inputs with debounced API calls.",
      icon: <Search size={18} />,
      code: `import { useState, useEffect, useMemo } from "react";
import { debounce } from "lodash";
import SearchBox from "../Inputs/SearchBox";

const MySearch = ({ onSearch }: { onSearch: (query: string) => void }) => {
  const [searchValue, setSearchValue] = useState("");

  const debouncedSearch = useMemo(
    () => debounce((query: string) => {
      onSearch(query);
    }, 300),
    [onSearch]
  );

  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
    debouncedSearch(value);
  };

  return (
    <SearchBox
      value={searchValue}
      onChange={handleChange}
      placeholder="Search..."
    />
  );
};`,
      notes: [
        "Use 300ms debounce for search inputs",
        "Cancel debounce on unmount to prevent memory leaks",
        "Use useMemo to prevent recreation on each render",
      ],
    },
    {
      id: "data-fetching",
      title: "Data fetching with loading state",
      description: "Standard pattern for fetching data with loading and error states.",
      icon: <Database size={18} />,
      code: `import { useState, useEffect } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";

interface DataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const MyDataComponent = () => {
  const [state, setState] = useState<DataState<Item[]>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const response = await api.getItems();
        setState({ data: response, loading: false, error: null });
      } catch (err) {
        setState({ data: null, loading: false, error: "Failed to load" });
      }
    };

    fetchData();
  }, []);

  if (state.loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: "40px" }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (state.error) {
    return (
      <Typography color="error" sx={{ p: "16px" }}>
        {state.error}
      </Typography>
    );
  }

  return <DataList items={state.data} />;
};`,
      notes: [
        "Always handle loading, error, and success states",
        "Use CircularProgress with size={24} for inline loading",
        "Clear error state before new fetch attempt",
      ],
    },
    {
      id: "form-validation",
      title: "Form with validation",
      description: "Standard pattern for forms with field validation and error display.",
      icon: <FileText size={18} />,
      code: `import { useState } from "react";
import { Stack, TextField, Typography } from "@mui/material";
import Button from "../Buttons/Button";

interface FormData {
  name: string;
  email: string;
}

interface FormErrors {
  name?: string;
  email?: string;
}

const MyForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const [formData, setFormData] = useState<FormData>({ name: "", email: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    try {
      await api.submitForm(formData);
      onSuccess();
    } catch (err) {
      setErrors({ name: "Submission failed. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing="16px">
      <TextField
        label="Name"
        value={formData.name}
        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
        error={!!errors.name}
        helperText={errors.name}
      />
      <TextField
        label="Email"
        value={formData.email}
        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
        error={!!errors.email}
        helperText={errors.email}
      />
      <Button onClick={handleSubmit} disabled={submitting}>
        {submitting ? "Submitting..." : "Submit"}
      </Button>
    </Stack>
  );
};`,
      notes: [
        "Validate all fields before submission",
        "Show inline errors using helperText",
        "Disable button during submission",
        "Use sentence case for error messages",
      ],
    },
    {
      id: "table-pattern",
      title: "Data table with actions",
      description: "Standard pattern for tables with row actions and empty state.",
      icon: <Layout size={18} />,
      code: `import { Box, Table, TableBody, TableCell, TableHead, TableRow, IconButton } from "@mui/material";
import { Edit, Trash2 } from "lucide-react";
import { EmptyState } from "../EmptyState";

interface TableItem {
  id: string;
  name: string;
  status: string;
}

const MyTable = ({ items, onEdit, onDelete }: {
  items: TableItem[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) => {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No items yet"
        description="Create your first item to get started."
      />
    );
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>Name</TableCell>
          <TableCell>Status</TableCell>
          <TableCell align="right">Actions</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.name}</TableCell>
            <TableCell>{item.status}</TableCell>
            <TableCell align="right">
              <IconButton size="small" onClick={() => onEdit(item.id)}>
                <Edit size={14} />
              </IconButton>
              <IconButton size="small" onClick={() => onDelete(item.id)}>
                <Trash2 size={14} />
              </IconButton>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};`,
      notes: [
        "Always handle empty state",
        "Use IconButton with size='small' for table actions",
        "Right-align action columns",
        "Use 14px icons in tables",
      ],
    },
  ];

  return (
    <Box sx={{ p: "32px 40px" }}>
      <Snackbar
        open={!!copiedId}
        autoHideDuration={2000}
        onClose={() => setCopiedId(null)}
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
          Common patterns
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Reusable code patterns and recipes for common UI scenarios. Copy these patterns as
          starting points for new features.
        </Typography>
      </Box>

      {/* Patterns */}
      <Stack spacing="24px">
        {patterns.map((pattern) => (
          <Box
            key={pattern.id}
            sx={{
              border: `1px solid ${theme.palette.border.dark}`,
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            {/* Pattern Header */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                p: "16px",
                borderBottom: `1px solid ${theme.palette.border.light}`,
                backgroundColor: theme.palette.background.fill,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: "4px",
                  backgroundColor: theme.palette.background.main,
                  color: theme.palette.primary.main,
                }}
              >
                {pattern.icon}
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography
                  sx={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                  }}
                >
                  {pattern.title}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 12,
                    color: theme.palette.text.tertiary,
                  }}
                >
                  {pattern.description}
                </Typography>
              </Box>
            </Box>

            {/* Code Block */}
            <Box
              onClick={() => handleCopy(pattern.id, pattern.code)}
              sx={{
                "position": "relative",
                "backgroundColor": "#1e1e1e",
                "cursor": "pointer",
                "&:hover .copy-btn": {
                  opacity: 1,
                },
              }}
            >
              <Box
                className="copy-btn"
                sx={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  px: "8px",
                  py: "4px",
                  borderRadius: "4px",
                  backgroundColor: "rgba(255,255,255,0.1)",
                  opacity: 0,
                  transition: "opacity 150ms ease",
                }}
              >
                {copiedId === pattern.id ? (
                  <Check size={12} color="#4ade80" />
                ) : (
                  <Copy size={12} color="#888" />
                )}
                <Typography sx={{ fontSize: 10, color: "#888" }}>
                  {copiedId === pattern.id ? "Copied" : "Copy"}
                </Typography>
              </Box>
              <Typography
                component="pre"
                sx={{
                  p: "16px",
                  m: 0,
                  fontSize: 11,
                  fontFamily: "'Fira Code', 'Consolas', monospace",
                  color: "#d4d4d4",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflowX: "auto",
                }}
              >
                {pattern.code}
              </Typography>
            </Box>

            {/* Notes */}
            {pattern.notes && pattern.notes.length > 0 && (
              <Box
                sx={{
                  p: "12px 16px",
                  borderTop: `1px solid ${theme.palette.border.light}`,
                  backgroundColor: theme.palette.background.accent,
                }}
              >
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: theme.palette.text.secondary,
                    mb: "8px",
                  }}
                >
                  Best practices
                </Typography>
                <Stack spacing="4px">
                  {pattern.notes.map((note, index) => (
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
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          backgroundColor: theme.palette.primary.main,
                          mt: "6px",
                          flexShrink: 0,
                        }}
                      />
                      <Typography
                        sx={{
                          fontSize: 11,
                          color: theme.palette.text.tertiary,
                        }}
                      >
                        {note}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </Box>
        ))}
      </Stack>

      {/* Quick Reference */}
      <Box
        sx={{
          mt: "40px",
          p: "24px",
          backgroundColor: theme.palette.background.fill,
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
          Pattern checklist
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: "16px",
          }}
        >
          {[
            {
              label: "Modals",
              items: ["useStandardModal hook", "onSubmitRef for forms", "StandardModal component"],
            },
            {
              label: "Dropdowns",
              items: ["Popover over Menu", "anchorEl state", "handleClose on select"],
            },
            {
              label: "Forms",
              items: ["Validation before submit", "Error state display", "Loading state on button"],
            },
            {
              label: "Data fetching",
              items: ["Loading spinner", "Error message", "Empty state handling"],
            },
          ].map((group) => (
            <Box key={group.label}>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  mb: "8px",
                }}
              >
                {group.label}
              </Typography>
              <Stack spacing="4px">
                {group.items.map((item, index) => (
                  <Box
                    key={index}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Check size={12} color={theme.palette.status.success.text} />
                    <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
                      {item}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default CommonPatternsSection;
