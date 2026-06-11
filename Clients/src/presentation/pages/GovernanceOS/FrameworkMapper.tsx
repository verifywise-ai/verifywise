import { useState } from "react";
import {
  Stack,
  Typography,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { GitCompareArrows, Plus, List, Grid3X3, Download, Upload } from "lucide-react";
import FrameworkSelector from "../../components/GovernanceOS/FrameworkSelector";
import MappingCard from "../../components/GovernanceOS/MappingCard";
import { EmptyState } from "../../components/EmptyState";
import { StatusTileCards, StatusTileItem } from "../../components/Cards/StatusTileCards";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import { CustomizableButton } from "../../components/button/customizable-button";
import {
  useMappings,
  useMappingsBetween,
  useCreateMapping,
  useUpdateMapping,
  useDeleteMapping,
  useBulkCreateMappings,
} from "../../../application/hooks/useGovernanceOs";
import { IGovernanceControlMapping } from "../../../domain/interfaces/i.governanceOs";
import MappingFormModal from "./FrameworkMapperModule/MappingFormModal";

import BulkImportModal from "./FrameworkMapperModule/BulkImportModal";
import { text, brand } from "../../themes/palette";

const FrameworkMapper = () => {
  const [sourceId, setSourceId] = useState(1);
  const [targetId, setTargetId] = useState(2);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<IGovernanceControlMapping | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [mappingToDelete, setMappingToDelete] = useState<IGovernanceControlMapping | null>(null);

  const [viewMode, setViewMode] = useState<"list" | "matrix">("list");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const { data: allMappings, isLoading: allMappingsLoading } = useMappings();
  const { data: pairwiseMappings, isLoading: pairwiseLoading } = useMappingsBetween(
    sourceId,
    targetId,
  );
  const createMappingMutation = useCreateMapping();
  const updateMappingMutation = useUpdateMapping();
  const deleteMappingMutation = useDeleteMapping();
  const bulkCreateMutation = useBulkCreateMappings();

  const mappings = viewMode === "matrix" ? allMappings : pairwiseMappings;
  const isLoading = viewMode === "matrix" ? allMappingsLoading : pairwiseLoading;

  const handleCreateMapping = () => {
    setEditingMapping(null);
    setFormModalOpen(true);
  };

  const confirmDelete = () => {
    if (mappingToDelete) {
      deleteMappingMutation.mutate(mappingToDelete.id!);
      setDeleteConfirmOpen(false);
      setMappingToDelete(null);
    }
  };

  const handleFormSubmit = (data: Partial<IGovernanceControlMapping>) => {
    if (editingMapping) {
      updateMappingMutation.mutate(
        { id: editingMapping.id!, body: data },
        { onSuccess: () => setFormModalOpen(false) },
      );
    } else {
      createMappingMutation.mutate(data, { onSuccess: () => setFormModalOpen(false) });
    }
  };

  const filteredMappings = (mappings || []).filter((m) => {
    if (selectedDomain && m.domain_tag !== selectedDomain) return false;
    return true;
  });

  const domains = [...new Set((mappings || []).map((m) => m.domain_tag).filter(Boolean))];

  const domainTileItems: StatusTileItem[] = domains.map((domain) => {
    const count = (mappings || []).filter((m) => m.domain_tag === domain).length;
    return {
      key: domain as string,
      label: (domain as string).replace(/_/g, " "),
      count,
      color: brand.primary,
    };
  });

  return (
    <Stack gap="16px">
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <FrameworkSelector
          sourceId={sourceId}
          targetId={targetId}
          onSourceChange={setSourceId}
          onTargetChange={setTargetId}
        />
        <Stack direction="row" gap="8px" alignItems="center">
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, value) => value && setViewMode(value)}
            size="small"
          >
            <ToggleButton value="list" disableRipple>
              <List size={14} />
            </ToggleButton>
            <ToggleButton value="matrix" disableRipple>
              <Grid3X3 size={14} />
            </ToggleButton>
          </ToggleButtonGroup>
          <CustomizableButton
            variant="outlined"
            size="small"
            startIcon={<Download size={14} />}
            onClick={() => {
              const rows = [
                [
                  "ID",
                  "Source Framework",
                  "Source Control",
                  "Target Framework",
                  "Target Control",
                  "Strength",
                  "Domain",
                  "Confidence",
                ].join(","),
                ...(pairwiseMappings || []).map((m) =>
                  [
                    m.id,
                    m.source_framework_id,
                    m.source_control_identifier,
                    m.target_framework_id,
                    m.target_control_identifier,
                    m.mapping_strength,
                    m.domain_tag || "",
                    m.confidence_score || "",
                  ].join(","),
                ),
              ];
              const blob = new Blob([rows.join("\n")], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `mappings-${sourceId}-${targetId}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            text="Export"
          />
          <CustomizableButton
            variant="outlined"
            size="small"
            startIcon={<Upload size={14} />}
            onClick={() => setBulkImportOpen(true)}
            text="Import"
          />
          <CustomizableButton
            variant="outlined"
            size="small"
            startIcon={<Plus size={14} />}
            onClick={handleCreateMapping}
            text="New Mapping"
          />
        </Stack>
      </Stack>

      {domainTileItems.length > 0 && (
        <StatusTileCards
          items={domainTileItems}
          size="small"
          entityName="mapping"
          selectedKey={selectedDomain}
          onCardClick={(key) => setSelectedDomain(selectedDomain === key ? null : key)}
        />
      )}

      {isLoading ? (
        <Stack alignItems="center" sx={{ py: "48px" }}>
          <CircularProgress size={32} />
        </Stack>
      ) : filteredMappings.length === 0 ? (
        <EmptyState
          message="No mappings found for the selected frameworks and filters."
          icon={GitCompareArrows}
          showBorder
        />
      ) : (
        <Stack gap="16px">
          <Typography sx={{ fontSize: 12, color: text.muted }}>
            {filteredMappings.length} mapping(s) found
          </Typography>
          <Stack gap="8px">
            {filteredMappings.map((mapping) => (
              <MappingCard key={mapping.id} mapping={mapping} />
            ))}
          </Stack>
        </Stack>
      )}
      <MappingFormModal
        open={formModalOpen}
        mapping={editingMapping}
        onClose={() => setFormModalOpen(false)}
        onSubmit={handleFormSubmit}
        isSubmitting={createMappingMutation.isPending || updateMappingMutation.isPending}
      />

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onCancel={() => setDeleteConfirmOpen(false)}
        onProceed={confirmDelete}
        title="Delete Mapping"
        body={`Are you sure you want to delete the mapping from "${mappingToDelete?.source_control_identifier}" to "${mappingToDelete?.target_control_identifier}"? This action cannot be undone.`}
        proceedText="Delete"
        cancelText="Cancel"
        proceedButtonVariant="contained"
        proceedButtonColor="error"
        isLoading={deleteMappingMutation.isPending}
      />

      <BulkImportModal
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onImport={(mappings) => {
          bulkCreateMutation.mutate(mappings, {
            onSuccess: () => setBulkImportOpen(false),
          });
        }}
        isSubmitting={bulkCreateMutation.isPending}
      />
    </Stack>
  );
};

export default FrameworkMapper;
