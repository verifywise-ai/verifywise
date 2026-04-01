import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Stack,
  Typography,
  CircularProgress,
} from "@mui/material";
import { ChevronRight } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import VWISO42001ClauseDrawerDialog from "../../../components/Drawer/ClauseDrawerDialog";
import { Project } from "../../../../domain/types/Project";
import { GetClausesByProjectFrameworkId } from "../../../../application/repository/clause_struct_iso.repository";
import { GetSubClausesById } from "../../../../application/repository/subClause_iso.repository";
import { ClauseStructISO } from "../../../../domain/types/ClauseStructISO";
import { SubClauseISO } from "../../../../domain/types/SubClauseISO";
import { SubClauseStructISO } from "../../../../domain/types/SubClauseStructISO";
import Alert from "../../../components/Alert";
import { AlertProps } from "../../../types/alert.types";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { styles } from "./styles";
import { getEntityById } from "../../../../application/repository/entity.repository";
import { StatsCard } from "../../../components/Cards/StatsCard";
import { useSearchParams } from "react-router-dom";
import { brand } from "../../../themes/palette";

const ISO42001Clauses = ({
  project: _project,
  projectFrameworkId,
  statusFilter,
}: {
  project: Project;
  framework_id: number;
  projectFrameworkId: number;
  statusFilter?: string;
}) => {
  const [expanded, setExpanded] = useState<number | false>(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSubClause, setSelectedSubClause] = useState<any>(null);
  const [selectedClause, setSelectedClause] = useState<any>(null);
  const [clauses, setClauses] = useState<ClauseStructISO[]>([]);
  const [loadingSubClauses, setLoadingSubClauses] = useState<{
    [key: number]: boolean;
  }>({});
  const [subClausesMap, setSubClausesMap] = useState<{ [key: number]: any[] }>(
    {}
  );
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [flashingRowId, setFlashingRowId] = useState<number | null>(null);
  const [_selectedIndex, setSelectedIndex] = useState<number>(0);
  const [clauseProgress, setClauseProgress] = useState<{
    totalSubclauses: number;
    doneSubclauses: number;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const clauseId = searchParams.get("clauseId");
  const subClauseId = searchParams.get("subClauseId");

  const fetchClauses = useCallback(async () => {
    try {
      const clauseProgressResponse = await getEntityById({
        routeUrl: `/iso-42001/clauses/progress/${projectFrameworkId}`,
      });
      setClauseProgress(clauseProgressResponse.data);

      const response = await GetClausesByProjectFrameworkId({
        routeUrl: `/iso-42001/clauses/struct/byProjectId/${projectFrameworkId}`,
      });
      setClauses(response);
      setSubClausesMap({});
    } catch (error) {
      console.error("Error fetching clauses:", error);
      setClauses([]);
    }
  }, [projectFrameworkId]);

  useEffect(() => {
    fetchClauses();
  }, [fetchClauses, refreshTrigger]);

  const fetchSubClauses = useCallback(
    async (clauseId: number, clauseSubClausesWithStatus: any[]) => {
      setLoadingSubClauses((prev) => ({ ...prev, [clauseId]: true }));
      try {
        const response = await GetSubClausesById({
          routeUrl: `/iso-42001/subClauses/byClauseId/${clauseId}`,
        });

        const detailedSubClauses = response.data;

        const mergedSubClauses = detailedSubClauses.map((detailed: any) => {
          const match = clauseSubClausesWithStatus.find(
            (s) => s.id === detailed.id
          );
          return {
            ...detailed,
            status: match?.status ?? "Not started",
          };
        });

        setSubClausesMap((prev) => ({ ...prev, [clauseId]: mergedSubClauses }));
      } catch (error) {
        console.error("Error fetching detailed subclauses:", error);
        setSubClausesMap((prev) => ({ ...prev, [clauseId]: [] }));
      } finally {
        setLoadingSubClauses((prev) => ({ ...prev, [clauseId]: false }));
      }
    },
    []
  );

  useEffect(() => {
    if (expanded !== false && !subClausesMap[expanded]) {
      const clause = clauses.find((c) => c.id === expanded);
      if (clause) {
        fetchSubClauses(expanded, clause.subClauses);
      }
    }
  }, [clauses, expanded, fetchSubClauses, subClausesMap]);

  const handleAccordionChange =
    (panel: number) => async (_: React.SyntheticEvent, isExpanded: boolean) => {
      setExpanded(isExpanded ? panel : false);
    };

  const handleSubClauseClick = useCallback(
    (clause: any, subClause: any, index: number) => {
      setSelectedClause(clause);
      setSelectedSubClause(subClause);
      setSelectedIndex(index);
      setDrawerOpen(true);
    },
    []
  );

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setSelectedSubClause(null);
    setSelectedClause(null);
    if (clauseId && subClauseId) {
      searchParams.delete("clauseId");
      searchParams.delete("subClauseId");
      setSearchParams(searchParams);
    }
  };

  const handleSaveSuccess = async (
    success: boolean,
    message?: string,
    savedSubClauseId?: number
  ) => {
    handleAlert({
      variant: success ? "success" : "error",
      body:
        message ||
        (success ? "Changes saved successfully" : "Failed to save changes"),
      setAlert,
    });

    if (success && savedSubClauseId) {
      setFlashingRowId(savedSubClauseId);
      setTimeout(() => setFlashingRowId(null), 2000);

      setRefreshTrigger((prev) => prev + 1);
    }
  };

  function dynamicSubClauses(clause: ClauseStructISO) {
    const subClauses = subClausesMap[clause.id ?? 0] || [];
    const isLoading = loadingSubClauses[clause.id ?? 0];

    const filteredSubClauses =
      statusFilter && statusFilter !== ""
        ? subClauses.filter(
            (sc) => sc.status?.toLowerCase() === statusFilter.toLowerCase()
          )
        : subClauses;

    return (
      <AccordionDetails sx={{ padding: 0 }}>
        {isLoading ? (
          <Stack sx={styles.loadingContainer}>
            <CircularProgress size={24} />
          </Stack>
        ) : filteredSubClauses.length > 0 ? (
          filteredSubClauses.map(
            (
              subClause: Partial<SubClauseISO & SubClauseStructISO>,
              index: number
            ) => (
              <Stack
                key={subClause.id}
                onClick={() => handleSubClauseClick(clause, subClause, index)}
                sx={styles.subClauseRow(
                  filteredSubClauses.length - 1 === index,
                  flashingRowId === subClause.id
                )}
              >
                <Typography fontSize={13}>
                  {clause.clause_no + "." + (index + 1)}{" "}
                  {subClause.title ?? "Untitled"}
                </Typography>
                <Stack sx={styles.statusBadge(subClause.status ?? "")}>
                  {subClause.status
                    ? subClause.status.charAt(0).toUpperCase() +
                      subClause.status.slice(1).toLowerCase()
                    : "Not started"}
                </Stack>
              </Stack>
            )
          )
        ) : (
          <Stack sx={styles.noSubClausesContainer}>
            No matching subclauses
          </Stack>
        )}
      </AccordionDetails>
    );
  }

  useEffect(() => {
    if (clauseId && subClauseId && clauses.length > 0) {
      const clause = clauses.find((c) => c.id === parseInt(clauseId));
      async function fetchSubClause() {
        try {
          const response = await getEntityById({
            routeUrl: `/iso-42001/subClause/byId/${clauseId}?projectFrameworkId=${projectFrameworkId}`,
          });
          setSelectedSubClause({
            ...response.data,
            id: response.data.clause_id,
          });
          if (clause && clauseId) {
            handleSubClauseClick(
              clause,
              { ...response.data, id: response.data.clause_id },
              parseInt(clauseId)
            );
          }
        } catch (error) {
          console.error("Error fetching subclause:", error);
        }
      }
      fetchSubClause();
    }
  }, [clauseId, subClauseId, clauses]);

  return (
    <Stack className="iso-42001-clauses">
      {alert && (
        <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />
      )}
      <StatsCard
        completed={clauseProgress?.doneSubclauses ?? 0}
        total={clauseProgress?.totalSubclauses ?? 0}
        title="Clauses"
        progressbarColor={brand.primary}
      />
      <Typography sx={{ ...styles.title, mt: 4 }}>
        {"Management System Clauses"}
      </Typography>
      {clauses &&
        clauses.map((clause: ClauseStructISO) => (
          <Stack key={clause.id} sx={styles.container}>
            <Accordion
              key={clause.id}
              expanded={expanded === clause.id}
              sx={styles.accordion}
              onChange={handleAccordionChange(clause.id ?? 0)}
            >
              <AccordionSummary sx={styles.accordionSummary}>
                <ChevronRight
                  size={16}
                  style={
                    styles.expandIcon(
                      expanded === clause.id
                    ) as React.CSSProperties
                  }
                />
                <Typography sx={{ paddingLeft: "2.5px", fontSize: 13 }}>
                  {clause.title}
                </Typography>
              </AccordionSummary>
              {dynamicSubClauses(clause)}
            </Accordion>
          </Stack>
        ))}
      {drawerOpen && (
        <VWISO42001ClauseDrawerDialog
          open={drawerOpen}
          onClose={(_event?: any, reason?: string) => {
            if (reason === "backdropClick") {
              return; // block closing on backdrop click
            }
            handleDrawerClose();
          }}
          subclause={selectedSubClause}
          clause={selectedClause}
          projectFrameworkId={projectFrameworkId}
          onSaveSuccess={(success, message) =>
            handleSaveSuccess(success, message, selectedSubClause?.id)
          }
        />
      )}
    </Stack>
  );
};

export default ISO42001Clauses;
