/**
 * LifecycleItemField - Renders the correct field UI based on item_type.
 * Uses VerifyWise styling patterns.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Stack,
  Typography,
  Box,
  IconButton,
  CircularProgress,
  TextField,
  Checkbox,
  FormControlLabel,
  Radio,
  RadioGroup,
  Chip,
  Button,
  Select,
  MenuItem,
} from "@mui/material";
import { Trash2, Upload, FileText, Check, X } from "lucide-react";
import { LifecycleItem, LifecycleValue } from "./useModelLifecycle";
import { apiServices } from "../../../../infrastructure/api/networkServices";

// User type for dropdown
interface User {
  id: number;
  name: string;
  surname: string;
  email: string;
}

// Custom hook for fetching users
function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await apiServices.get<any>("/users");
        // Handle nested data structure: { message: "OK", data: [...] }
        const data = response?.data;
        const usersArray = data?.data || data || [];
        setUsers(Array.isArray(usersArray) ? usersArray : []);
      } catch (err) {
        console.error("Failed to fetch users:", err);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  return { users, loading };
}

// ============================================================================
// VerifyWise Theme Constants
// ============================================================================

const VW_COLORS = {
  primary: "#13715B",
  primaryDark: "#0F5A47",
  textPrimary: "#1c2130",
  textSecondary: "#344054",
  textTertiary: "#475467",
  textAccent: "#838c99",
  bgMain: "#FFFFFF",
  bgAlt: "#FCFCFD",
  bgFill: "#F4F4F4",
  bgAccent: "#f9fafb",
  borderLight: "#eaecf0",
  borderDark: "#d0d5dd",
  error: "#f04438",
  errorBg: "#FEE2E2",
  success: "#079455",
  successBg: "#ecfdf3",
};

const VW_TYPOGRAPHY = {
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  fontSize: 13,
};

// Shared input styles
const vwInputSx = {
  "& .MuiInputBase-root": {
    fontFamily: VW_TYPOGRAPHY.fontFamily,
    fontSize: "13px",
    borderRadius: "4px",
  },
  "& .MuiOutlinedInput-root": {
    "& fieldset": { borderColor: VW_COLORS.borderDark },
    "&:hover fieldset": { borderColor: VW_COLORS.primary },
    "&.Mui-focused fieldset": { borderColor: VW_COLORS.primary },
  },
};

const vwButtonOutlined = {
  "textTransform": "none" as const,
  "fontWeight": 500,
  "fontSize": "13px",
  "fontFamily": VW_TYPOGRAPHY.fontFamily,
  "borderRadius": "4px",
  "borderColor": VW_COLORS.borderDark,
  "color": VW_COLORS.textSecondary,
  "&:hover": {
    borderColor: VW_COLORS.primary,
    color: VW_COLORS.primary,
    backgroundColor: "rgba(19, 113, 91, 0.04)",
  },
};

const vwChipSx = {
  fontFamily: VW_TYPOGRAPHY.fontFamily,
  fontSize: "12px",
  fontWeight: 500,
  borderRadius: "4px",
};

interface LifecycleItemFieldProps {
  modelId: number;
  item: LifecycleItem;
  onValueChanged?: () => void;
}

export default function LifecycleItemField({
  modelId,
  item,
  onValueChanged,
}: LifecycleItemFieldProps) {
  const value = item.value;

  switch (item.item_type) {
    case "text":
      return (
        <TextFieldRenderer
          modelId={modelId}
          item={item}
          value={value}
          multiline={false}
          onValueChanged={onValueChanged}
        />
      );
    case "textarea":
      return (
        <TextFieldRenderer
          modelId={modelId}
          item={item}
          value={value}
          multiline
          onValueChanged={onValueChanged}
        />
      );
    case "documents":
      return (
        <DocumentsFieldRenderer
          modelId={modelId}
          item={item}
          value={value}
          onValueChanged={onValueChanged}
        />
      );
    case "people":
      return (
        <PeopleFieldRenderer
          modelId={modelId}
          item={item}
          value={value}
          onValueChanged={onValueChanged}
        />
      );
    case "classification":
      return (
        <ClassificationFieldRenderer
          modelId={modelId}
          item={item}
          value={value}
          onValueChanged={onValueChanged}
        />
      );
    case "checklist":
      return (
        <ChecklistFieldRenderer
          modelId={modelId}
          item={item}
          value={value}
          onValueChanged={onValueChanged}
        />
      );
    case "approval":
      return (
        <ApprovalFieldRenderer
          modelId={modelId}
          item={item}
          value={value}
          onValueChanged={onValueChanged}
        />
      );
    default:
      return (
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          Unsupported field type: {item.item_type}
        </Typography>
      );
  }
}

// ============================================================================
// Text / Textarea
// ============================================================================

function TextFieldRenderer({
  modelId,
  item,
  value,
  multiline,
  onValueChanged,
}: {
  modelId: number;
  item: LifecycleItem;
  value: LifecycleValue | null | undefined;
  multiline: boolean;
  onValueChanged?: () => void;
}) {
  const config = item.config as { placeholder?: string; maxLength?: number };
  const [text, setText] = useState(value?.value_text ?? "");
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(value?.value_text ?? "");

  const handleBlur = useCallback(async () => {
    if (text === savedRef.current) return;
    setSaving(true);
    try {
      await apiServices.put(
        `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}`,
        { value_text: text || null },
      );
      savedRef.current = text;
      onValueChanged?.();
    } catch {
      /* keep current text */
    } finally {
      setSaving(false);
    }
  }, [text, modelId, item.id, onValueChanged]);

  return (
    <TextField
      placeholder={config?.placeholder || `Enter ${item.name.toLowerCase()}`}
      value={text}
      onChange={(e) => {
        if (config?.maxLength && e.target.value.length > config.maxLength) return;
        setText(e.target.value);
      }}
      onBlur={handleBlur}
      multiline={multiline}
      rows={multiline ? 3 : undefined}
      size="small"
      fullWidth
      sx={vwInputSx}
      slotProps={{
        input: {
          endAdornment: saving ? (
            <CircularProgress size={14} sx={{ color: VW_COLORS.primary }} />
          ) : undefined,
        },
      }}
    />
  );
}

// ============================================================================
// Documents
// ============================================================================

function DocumentsFieldRenderer({
  modelId,
  item,
  value,
  onValueChanged,
}: {
  modelId: number;
  item: LifecycleItem;
  value: LifecycleValue | null | undefined;
  onValueChanged?: () => void;
}) {
  const files = Array.isArray(value?.files) ? value.files : [];
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (!selectedFiles || selectedFiles.length === 0) return;

      setUploading(true);
      try {
        for (const file of Array.from(selectedFiles)) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("source", "File Manager");
          const result = await apiServices.post<{ data: { id: number } }>(
            "/file-manager",
            formData,
            { headers: { "Content-Type": "multipart/form-data" } },
          );
          const fileId = (result.data as any)?.data?.id || (result.data as any)?.id;
          await apiServices.post(
            `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}/files`,
            { fileId },
          );
        }
        onValueChanged?.();
      } catch {
        /* upload failed */
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [modelId, item.id, onValueChanged],
  );

  const handleRemoveFile = useCallback(
    async (fileId: number) => {
      try {
        await apiServices.delete(
          `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}/files/${fileId}`,
        );
        onValueChanged?.();
      } catch {
        /* retry */
      }
    },
    [modelId, item.id, onValueChanged],
  );

  return (
    <Stack sx={{ gap: "12px" }}>
      {files.length > 0 && (
        <Stack sx={{ gap: "8px" }}>
          {files.map((file) => (
            <Stack
              key={file.id}
              direction="row"
              sx={{
                alignItems: "center",
                gap: "10px",
                p: "10px 12px",
                borderRadius: "4px",
                border: `1px solid ${VW_COLORS.borderLight}`,
                backgroundColor: VW_COLORS.bgAccent,
              }}
            >
              <FileText size={16} color={VW_COLORS.textAccent} />
              <Typography
                sx={{
                  flex: 1,
                  fontFamily: VW_TYPOGRAPHY.fontFamily,
                  fontSize: "13px",
                  color: VW_COLORS.textSecondary,
                }}
              >
                {file.filename || `File #${file.file_id}`}
              </Typography>
              <IconButton
                size="small"
                onClick={() => handleRemoveFile(file.file_id)}
                aria-label="Remove file"
                sx={{ "color": VW_COLORS.textAccent, "&:hover": { color: VW_COLORS.error } }}
              >
                <Trash2 size={14} />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      )}
      <Box
        sx={{
          "border": `1px dashed ${VW_COLORS.borderDark}`,
          "borderRadius": "4px",
          "p": "20px 16px",
          "textAlign": "center",
          "cursor": "pointer",
          "transition": "all 0.15s ease",
          "&:hover": {
            backgroundColor: VW_COLORS.bgAccent,
            borderColor: VW_COLORS.primary,
          },
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? (
          <CircularProgress size={20} sx={{ color: VW_COLORS.primary }} />
        ) : (
          <Stack
            direction="row"
            sx={{ gap: "8px", justifyContent: "center", alignItems: "center" }}
          >
            <Upload size={16} color={VW_COLORS.textAccent} />
            <Typography
              sx={{
                fontFamily: VW_TYPOGRAPHY.fontFamily,
                fontSize: "13px",
                color: VW_COLORS.textTertiary,
              }}
            >
              Click to upload documents
            </Typography>
          </Stack>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md"
          onChange={handleFileSelect}
        />
      </Box>
    </Stack>
  );
}

// ============================================================================
// People (uses junction table model_lifecycle_item_people)
// ============================================================================

interface PersonRecord {
  id: number;
  user_id: number;
  name: string;
  surname: string;
  email: string;
}

function PeopleFieldRenderer({
  modelId,
  item,
  value,
  onValueChanged,
}: {
  modelId: number;
  item: LifecycleItem;
  value: LifecycleValue | null | undefined;
  onValueChanged?: () => void;
}) {
  const { users, loading: usersLoading } = useUsers();
  // People now come from junction table, not value_json
  const currentPeople: PersonRecord[] = Array.isArray((value as any)?.people)
    ? (value as any).people
    : [];
  const [selectedUserId, setSelectedUserId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  // Filter out already-added users from the dropdown
  const availableUsers = users.filter((u) => !currentPeople.some((p) => p.user_id === u.id));

  // Helper to get user display name
  const getPersonDisplayName = (person: PersonRecord): string => {
    const fullName = `${person.name || ""} ${person.surname || ""}`.trim();
    return fullName || person.email || `User #${person.user_id}`;
  };

  const handleAdd = useCallback(async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await apiServices.post(
        `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}/people`,
        { userId: selectedUserId },
      );
      setSelectedUserId("");
      onValueChanged?.();
    } catch {
      /* retry */
    } finally {
      setSaving(false);
    }
  }, [selectedUserId, modelId, item.id, onValueChanged]);

  const handleRemove = useCallback(
    async (userId: number) => {
      setSaving(true);
      try {
        await apiServices.delete(
          `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}/people/${userId}`,
        );
        onValueChanged?.();
      } catch {
        /* retry */
      } finally {
        setSaving(false);
      }
    },
    [modelId, item.id, onValueChanged],
  );

  return (
    <Stack sx={{ gap: "10px" }}>
      {currentPeople.length > 0 && (
        <Stack
          direction="row"
          sx={{
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          {currentPeople.map((p) => (
            <Chip
              key={p.user_id}
              label={getPersonDisplayName(p)}
              size="small"
              variant="outlined"
              onDelete={() => handleRemove(p.user_id)}
              sx={{
                ...vwChipSx,
                "borderColor": VW_COLORS.borderDark,
                "color": VW_COLORS.textSecondary,
                "& .MuiChip-deleteIcon": {
                  "color": VW_COLORS.textAccent,
                  "&:hover": { color: VW_COLORS.error },
                },
              }}
            />
          ))}
        </Stack>
      )}
      <Stack direction="row" sx={{ gap: "8px" }}>
        <Select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value as number | "")}
          displayEmpty
          size="small"
          sx={{
            "flex": 1,
            "fontFamily": VW_TYPOGRAPHY.fontFamily,
            "fontSize": "13px",
            "& .MuiOutlinedInput-notchedOutline": { borderColor: VW_COLORS.borderDark },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: VW_COLORS.primary },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: VW_COLORS.primary },
          }}
        >
          <MenuItem value="" disabled>
            <Typography sx={{ color: VW_COLORS.textAccent, fontSize: "13px" }}>
              {usersLoading ? "Loading users..." : "Select a user..."}
            </Typography>
          </MenuItem>
          {availableUsers.map((user) => (
            <MenuItem key={user.id} value={user.id}>
              <Typography sx={{ fontSize: "13px", color: VW_COLORS.textSecondary }}>
                {`${user.name} ${user.surname}`.trim() || user.email}
              </Typography>
            </MenuItem>
          ))}
        </Select>
        <Button
          variant="outlined"
          size="small"
          onClick={handleAdd}
          disabled={saving || !selectedUserId}
          sx={vwButtonOutlined}
        >
          Add
        </Button>
      </Stack>
      {saving && <CircularProgress size={14} sx={{ color: VW_COLORS.primary }} />}
    </Stack>
  );
}

// ============================================================================
// Classification
// ============================================================================

function ClassificationFieldRenderer({
  modelId,
  item,
  value,
  onValueChanged,
}: {
  modelId: number;
  item: LifecycleItem;
  value: LifecycleValue | null | undefined;
  onValueChanged?: () => void;
}) {
  const config = item.config as { levels?: string[] };
  const levels = Array.isArray(config?.levels) ? config.levels : [];
  const currentValue = (value?.value_json as { level?: string })?.level ?? "";
  const [selected, setSelected] = useState(currentValue);
  const [saving, setSaving] = useState(false);

  const handleChange = useCallback(
    async (level: string) => {
      setSelected(level);
      setSaving(true);
      try {
        await apiServices.put(
          `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}`,
          { value_json: { level } },
        );
        onValueChanged?.();
      } catch {
        /* keep selection */
      } finally {
        setSaving(false);
      }
    },
    [modelId, item.id, onValueChanged],
  );

  return (
    <Stack sx={{ gap: "8px" }}>
      <RadioGroup value={selected} onChange={(e) => handleChange(e.target.value)}>
        {levels.map((level) => (
          <FormControlLabel
            key={level}
            value={level}
            control={
              <Radio
                size="small"
                sx={{
                  "color": VW_COLORS.borderDark,
                  "&.Mui-checked": { color: VW_COLORS.primary },
                }}
              />
            }
            label={
              <Typography
                sx={{
                  fontFamily: VW_TYPOGRAPHY.fontFamily,
                  fontSize: "13px",
                  color: VW_COLORS.textSecondary,
                }}
              >
                {level}
              </Typography>
            }
            sx={{ marginLeft: 0 }}
          />
        ))}
      </RadioGroup>
      {saving && <CircularProgress size={14} sx={{ color: VW_COLORS.primary }} />}
    </Stack>
  );
}

// ============================================================================
// Checklist
// ============================================================================

interface ChecklistValue {
  label: string;
  checked: boolean;
}

function ChecklistFieldRenderer({
  modelId,
  item,
  value,
  onValueChanged,
}: {
  modelId: number;
  item: LifecycleItem;
  value: LifecycleValue | null | undefined;
  onValueChanged?: () => void;
}) {
  const config = item.config as { defaultItems?: string[] };
  const configItems = Array.isArray(config?.defaultItems) ? config.defaultItems : [];
  const defaultItems: ChecklistValue[] = configItems.map((label) => ({ label, checked: false }));
  const savedItems: ChecklistValue[] = Array.isArray(value?.value_json)
    ? (value.value_json as ChecklistValue[])
    : defaultItems;
  const [items, setItems] = useState<ChecklistValue[]>(
    savedItems.length > 0 ? savedItems : defaultItems,
  );
  const [saving, setSaving] = useState(false);
  const [newItemText, setNewItemText] = useState("");

  const saveItems = useCallback(
    async (updatedItems: ChecklistValue[]) => {
      setSaving(true);
      try {
        await apiServices.put(
          `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}`,
          { value_json: updatedItems },
        );
        onValueChanged?.();
      } catch {
        /* keep state */
      } finally {
        setSaving(false);
      }
    },
    [modelId, item.id, onValueChanged],
  );

  const toggleItem = useCallback(
    (index: number) => {
      const updated = items.map((it, i) => (i === index ? { ...it, checked: !it.checked } : it));
      setItems(updated);
      saveItems(updated);
    },
    [items, saveItems],
  );

  const addItem = useCallback(() => {
    if (!newItemText.trim()) return;
    const updated = [...items, { label: newItemText.trim(), checked: false }];
    setItems(updated);
    setNewItemText("");
    saveItems(updated);
  }, [items, newItemText, saveItems]);

  const removeItem = useCallback(
    (index: number) => {
      const updated = items.filter((_, i) => i !== index);
      setItems(updated);
      saveItems(updated);
    },
    [items, saveItems],
  );

  return (
    <Stack sx={{ gap: "10px" }}>
      {items.map((it, index) => (
        <Stack
          key={index}
          direction="row"
          sx={{
            alignItems: "center",
            gap: "10px",
          }}
        >
          <Checkbox
            checked={it.checked}
            onChange={() => toggleItem(index)}
            size="small"
            sx={{
              "color": VW_COLORS.borderDark,
              "&.Mui-checked": { color: VW_COLORS.primary },
              "padding": "4px",
            }}
          />
          <Typography
            sx={{
              flex: 1,
              fontFamily: VW_TYPOGRAPHY.fontFamily,
              fontSize: "13px",
              textDecoration: it.checked ? "line-through" : "none",
              color: it.checked ? VW_COLORS.textAccent : VW_COLORS.textSecondary,
            }}
          >
            {it.label}
          </Typography>
          <IconButton
            size="small"
            onClick={() => removeItem(index)}
            aria-label="Remove item"
            sx={{ "color": VW_COLORS.textAccent, "&:hover": { color: VW_COLORS.error } }}
          >
            <X size={14} />
          </IconButton>
        </Stack>
      ))}
      <Stack direction="row" sx={{ gap: "10px" }}>
        <TextField
          placeholder="Add checklist item..."
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          size="small"
          sx={{ flex: 1, ...vwInputSx }}
        />
        <Button variant="outlined" size="small" onClick={addItem} sx={vwButtonOutlined}>
          Add
        </Button>
      </Stack>
      {saving && <CircularProgress size={14} sx={{ color: VW_COLORS.primary }} />}
    </Stack>
  );
}

// ============================================================================
// Approval (uses junction table model_lifecycle_item_approvals)
// ============================================================================

interface ApprovalRecord {
  id: number;
  user_id: number;
  status: "pending" | "approved" | "rejected";
  decided_at: string | null;
  name: string;
  surname: string;
  email: string;
}

function ApprovalFieldRenderer({
  modelId,
  item,
  value,
  onValueChanged,
}: {
  modelId: number;
  item: LifecycleItem;
  value: LifecycleValue | null | undefined;
  onValueChanged?: () => void;
}) {
  const { users, loading: usersLoading } = useUsers();
  // Approvals now come from junction table, not value_json
  const currentApprovals: ApprovalRecord[] = Array.isArray((value as any)?.approvals)
    ? (value as any).approvals
    : [];
  const [saving, setSaving] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | "">("");

  // Filter out already-added approvers from the dropdown
  const availableUsers = users.filter((u) => !currentApprovals.some((a) => a.user_id === u.id));

  // Helper to get user display name
  const getApproverDisplayName = (approval: ApprovalRecord): string => {
    const fullName = `${approval.name || ""} ${approval.surname || ""}`.trim();
    return fullName || approval.email || `User #${approval.user_id}`;
  };

  const handleStatusChange = useCallback(
    async (userId: number, status: "approved" | "rejected") => {
      setSaving(true);
      try {
        await apiServices.put(
          `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}/approvals/${userId}`,
          { status },
        );
        onValueChanged?.();
      } catch {
        /* retry */
      } finally {
        setSaving(false);
      }
    },
    [modelId, item.id, onValueChanged],
  );

  const addApprover = useCallback(async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await apiServices.post(
        `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}/approvals`,
        { userId: selectedUserId },
      );
      setSelectedUserId("");
      onValueChanged?.();
    } catch {
      /* retry */
    } finally {
      setSaving(false);
    }
  }, [selectedUserId, modelId, item.id, onValueChanged]);

  const removeApprover = useCallback(
    async (userId: number) => {
      setSaving(true);
      try {
        await apiServices.delete(
          `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}/approvals/${userId}`,
        );
        onValueChanged?.();
      } catch {
        /* retry */
      } finally {
        setSaving(false);
      }
    },
    [modelId, item.id, onValueChanged],
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return VW_COLORS.success;
      case "rejected":
        return VW_COLORS.error;
      default:
        return VW_COLORS.textAccent;
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case "approved":
        return VW_COLORS.successBg;
      case "rejected":
        return VW_COLORS.errorBg;
      default:
        return VW_COLORS.bgAccent;
    }
  };

  return (
    <Stack sx={{ gap: "12px" }}>
      {currentApprovals.map((approval) => (
        <Stack
          key={approval.user_id}
          direction="row"
          sx={{
            alignItems: "center",
            gap: "10px",
            p: "12px 16px",
            borderRadius: "4px",
            border: `1px solid ${VW_COLORS.borderLight}`,
            backgroundColor: VW_COLORS.bgMain,
          }}
        >
          <Typography
            sx={{
              flex: 1,
              fontFamily: VW_TYPOGRAPHY.fontFamily,
              fontSize: "13px",
              color: VW_COLORS.textSecondary,
            }}
          >
            {getApproverDisplayName(approval)}
          </Typography>
          <Chip
            label={approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}
            size="small"
            sx={{
              ...vwChipSx,
              color: getStatusColor(approval.status),
              backgroundColor: getStatusBgColor(approval.status),
              border: "none",
            }}
          />
          {approval.status === "pending" && (
            <>
              <IconButton
                size="small"
                onClick={() => handleStatusChange(approval.user_id, "approved")}
                sx={{
                  "color": VW_COLORS.success,
                  "&:hover": { backgroundColor: VW_COLORS.successBg },
                }}
                aria-label="Approve"
              >
                <Check size={16} />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => handleStatusChange(approval.user_id, "rejected")}
                sx={{
                  "color": VW_COLORS.error,
                  "&:hover": { backgroundColor: VW_COLORS.errorBg },
                }}
                aria-label="Reject"
              >
                <X size={16} />
              </IconButton>
            </>
          )}
          <IconButton
            size="small"
            onClick={() => removeApprover(approval.user_id)}
            sx={{ "color": VW_COLORS.textAccent, "&:hover": { color: VW_COLORS.error } }}
            aria-label="Remove approver"
          >
            <Trash2 size={14} />
          </IconButton>
        </Stack>
      ))}
      <Stack direction="row" sx={{ gap: "8px" }}>
        <Select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value as number | "")}
          displayEmpty
          size="small"
          sx={{
            "flex": 1,
            "fontFamily": VW_TYPOGRAPHY.fontFamily,
            "fontSize": "13px",
            "& .MuiOutlinedInput-notchedOutline": { borderColor: VW_COLORS.borderDark },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: VW_COLORS.primary },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: VW_COLORS.primary },
          }}
        >
          <MenuItem value="" disabled>
            <Typography sx={{ color: VW_COLORS.textAccent, fontSize: "13px" }}>
              {usersLoading ? "Loading users..." : "Select an approver..."}
            </Typography>
          </MenuItem>
          {availableUsers.map((user) => (
            <MenuItem key={user.id} value={user.id}>
              <Typography sx={{ fontSize: "13px", color: VW_COLORS.textSecondary }}>
                {`${user.name} ${user.surname}`.trim() || user.email}
              </Typography>
            </MenuItem>
          ))}
        </Select>
        <Button
          variant="outlined"
          size="small"
          onClick={addApprover}
          disabled={saving || !selectedUserId}
          sx={vwButtonOutlined}
        >
          Add Approver
        </Button>
      </Stack>
      {saving && <CircularProgress size={14} sx={{ color: VW_COLORS.primary }} />}
    </Stack>
  );
}
