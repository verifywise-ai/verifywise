import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import VWISO42001AnnexDrawerDialog from "../../../components/Drawer/AnnexDrawerDialog";
import { Project } from "../../../../domain/types/Project";
import { GetAnnexesByProjectFrameworkId } from "../../../../application/repository/annex_struct_iso.repository";
import { AnnexStructISO } from "../../../../domain/types/AnnexStructISO";
import { GetAnnexCategoriesById } from "../../../../application/repository/annexCategory_iso.repository";
import { AnnexCategoryStructISO } from "../../../../domain/types/AnnexCategoryStructISO";
import { AnnexCategoryISO } from "../../../../domain/types/AnnexCategoryISO";
import Alert from "../../../components/Alert";
import { AlertProps } from "../../../types/alert.types";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { styles } from "./styles";
import { getEntityById } from "../../../../application/repository/entity.repository";
import { StatsCard } from "../../../components/Cards/StatsCard";
import { useSearchParams } from "react-router-dom";
import { brand } from "../../../themes/palette";

const ISO42001Annex = ({
  project,
  projectFrameworkId,
  statusFilter,
  applicabilityFilter,
}: {
  project: Project;
  framework_id: number;
  projectFrameworkId: number;
  statusFilter?: string;
  applicabilityFilter?: string;
}) => {
  const [expanded, setExpanded] = useState<number | false>(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedControl, setSelectedControl] = useState<any>(null);
  const [selectedAnnex, setSelectedAnnex] = useState<any>(null);
  const [annexes, setAnnexes] = useState<AnnexStructISO[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [controlsMap, setControlsMap] = useState<{ [key: number]: any[] }>({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [flashingRowId, setFlashingRowId] = useState<number | null>(null);
  const [annexesProgress, setAnnexesProgress] = useState<{
    totalAnnexcategories: number;
    doneAnnexcategories: number;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const annexId = searchParams.get("annexId");
  const annexCategoryId = searchParams.get("annexCategoryId");

  useEffect(() => {
    const fetchClauses = async () => {
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

    fetchClauses();
  }, [projectFrameworkId, refreshTrigger]);

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

  const handleAccordionChange =
    (panel: number) => async (_: React.SyntheticEvent, isExpanded: boolean) => {
      setExpanded(isExpanded ? panel : false);

      if (isExpanded && !controlsMap[panel]) {
        await fetchControls(panel);
      }
    };

  const handleControlClick = (
    order: any,
    annex: any,
    control: any,
    index: number
  ) => {
    setSelectedOrder(order);
    setSelectedAnnex(annex);
    setSelectedControl(control);
    setSelectedIndex(index);
    setDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setSelectedControl(null);
    setSelectedAnnex(null);
    if (annexId && annexCategoryId) {
      searchParams.delete("annexId");
      searchParams.delete("annexCategoryId");
      setSearchParams(searchParams);
    }
  };

  const handleSaveSuccess = async (
    success: boolean,
    message?: string,
    savedControlId?: number
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

  useEffect(() => {
    if (annexId && annexCategoryId && annexes.length > 0) {
      const annex = annexes.find((a) => a.id === parseInt(annexId));
      async function fetchAnnexCategory() {
        try {
          const response = await getEntityById({
            routeUrl: `/iso-42001/annexCategory/byId/${annexCategoryId}?projectFrameworkId=${projectFrameworkId}`,
          });
          setSelectedAnnex({ ...response.data, id: response.data.annex_id });
          if (annex && annexCategoryId) {
            handleControlClick(
              "A",
              annex,
              { ...response.data, id: response.data.annex_id },
              parseInt(annexCategoryId)
            );
          }
        } catch (error) {
          console.error("Error fetching annex category:", error);
        }
      }
      fetchAnnexCategory();
    }
  }, [annexId, annexCategoryId, annexes]);

  return (
    <Stack className="iso-42001-annex">
      {alert && (
        <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />
      )}
      {
        <>
          <StatsCard
            completed={annexesProgress?.doneAnnexcategories ?? 0}
            total={annexesProgress?.totalAnnexcategories ?? 0}
            title="Annexes"
            progressbarColor={brand.primary}
          />
          <Typography sx={{ ...styles.title, mt: 4 }}>
            Annex A : Reference Controls (Statement of Applicability)
          </Typography>
          {annexes &&
            annexes.map((annex: AnnexStructISO) => (
              <Stack key={annex.id} sx={styles.container}>
                <Accordion
                  key={annex.id}
                  expanded={expanded === annex.id}
                  onChange={handleAccordionChange(annex.id ?? 0)}
                  sx={styles.accordion}
                >
                  <AccordionSummary sx={styles.accordionSummary}>
                    <ChevronRight
                      size={16}
                      style={styles.expandIcon(expanded === annex.id) as React.CSSProperties}
                    />
                    {annex.title}
                  </AccordionSummary>
                  <AccordionDetails sx={{ padding: 0 }}>
                    {annex.annexCategories
                      .map((control, index) => ({ control, index }))
                      .filter(({ control }) => {
                        const statusMatches = statusFilter
                          ? control.status?.toLowerCase() ===
                            statusFilter.toLowerCase()
                          : true;

                        const applicabilityMatches =
                          applicabilityFilter?.toLowerCase() === "all"
                            ? true
                            : applicabilityFilter?.toLowerCase() === "true"
                            ? control.is_applicable === true
                            : applicabilityFilter?.toLowerCase() === "false"
                            ? control.is_applicable === false
                            : true;

                        return statusMatches && applicabilityMatches;
                      })

                      .map(({ control, index }) => (
                        <Stack
                          key={control.id}
                          onClick={() =>
                            handleControlClick("A", annex, control, index)
                          }
                          sx={styles.controlRow(
                            annex.annexCategories.length - 1 === index,
                            flashingRowId === control.id
                          )}
                        >
                          <Stack>
                            <Typography sx={styles.controlTitle}>
                              {"A"}.{annex.annex_no}.{index + 1} {control.title}
                            </Typography>
                            <Typography sx={styles.controlDescription}>
                              {control.description}
                            </Typography>
                          </Stack>
                          <Stack sx={styles.statusBadge(control.status || "")}>
                            {control.status
                              ? control.status.charAt(0).toUpperCase() +
                                control.status.slice(1).toLowerCase()
                              : "Not started"}
                          </Stack>
                        </Stack>
                      ))}
                  </AccordionDetails>
                </Accordion>
              </Stack>
            ))}
        </>
      }
      {drawerOpen && (
        <VWISO42001AnnexDrawerDialog
          open={drawerOpen}
          onClose={handleDrawerClose}
          title={`${selectedOrder}.${selectedAnnex?.annex_no}.${
            selectedIndex + 1
          } ${selectedControl?.title}`}
          control={selectedControl}
          annex={selectedAnnex}
          projectFrameworkId={projectFrameworkId}
          project_id={project.id}
          onSaveSuccess={(success, message) =>
            handleSaveSuccess(success, message, selectedControl?.id)
          }
        />
      )}
    </Stack>
  );
};

export default ISO42001Annex;
