/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Box, Stack, Typography, CircularProgress, useTheme } from "@mui/material";
import { LayoutTemplate } from "lucide-react";
import { text as textColors } from "../../themes/palette";
import Chip from "../../components/Chip";
import { CustomizableButton } from "../../components/button/customizable-button";
import { EmptyState } from "../../components/EmptyState";
import StandardModal from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import {
  useTemplates,
  useUpdateTemplate,
  useArchiveTemplate,
  useCreateTemplate,
} from "../../../application/hooks/useReporting";
import { getTemplate } from "../../../application/repository/reporting.repository";
import { showAlert } from "../../../infrastructure/api/customAxios";
import type {
  FrameworkConfig,
  ReportTemplateWriteBody,
} from "../../../domain/interfaces/i.reporting";

// The create body carries framework_config the same way it carries
// sections_config — createTemplateVersionQuery reads all three off one body.
// ReportTemplateWriteBody does not declare it yet, so widen here rather than
// send the field untyped.
type TemplateCreateBody = ReportTemplateWriteBody & {
  framework_config?: FrameworkConfig;
};

// Same three the builder offers. Kept in sync by hand — the backend takes any
// string, so a mismatch is a UX bug, not a type error.
const CATEGORIES = ["governance", "compliance", "risk"];

const CATEGORY_ITEMS = CATEGORIES.map((c) => ({
  _id: c,
  name: c.charAt(0).toUpperCase() + c.slice(1),
}));

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

export default function TemplatesTab({
  onUse,
}: {
  onUse: (templateId: number, mode: "schedule" | "run-now") => void;
}) {
  const theme = useTheme();
  const { data: templates = [], isLoading } = useTemplates();
  const update = useUpdateTemplate();
  const archive = useArchiveTemplate();
  const duplicate = useCreateTemplate();

  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", category: "" });
  const [deleting, setDeleting] = useState<any>(null);

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

  const confirmDelete = () => {
    if (!deleting) return;
    archive.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
      onError: mutationError("Failed to delete template"),
    });
  };

  // System templates cannot be edited in place (see the is_system_template
  // guard below), so Duplicate is how an org turns one into a starting point
  // it can customize: a new, org-owned template seeded from the same config.
  // Field names match ReportTemplateWriteBody (snake_case, same as
  // TemplateBuilder's create call) rather than the camelCase the wizard's
  // own run/schedule bodies use — this goes through POST /templates, not
  // POST /templates/:id/run.
  //
  // The section config has to be fetched first: useTemplates is backed by
  // `SELECT * FROM report_templates`, which carries no version — only
  // GET /templates/:id attaches latestVersion. Reading it off the list row
  // gave every copy an empty sections_config, and the wizard then refuses to
  // leave its Sections step (canNext needs one enabled section), so the copy
  // could never be run or scheduled and the Edit modal could not repair it.
  //
  // createTemplateQuery (Servers/utils/reportTemplate.utils.ts) 400s unless
  // default_scope is exactly "project" or "organization"; the source
  // template always has one, but fall back to "project" defensively rather
  // than send undefined and 400 on every click.
  //
  // framework_config travels with the section config for the same reason it is
  // fetched at all: an omitted selection is not "no preference", it means every
  // framework in scope. Dropping it turns a copy of a framework-specific
  // template into an org-wide report carrying the original's name and
  // description — the silent widening the run/schedule 400-gates exist to stop.
  const handleDuplicate = async (t: any) => {
    let source = t;
    try {
      source = await getTemplate(t.id);
    } catch {
      showAlert({
        variant: "error",
        body: "Failed to load the template to duplicate.",
        isToast: true,
      });
      return;
    }

    const body: TemplateCreateBody = {
      name: `${source.name} (copy)`,
      description: source.description ?? null,
      category: source.category ?? CATEGORIES[0],
      default_scope: source.default_scope ?? "project",
      supported_scopes: source.supported_scopes ?? undefined,
      recommended_frequency: source.recommended_frequency ?? undefined,
      sections_config: source.latestVersion?.sections_config ?? undefined,
      ai_blocks_config: source.latestVersion?.ai_blocks_config ?? undefined,
      framework_config: source.latestVersion?.framework_config ?? undefined,
    };

    duplicate.mutate(body, { onError: mutationError("Failed to duplicate template") });
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  if (!templates.length) {
    return (
      <EmptyState icon={LayoutTemplate} message="No report templates available yet." showBorder />
    );
  }

  // Style guide § Buttons: 34px tall, 13px text, #d0d5dd border, accent hover.
  const secondaryButtonSx = {
    "height": 34,
    "fontSize": 13,
    "border": `1px solid ${theme.palette.border.dark}`,
    "color": theme.palette.text.secondary,
    "&:hover": {
      backgroundColor: theme.palette.background.accent,
      border: `1px solid ${theme.palette.border.dark}`,
    },
  };

  // Style guide § Cards: white surface, 1px border.light frame, 4px radius,
  // 16px padding. cardStyles.base() is deliberately not reused — its padding is
  // theme.spacing(2), which is 4px on this theme, and its border is the darker
  // input border, so neither matches the card spec.
  const cardSx = {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    backgroundColor: theme.palette.background.main,
    border: `1px solid ${theme.palette.border.light}`,
    borderRadius: "4px",
    padding: "16px",
  };

  // Section title, 16px/600 on text.primary, 8px above the grid it labels.
  const sectionTitleSx = {
    fontSize: 16,
    fontWeight: 600,
    color: textColors.primary,
    mb: "8px",
  };

  const cardGridSx = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "16px",
  };

  // is_system_template marks the shared, cross-organization templates. Editing
  // or deleting one would change it for every organization, so those actions
  // stay withheld and Duplicate is offered instead.
  const myTemplates = templates.filter((t: any) => !t.is_system_template);
  const systemTemplates = templates.filter((t: any) => t.is_system_template);

  const renderCard = (t: any, { editable }: { editable: boolean }) => (
    <Stack key={t.id} sx={cardSx}>
      <Stack direction="row" spacing="8px" flexWrap="wrap" useFlexGap>
        <Chip label={t.category} size="small" />
        {t.recommended_frequency && <Chip label={t.recommended_frequency} size="small" />}
        {/* Reads as "this card is deliberately read-only" rather than
            "the buttons failed to render". */}
        {t.is_system_template && (
          <Chip label="System" variant="info" size="small" uppercase={false} />
        )}
      </Stack>
      {/* Card title 16/600, body 13 on text.tertiary — style guide § Typography. */}
      <Typography
        sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4, color: textColors.primary }}
      >
        {t.name}
      </Typography>
      <Typography sx={{ fontSize: 13, lineHeight: 1.5, color: textColors.tertiary, flex: 1 }}>
        {t.description}
      </Typography>
      <Stack direction="row" spacing="8px" flexWrap="wrap" useFlexGap>
        {/* No sx override: CustomizableButton's contained/primary default is
            already the 34px, 13px, #13715B spec. */}
        <CustomizableButton
          variant="contained"
          text="Use Template"
          onClick={() => onUse(t.id, "schedule")}
        />
        <CustomizableButton
          variant="outlined"
          text="Run now"
          onClick={() => onUse(t.id, "run-now")}
          sx={secondaryButtonSx}
        />
        {/* System templates are read-only server-side (the UPDATE/DELETE
            WHERE clause filters is_system_template = false, so both
            return 404). Don't render buttons that cannot succeed — offer
            Duplicate instead. */}
        {editable ? (
          <>
            <CustomizableButton
              variant="outlined"
              text="Edit"
              onClick={() => openEdit(t)}
              sx={secondaryButtonSx}
            />
            <CustomizableButton
              variant="outlined"
              text="Delete"
              onClick={() => setDeleting(t)}
              sx={secondaryButtonSx}
            />
          </>
        ) : (
          <CustomizableButton
            variant="outlined"
            text="Duplicate"
            onClick={() => handleDuplicate(t)}
            sx={secondaryButtonSx}
          />
        )}
      </Stack>
    </Stack>
  );

  return (
    <>
      <Box component="section" aria-label="My templates" sx={{ mb: "24px" }}>
        <Typography sx={sectionTitleSx}>My templates</Typography>
        {myTemplates.length === 0 ? (
          <Typography sx={{ fontSize: 13, lineHeight: 1.5, color: textColors.tertiary }}>
            You haven&apos;t created any templates yet.
          </Typography>
        ) : (
          <Box sx={cardGridSx}>{myTemplates.map((t: any) => renderCard(t, { editable: true }))}</Box>
        )}
      </Box>

      <Box component="section" aria-label="System templates">
        <Typography sx={sectionTitleSx}>System templates</Typography>
        <Box sx={cardGridSx}>
          {systemTemplates.map((t: any) => renderCard(t, { editable: false }))}
        </Box>
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
          <Field
            id="template-name"
            label="Template name"
            isRequired
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <Field
            id="template-description"
            label="Description"
            isOptional
            multiline
            minRows={2}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />
          <Select
            id="template-category"
            label="Category"
            value={form.category}
            items={CATEGORY_ITEMS}
            onChange={(e) => setForm((p) => ({ ...p, category: String(e.target.value) }))}
            getOptionValue={(item) => item._id}
          />
        </Stack>
      </StandardModal>

      {/* The server soft-deletes (is_active = false) because
          scheduled_reports.template_id is a NOT NULL FK with no ON DELETE
          clause, so a hard DELETE of a referenced template fails. That is an
          implementation detail: getTemplatesQuery filters is_active = true and
          nothing in the UI can bring the template back, so to the user this is
          a delete. The one consequence worth surfacing is that schedules
          already pointing at it keep running. */}
      <StandardModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete template"
        description={`Delete "${deleting?.name ?? ""}"? This cannot be undone. Scheduled reports already using it keep running.`}
        onSubmit={confirmDelete}
        submitButtonText="Delete"
        submitButtonColor={theme.palette.error?.main}
        isSubmitting={archive.isPending}
      />
    </>
  );
}
