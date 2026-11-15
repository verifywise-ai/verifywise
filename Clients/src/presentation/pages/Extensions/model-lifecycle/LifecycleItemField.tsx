/**
 * LifecycleItemField - Renders the correct field UI based on item_type.
 * Uses VerifyWise styling patterns.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Stack,
  Typography,
  Box,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  Radio,
  RadioGroup,
  Chip,
} from "@mui/material";
import { Trash2, Upload, FileText, Check, X } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import { LifecycleItem, LifecycleValue } from "./useModelLifecycle";
import { useCan } from "../../../../application/hooks/useCan";
import { useAuth } from "../../../../application/hooks/useAuth";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import type CustomException from "../../../../infrastructure/exceptions/customeException";
import {
  background,
  border,
  border as borderPalette,
  brand,
  editor,
  icon,
  status,
  text,
  palette as vwPalette,
  radiusPx,
} from "../../../themes/palette";
import { textStyles } from "../../../themes/typography";

// User type for dropdown
interface User {
  id: number;
  name: string;
  surname: string;
  email: string;
}

function toUserOption(user: User) {
  const givenName = user.name?.trim() ?? "";
  const fullName = `${givenName} ${user.surname || ""}`.trim();
  if (!givenName) {
    return { _id: user.id, name: fullName || user.email, email: user.email };
  }
  return {
    _id: user.id,
    name: givenName,
    surname: user.surname,
    email: user.email,
  };
}

// Custom hook for fetching users. Read-only viewers never pick a user, so
// they skip the request. `loading` is true while a fetch is in flight,
// including one that starts when edit access arrives after the first render.
function useUsers(enabled = true) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    const fetchUsers = async () => {
      try {
        const response = await apiServices.get<any>("/users");
        // Handle nested data structure: { message: "OK", data: [...] }
        const data = response?.data;
        const usersArray = data?.data || data || [];
        if (!cancelled) setUsers(Array.isArray(usersArray) ? usersArray : []);
      } catch (err) {
        // A read, not a write: nothing the user entered is lost. The picker
        // falls back to an empty list and the global error toast reports the
        // failed request.
        console.error("Failed to fetch users:", err);
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchUsers();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { users, loading };
}

// ============================================================================
// VerifyWise Theme Constants
// ============================================================================

const VW_COLORS = {
  primary: brand.primary,
  textSecondary: text.secondary,
  textTertiary: text.tertiary,
  textAccent: text.accent,
  bgMain: background.main,
  bgAccent: background.alt,
  borderLight: vwPalette.border.light,
  borderDark: borderPalette.dark,
  error: vwPalette.status.error.text,
  errorBg: editor.imageErrorBg,
  success: status.success.strong,
  successBg: vwPalette.status.success.bg,
};

const vwChipSx = {
  ...textStyles.bodyLarge,
  color: text.secondary,
  borderRadius: radiusPx.sm,
};

/**
 * A saved answer shown as plain text to viewers who cannot edit it, or
 * "Not set" when there is no answer yet.
 */
function ReadOnlyValue({ children }: { children?: React.ReactNode }) {
  const empty = children === undefined || children === null || children === "";
  return (
    <Typography
      sx={{
        ...textStyles.body,
        color: empty ? text.subdued : text.primary,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {empty ? "Not set" : children}
    </Typography>
  );
}

/**
 * Shown under a field whose last write failed. The field keeps what the user
 * entered, so trying again (blur, click, select) resends it. The global error
 * toast already carries the server's reason.
 */
function NotSavedMessage() {
  return (
    <Typography role="alert" sx={{ ...textStyles.body, color: VW_COLORS.error }}>
      Not saved. Try again.
    </Typography>
  );
}

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
  // Same keys the server authorizes on: model.edit for answers, people,
  // approvers and files. Approve/reject is decided per row (own row only).
  const readOnly = !useCan("model.edit");
  const { userId: currentUserId } = useAuth();
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
          readOnly={readOnly}
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
          readOnly={readOnly}
        />
      );
    case "documents":
      return (
        <DocumentsFieldRenderer
          modelId={modelId}
          item={item}
          value={value}
          onValueChanged={onValueChanged}
          readOnly={readOnly}
        />
      );
    case "people":
      return (
        <PeopleFieldRenderer
          modelId={modelId}
          item={item}
          value={value}
          onValueChanged={onValueChanged}
          readOnly={readOnly}
        />
      );
    case "classification":
      return (
        <ClassificationFieldRenderer
          modelId={modelId}
          item={item}
          value={value}
          onValueChanged={onValueChanged}
          readOnly={readOnly}
        />
      );
    case "checklist":
      return (
        <ChecklistFieldRenderer
          modelId={modelId}
          item={item}
          value={value}
          onValueChanged={onValueChanged}
          readOnly={readOnly}
        />
      );
    case "approval":
      return (
        <ApprovalFieldRenderer
          modelId={modelId}
          item={item}
          value={value}
          onValueChanged={onValueChanged}
          readOnly={readOnly}
          currentUserId={currentUserId}
        />
      );
    default:
      return (
        <Typography color="text.secondary" variant="body2">
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
  readOnly,
}: {
  modelId: number;
  item: LifecycleItem;
  value: LifecycleValue | null | undefined;
  multiline: boolean;
  onValueChanged?: () => void;
  readOnly: boolean;
}) {
  const config = item.config as { placeholder?: string; maxLength?: number };
  const [text, setText] = useState(value?.value_text ?? "");
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const savedRef = useRef(value?.value_text ?? "");

  const handleBlur = useCallback(async () => {
    if (text === savedRef.current) {
      // Back to the saved text (e.g. the user undid a failed edit): nothing is unsaved.
      setSaveFailed(false);
      return;
    }
    setSaving(true);
    setSaveFailed(false);
    try {
      await apiServices.put(
        `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}`,
        { value_text: text || null },
      );
      savedRef.current = text;
      onValueChanged?.();
    } catch {
      // Keep the typed text; the next blur sends it again.
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }, [text, modelId, item.id, onValueChanged]);

  if (readOnly) return <ReadOnlyValue>{value?.value_text}</ReadOnlyValue>;

  return (
    <Stack sx={{ gap: "4px" }}>
      <Field
        placeholder={config?.placeholder || `Enter ${item.name.toLowerCase()}`}
        value={text}
        onChange={(e) => {
          if (config?.maxLength && e.target.value.length > config.maxLength) return;
          setText(e.target.value);
        }}
        onBlur={handleBlur}
        rows={multiline ? 3 : undefined}
        width="100%"
        InputProps={{
          endAdornment: saving ? (
            <CircularProgress size={14} sx={{ color: icon.brand }} />
          ) : undefined,
        }}
      />
      {saveFailed && <NotSavedMessage />}
    </Stack>
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
  readOnly,
}: {
  modelId: number;
  item: LifecycleItem;
  value: LifecycleValue | null | undefined;
  onValueChanged?: () => void;
  readOnly: boolean;
}) {
  const files = Array.isArray(value?.files) ? value.files : [];
  // Uploading also creates a file manager entry, which POST /file-manager
  // authorizes on fileManager.contribute. Without it the list stays visible.
  const canContributeFiles = useCan("fileManager.contribute");
  const canUpload = !readOnly && canContributeFiles;
  const [uploading, setUploading] = useState(false);
  // Which action last failed; cleared when any action starts or succeeds so
  // a stale message never outlives the thing it was about.
  const [failedAction, setFailedAction] = useState<"upload" | "remove" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (!selectedFiles || selectedFiles.length === 0) return;

      setUploading(true);
      setFailedAction(null);
      let attachedAny = false;
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
          attachedAny = true;
        }
        onValueChanged?.();
      } catch {
        // Show the files that did attach before the failure, and say so.
        if (attachedAny) onValueChanged?.();
        setFailedAction("upload");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [modelId, item.id, onValueChanged],
  );

  const handleRemoveFile = useCallback(
    async (fileId: number) => {
      setFailedAction(null);
      try {
        await apiServices.delete(
          `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}/files/${fileId}`,
        );
        onValueChanged?.();
      } catch (error) {
        // 404: the link is already gone (removed in another tab, or a double
        // click), so refresh to drop the stale row. Anything else: keep the
        // row and say so, so the user can retry.
        if ((error as CustomException | undefined)?.status === 404) {
          onValueChanged?.();
        } else {
          setFailedAction("remove");
        }
      }
    },
    [modelId, item.id, onValueChanged],
  );

  if (!canUpload && files.length === 0) {
    return (
      <Typography sx={{ ...textStyles.body, color: text.subdued }}>
        No files uploaded yet.
      </Typography>
    );
  }

  return (
    <Stack sx={{ gap: 6 }}>
      {files.length > 0 && (
        <Stack sx={{ gap: 4 }}>
          {files.map((file) => (
            <Stack
              key={file.id}
              direction="row"
              alignItems="center"
              sx={{
                gap: 4,
                pt: 4,
                pb: 4,
                pl: 6,
                pr: 6,
                borderRadius: radiusPx.sm,
                border: `1px solid ${border.light}`,
                backgroundColor: background.alt,
              }}
            >
              <FileText size={16} color={text.icon} />
              <Typography
                sx={{
                  flex: 1,
                  ...textStyles.body,
                  color: text.secondary,
                }}
              >
                {file.filename || `File #${file.file_id}`}
              </Typography>
              {!readOnly && (
                <CustomizableButton
                  iconOnly
                  variant="text"
                  size="medium"
                  ariaLabel="Remove file"
                  onClick={() => handleRemoveFile(file.file_id)}
                  sx={{ "color": VW_COLORS.textAccent, "&:hover": { color: VW_COLORS.error } }}
                >
                  <Trash2 size={16} />
                </CustomizableButton>
              )}
            </Stack>
          ))}
        </Stack>
      )}
      {!readOnly && failedAction && (
        <Typography
          role="alert"
          sx={{
            ...textStyles.body,
            color: VW_COLORS.error,
          }}
        >
          {failedAction === "upload"
            ? "Could not upload the file. Try again."
            : "Could not remove the file. Try again."}
        </Typography>
      )}
      {canUpload && (
        <Box
          sx={{
            "border": `1px dashed ${VW_COLORS.borderDark}`,
            "borderRadius": radiusPx.sm,
            "pt": 4,
            "pb": 4,
            "pl": 6,
            "pr": 6,
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
            <Stack direction="row" sx={{ gap: 4, justifyContent: "center", alignItems: "center" }}>
              <Upload size={16} color={text.icon} />
              <Typography
                sx={{
                  ...textStyles.body,
                  color: text.tertiary,
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
      )}
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
  readOnly,
}: {
  modelId: number;
  item: LifecycleItem;
  value: LifecycleValue | null | undefined;
  onValueChanged?: () => void;
  readOnly: boolean;
}) {
  const { users, loading: usersLoading } = useUsers(!readOnly);
  // People now come from junction table, not value_json
  const currentPeople: PersonRecord[] = Array.isArray((value as any)?.people)
    ? (value as any).people
    : [];
  const [selectedUserId, setSelectedUserId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

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
    setSaveFailed(false);
    try {
      await apiServices.post(
        `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}/people`,
        { userId: selectedUserId },
      );
      setSelectedUserId("");
      onValueChanged?.();
    } catch {
      // Keep the picked user selected so Add can be pressed again.
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }, [selectedUserId, modelId, item.id, onValueChanged]);

  const handleRemove = useCallback(
    async (userId: number) => {
      setSaving(true);
      setSaveFailed(false);
      try {
        await apiServices.delete(
          `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}/people/${userId}`,
        );
        onValueChanged?.();
      } catch {
        setSaveFailed(true);
      } finally {
        setSaving(false);
      }
    },
    [modelId, item.id, onValueChanged],
  );

  if (readOnly && currentPeople.length === 0) return <ReadOnlyValue />;

  return (
    <Stack sx={{ gap: 4 }}>
      {currentPeople.length > 0 && (
        <Stack direction="row" flexWrap="wrap" sx={{ gap: 4 }}>
          {currentPeople.map((p) => (
            <Chip
              key={p.user_id}
              label={getPersonDisplayName(p)}
              size="small"
              variant="outlined"
              onDelete={readOnly ? undefined : () => handleRemove(p.user_id)}
              sx={{
                ...vwChipSx,
                "borderColor": border.dark,
                "color": text.primary,
                "& .MuiChip-deleteIcon": {
                  "color": VW_COLORS.textAccent,
                  "&:hover": { color: VW_COLORS.error },
                },
              }}
            />
          ))}
        </Stack>
      )}
      {!readOnly && (
        <Stack direction="row" alignItems="center" sx={{ gap: 4 }}>
          <Select
            id={`lifecycle-people-${item.id}`}
            ariaLabel={item.name}
            placeholder={usersLoading ? "Loading users..." : "Select a user..."}
            value={selectedUserId}
            items={availableUsers.map(toUserOption)}
            onChange={(e) => setSelectedUserId(e.target.value as number | "")}
            sx={{ flex: 1 }}
          />
          <CustomizableButton
            variant="outlined"
            color="secondary"
            size="small"
            onClick={handleAdd}
            disabled={saving || !selectedUserId}
          >
            Add
          </CustomizableButton>
        </Stack>
      )}
      {saving && <CircularProgress size={14} sx={{ color: VW_COLORS.primary }} />}
      {!readOnly && saveFailed && <NotSavedMessage />}
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
  readOnly,
}: {
  modelId: number;
  item: LifecycleItem;
  value: LifecycleValue | null | undefined;
  onValueChanged?: () => void;
  readOnly: boolean;
}) {
  const config = item.config as { levels?: string[] };
  const levels = Array.isArray(config?.levels) ? config.levels : [];
  const currentValue = (value?.value_json as { level?: string })?.level ?? "";
  const [selected, setSelected] = useState(currentValue);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const savedRef = useRef(currentValue);

  const handleChange = useCallback(
    async (level: string) => {
      setSelected(level);
      setSaving(true);
      setSaveFailed(false);
      try {
        await apiServices.put(
          `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}`,
          { value_json: { level } },
        );
        savedRef.current = level;
        onValueChanged?.();
      } catch {
        // Show the last saved level again. A radio fires no change event when
        // its checked option is clicked, so leaving the failed pick checked
        // would make it impossible to retry; picking it again now resends it.
        setSelected(savedRef.current);
        setSaveFailed(true);
      } finally {
        setSaving(false);
      }
    },
    [modelId, item.id, onValueChanged],
  );

  if (readOnly) return <ReadOnlyValue>{currentValue}</ReadOnlyValue>;

  return (
    <Stack sx={{ gap: 4 }}>
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
                  ...textStyles.body,
                  color: text.secondary,
                }}
              >
                {level}
              </Typography>
            }
            sx={{ marginLeft: 0 }}
          />
        ))}
      </RadioGroup>
      {saving && <CircularProgress size={14} sx={{ color: icon.brand }} />}
      {saveFailed && <NotSavedMessage />}
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
  readOnly,
}: {
  modelId: number;
  item: LifecycleItem;
  value: LifecycleValue | null | undefined;
  onValueChanged?: () => void;
  readOnly: boolean;
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
  const [saveFailed, setSaveFailed] = useState(false);
  const [newItemText, setNewItemText] = useState("");

  const saveItems = useCallback(
    async (updatedItems: ChecklistValue[]) => {
      setSaving(true);
      setSaveFailed(false);
      try {
        await apiServices.put(
          `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}`,
          { value_json: updatedItems },
        );
        onValueChanged?.();
      } catch {
        // Keep the list as edited; the next change sends the whole list.
        setSaveFailed(true);
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

  if (readOnly && items.length === 0) return <ReadOnlyValue />;

  return (
    <Stack sx={{ gap: 4 }}>
      {items.map((it, index) => (
        <Stack key={index} direction="row" alignItems="center" sx={{ gap: 4 }}>
          <Checkbox
            checked={it.checked}
            onChange={() => toggleItem(index)}
            disabled={readOnly}
            inputProps={{ "aria-label": it.label }}
            size="small"
            sx={{
              "color": border.dark,
              "&.Mui-checked": { color: brand.primary },
              "padding": 2,
            }}
          />
          <Typography
            sx={{
              flex: 1,

              ...textStyles.body,
              textDecoration: it.checked ? "line-through" : "none",
              color: it.checked ? text.subdued : text.primary,
            }}
          >
            {it.label}
          </Typography>
          {!readOnly && (
            <CustomizableButton
              iconOnly
              variant="text"
              color="error"
              size="small"
              ariaLabel="Remove item"
              onClick={() => removeItem(index)}
            >
              <X size={16} />
            </CustomizableButton>
          )}
        </Stack>
      ))}
      {!readOnly && (
        <Stack direction="row" alignItems="center" sx={{ gap: 4 }}>
          <Field
            placeholder="Add checklist item..."
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addItem();
            }}
            sx={{ flex: 1 }}
          />
          <CustomizableButton
            variant="outlined"
            color="secondary"
            size="small"
            onClick={addItem}
            loading={saving}
          >
            Add
          </CustomizableButton>
        </Stack>
      )}
      {!readOnly && saveFailed && <NotSavedMessage />}
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
  readOnly,
  currentUserId,
}: {
  modelId: number;
  item: LifecycleItem;
  value: LifecycleValue | null | undefined;
  onValueChanged?: () => void;
  readOnly: boolean;
  currentUserId: number | null;
}) {
  const { users, loading: usersLoading } = useUsers(!readOnly);
  // Approvals now come from junction table, not value_json
  const currentApprovals: ApprovalRecord[] = Array.isArray((value as any)?.approvals)
    ? (value as any).approvals
    : [];
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
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
      setSaveFailed(false);
      try {
        await apiServices.put(
          `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}/approvals/${userId}`,
          { status },
        );
        onValueChanged?.();
      } catch {
        setSaveFailed(true);
      } finally {
        setSaving(false);
      }
    },
    [modelId, item.id, onValueChanged],
  );

  const addApprover = useCallback(async () => {
    if (!selectedUserId) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await apiServices.post(
        `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}/approvals`,
        { userId: selectedUserId },
      );
      setSelectedUserId("");
      onValueChanged?.();
    } catch {
      // Keep the picked approver selected so Add Approver can be pressed again.
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }, [selectedUserId, modelId, item.id, onValueChanged]);

  const removeApprover = useCallback(
    async (userId: number) => {
      setSaving(true);
      setSaveFailed(false);
      try {
        await apiServices.delete(
          `/extensions/model-lifecycle/models/${modelId}/lifecycle/items/${item.id}/approvals/${userId}`,
        );
        onValueChanged?.();
      } catch {
        setSaveFailed(true);
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

  if (readOnly && currentApprovals.length === 0) return <ReadOnlyValue />;

  return (
    <Stack sx={{ gap: 6 }}>
      {currentApprovals.map((approval) => (
        <Stack
          key={approval.user_id}
          data-testid={`approver-row-${approval.user_id}`}
          direction="row"
          alignItems="center"
          sx={{
            gap: 4,
            pt: 6,
            pb: 6,
            pr: 8,
            pl: 8,
            borderRadius: radiusPx.sm,
            border: `1px solid ${border.light}`,
            background: background.main,
          }}
        >
          <Typography
            sx={{
              flex: 1,
              ...textStyles.body,
              color: text.primary,
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
          {/* Only the named approver decides their own row, whatever their
              role (the server rejects anyone else). */}
          {approval.status === "pending" && approval.user_id === currentUserId && (
            <>
              <CustomizableButton
                iconOnly
                variant="text"
                color="primary"
                size="small"
                ariaLabel="Approve"
                onClick={() => handleStatusChange(approval.user_id, "approved")}
              >
                <Check size={16} />
              </CustomizableButton>
              <CustomizableButton
                iconOnly
                variant="text"
                color="error"
                size="small"
                ariaLabel="Reject"
                onClick={() => handleStatusChange(approval.user_id, "rejected")}
              >
                <X size={16} />
              </CustomizableButton>
            </>
          )}
          {!readOnly && (
            <CustomizableButton
              iconOnly
              variant="text"
              size="small"
              ariaLabel="Remove approver"
              onClick={() => removeApprover(approval.user_id)}
              sx={{ "color": VW_COLORS.textAccent, "&:hover": { color: VW_COLORS.error } }}
            >
              <Trash2 size={14} />
            </CustomizableButton>
          )}
        </Stack>
      ))}
      {!readOnly && (
        <Stack direction="row" alignItems="center" sx={{ gap: 4 }}>
          <Select
            id={`lifecycle-approval-${item.id}`}
            ariaLabel={item.name}
            placeholder={usersLoading ? "Loading users..." : "Select an approver..."}
            value={selectedUserId}
            items={availableUsers.map(toUserOption)}
            onChange={(e) => setSelectedUserId(e.target.value as number | "")}
            sx={{ flex: 1 }}
          />
          <CustomizableButton
            variant="outlined"
            color="secondary"
            size="small"
            onClick={addApprover}
            disabled={saving || !selectedUserId}
            loading={saving}
          >
            Add Approver
          </CustomizableButton>
        </Stack>
      )}
      {saveFailed && <NotSavedMessage />}
    </Stack>
  );
}
