import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
} from "@mui/material";
import { getEntityById } from "../../../../../application/repository/entity.repository";
import { GetAnnexesByProjectFrameworkId } from "../../../../../application/repository/annex_struct_iso.repository";
import { useCallback, useEffect, useMemo, useState } from "react";
import { styles } from "../../ISO27001/Clause/style";
import { ArrowRight as RightArrowBlack } from "lucide-react";
import VWISO42001AnnexDrawerDialog from "../../../../components/Drawer/AnnexDrawerDialog";
import { handleAlert } from "../../../../../application/tools/alertUtils";
import { AlertProps } from "../../../../types/alert.types";
import Alert from "../../../../components/Alert";
import StatusDropdown from "../../../../components/StatusDropdown";
import { updateISO42001AnnexStatus } from "../../../../components/StatusDropdown/statusUpdateApi";
import { useAuth } from "../../../../../application/hooks/useAuth";
import allowedRoles from "../../../../../application/constants/permissions";
import { Project } from "../../../../../domain/types/Project";
import { useSearchParams } from "react-router-dom";
import { TabFilterBar } from "../../../../components/FrameworkFilter/TabFilterBar";

const ISO42001Annex = ({
  project,
  projectFrameworkId,
  statusFilter,
  applicabilityFilter,
  reviewerFilter,
  ownerFilter,
  dueDateFilter,
  initialAnnexId,
  initialAnnexCategoryId,
  searchTerm,
  onStatusChange,
  onApplicabilityChange,
  onOwnerChange,
  onReviewerChange,
  onDueDateChange,
  onSearchTermChange,
  statusOptions,
  ownerOptions,
  reviewerOptions,
}: {
  project: Project;
  projectFrameworkId: string | number;
  statusFilter?: string;
  applicabilityFilter?: string;
  ownerFilter?: string;
  reviewerFilter?: string;
  dueDateFilter?: string;
  initialAnnexId?: string | null;
  initialAnnexCategoryId?: string | null;
  searchTerm: string;
  onStatusChange?: (val: string) => void;
  onApplicabilityChange?: (val: string) => void;
  onOwnerChange?: (val: string) => void;
  onReviewerChange?: (val: string) => void;
  onDueDateChange?: (val: string) => void;
  onSearchTermChange?: (val: string) => void;
  statusOptions?: { label: string; value: string }[];
  ownerOptions?: { label: string; value: string }[];
  reviewerOptions?: { label: string; value: string }[];
}) => {
  const { userId, userRoleName } = useAuth();
  const [expanded, setExpanded] = useState<number | false>(false);
  const [, setAnnexesProgress] = useState<any>({});
  const [annexes, setAnnexes] = useState<any>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedControl, setSelectedControl] = useState<any>(null);
  const [selectedAnnex, setSelectedAnnex] = useState<any>(null);
  const [flashingRowId, setFlashingRowId] = useState<number | null>(null);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();

  const annexId = initialAnnexId;
  const annexControlId = initialAnnexCategoryId;
  const [lastProcessedLink, setLastProcessedLink] = useState<string | null>(null);

  // Shared function to filter controls based on all active filters
  const filterControls = useCallback((controls: any[]) => {
    let filtered = controls;

    // Apply status filter
    if (statusFilter && statusFilter !== "") {
      filtered = filtered.filter(
        (control: any) =>
          control.status?.toLowerCase() === statusFilter.toLowerCase(),
      );
    }

    // Apply applicability filter
    if (
      applicabilityFilter &&
      applicabilityFilter !== "all" &&
      applicabilityFilter !== ""
    ) {
      const isApplicable = applicabilityFilter === "true";
      filtered = filtered.filter(
        (control: any) => Boolean(control.is_applicable) === isApplicable,
      );
    }

    // Apply owner filter
    if (ownerFilter && ownerFilter !== "") {
      filtered = filtered.filter(
        (control: any) => control.owner?.toString() === ownerFilter,
      );
    }

    // Apply reviewer filter
    if (reviewerFilter && reviewerFilter !== "") {
      filtered = filtered.filter(
        (control: any) => control.reviewer?.toString() === reviewerFilter,
      );
    }

    // Apply due date filter
    if (dueDateFilter && dueDateFilter !== "") {
      filtered = filtered.filter((control: any) => {
        if (control.due_date) {
          const dueDate = new Date(control.due_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const filterDays = parseInt(dueDateFilter);
          return daysUntilDue >= 0 && daysUntilDue <= filterDays;
        }
        return false;
      });
    }

    return filtered;
  }, [statusFilter, applicabilityFilter, ownerFilter, reviewerFilter, dueDateFilter]);

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return !!(
      (statusFilter && statusFilter !== "") ||
      (applicabilityFilter && applicabilityFilter !== "all" && applicabilityFilter !== "") ||
      (ownerFilter && ownerFilter !== "") ||
      (reviewerFilter && reviewerFilter !== "") ||
      (dueDateFilter && dueDateFilter !== "")
    );
  }, [statusFilter, applicabilityFilter, ownerFilter, reviewerFilter, dueDateFilter]);

  // Calculate filtered controls count for all annexes
  const filteredControlsCountMemo = useMemo(() => {
    const counts: { [key: number]: number } = {};

    annexes.forEach((annex: any) => {
      const controls = annex.annexCategories || [];
      const filteredControls = filterControls(controls);
      counts[annex.id ?? 0] = filteredControls.length;
    });

    return counts;
  }, [annexes, filterControls]);

  useEffect(() => {
    const fetchAnnexes = async () => {
      try {
        const annexProgressResponse = await getEntityById({
          routeUrl: `/iso-42001/annexes/progress/${projectFrameworkId}`,
        });
        setAnnexesProgress(annexProgressResponse.data);
        const response = await GetAnnexesByProjectFrameworkId({
          routeUrl: `/iso-42001/annexes/struct/byProjectId/${projectFrameworkId}`,
        });
        setAnnexes(response.data);
      } catch (error) {
        console.error("Error fetching annexes:", error);
      }
    };
    fetchAnnexes();
  }, [projectFrameworkId, refreshTrigger]);

  useEffect(() => {
    // Use initialAnnexId/initialAnnexCategoryId props first, fallback to URL params
    if (!annexId || !annexControlId || !annexes || annexes.length === 0) return;

    const linkKey = `${annexId}-${annexControlId}`;
    if (lastProcessedLink === linkKey) return;

    const annex = annexes.find((a: any) => a.id === Number(annexId));
    if (annex) {
      handleAccordionChange(annex.id)(new Event("click") as any, true);
      const annexCategory = annex.annexCategories?.find(
        (ac: any) => ac.id === Number(annexControlId),
      );
      if (annexCategory) {
        setLastProcessedLink(linkKey);
        handleControlClick(annex, annexCategory);
      }
    }
  }, [annexId, annexes, annexControlId, lastProcessedLink]);


  const filteredAnnexes = useMemo(() => {
    if (!searchTerm.trim()) {
      return annexes;
    }
    return annexes.filter((annex: any) =>
      annex.title?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [annexes, searchTerm]);

  const handleAccordionChange =
    (panel: number) => (_: React.SyntheticEvent, isExpanded: boolean) => {
      setExpanded(isExpanded ? panel : false);
    };

  const handleControlClick = (annex: any, control: any) => {
    setSelectedAnnex(annex);
    setSelectedControl(control);
    setDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setSelectedControl(null);
    setSelectedAnnex(null);
    if (annexId && annexControlId) {
      searchParams.delete("annexId");
      searchParams.delete("annexControlId");
      searchParams.delete("framework");
      setSearchParams(searchParams);
    }
  };

  const handleSaveSuccess = async (
    success: boolean,
    message?: string,
    savedControlId?: number,
  ) => {
    handleAlert({
      variant: success ? "success" : "error",
      body:
        message ||
        (success ? "Changes saved successfully" : "Failed to save changes"),
      setAlert,
    });

    if (success && savedControlId) {
      setFlashingRowId(savedControlId);
      setTimeout(() => setFlashingRowId(null), 2000);

      setRefreshTrigger((prev) => prev + 1);
    }
  };

  const handleStatusChange = async (
    control: any,
    newStatus: string,
  ): Promise<boolean> => {
    try {
      const success = await updateISO42001AnnexStatus({
        id: control.id,
        newStatus,
        projectFrameworkId: Number(projectFrameworkId),
        userId: userId || 1,
        currentData: control,
      });

      if (success) {
        handleAlert({
          variant: "success",
          body: "Status updated successfully",
          setAlert,
        });

        setFlashingRowId(control.id);
        setTimeout(() => setFlashingRowId(null), 2000);

        setRefreshTrigger((prev) => prev + 1);
      } else {
        handleAlert({
          variant: "error",
          body: "Failed to update status",
          setAlert,
        });
      }

      return success;
    } catch (error) {
      console.error("Error updating status:", error);
      handleAlert({
        variant: "error",
        body: "Error updating status",
        setAlert,
      });
      return false;
    }
  };

  function dynamicControls(annex: any) {
    const controls = annex.annexCategories || [];

    // Use shared filtering function
    const filteredControls = filterControls(controls);

    return (
      <AccordionDetails sx={{ padding: 0 }}>
        {filteredControls.length > 0 ? (
          filteredControls.map((control: any, index: number) => (
            <Stack
              key={control.id}
              onClick={() => {
                handleControlClick(annex, control);
              }}
              sx={styles.controlRow(
                filteredControls.length - 1 === index,
                flashingRowId === control.id,
              )}
            >
              <Stack>
                <Typography sx={styles.controlTitle}>
                  {"A"}.{annex.annex_no}.{control.order_no} {control.title}
                </Typography>
                <Typography fontSize={13}>{control.description}</Typography>
              </Stack>
              <StatusDropdown
                currentStatus={control.status || "Not started"}
                onStatusChange={(newStatus) =>
                  handleStatusChange(control, newStatus)
                }
                size="small"
                allowedRoles={allowedRoles.frameworks.edit}
                userRole={userRoleName}
              />
            </Stack>
          ))
        ) : (
          <Stack sx={styles.noSubClausesContainer}>
            No matching categories
          </Stack>
        )}
      </AccordionDetails>
    );
  }

  return (
    <Stack className="iso-42001-annexes">
      {alert && (
        <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />
      )}
      <Typography sx={{ ...styles.title, mt: 4 }}>
        {"Information Security Controls"}
      </Typography>
      <TabFilterBar
        statusFilter={statusFilter}
        onStatusChange={onStatusChange}
        applicabilityFilter={applicabilityFilter}
        onApplicabilityChange={onApplicabilityChange}
        ownerFilter={ownerFilter}
        onOwnerChange={onOwnerChange}
        reviewerFilter={reviewerFilter}
        onReviewerChange={onReviewerChange}
        dueDateFilter={dueDateFilter}
        onDueDateChange={onDueDateChange}
        showStatusFilter={true}
        showApplicabilityFilter={true}
        showOwnerFilter={true}
        showReviewerFilter={true}
        showDueDateFilter={true}
        statusOptions={statusOptions}
        ownerOptions={ownerOptions}
        reviewerOptions={reviewerOptions}
        showSearchBar={true}
        searchTerm={searchTerm}
        setSearchTerm={onSearchTermChange as any}
      />
      {filteredAnnexes &&
        filteredAnnexes.map((annex: any) => {
          const count = filteredControlsCountMemo[annex.id ?? 0];
          const chipColor = count !== undefined && count > 0
            ? { bg: "#E6F4EA", color: "status.success.text" }
            : { bg: "#FFF8E1", color: "#795548" };
          return (
            <Stack key={annex.id} sx={styles.container}>
              <Accordion
                key={annex.id}
                expanded={expanded === annex.id}
                sx={styles.accordion}
                onChange={handleAccordionChange(annex.id ?? 0)}
              >
                <AccordionSummary sx={styles.accordionSummary}>
                  <RightArrowBlack size={16}
                    style={styles.expandIcon(expanded === annex.id) as React.CSSProperties}
                     />
                  <Typography sx={{ paddingLeft: "2.5px", fontSize: 13 }}>
                    {annex.arrangement} {annex.title}
                  </Typography>
                  {hasActiveFilters && count !== undefined && (
                    <Box component="span" sx={{
                      backgroundColor: chipColor.bg,
                      color: chipColor.color,
                      padding: "4px 8px",
                      borderRadius: "2px",
                      fontSize: 13,
                      fontWeight: 500,
                      ml: 4,
                    }}>
                      {count} filtered
                    </Box>
                  )}
                </AccordionSummary>
                {dynamicControls(annex)}
              </Accordion>
            </Stack>
          );
        })}
      {drawerOpen && (
        <VWISO42001AnnexDrawerDialog
          title={selectedControl?.title || ""}
          open={drawerOpen}
          onClose={(_event?: any, reason?: string) => {
            if (reason === "backdropClick") {
              return; // block closing on backdrop click
            }
            handleDrawerClose();
          }}
          annex={selectedAnnex}
          control={selectedControl}
          projectFrameworkId={Number(projectFrameworkId)}
          project_id={Number(project.id)}
          onSaveSuccess={(success, message) =>
            handleSaveSuccess(success, message, selectedControl?.id)
          }
        />
      )}
    </Stack>
  );
};

export default ISO42001Annex;
