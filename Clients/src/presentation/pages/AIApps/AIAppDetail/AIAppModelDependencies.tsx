import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Stack,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  IconButton,
} from "@mui/material";
import { Cpu, CirclePlus, Trash2 } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import AutoCompleteField from "../../../components/Inputs/Autocomplete";
import StandardModal from "../../../components/Modals/StandardModal";
import { useLinkModelsToAiApp } from "../../../../application/hooks/useAiApps";
import { useModelInventories } from "../../../../application/hooks/useModelInventories";
import { IAIAppModel } from "../../../../domain/interfaces/i.aiApp";
import singleTheme from "../../../themes/v1SingleTheme";
import { palette } from "../../../themes/palette";
import Alert from "../../../components/Alert";
import Chip from "../../../components/Chip";
import StandardTableHead from "../../../components/Table/StandardTableHead";
import StandardTablePagination from "../../../components/Table/StandardTablePagination";
import { useStandardTable } from "../../../../application/hooks/useStandardTable";
import type { StandardColumn } from "../../../../domain/types/standardTable";

interface AIAppModelDependenciesProps {
  appId: number;
  models: IAIAppModel[];
}

interface ModelOption {
  id: number;
  label: string;
}

const TABLE_COLUMNS: StandardColumn[] = [
  { id: "provider", label: "Provider", sortable: true },
  { id: "model", label: "Model", sortable: true },
  { id: "version", label: "Version", sortable: false },
  { id: "status", label: "Status", sortable: true },
  { id: "actions", label: "", sortable: false },
];

export default function AIAppModelDependencies({ appId, models }: AIAppModelDependenciesProps) {
  // Source of truth for what's linked to this app.
  const [linkedIds, setLinkedIds] = useState<number[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [toAdd, setToAdd] = useState<ModelOption[]>([]);
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    body: string;
  } | null>(null);

  // Auto-dismiss toasts after 3s.
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), 3000);
    return () => clearTimeout(timer);
  }, [alert]);

  const { data: modelInventories } = useModelInventories();
  const linkModelsMutation = useLinkModelsToAiApp();

  // Seed the linked set from the models already mapped to this app.
  useEffect(() => {
    setLinkedIds(models.map((m) => m.id));
  }, [models]);

  // Full inventory detail keyed by id, so a linked id can render a full row.
  const inventoryById = useMemo(() => {
    const map = new Map<number, IAIAppModel>();
    for (const m of modelInventories ?? []) {
      if (m.id == null) continue;
      map.set(m.id, {
        id: m.id,
        provider: m.provider || "Unknown",
        model: m.model || "Unknown",
        version: m.version || "",
        status: m.status || "",
      });
    }
    return map;
  }, [modelInventories]);

  // Rows = the linked models, resolved to full detail (fall back to the prop row).
  const linkedRows = useMemo<IAIAppModel[]>(
    () =>
      linkedIds.map(
        (id) =>
          inventoryById.get(id) ??
          models.find((m) => m.id === id) ?? {
            id,
            provider: "Unknown",
            model: "Unknown",
            version: "",
            status: "",
          },
      ),
    [linkedIds, inventoryById, models],
  );

  // Inventory entries not yet linked — candidates for the add modal.
  const addableOptions = useMemo<ModelOption[]>(() => {
    const linked = new Set(linkedIds);
    return (modelInventories ?? [])
      .filter((m) => m.id != null && !linked.has(m.id))
      .map((m) => ({
        id: m.id!,
        label: `${m.provider || "Unknown"} - ${m.model || "Unknown"}${
          m.version ? ` v${m.version}` : ""
        }`,
      }));
  }, [modelInventories, linkedIds]);

  const persist = useCallback(
    async (next: number[]) => {
      try {
        await linkModelsMutation.mutateAsync({ id: appId, modelInventoryIds: next });
        setAlert({ variant: "success", body: "Model dependencies updated" });
      } catch (err) {
        setAlert({ variant: "error", body: "Failed to update model dependencies" });
        // Re-seed from server-truth so the UI doesn't drift on failure.
        setLinkedIds(models.map((m) => m.id));
      }
    },
    [appId, models, linkModelsMutation],
  );

  const handleConfirmAdd = async () => {
    if (toAdd.length === 0) {
      setIsAddOpen(false);
      return;
    }
    const next = [...linkedIds, ...toAdd.map((o) => o.id)];
    setLinkedIds(next);
    setIsAddOpen(false);
    setToAdd([]);
    await persist(next);
  };

  const handleRemove = async (modelId: number) => {
    const next = linkedIds.filter((id) => id !== modelId);
    setLinkedIds(next);
    await persist(next);
  };

  const sortComparator = useCallback((a: IAIAppModel, b: IAIAppModel, key: string): number => {
    switch (key) {
      case "provider":
        return (a.provider || "").localeCompare(b.provider || "");
      case "model":
        return (a.model || "").localeCompare(b.model || "");
      case "status":
        return (a.status || "").localeCompare(b.status || "");
      default:
        return 0;
    }
  }, []);

  const {
    sortConfig,
    handleSort,
    sortedRows,
    validPage,
    rowsPerPage,
    handleChangePage,
    handleChangeRowsPerPage,
    getRange,
    totalCount,
  } = useStandardTable<IAIAppModel>({
    rows: linkedRows,
    storageKey: "aiAppModelDependencies",
    defaultSortColumn: "",
    defaultSortDirection: null,
    sortComparator,
  });

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        gap="12px"
        sx={{ mb: "16px" }}
      >
        <Stack direction="row" alignItems="center" gap="8px">
          <Cpu size={16} strokeWidth={1.5} color={palette.text.secondary} />
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Model dependencies</Typography>
        </Stack>
        <CustomizableButton
          text="Add model"
          variant="contained"
          icon={<CirclePlus size={14} strokeWidth={1.5} />}
          onClick={() => {
            setToAdd([]);
            setIsAddOpen(true);
          }}
          disabled={linkModelsMutation.isPending}
        />
      </Stack>

      <TableContainer sx={{ overflowX: "auto" }}>
        <Table sx={singleTheme.tableStyles.primary.frame}>
          <StandardTableHead columns={TABLE_COLUMNS} sortConfig={sortConfig} onSort={handleSort} />
          <TableBody>
            {totalCount > 0 ? (
              sortedRows
                .slice(validPage * rowsPerPage, validPage * rowsPerPage + rowsPerPage)
                .map((model) => (
                  <TableRow key={model.id} sx={singleTheme.tableStyles.primary.body.row}>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {model.provider}
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {model.model}
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {model.version || "—"}
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      <Chip label={model.status || "Unknown"} size="small" uppercase={false} />
                    </TableCell>
                    <TableCell
                      sx={{ ...singleTheme.tableStyles.primary.body.cell, textAlign: "right" }}
                    >
                      <IconButton
                        size="small"
                        onClick={() => handleRemove(model.id)}
                        disabled={linkModelsMutation.isPending}
                        aria-label={`Remove ${model.provider} ${model.model}`}
                      >
                        <Trash2 size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMNS.length}
                  sx={singleTheme.tableStyles.primary.body.cell}
                >
                  No models linked yet. Use "Add model" to link model inventory entries to this app.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {totalCount > 0 && (
            <StandardTablePagination
              totalCount={totalCount}
              page={validPage}
              rowsPerPage={rowsPerPage}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              getRange={getRange}
              entityLabel="model"
              colSpan={TABLE_COLUMNS.length}
            />
          )}
        </Table>
      </TableContainer>

      <StandardModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add models"
        description="Select the model inventory entries this AI app depends on."
        onSubmit={handleConfirmAdd}
        submitButtonText="Add"
        isSubmitting={linkModelsMutation.isPending}
        maxWidth="480px"
      >
        <AutoCompleteField<ModelOption, true>
          multiple
          label="Models"
          placeholder={
            addableOptions.length === 0 ? "All models are already linked" : "Select models"
          }
          options={addableOptions}
          value={toAdd}
          onChange={(_e, value) => setToAdd(value as ModelOption[])}
          getOptionLabel={(option) => option.label}
          isOptionEqualToValue={(option, val) => option.id === val.id}
          disabled={addableOptions.length === 0}
        />
      </StandardModal>

      {alert && (
        <Alert variant={alert.variant} body={alert.body} isToast onClick={() => setAlert(null)} />
      )}
    </Box>
  );
}
