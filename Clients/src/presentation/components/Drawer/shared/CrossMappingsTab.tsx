import React from "react";
import { Box, IconButton, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import { Eye as ViewIcon, Trash2 as DeleteIcon } from "lucide-react";
import { CustomizableButton } from "../../button/customizable-button";
import { LinkedRisksPopup } from "../../LinkedRisks";
import StandardModal from "../../Modals/StandardModal";
import AddNewRiskForm from "../../AddNewRiskForm";
import { text } from "../../../themes/palette";
import { User } from "../../../../domain/types/User";
import { OnAlert } from "./types";
import { UseLinkedRisksReturn } from "./useLinkedRisks";

interface CrossMappingsTabProps {
  risks: UseLinkedRisksReturn;
  frameworkId: number;
  isOrganizational: boolean;
  users: User[];
  isEditingDisabled?: boolean;
  onAlert: OnAlert;
  onRiskUpdateSuccess?: () => void;
}

const CrossMappingsTab: React.FC<CrossMappingsTabProps> = ({
  risks,
  frameworkId,
  isOrganizational,
  users,
  isEditingDisabled,
  onAlert,
  onRiskUpdateSuccess,
}) => {
  const theme = useTheme();
  const {
    currentRisks,
    linkedRiskObjects,
    selectedRisks,
    deletedRisks,
    isLinkedRisksModalOpen,
    setIsLinkedRisksModalOpen,
    setSelectedRisks,
    setDeletedRisks,
    isRiskDetailModalOpen,
    selectedRiskForView,
    riskFormData,
    onRiskSubmitRef,
    handleViewRiskDetails,
    handleRiskDetailModalClose,
    handleUnlinkRisk,
  } = risks;

  return (
    <>
      <Stack spacing={3}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Linked risks
        </Typography>

        <Typography
          variant="body2"
          sx={{
            color: "text.tertiary",
          }}
        >
          Link risks from your risk database to track which risks are being addressed by this
          implementation.
        </Typography>

        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems: "center",
          }}
        >
          <CustomizableButton
            variant="outlined"
            onClick={() => setIsLinkedRisksModalOpen(true)}
            isDisabled={isEditingDisabled}
            text="Add/remove risks"
            size="small"
          />

          <Stack direction="row" spacing={2}>
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
              {`${currentRisks.length || 0} risks linked`}
            </Typography>
            {selectedRisks.length > 0 && (
              <Typography sx={{ fontSize: 11, color: "primary.main" }}>
                {`+${selectedRisks.length} pending save`}
              </Typography>
            )}
            {deletedRisks.length > 0 && (
              <Typography sx={{ fontSize: 11, color: "status.error.main" }}>
                {`-${deletedRisks.length} pending delete`}
              </Typography>
            )}
          </Stack>
        </Stack>

        {linkedRiskObjects.length > 0 && (
          <Stack spacing={1}>
            {linkedRiskObjects
              .filter((risk) => !deletedRisks.includes(risk.id))
              .map((risk) => (
                <Box
                  key={risk.id}
                  sx={{
                    "display": "flex",
                    "alignItems": "center",
                    "justifyContent": "space-between",
                    "padding": "10px 12px",
                    "border": `1px solid ${theme.palette.border.light}`,
                    "borderRadius": "4px",
                    "backgroundColor": "background.main",
                    "&:hover": {
                      backgroundColor: "background.accent",
                    },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "#1F2937",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {risk.risk_name}
                    </Typography>
                    {risk.risk_level && (
                      <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>
                        Risk level: {risk.risk_level}
                      </Typography>
                    )}
                  </Box>

                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Tooltip title="View details">
                      <IconButton
                        size="small"
                        onClick={() => handleViewRiskDetails(risk)}
                        sx={{
                          "color": "text.tertiary",
                          "&:hover": {
                            color: "primary.main",
                            backgroundColor: "rgba(19, 113, 91, 0.08)",
                          },
                        }}
                      >
                        <ViewIcon size={16} />
                      </IconButton>
                    </Tooltip>

                    <Tooltip title="Unlink risk">
                      <IconButton
                        size="small"
                        onClick={() => handleUnlinkRisk(risk.id)}
                        disabled={isEditingDisabled}
                        sx={{
                          "color": "text.tertiary",
                          "&:hover": {
                            color: "status.error.main",
                            backgroundColor: "rgba(211, 47, 47, 0.08)",
                          },
                        }}
                      >
                        <DeleteIcon size={16} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              ))}
          </Stack>
        )}

        {currentRisks.length === 0 && selectedRisks.length === 0 && (
          <Box
            sx={{
              textAlign: "center",
              py: 4,
              color: "text.tertiary",
              border: `2px dashed ${theme.palette.border.dark}`,
              borderRadius: 1,
              backgroundColor: "background.accent",
            }}
          >
            <Typography variant="body2" sx={{ mb: 1 }}>
              No risks linked yet
            </Typography>
            <Typography variant="caption" color={text.disabled}>
              Click "Add/remove risks" to link risks from your risk database
            </Typography>
          </Box>
        )}

        {isLinkedRisksModalOpen && (
          <LinkedRisksPopup
            onClose={() => setIsLinkedRisksModalOpen(false)}
            currentRisks={currentRisks
              .concat(selectedRisks)
              .filter((risk) => !deletedRisks.includes(risk))}
            setSelectecRisks={setSelectedRisks}
            _setDeletedRisks={setDeletedRisks}
            frameworkId={frameworkId}
            isOrganizational={isOrganizational}
          />
        )}
      </Stack>

      <StandardModal
        isOpen={isRiskDetailModalOpen && !!riskFormData}
        onClose={handleRiskDetailModalClose}
        title={`Risk: ${selectedRiskForView?.risk_name || "Risk Details"}`}
        description="View and edit risk details"
        onSubmit={() => onRiskSubmitRef.current?.()}
        submitButtonText="Update"
        maxWidth="1039px"
      >
        <AddNewRiskForm
          closePopup={handleRiskDetailModalClose}
          popupStatus="edit"
          initialRiskValues={riskFormData}
          onSuccess={() => {
            handleRiskDetailModalClose();
            onRiskUpdateSuccess?.();
          }}
          onError={(error) => {
            onAlert({
              variant: "error",
              body: error || "Failed to update risk",
            });
          }}
          users={users}
          onSubmitRef={onRiskSubmitRef}
        />
      </StandardModal>
    </>
  );
};

export default CrossMappingsTab;
