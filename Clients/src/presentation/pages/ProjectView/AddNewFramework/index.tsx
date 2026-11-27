import React, { useMemo, useRef, useState } from "react";
import { Box, Typography, Stack, Button } from "@mui/material";
import { Check as CheckGreenIcon, Shield as ShieldIcon } from "lucide-react";
import { getFrameworkBadgePath } from "../../../tools/frameworkBadge";
import StandardModal from "../../../components/Modals/StandardModal";
import SearchBox from "../../../components/Search/SearchBox";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { CustomizableButton } from "../../../components/button/customizable-button";
import {
  accent,
  background,
  brand,
  icon,
  text,
  palette as vwPalette,
  radiusPx,
} from "../../../themes/palette";
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
import CustomException from "../../../../infrastructure/exceptions/customException";
import { logEngine } from "../../../../application/tools/log.engine";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { EU_AI_ACT_ORGANIZATION_ADDED_MESSAGE } from "../../../../application/constants/frameworks";
import Alert from "../../../components/Alert";
import { AlertProps } from "../../../types/alert.types";
import CustomizableToast from "../../../components/Toast";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import { useModalKeyHandling } from "../../../../application/hooks/useModalKeyHandling";
import { useExtensions } from "../../../../application/contexts/Extensions.context";
import ImportedFrameworksSection from "./ImportedFrameworksSection";
import { matchesFrameworkSearch } from "./frameworkSearch";
// Governance OS prompt imports removed while the module is not broadly released.
// The module remains reachable by direct URL for authorized users.

interface AddFrameworkModalProps {
  open: boolean;
  onClose: () => void;
  frameworks: Framework[];
  project: Project;
  /** "removeImported" carries no framework id: imported frameworks are not in the frameworks table. */
  onFrameworksChanged?: (action: "add" | "remove" | "removeImported", frameworkId?: number) => void;
  /** Added frameworks that can't be removed now, by id, with the reason shown instead of Remove. */
  lockedFrameworks?: Record<number, string>;
}

const AddFrameworkModal: React.FC<AddFrameworkModalProps> = ({
  open,
  onClose,
  frameworks,
  project,
  onFrameworksChanged,
  lockedFrameworks,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [frameworkToRemove, setFrameworkToRemove] = useState<Framework | null>(null);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  // Height of the unfiltered list, held while searching so the centred modal
  // doesn't shrink and move the search box under the user's typing.
  const [heldHeight, setHeldHeight] = useState<number | undefined>();
  const listRef = useRef<HTMLDivElement>(null);
  const { isEnabled } = useExtensions();
  const { t } = useTranslation();

  // Start each opening with the full list (reset during render, not in an effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setSearchQuery("");
  }

  const isSearching = searchQuery.trim() !== "";

  const handleSearchChange = (value: string) => {
    if (!isSearching && value.trim() !== "") {
      setHeldHeight(listRef.current?.offsetHeight);
    }
    setSearchQuery(value);
  };

  const visibleFrameworks = useMemo(
    () => frameworks.filter((fw) => matchesFrameworkSearch(searchQuery, fw.name, fw.description)),
    [frameworks, searchQuery],
  );
  // Imported frameworks attach to use cases only, and only while the extension is on.
  const showImported = open && isEnabled("framework-import") && !project.is_organizational;

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
        if (response.data?.data?.organization_framework_added) {
          showToast("info", EU_AI_ACT_ORGANIZATION_ADDED_MESSAGE);
        } else {
          showToast("success", "Framework added successfully");
        }
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
    } catch (error) {
      logEngine({
        type: "error",
        message: "An error occurred while removing the framework.",
      });
      // A refusal (400, e.g. EU AI Act (organization) still required) says why.
      showToast(
        "error",
        error instanceof CustomException && error.status === 400
          ? error.message
          : "An unexpected error occurred. Please try again.",
      );
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
      description={
        project.is_organizational
          ? "Add or remove the AI frameworks and regulations your organization follows."
          : "Add or remove AI frameworks or regulations to your platform. Those selected will be integrated into your use case."
      }
      maxWidth="800px"
      customFooter={
        <>
          <Box />
          <CustomizableButton
            variant="contained"
            size="medium"
            text="Done"
            onClick={onClose}
            sx={{ minWidth: "80px" }}
          />
        </>
      }
    >
      <Stack
        ref={listRef}
        spacing={6}
        sx={{ minHeight: isSearching && heldHeight ? `${heldHeight}px` : undefined }}
      >
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
        <SearchBox
          placeholder={t("Search frameworks")}
          value={searchQuery}
          onChange={handleSearchChange}
          inputProps={{ "aria-label": t("Search frameworks") }}
        />
        {/* With imported frameworks shown, the section says it once both lists are empty. */}
        {isSearching && visibleFrameworks.length === 0 && !showImported && (
          <Typography sx={frameworkCardDescriptionStyle}>
            {t("No frameworks match your search.")}
          </Typography>
        )}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
            alignItems: "stretch",
          }}
        >
          {visibleFrameworks.map((fw) => {
            const isAdded = isFrameworkAdded(fw);
            const lockedReason = isAdded ? lockedFrameworks?.[Number(fw.id)] : undefined;
            const badgePath = getFrameworkBadgePath(fw.name);
            return (
              <Box key={fw.id} sx={frameworkCardStyle}>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
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
                          backgroundColor: background.surface,
                          borderRadius: radiusPx.sm,
                          flexShrink: 0,
                        }}
                      >
                        <ShieldIcon size={18} color={icon.default} />
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
                <Box display="flex" justifyContent="flex-end" mt={2}>
                  {lockedReason ? (
                    <Typography sx={frameworkCardDescriptionStyle}>{lockedReason}</Typography>
                  ) : isAdded ? (
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={isLoading}
                      onClick={() => {
                        setFrameworkToRemove(fw);
                        setIsRemoveModalOpen(true);
                      }}
                      sx={{
                        "minWidth": "100px",
                        "borderColor": vwPalette.status.error.border,
                        "color": accent.red.text,
                        "fontWeight": 600,
                        "textTransform": "none",
                        "&:hover": {
                          borderColor: vwPalette.riskMark.critical,
                          backgroundColor: accent.red.bg,
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
                        "minWidth": "100px",
                        "fontWeight": 600,
                        "textTransform": "none",
                        "backgroundColor": brand.primary,
                        "color": text.inverse,
                        "&:hover": { backgroundColor: brand.primaryHover },
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
        {showImported && (
          <ImportedFrameworksSection
            project={project}
            searchQuery={searchQuery}
            builtInMatchCount={visibleFrameworks.length}
            disabled={isLoading}
            onBusyChange={setIsLoading}
            onResult={showToast}
            onChanged={(action) => onFrameworksChanged?.(action)}
          />
        )}
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
