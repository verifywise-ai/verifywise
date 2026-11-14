import { useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { FileUp as FileUpIcon, Trash2 as DeleteIconRed } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import FrameworkImportModal from "../Components/FrameworkImportModal";
import { useCan } from "../../../../application/hooks/useCan";
import {
  useDeleteImportedFramework,
  useImportedFrameworks,
} from "../../../../application/hooks/useFrameworkImport";
import { background, border as borderPalette, radiusPx, text } from "../../../themes/palette";
import { fontWeight, textStyles } from "../../../themes/typography";
import { useExtensions } from "../../../../application/contexts/Extensions.context";

/**
 * Message for a failed imported-framework delete. On a 409 (still used by use
 * cases) the server's translated message already names those use cases.
 */
function importedDeleteErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Failed to delete the imported framework. Please try again.";
}

/**
 * Imported frameworks (#5254) on the Framework settings page: the
 * organization's own frameworks imported from Excel, with import and delete.
 * The list is fetched only while the framework-import extension is enabled
 * (the endpoint answers 403 otherwise).
 */
const ImportedFrameworksSettings = () => {
  // The framework-import routes authorize on this key, so a custom role
  // granted it gets the import controls too (Admin and Editor by default).
  const canImportFrameworks = useCan("ext.frameworkImport.edit");
  const { isEnabled } = useExtensions();
  const {
    data: importedFrameworks = [],
    isLoading,
    isError,
  } = useImportedFrameworks({ enabled: isEnabled("framework-import") });
  const deleteImportedMutation = useDeleteImportedFramework();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [confirmDeleteImported, setConfirmDeleteImported] = useState<number | null>(null);
  const [deleteImportedError, setDeleteImportedError] = useState<string | null>(null);

  const closeDeleteImported = () => {
    setConfirmDeleteImported(null);
    setDeleteImportedError(null);
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: "8px" }}>
        <Typography sx={{ ...textStyles.cardTitle, color: text.primary }}>
          Imported frameworks
        </Typography>
        <CustomizableButton
          variant="outlined"
          text="Import from Excel"
          startIcon={<FileUpIcon size={16} />}
          onClick={() => setIsImportModalOpen(true)}
          isDisabled={!canImportFrameworks}
        />
      </Stack>
      <Typography sx={{ ...textStyles.body, color: text.tertiary, mb: "16px" }}>
        Your own frameworks, imported from Excel. Add one to a use case from that use case's
        Frameworks tab to assess it.
      </Typography>

      {isLoading ? (
        <Typography sx={{ ...textStyles.body, color: text.tertiary }}>
          Loading imported frameworks...
        </Typography>
      ) : isError ? (
        <Typography sx={{ ...textStyles.body, color: "error.main" }} role="alert">
          Could not load imported frameworks. Refresh the page to try again.
        </Typography>
      ) : importedFrameworks.length === 0 ? (
        <Typography sx={{ ...textStyles.body, color: text.tertiary }}>
          No imported frameworks yet. Import one from a spreadsheet to keep its topics and subtopics
          here.
        </Typography>
      ) : (
        <Stack sx={{ gap: "8px" }}>
          {importedFrameworks.map((fw) => (
            <Stack
              key={fw.id}
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{
                background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
                border: `1px solid ${borderPalette.dark}`,
                borderRadius: radiusPx.sm,
                p: "16px",
              }}
            >
              <Box>
                <Typography
                  sx={{ ...textStyles.body, fontWeight: fontWeight.semibold, color: text.primary }}
                >
                  {fw.name}
                </Typography>
                <Typography sx={{ ...textStyles.bodySmall, color: text.tertiary }}>
                  {fw.topics.length} topic(s) ·{" "}
                  {fw.topics.reduce((acc, t) => acc + t.subtopics.length, 0)} subtopic(s)
                </Typography>
              </Box>
              {canImportFrameworks && (
                <CustomizableButton
                  variant="outlined"
                  color="error"
                  icon={<DeleteIconRed size={16} />}
                  text="Delete"
                  onClick={() => setConfirmDeleteImported(fw.id)}
                  isDisabled={deleteImportedMutation.isPending}
                  ariaLabel={`Delete ${fw.name}`}
                  sx={{ whiteSpace: "nowrap" }}
                />
              )}
            </Stack>
          ))}
        </Stack>
      )}

      {isImportModalOpen && (
        <FrameworkImportModal
          open={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImportComplete={() => setIsImportModalOpen(false)}
        />
      )}

      {confirmDeleteImported !== null && (
        <ConfirmationModal
          isOpen
          title="Delete this imported framework?"
          body={
            <Stack sx={{ gap: "8px" }}>
              <Typography sx={textStyles.body}>
                This removes the imported framework with all its topics and subtopics. You can
                import it again from your file later. A framework used by a use case cannot be
                deleted: remove it from those use cases first.
              </Typography>
              {deleteImportedError && (
                <Typography sx={{ ...textStyles.body, color: "error.main" }} role="alert">
                  {deleteImportedError}
                </Typography>
              )}
            </Stack>
          }
          cancelText="Cancel"
          proceedText="Delete"
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          onCancel={closeDeleteImported}
          onProceed={async () => {
            try {
              await deleteImportedMutation.mutateAsync(confirmDeleteImported);
              closeDeleteImported();
            } catch (error) {
              setDeleteImportedError(importedDeleteErrorMessage(error));
            }
          }}
          isLoading={deleteImportedMutation.isPending}
        />
      )}
    </Box>
  );
};

export default ImportedFrameworksSettings;
