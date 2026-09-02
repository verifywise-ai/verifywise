import React, { useState } from "react";
import { Box, Typography, Stack, Button } from "@mui/material";
import { Check as CheckGreenIcon, Shield as ShieldIcon } from "lucide-react";
import { getFrameworkBadgePath } from "../../../tools/frameworkBadge";
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
// Governance OS prompt imports removed while the module is not broadly released.
// The module remains reachable by direct URL for authorized users.

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

        // Governance OS enable prompt is disabled while the module is not broadly
        // released. The module remains reachable by direct URL for authorized users.
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
              "minWidth": "80px",
              "height": "34px",
              "backgroundColor": "brand.primary",
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
            const badgePath = getFrameworkBadgePath(fw.name);
            return (
              <Box key={fw.id} sx={frameworkCardStyle}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    mb: 2,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                    {badgePath ? (
                      <Box
                        component="img"
                        src={badgePath}
                        alt=""
                        sx={{
                          width: 32,
                          height: 32,
                          objectFit: "contain",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#F1F3F4",
                          borderRadius: "4px",
                          flexShrink: 0,
                        }}
                      >
                        <ShieldIcon size={18} color="#666666" />
                      </Box>
                    )}
                    <Typography sx={frameworkCardTitleStyle}>{fw.name}</Typography>
                  </Box>
                  {isAdded && (
                    <Box sx={frameworkAddedBadgeStyle}>
                      <CheckGreenIcon size={16} />
                      Added
                    </Box>
                  )}
                </Box>
                <Typography sx={frameworkCardDescriptionStyle}>{fw.description}</Typography>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                    mt: 2,
                  }}
                >
                  {isAdded ? (
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={isLoading}
                      onClick={() => {
                        setFrameworkToRemove(fw);
                        setIsRemoveModalOpen(true);
                      }}
                      sx={{
                        "minWidth": 100,
                        "borderColor": "#F87171",
                        "color": "#DC2626",
                        "fontWeight": 600,
                        "textTransform": "none",
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
                        "minWidth": 100,
                        "fontWeight": 600,
                        "textTransform": "none",
                        "backgroundColor": "#13715B",
                        "color": "#fff",
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
        {isRemoveModalOpen && frameworkToRemove && (
          <ConfirmationModal
            title="Confirm framework removal"
            body={
              <Typography
                sx={{
                  fontSize: 13,
                }}
              >
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
