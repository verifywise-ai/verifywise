/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import {
  Box,
  Stack,
  Typography,
  CircularProgress,
  TextField,
  MenuItem,
  useTheme,
} from "@mui/material";
import { FileText } from "lucide-react";
import { text as textColors } from "../../themes/palette";
import { cardStyles } from "../../themes/components";
import Chip from "../../components/Chip";
import { CustomizableButton } from "../../components/button/customizable-button";
import { EmptyState } from "../../components/EmptyState";
import StandardModal from "../../components/Modals/StandardModal";
import {
  useTemplates,
  useUpdateTemplate,
  useArchiveTemplate,
} from "../../../application/hooks/useReporting";
import { showAlert } from "../../../infrastructure/api/customAxios";

// Same three the builder offers. Kept in sync by hand — the backend takes any
// string, so a mismatch is a UX bug, not a type error.
const CATEGORIES = ["governance", "compliance", "risk"];

// A 409 from PATCH/POST /templates is always a unique-name violation. Saying
// "failed" there sends the user hunting for a server problem that isn't one.
const mutationError = (fallback: string) => (err: any) =>
  showAlert({
    variant: "error",
    body:
      err?.response?.status === 409
        ? "A template with this name already exists. Choose a different name."
        : fallback,
    isToast: true,
  });

export default function TemplatesTab({ onUse }: { onUse: (templateId: number) => void }) {
  const theme = useTheme();
  const { data: templates = [], isLoading } = useTemplates();
  const update = useUpdateTemplate();
  const archive = useArchiveTemplate();

  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", category: "" });
  const [archiving, setArchiving] = useState<any>(null);

  const openEdit = (t: any) => {
    setForm({
      name: t.name ?? "",
      description: t.description ?? "",
      category: t.category ?? CATEGORIES[0],
    });
    setEditing(t);
  };

  const submitEdit = () => {
    if (!editing) return;
    update.mutate(
      {
        id: editing.id,
        body: {
          name: form.name.trim(),
          description: form.description.trim() || null,
          category: form.category,
        },
      },
      {
        onSuccess: () => setEditing(null),
        onError: mutationError("Failed to update template"),
      },
    );
  };

  const confirmArchive = () => {
    if (!archiving) return;
    archive.mutate(archiving.id, {
      onSuccess: () => setArchiving(null),
      onError: mutationError("Failed to archive template"),
    });
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  if (!templates.length) {
    return <EmptyState icon={FileText} message="No report templates available yet." showBorder />;
  }

  const secondaryButtonSx = {
    "height": 34,
    "fontSize": 13,
    "border": `1px solid ${theme.palette.border?.dark || "#d0d5dd"}`,
    "color": theme.palette.text.secondary,
    "&:hover": {
      backgroundColor: theme.palette.background.accent,
      border: `1px solid ${theme.palette.border?.dark || "#d0d5dd"}`,
    },
  };

  return (
    <>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "16px",
        }}
      >
        {templates.map((t: any) => (
          <Stack key={t.id} sx={{ ...cardStyles.base(theme), gap: "8px" }}>
            <Stack direction="row" spacing="8px" flexWrap="wrap">
              <Chip label={t.category} size="small" />
              {t.recommended_frequency && <Chip label={t.recommended_frequency} size="small" />}
              {/* Reads as "this card is deliberately read-only" rather than
                  "the buttons failed to render". */}
              {t.is_system_template && (
                <Chip label="System" variant="info" size="small" uppercase={false} />
              )}
            </Stack>
            <Typography sx={{ fontSize: 16, fontWeight: 600, color: textColors.primary }}>
              {t.name}
            </Typography>
            <Typography sx={{ fontSize: 13, color: textColors.tertiary, flex: 1 }}>
              {t.description}
            </Typography>
            <Stack direction="row" spacing="8px" flexWrap="wrap" useFlexGap>
              <CustomizableButton
                variant="contained"
                text="Use Template"
                onClick={() => onUse(t.id)}
                sx={{
                  "backgroundColor": theme.palette.primary.main,
                  "&:hover": { backgroundColor: theme.palette.primary.dark },
                  "height": 34,
                  "fontSize": 13,
                }}
              />
              {/* System templates are read-only server-side (the UPDATE/DELETE
                  WHERE clause filters is_system_template = false, so both
                  return 404). Don't render buttons that cannot succeed. */}
              {!t.is_system_template && (
                <>
                  <CustomizableButton
                    variant="outlined"
                    text="Edit"
                    onClick={() => openEdit(t)}
                    sx={secondaryButtonSx}
                  />
                  <CustomizableButton
                    variant="outlined"
                    text="Archive"
                    onClick={() => setArchiving(t)}
                    sx={secondaryButtonSx}
                  />
                </>
              )}
            </Stack>
          </Stack>
        ))}
      </Box>

      <StandardModal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title="Edit template"
        description="Update the template name, description, and category."
        onSubmit={submitEdit}
        submitButtonText="Save changes"
        isSubmitting={update.isPending || !form.name.trim()}
        fitContent
      >
        <Stack spacing={6}>
          <TextField
            label="Template name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Description"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            multiline
            minRows={2}
            fullWidth
          />
          <TextField
            select
            label="Category"
            value={form.category}
            onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
            fullWidth
          >
            {CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </StandardModal>

      {/* Archiving is a soft delete (is_active = false): the row survives and
          schedules already pointing at it keep running. Say "archive", not
          "delete", so the wording matches what actually happens. */}
      <StandardModal
        isOpen={!!archiving}
        onClose={() => setArchiving(null)}
        title="Archive template"
        description={`Archive "${archiving?.name ?? ""}"? It will no longer appear here. Scheduled reports already using it keep running.`}
        onSubmit={confirmArchive}
        submitButtonText="Archive"
        submitButtonColor={theme.palette.error?.main}
        isSubmitting={archive.isPending}
      />
    </>
  );
}
