import React, { useState, useEffect } from "react";
import { Box, Typography, Stack, Button } from "@mui/material";
import { Check as CheckGreenIcon } from "lucide-react";
import StandardModal from "../../../components/Modals/StandardModal";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { Project } from "../../../../domain/types/Project";
import { Framework } from "../../../../domain/types/Framework";
import {
  frameworkCardStyle,
  frameworkCardTitleStyle,
  frameworkCardDescriptionStyle,
  frameworkAddedBadgeStyle,
} from "./styles";
import {
  assignFrameworkToProject,
  deleteEntityById,
} from "../../../../application/repository/entity.repository";
import { logEngine } from "../../../../application/tools/log.engine";
import { handleAlert } from "../../../../application/tools/alertUtils";
import Alert from "../../../components/Alert";
import { AlertProps } from "../../../types/alert.types";
import CustomizableToast from "../../../components/Toast";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import { useModalKeyHandling } from "../../../../application/hooks/useModalKeyHandling";
import { PluginSlot } from "../../../components/PluginSlot";
import { PLUGIN_SLOTS } from "../../../../domain/constants/pluginSlots";

interface AddFrameworkModalProps {
  open: boolean;
  onClose: () => void;
  frameworks: Framework[];
  project: Project;
  onFrameworksChanged?: (action: "add" | "remove", frameworkId?: number) => void;
}

const AddFrameworkModal: React.FC<AddFrameworkModalProps> = ({
  open,
  onClose,
  frameworks,
  project,
  onFrameworksChanged,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [frameworkToRemove, setFrameworkToRemove] = useState<Framework | null>(null);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [customFrameworkCount, setCustomFrameworkCount] = useState(0);

  // Listen for custom framework count changes from plugins (event-based communication)
  useEffect(() => {
    const handleCustomFrameworkCount = (event: CustomEvent) => {
      if (event.detail?.projectId === project.id) {
        setCustomFrameworkCount(event.detail.count || 0);
      }
    };

    window.addEventListener(
      "customFrameworkCountChanged" as any,
      handleCustomFrameworkCount as EventListener,
    );

    return () => {
      window.removeEventListener(
        "customFrameworkCountChanged" as any,
        handleCustomFrameworkCount as EventListener,
      );
    };
  }, [project.id]);

  const showToast = (variant: AlertProps["variant"], body: string) => {
    handleAlert({ variant, body, setAlert, alertTimeout: 3000 });
  };

  const handleAddFramework = async (fw: Framework) => {
    setIsLoading(true);
    try {
      const response = await assignFrameworkToProject({
        frameworkId: Number(fw.id),
        projectId: String(project.id),
      });
      if (response.status === 200 || response.status === 201) {
        showToast("success", "Framework added successfully");
        if (onFrameworksChanged) onFrameworksChanged("add");
      } else {
        showToast("error", "Failed to add framework. Please try again.");
      }
    } catch (_error) {
      logEngine({
        type: "error",
        message: "An error occurred while adding the framework.",
      });
      showToast("error", "An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveFramework = async () => {
    if (!frameworkToRemove) return;
    setIsLoading(true);
    try {
      const response = await deleteEntityById({
        routeUrl: `/frameworks/fromProject?frameworkId=${frameworkToRemove.id}&projectId=${project.id}`,
      });
      if (response.status === 200) {
        showToast("success", "Framework removed successfully");
        if (onFrameworksChanged) onFrameworksChanged("remove", parseInt(frameworkToRemove.id));
      } else {
        showToast("error", "Failed to remove framework. Please try again.");
      }
    } catch (_error) {
      logEngine({
        type: "error",
        message: "An error occurred while removing the framework.",
      });
      showToast("error", "An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
      setIsRemoveModalOpen(false);
      setFrameworkToRemove(null);
    }
  };

  const isFrameworkAdded = (fw: Framework) =>
    project.framework?.some((pf) => Number(pf.framework_id) === Number(fw.id));

  useModalKeyHandling({
    isOpen: open,
    onClose: () => onClose(),
  });

  return (
    <StandardModal
      isOpen={open}
      onClose={onClose}
      title="AI Frameworks"
      description="Add or remove AI frameworks or regulations to your platform. Those selected will be integrated into your use case."
      maxWidth="800px"
      customFooter={
        <>
          <Box />
          <CustomizableButton
            variant="contained"
            text="Done"
            onClick={onClose}
            sx={{
              minWidth: "80px",
              height: "34px",
              backgroundColor: "brand.primary",
              "&:hover": {
                backgroundColor: "brand.primaryHover",
              },
            }}
          />
        </>
      }
    >
      <Stack spacing={6}>
        {alert && (
          <Alert
            variant={alert.variant}
            title={alert.title}
            body={alert.body}
            isToast={true}
            onClick={() => setAlert(null)}
          />
        )}
        {isLoading && <CustomizableToast title="Processing..." />}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
            alignItems: "stretch",
          }}
        >
          {frameworks.map((fw) => {
            const isAdded = isFrameworkAdded(fw);
            // Total frameworks = system frameworks + custom frameworks (from plugin events)
            const totalFrameworkCount = (project.framework?.length || 0) + customFrameworkCount;
            const onlyOneFramework = totalFrameworkCount === 1 && isAdded;
            return (
              <Box key={fw.id} sx={frameworkCardStyle}>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                  <Typography sx={frameworkCardTitleStyle}>{fw.name}</Typography>
                  {isAdded && (
                    <Box sx={frameworkAddedBadgeStyle}>
                      <CheckGreenIcon size={16} />
                      Added
                    </Box>
                  )}
                </Box>
                <Typography sx={frameworkCardDescriptionStyle}>{fw.description}</Typography>
                <Box display="flex" justifyContent="flex-end" mt={2}>
                  {isAdded ? (
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={isLoading || onlyOneFramework}
                      onClick={() => {
                        setFrameworkToRemove(fw);
                        setIsRemoveModalOpen(true);
                      }}
                      sx={{
                        minWidth: 100,
                        borderColor: "#F87171",
                        color: "#DC2626",
                        fontWeight: 600,
                        textTransform: "none",
                        "&:hover": {
                          borderColor: "#EF4444",
                          backgroundColor: "#FEF2F2",
                        },
                      }}
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      size="small"
                      disabled={isLoading}
                      onClick={() => handleAddFramework(fw)}
                      sx={{
                        minWidth: 100,
                        fontWeight: 600,
                        textTransform: "none",
                        backgroundColor: "#13715B",
                        color: "#fff",
                        "&:hover": { backgroundColor: "#0e5c47" },
                      }}
                    >
                      Add
                    </Button>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
        {/* Plugin slot for custom frameworks */}
        <PluginSlot
          id={PLUGIN_SLOTS.FRAMEWORK_SELECTION}
          slotProps={{
            project,
            isLoading,
            onFrameworkAdded: () => onFrameworksChanged?.("add"),
            onFrameworkRemoved: (frameworkId: number) =>
              onFrameworksChanged?.("remove", frameworkId),
            setAlert,
            setIsLoading,
          }}
        />
        {isRemoveModalOpen && frameworkToRemove && (
          <ConfirmationModal
            title="Confirm framework removal"
            body={
              <Typography fontSize={13}>
                Are you sure you want to remove {frameworkToRemove.name} from the project?
              </Typography>
            }
            cancelText="Cancel"
            proceedText="Remove"
            onCancel={() => {
              setIsRemoveModalOpen(false);
              setFrameworkToRemove(null);
            }}
            onProceed={handleRemoveFramework}
            proceedButtonColor="error"
            proceedButtonVariant="contained"
            TitleFontSize={0}
          />
        )}
      </Stack>
    </StandardModal>
  );
};

export default AddFrameworkModal;
