import { useState, useMemo, useCallback } from "react";
import { Database } from "lucide-react";
import {
  Stack,
  Typography,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Radio,
  Tooltip,
  alpha,
} from "@mui/material";
import { EmptyState } from "../EmptyState";
import StandardModal from "../Modals/StandardModal";
import { SearchBox } from "../Search";
import {
  RiskDatabaseModalProps,
  SelectedRiskData,
  DEFAULT_VALUES,
  MODAL_CONFIG,
  TITLE_OF_COLUMNS,
  RiskData,
} from "./types";
import { mapRiskCategories, filterRisks } from "./utils";

/**
 * Reusable modal component for selecting risks from a database.
 * Supports configurable data sources, severity/likelihood mapping functions,
 * and customizable title/description.
 */
const RiskDatabaseModal = ({
  isOpen,
  setIsOpen,
  onRiskSelected,
  riskData,
  mapSeverity,
  mapLikelihood,
  title,
  description,
  databaseName,
}: RiskDatabaseModalProps) => {
  const theme = useTheme();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Memoized filtered risks for performance
  const filteredRisks = useMemo(
    () => filterRisks(riskData, search),
    [riskData, search]
  );

  // Memoized handlers for performance
  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch("");
    setSelectedId(null);
  }, [setIsOpen]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleRowClick = useCallback(
    (riskId: number) => {
      setSelectedId(selectedId === riskId ? null : riskId);
    },
    [selectedId]
  );

  const handleRadioChange = useCallback(
    (riskId: number) => {
      setSelectedId(selectedId === riskId ? null : riskId);
    },
    [selectedId]
  );

  const handleUseSelectedRisk = useCallback(() => {
    if (selectedId === null) return;

    const selectedRisk = riskData.find((risk) => risk.Id === selectedId);
    if (!selectedRisk) {
      console.error(`Risk with ID ${selectedId} not found in ${databaseName}`);
      alert("Selected risk not found. Please try again.");
      return;
    }

    try {
      const mappedRiskData: SelectedRiskData = {
        riskName: selectedRisk.Summary,
        actionOwner: DEFAULT_VALUES.ACTION_OWNER,
        aiLifecyclePhase: DEFAULT_VALUES.AI_LIFECYCLE_PHASE,
        riskDescription: selectedRisk.Description,
        riskCategory: mapRiskCategories(selectedRisk["Risk Category"]),
        potentialImpact: DEFAULT_VALUES.POTENTIAL_IMPACT,
        assessmentMapping: DEFAULT_VALUES.ASSESSMENT_MAPPING,
        controlsMapping: DEFAULT_VALUES.CONTROLS_MAPPING,
        likelihood: mapLikelihood(selectedRisk.Likelihood),
        riskSeverity: mapSeverity(selectedRisk["Risk Severity"]),
        riskLevel: DEFAULT_VALUES.RISK_LEVEL,
        reviewNotes: `Imported from ${databaseName} - Category: ${selectedRisk["Risk Category"]}`,
        applicableProjects: [],
        applicableFrameworks: [],
      };

      onRiskSelected?.(mappedRiskData);
      handleClose();
    } catch (error) {
      console.error("Error mapping risk data:", error);
      alert("Failed to process risk data. Please try again.");
    }
  }, [selectedId, riskData, databaseName, mapLikelihood, mapSeverity, onRiskSelected, handleClose]);

  // Styles using theme values
  const selectedRowBgColor = alpha(theme.palette.primary.main, 0.04);

  const truncatedTextStyle = {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      description={description}
      onSubmit={handleUseSelectedRisk}
      submitButtonText="Use selected risk and edit"
      isSubmitting={selectedId === null}
      maxWidth={`${MODAL_CONFIG.MAX_WIDTH}px`}
    >
      <Stack spacing={6}>
        <Stack direction="row" alignItems="center" gap={2}>
          <Typography
            component="label"
            htmlFor="risk-search-input"
            sx={{
              fontSize: theme.typography.body2.fontSize,
              fontWeight: 400,
              color: theme.palette.text.secondary,
              mr: 4,
              minWidth: "fit-content",
            }}
          >
            Search from the risk database:
          </Typography>
          <SearchBox
            value={search}
            onChange={handleSearchChange}
            placeholder="Search by name, category, or description..."
            inputProps={{ "aria-label": "Search risks" }}
            sx={{
              width: { xs: "100%", sm: MODAL_CONFIG.SEARCH_FIELD_WIDTH },
              maxWidth: MODAL_CONFIG.SEARCH_FIELD_WIDTH,
            }}
          />
        </Stack>
        <Stack
          sx={{
            height: MODAL_CONFIG.MAX_HEIGHT,
            minHeight: MODAL_CONFIG.MAX_HEIGHT,
            overflow: "auto",
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: theme.spacing(1),
          }}
        >
          <TableContainer>
            <Table sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  {TITLE_OF_COLUMNS.map((column) => (
                    <TableCell
                      key={column}
                      sx={{
                        fontSize: theme.typography.body2.fontSize,
                        fontWeight: 400,
                        color: theme.palette.text.secondary,
                        bgcolor: theme.palette.grey[50],
                        position: "sticky",
                        top: 0,
                        zIndex: 1,
                      }}
                    >
                      {column}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRisks.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={TITLE_OF_COLUMNS.length}
                      align="center"
                      sx={{ border: "none", p: 0 }}
                    >
                      <EmptyState icon={Database} message="No risks found in database" />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRisks.map((risk: RiskData) => (
                    <TableRow
                      key={risk.Id}
                      onClick={() => handleRowClick(risk.Id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleRowClick(risk.Id);
                        }
                      }}
                      sx={{
                        cursor: "pointer",
                        backgroundColor:
                          selectedId === risk.Id ? selectedRowBgColor : "inherit",
                        "&:hover": {
                          backgroundColor: theme.palette.action.hover,
                        },
                        "&:focus": {
                          backgroundColor: theme.palette.action.focus,
                          outline: `1px solid ${theme.palette.primary.main}`,
                          outlineOffset: -1,
                        },
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Select risk: ${risk.Summary}`}
                    >
                      <TableCell>
                        <Radio
                          checked={selectedId === risk.Id}
                          onChange={() => handleRadioChange(risk.Id)}
                          slotProps={{
                            input: {
                              "aria-label": `Select risk ${risk.Id}: ${risk.Summary}`,
                            },
                          }}
                          color="primary"
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{risk.Id}</TableCell>
                      <TableCell sx={{ maxWidth: 200 }}>
                        <span style={truncatedTextStyle}>{risk.Summary}</span>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 250 }}>
                        <Tooltip title={risk.Description} arrow placement="top-start">
                          <span style={truncatedTextStyle}>{risk.Description}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            bgcolor: theme.palette.warning.light,
                            color: theme.palette.warning.contrastText,
                            fontSize: theme.typography.caption.fontSize,
                            fontWeight: 600,
                            textAlign: "center",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {risk["Risk Severity"]}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            bgcolor: theme.palette.info.light,
                            color: theme.palette.info.contrastText,
                            fontSize: theme.typography.caption.fontSize,
                            fontWeight: 600,
                            textAlign: "center",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {risk.Likelihood}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 150 }}>
                        <span style={truncatedTextStyle}>
                          {risk["Risk Category"]}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </Stack>
    </StandardModal>
  );
};

export default RiskDatabaseModal;
