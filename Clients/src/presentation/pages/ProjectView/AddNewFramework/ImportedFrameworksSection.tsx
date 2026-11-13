/**
 * "Imported frameworks" section of the use case framework picker (#5254).
 *
 * Lists the organization's active imported frameworks (plus any already on
 * this use case, even if deactivated since, so they can still be removed) and
 * attaches or detaches them through /v1/imported-framework-assessments.
 * Rendered only while the framework-import extension is enabled.
 */

import React, { useMemo, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Check as CheckGreenIcon, FileSpreadsheet } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import { background, icon } from "../../../themes/palette";
import { Project } from "../../../../domain/types/Project";
import type { ImportedFramework } from "../../../../domain/interfaces/i.frameworkImport";
import { useImportedFrameworks } from "../../../../application/hooks/useFrameworkImport";
import {
  useAttachImportedFramework,
  useDetachImportedFramework,
  useProjectImportedFrameworks,
} from "../../../../application/hooks/useImportedFrameworkAssessment";
import {
  frameworkCardStyle,
  frameworkCardTitleStyle,
  frameworkCardDescriptionStyle,
  frameworkAddedBadgeStyle,
} from "./styles";

interface ImportedFrameworksSectionProps {
  project: Project;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onResult: (variant: "success" | "error", body: string) => void;
  onChanged: (action: "add" | "removeImported") => void;
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const ImportedFrameworksSection: React.FC<ImportedFrameworksSectionProps> = ({
  project,
  disabled,
  onBusyChange,
  onResult,
  onChanged,
}) => {
  const projectId = Number(project.id);
  const { data: imported = [], isLoading: isLoadingImports } = useImportedFrameworks();
  const { data: links = [], isLoading: isLoadingLinks } = useProjectImportedFrameworks(projectId);
  const attachMutation = useAttachImportedFramework(projectId);
  const detachMutation = useDetachImportedFramework(projectId);
  const [toRemove, setToRemove] = useState<{ linkId: number; name: string } | null>(null);

  const linkByFrameworkId = useMemo(
    () => new Map(links.map((link) => [link.imported_framework_id, link.id])),
    [links],
  );

  // Inactive imports are hidden from the picker unless this use case already uses them.
  const visible = useMemo(
    () => imported.filter((fw) => fw.is_active || linkByFrameworkId.has(fw.id)),
    [imported, linkByFrameworkId],
  );

  const isBusy = disabled || attachMutation.isPending || detachMutation.isPending;

  const handleAdd = async (fw: ImportedFramework) => {
    onBusyChange(true);
    try {
      await attachMutation.mutateAsync(fw.id);
      onResult("success", "Framework added successfully");
      onChanged("add");
    } catch (error) {
      onResult("error", errorMessage(error, "Failed to add framework. Please try again."));
    } finally {
      onBusyChange(false);
    }
  };

  const handleRemove = async () => {
    if (!toRemove) return;
    onBusyChange(true);
    try {
      await detachMutation.mutateAsync(toRemove.linkId);
      onResult("success", "Framework removed successfully");
      onChanged("removeImported");
    } catch (error) {
      onResult("error", errorMessage(error, "Failed to remove framework. Please try again."));
    } finally {
      onBusyChange(false);
      setToRemove(null);
    }
  };

  if (isLoadingImports || isLoadingLinks) return null;

  return (
    <Stack sx={{ gap: "8px" }} data-testid="imported-frameworks-section">
      <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Imported frameworks</Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
        Frameworks your organization imported from Excel. They are assessed topic by topic in this
        use case.
      </Typography>
      {visible.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          No imported frameworks yet. Import one from the Frameworks page.
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
            alignItems: "stretch",
          }}
        >
          {visible.map((fw) => {
            const linkId = linkByFrameworkId.get(fw.id);
            const subtopicCount = fw.topics.reduce((acc, t) => acc + t.subtopics.length, 0);
            return (
              <Box key={fw.id} sx={frameworkCardStyle}>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb="8px">
                  <Box sx={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: background.surface,
                        borderRadius: "4px",
                        flexShrink: 0,
                      }}
                    >
                      <FileSpreadsheet size={16} strokeWidth={1.5} color={icon.default} />
                    </Box>
                    <Typography sx={frameworkCardTitleStyle}>{fw.name}</Typography>
                  </Box>
                  {linkId !== undefined && (
                    <Box sx={frameworkAddedBadgeStyle}>
                      <CheckGreenIcon size={16} strokeWidth={1.5} />
                      Added
                    </Box>
                  )}
                </Box>
                <Typography sx={frameworkCardDescriptionStyle}>
                  {fw.description || `${fw.topics.length} topic(s) · ${subtopicCount} subtopic(s)`}
                </Typography>
                <Box display="flex" justifyContent="flex-end" mt="16px">
                  {linkId !== undefined ? (
                    <CustomizableButton
                      variant="outlined"
                      color="error"
                      size="small"
                      text="Remove"
                      ariaLabel={`Remove ${fw.name}`}
                      isDisabled={isBusy}
                      onClick={() => setToRemove({ linkId, name: fw.name })}
                      sx={{ minWidth: "100px", height: "30px" }}
                    />
                  ) : (
                    <CustomizableButton
                      variant="contained"
                      size="small"
                      text="Add"
                      ariaLabel={`Add ${fw.name}`}
                      isDisabled={isBusy}
                      onClick={() => handleAdd(fw)}
                      sx={{ minWidth: "100px", height: "30px" }}
                    />
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
      {toRemove && (
        <ConfirmationModal
          title="Remove imported framework"
          body={
            <Typography fontSize={13}>
              Remove {toRemove.name} from this use case? Its assessment in this use case is deleted:
              statuses, descriptions, owners, due dates, and evidence and risk links. This cannot be
              undone.
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Remove"
          onCancel={() => setToRemove(null)}
          onProceed={handleRemove}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          isLoading={detachMutation.isPending}
        />
      )}
    </Stack>
  );
};

export default ImportedFrameworksSection;
