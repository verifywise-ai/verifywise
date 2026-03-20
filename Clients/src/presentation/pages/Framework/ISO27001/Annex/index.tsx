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
import { styles } from "../Clause/style";
import { ArrowRight as RightArrowBlack } from "lucide-react";
import VWISO27001AnnexDrawerDialog from "../../../../components/Drawer/ISO27001AnnexDrawerDialog";
import { handleAlert } from "../../../../../application/tools/alertUtils";
import { AlertProps } from "../../../../types/alert.types";
import { AnnexCategoryISO } from "../../../../../domain/types/AnnexCategoryISO";
import { AnnexCategoryStructISO } from "../../../../../domain/types/AnnexCategoryStructISO";
import { GetAnnexCategoriesById } from "../../../../../application/repository/annexCategory_iso.repository";
import Alert from "../../../../components/Alert";
import StatusDropdown from "../../../../components/StatusDropdown";
import { updateISO27001AnnexStatus } from "../../../../components/StatusDropdown/statusUpdateApi";
import { useAuth } from "../../../../../application/hooks/useAuth";
import allowedRoles from "../../../../../application/constants/permissions";
import { Project } from "../../../../../domain/types/Project";
import { useSearchParams } from "react-router-dom";
import { TabFilterBar } from "../../../../components/FrameworkFilter/TabFilterBar";

const ISO27001Annex = ({
  project,
  projectFrameworkId,
  statusFilter,
  ownerFilter,
  reviewerFilter,
  dueDateFilter,
  applicabilityFilter,
  initialAnnexId,
  initialAnnexControlId,
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
  ownerFilter?: string;
  reviewerFilter?: string;
  dueDateFilter?: string;
  applicabilityFilter?: string;
  initialAnnexId?: string | null;
  initialAnnexControlId?: string | null;
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
  const [annexes, setAnnexes] = useState<any>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedControl, setSelectedControl] = useState<any>(null);
  const [selectedAnnex, setSelectedAnnex] = useState<any>(null);
  const [flashingRowId, setFlashingRowId] = useState<number | null>(null);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [controlsMap, setControlsMap] = useState<{ [key: number]: any[] }>({});
  const [annexTitle, setAnnexTitle] = useState<string>("");
  const [searchParams, setSearchParams] = useSearchParams();
  const annexId = initialAnnexId;
  const annexControlId = initialAnnexControlId;
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

    // Apply applicability filter
    if (
      applicabilityFilter &&
      applicabilityFilter !== "all" &&
      applicabilityFilter !== ""
    ) {
      const isApplicable = applicabilityFilter === "true";
      filtered = filtered.filter(
        (control: any) => Boolean(control.applicable) === isApplicable,
      );
    }

    return filtered;
  }, [statusFilter, ownerFilter, reviewerFilter, dueDateFilter, applicabilityFilter]);

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return !!(
      (statusFilter && statusFilter !== "") ||
      (ownerFilter && ownerFilter !== "") ||
      (reviewerFilter && reviewerFilter !== "") ||
      (dueDateFilter && dueDateFilter !== "") ||
      (applicabilityFilter && applicabilityFilter !== "all" && applicabilityFilter !== "")
    );
  }, [statusFilter, ownerFilter, reviewerFilter, dueDateFilter, applicabilityFilter]);

  // Calculate filtered controls count for all annexes
  const filteredControlsCountMemo = useMemo(() => {
    const counts: { [key: number]: number } = {};

    if (annexes) {
      annexes.forEach((annex: any) => {
        const controls = annex.annexControls || [];
        const filteredControls = filterControls(controls);
        counts[annex.id ?? 0] = filteredControls.length;
      });
    }

    return counts;
  }, [annexes, filterControls]);

  useEffect(() => {
    const fetchClauses = async () => {
      try {
        const annexProgressResponse = await getEntityById({
          routeUrl: `/iso-27001/annexes/progress/${projectFrameworkId}`,
        });
        setAnnexesProgress(annexProgressResponse.data);
        const response = await GetAnnexesByProjectFrameworkId({
          routeUrl: `/iso-27001/annexes/struct/byProjectId/${projectFrameworkId}`,
        });
        setAnnexes(response.data);
      } catch (error) {
        console.error("Error fetching annexes:", error);
      }
    };
    fetchClauses();
  }, [refreshTrigger, projectFrameworkId]);

  useEffect(() => {
    // Use initialAnnexId/initialAnnexControlId props first, fallback to URL params
    const activeAnnexId = initialAnnexId || annexId;
    const activeAnnexControlId = initialAnnexControlId || annexControlId;

    if (!activeAnnexId || !activeAnnexControlId || !annexes || annexes.length === 0) return;

    const linkKey = `${activeAnnexId}-${activeAnnexControlId}`;
    if (lastProcessedLink === linkKey) return;

    const annex = annexes.find((a: any) => a.id === Number(activeAnnexId));
    if (annex) {
      handleAccordionChange(annex.id)(new Event("click") as any, true);
      const annexControl = annex.annexControls?.find(
        (ac: any) => ac.id === Number(activeAnnexControlId),
      );
      if (annexControl) {
        setLastProcessedLink(linkKey);
        handleControlClick(annex, annexControl);
      }
    }
  }, [annexId, annexes, annexControlId, initialAnnexId, initialAnnexControlId, lastProcessedLink]);


  const filteredAnnexes = useMemo(() => {
    if (!searchTerm.trim()) {
      return annexes;
    }
    return annexes.filter((annex: any) =>
      annex.title?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [annexes, searchTerm]);

  const handleAccordionChange =
    (panel: number) => async (_: React.SyntheticEvent, isExpanded: boolean) => {
      setExpanded(isExpanded ? panel : false);

      if (isExpanded && !controlsMap[panel]) {
        await fetchControls(panel);
      }
    };

  const handleControlClick = (annex: any, control: any) => {
    setAnnexTitle(
      `${annex.arrangement}.${annex.order_no}.${control.order_no} ${control.title}`,
    );
    setSelectedAnnex(annex);
    setSelectedControl(control);
    setDrawerOpen(true);
  };

  const fetchControls = useCallback(async (annexId: number) => {
    try {
      const response = (await GetAnnexCategoriesById({
        routeUrl: `/iso-42001/annexCategories/byAnnexId/${annexId}`,
      })) as { data: Partial<AnnexCategoryISO & AnnexCategoryStructISO>[] };
      setControlsMap((prev) => ({ ...prev, [annexId]: response.data }));
    } catch (error) {
      console.error("Error fetching controls:", error);
      setControlsMap((prev) => ({ ...prev, [annexId]: [] }));
    }
  }, []);

  const handleSaveSuccess = async (
    success: boolean,
    message?: string,
    savedControlId?: number,
  ) => {
    // Show appropriate toast message
    handleAlert({
      variant: success ? "success" : "error",
      body:
        message ||
        (success ? "Changes saved successfully" : "Failed to save changes"),
      setAlert,
    });

    // If save was successful, refresh the data and trigger flash animation
    if (success && savedControlId) {
      // Set the flashing row ID
      setFlashingRowId(savedControlId);
      // Clear the flashing state after animation
      setTimeout(() => {
        setFlashingRowId(null);
      }, 2000); // 2 seconds animation

      // If there's an expanded annex, refresh its controls
      if (expanded !== false) {
        await fetchControls(expanded);
      }
      // Trigger a refresh of the annexes
      setRefreshTrigger((prev) => prev + 1);
    }
  };

  const handleStatusChange = async (
    control: any,
    newStatus: string,
  ): Promise<boolean> => {
    try {
      const success = await updateISO27001AnnexStatus({
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

        if (expanded !== false) {
          await fetchControls(expanded);
        }
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

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    if (annexId && annexControlId) {
      searchParams.delete("annex27001Id");
      searchParams.delete("annexControl27001Id");
      searchParams.delete("framework");
      setSearchParams(searchParams);
    }
  };

  return (
    <Stack className="iso-27001-annex">
      {alert && (
        <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />
      )}
      {
        <>
          <Typography sx={{ ...styles.title, mt: 4 }}>
            Annex A : Reference Controls (Statement of Applicability)
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
                    onChange={handleAccordionChange(annex.id ?? 0)}
                    sx={styles.accordion}
                  >
                    <AccordionSummary sx={styles.accordionSummary}>
                      <RightArrowBlack size={16}
                        style={styles.expandIcon(expanded === annex.id) as React.CSSProperties}
                      />
                      <Typography sx={{ paddingLeft: "2.5px", fontSize: 13 }}>
                        {annex.arrangement}.{annex.order_no} {annex.title}
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
                  <AccordionDetails sx={{ padding: 0 }}>
                    {(() => {
                      const controls = annex.annexControls || [];

                      // Use shared filtering function
                      const filteredControls = filterControls(controls);

                      return filteredControls.length > 0 ? (
                        filteredControls.map((control: any, index: number) => (
                          <Stack
                            key={control.id}
                            onClick={() => handleControlClick(annex, control)}
                            sx={styles.controlRow(
                              filteredControls.length - 1 === index,
                              flashingRowId === control.id,
                            )}
                          >
                            <Stack>
                              <Typography sx={styles.controlTitle}>
                                {annex.arrangement}.{annex.order_no}.
                                {control.order_no} {control.title}
                              </Typography>
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
                        <Stack sx={{ p: 2, textAlign: "center" }}>
                          <Typography variant="body2" color="text.secondary">
                            No matching controls
                          </Typography>
                        </Stack>
                      );
                    })()}
                  </AccordionDetails>
                </Accordion>
              </Stack>
              );
            })}
          {drawerOpen && (
            <VWISO27001AnnexDrawerDialog
              title={annexTitle}
              open={drawerOpen}
              onClose={(_event?: any, reason?: string) => {
                if (reason === "backdropClick") {
                  return; // block closing on backdrop click
                }
                handleDrawerClose();
              }}
              control={selectedControl}
              annex={selectedAnnex}
              projectFrameworkId={Number(projectFrameworkId)}
              project_id={Number(project.id)}
              onSaveSuccess={(success, message) =>
                handleSaveSuccess(success, message, selectedControl?.id)
              }
            />
          )}
        </>
      }
    </Stack>
  );
};

export default ISO27001Annex;
