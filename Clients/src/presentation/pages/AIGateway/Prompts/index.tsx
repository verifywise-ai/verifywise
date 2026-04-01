import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
} from "@mui/material";
import { CirclePlus, Trash2, BookOpen, FileText, Link } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import Field from "../../../components/Inputs/Field";
import StandardModal from "../../../components/Modals/StandardModal";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import TablePaginationActions from "../../../components/TablePagination";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import { getPaginationRowCount, setPaginationRowCount } from "../../../../application/utils/paginationStorage";
import { slugify, ProviderIcon, getLabelVariant } from "../shared";
import singleTheme from "../../../themes/v1SingleTheme";

interface Prompt {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  published_version: number | null;
  published_model: string | null;
  published_status: string | null;
  version_count: number;
  updated_at: string;
  labels?: Array<{ label_name: string }>;
}

const { header, body, frame } = singleTheme.tableStyles.primary;

export default function PromptsPage() {
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() => getPaginationRowCount("aiGatewayPrompts", 10));

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const [form, setForm] = useState({ name: "", slug: "", description: "" });

  const loadData = useCallback(async () => {
    try {
      const res = await apiServices.get<Record<string, any>>("/ai-gateway/prompts");
      const promptList: Prompt[] = res?.data?.prompts || res?.data?.data || [];
      // Fetch labels for each prompt in parallel
      const labelsRes = await Promise.all(
        promptList.map((p) => apiServices.get<Record<string, any>>(`/ai-gateway/prompts/${p.id}/labels`).catch(() => null))
      );
      for (let i = 0; i < promptList.length; i++) {
        promptList[i].labels = labelsRes[i]?.data?.labels || labelsRes[i]?.data?.data || [];
      }
      setPrompts(promptList);
    } catch { /* silently handle */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setForm((p) => ({ ...p, name: value, slug: slugify(value) }));
  };

  const closeCreateModal = () => { setIsCreateOpen(false); setFormError(""); };

  const handleCreate = async () => {
    if (!form.name || !form.slug) { setFormError("Name is required"); return; }
    setIsSubmitting(true);
    setFormError("");
    try {
      const res = await apiServices.post<Record<string, any>>("/ai-gateway/prompts", {
        name: form.name, slug: form.slug, description: form.description || null,
      });
      const created = res?.data?.prompt || res?.data?.data;
      setIsCreateOpen(false);
      setForm({ name: "", slug: "", description: "" });
      if (created?.id) navigate(`/ai-gateway/prompts/${created.id}`);
      else loadData();
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || err?.response?.data?.message || "Failed to create prompt");
    } finally { setIsSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiServices.delete(`/ai-gateway/prompts/${deleteTarget.id}`);
      setPrompts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch { /* silently handle */ }
  };

  const actionButton = (
    <CustomizableButton
      text="Create prompt"
      icon={<CirclePlus size={14} strokeWidth={1.5} />}
      onClick={() => setIsCreateOpen(true)}
      sx={{ height: 34 }}
    />
  );

  const createModal = (
    <StandardModal
      isOpen={isCreateOpen}
      onClose={closeCreateModal}
      title="Create prompt"
      description="Set up a new prompt template."
      onSubmit={handleCreate}
      submitButtonText="Create"
      isSubmitting={isSubmitting}
      maxWidth="480px"
    >
      <Stack spacing={6}>
        {formError && <Typography color="error" fontSize={13}>{formError}</Typography>}
        <Field label="Name" value={form.name} onChange={handleNameChange} placeholder="e.g. Customer support agent" />
        <Field label="Description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Optional description" />
      </Stack>
    </StandardModal>
  );

  const deleteModal = (
    <StandardModal
      isOpen={!!deleteTarget}
      onClose={() => setDeleteTarget(null)}
      title="Delete prompt"
      description={`Are you sure you want to delete "${deleteTarget?.name || ""}"?`}
      onSubmit={handleDelete}
      submitButtonText="Delete"
      submitButtonColor="#c62828"
      maxWidth="480px"
    >
      <Typography fontSize={13}>
        All versions will be removed and any endpoints using this prompt will be unlinked.
        This action cannot be undone.
      </Typography>
    </StandardModal>
  );

  if (loading) {
    return (
      <PageHeaderExtended title="Prompts" description="Create versioned prompt templates with variables and bind them to endpoints." tipBoxEntity="ai-gateway-prompts" helpArticlePath="ai-gateway/prompts" actionButton={actionButton}>
        <Box />
      </PageHeaderExtended>
    );
  }

  if (prompts.length === 0 && !isCreateOpen) {
    return (
      <PageHeaderExtended title="Prompts" description="Create versioned prompt templates with variables and bind them to endpoints." tipBoxEntity="ai-gateway-prompts" helpArticlePath="ai-gateway/prompts" actionButton={actionButton}>
        <EmptyState
          icon={BookOpen}
          message="No prompts yet. Create your first prompt template to centralize and version-control system instructions."
        >
          <EmptyStateTip icon={FileText} title="Prompts are reusable message templates" description="Define system and user messages with {{variables}} that get resolved at request time. Each prompt tracks versions so you can test, compare, and roll back." />
          <EmptyStateTip icon={Link} title="Bind prompts to endpoints" description="Once published, a prompt can be bound to any endpoint. Every request through that endpoint automatically uses the prompt's messages as a base." />
        </EmptyState>
        {createModal}
      </PageHeaderExtended>
    );
  }

  const paginatedPrompts = prompts.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <PageHeaderExtended title="Prompts" description="Create versioned prompt templates with variables and bind them to endpoints." tipBoxEntity="ai-gateway-prompts" helpArticlePath="ai-gateway/prompts" actionButton={actionButton}>
      <TableContainer sx={frame}>
        <Table>
          <TableHead sx={{ background: header.backgroundColors }}>
            <TableRow sx={header.row}>
              <TableCell style={header.cell}>Name</TableCell>
              <TableCell style={header.cell}>Version</TableCell>
              <TableCell style={header.cell}>Labels</TableCell>
              <TableCell style={header.cell}>Model</TableCell>
              <TableCell style={header.cell}>Updated</TableCell>
              <TableCell style={{ ...header.cell, minWidth: 48, width: 48 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedPrompts.map((p) => {
              const provider = p.published_model?.includes("/") ? p.published_model.split("/")[0] : "";
              return (
                <TableRow
                  key={p.id}
                  onClick={() => navigate(`/ai-gateway/prompts/${p.id}`)}
                  sx={body.row}
                >
                  <TableCell style={body.cell}>
                    <Typography fontSize={13} fontWeight={500}>{p.name}</Typography>
                    {p.description && (
                      <Typography fontSize={12} color="text.secondary" sx={{ mt: "2px" }} noWrap>{p.description}</Typography>
                    )}
                  </TableCell>
                  <TableCell style={body.cell}>
                    {p.published_version
                      ? <Chip label={`v${p.published_version}`} variant="success" />
                      : <Chip label={p.version_count > 0 ? "Draft" : "No versions"} />}
                  </TableCell>
                  <TableCell style={body.cell}>
                    {p.labels && p.labels.length > 0 ? (
                      <Box sx={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {p.labels.map((l) => (
                          <Chip key={l.label_name} label={l.label_name} variant={getLabelVariant(l.label_name)} />
                        ))}
                      </Box>
                    ) : (
                      <Typography fontSize={12} color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell style={body.cell}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {provider && <ProviderIcon provider={provider} size={14} />}
                      <Typography fontSize={12} color="text.secondary" noWrap>{p.published_model || "-"}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell style={{ ...body.cell, color: "#475467" }}>{displayFormattedDate(p.updated_at)}</TableCell>
                  <TableCell style={{ ...body.cell, width: 48, minWidth: 48 }}>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: p.id, name: p.name }); }}
                      sx={{ color: "text.secondary" }}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {prompts.length > 5 && (
          <TablePagination
            component="div"
            count={prompts.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setRowsPerPage(val);
              setPaginationRowCount("aiGatewayPrompts", val);
              setPage(0);
            }}
            rowsPerPageOptions={[5, 10, 25]}
            ActionsComponent={TablePaginationActions}
            sx={{ borderTop: "1px solid", borderColor: "border.light" }}
          />
        )}
      </TableContainer>

      {createModal}
      {deleteModal}
    </PageHeaderExtended>
  );
}
