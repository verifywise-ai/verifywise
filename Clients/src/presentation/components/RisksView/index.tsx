import { Suspense, useCallback, useEffect, useState, useMemo } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { StatusTileCards, StatusTileItem } from "../Cards/StatusTileCards";
import RiskVisualizationTabs from "../RiskVisualization/RiskVisualizationTabs";
import RiskFilters from "../RiskVisualization/RiskFilters";
import VWProjectRisksTable from "../Table/VWProjectRisksTable";
import AddNewRiskForm from "../AddNewRiskForm";
import Popup from "../Popup";
import { handleAlert } from "../../../application/tools/alertUtils";
import Alert from "../Alert";
import { deleteEntityById } from "../../../application/repository/entity.repository";
import CustomizableToast from "../Toast";
import CustomizableSkeleton from "../Skeletons";
import useUsers from "../../../application/hooks/useUsers";
import { RiskModel } from "../../../domain/models/Common/risks/risk.model";
import { IFilterState } from "../../types/interfaces/i.filter";
import { IRiskLoadingStatus, IRisksViewProps } from "../../types/interfaces/i.risk";

const initialLoadingState: IRiskLoadingStatus = {
  loading: false,
  message: "",
};

const RisksView = ({
  fetchRisks,
  title,
  headerContent,
  refreshTrigger,
}: IRisksViewProps) => {
  const { users, loading: usersLoading } = useUsers();
  const [refreshKey, setRefreshKey] = useState(0);
  const [projectRisks, setProjectRisks] = useState<RiskModel[]>([]);
  const [selectedRow, setSelectedRow] = useState<RiskModel[]>([]);
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState<IRiskLoadingStatus>(initialLoadingState);
  const [showCustomizableSkeleton, setShowCustomizableSkeleton] = useState<boolean>(false);

  // New state for enhanced risk visualization
  const [selectedRisk, setSelectedRisk] = useState<RiskModel | null>(null);
  const [filteredRisks, setFilteredRisks] = useState<RiskModel[]>([]);
  const [activeFilters, setActiveFilters] = useState<IFilterState | null>(null);

  // Compute risk summary from fetched data
  const risksSummary = useMemo(() => {
    const veryHighRisks = projectRisks.filter((risk) => {
      const riskLevel = (risk.current_risk_level || risk.risk_level_autocalculated || "").toLowerCase();
      return riskLevel.includes("very high");
    }).length;
    const highRisks = projectRisks.filter((risk) => {
      const riskLevel = (risk.current_risk_level || risk.risk_level_autocalculated || "").toLowerCase();
      return riskLevel.includes("high") && !riskLevel.includes("very high");
    }).length;
    const mediumRisks = projectRisks.filter((risk) => {
      const riskLevel = (risk.current_risk_level || risk.risk_level_autocalculated || "").toLowerCase();
      return riskLevel.includes("medium");
    }).length;
    const lowRisks = projectRisks.filter((risk) => {
      const riskLevel = (risk.current_risk_level || risk.risk_level_autocalculated || "").toLowerCase();
      return riskLevel.includes("low") && !riskLevel.includes("very low");
    }).length;
    const veryLowRisks = projectRisks.filter((risk) => {
      const riskLevel = (risk.current_risk_level || risk.risk_level_autocalculated || "").toLowerCase();
      return riskLevel.includes("very low") || riskLevel.includes("no risk");
    }).length;

    return {
      total: veryHighRisks + highRisks + mediumRisks + lowRisks + veryLowRisks,
      veryHighRisks,
      highRisks,
      mediumRisks,
      lowRisks,
      veryLowRisks,
    };
  }, [projectRisks]);

  const fetchRisksData = useCallback(
    async (filter = "active") => {
      setShowCustomizableSkeleton(true);
      try {
        const risks = await fetchRisks(filter);
        setProjectRisks(risks);
        setFilteredRisks(risks);
      } catch (error) {
        console.error("Error fetching risks:", error);
        handleToast("error", "Unexpected error occurs while fetching risks.");
        setProjectRisks([]);
        setFilteredRisks([]);
      } finally {
        setShowCustomizableSkeleton(false);
      }
    },
    [fetchRisks]
  );

  useEffect(() => {
    fetchRisksData();
  }, [fetchRisksData, refreshKey, refreshTrigger]);

  const handleLoading = (message: string) => {
    setIsLoading((prev) => ({ ...prev, loading: true, message: message }));
  };

  const handleUpdate = () => {
    setTimeout(() => {
      setIsLoading(initialLoadingState);
      handleToast("success", "Risk updated successfully");
    }, 1000);

    fetchRisksData();
    setRefreshKey((prevKey) => prevKey + 1);
    setAnchor(null);
  };

  const handleError = (errorMessage: string) => {
    setIsLoading(initialLoadingState);
    handleToast("error", errorMessage);
  };

  const handleToast = (type: "success" | "info" | "warning" | "error", message: string) => {
    handleAlert({
      variant: type,
      body: message,
      setAlert,
    });
    setTimeout(() => {
      setAlert(null);
    }, 3000);
  };

  const handleDelete = async (riskId: number) => {
    handleLoading("Deleting the risk. Please wait...");
    try {
      const response = await deleteEntityById({
        routeUrl: `/projectRisks/${riskId}`,
      });
      if (response.status === 200) {
        const rowsPerPage = 5;
        const rowCount = projectRisks.slice(
          currentPage * rowsPerPage,
          currentPage * rowsPerPage + rowsPerPage
        );

        if (currentPage !== 0 && rowCount.length === 1) {
          setCurrentPage(currentPage - 1);
        } else {
          setCurrentPage(currentPage);
        }
        setTimeout(() => {
          setIsLoading(initialLoadingState);
          handleToast("success", "Risk deleted successfully.");
        }, 1000);

        fetchRisksData();
        setRefreshKey((prevKey) => prevKey + 1);
      } else if (response.status === 404) {
        handleToast("error", "Risk not found.");
      } else {
        handleToast("error", "Unexpected error occurs. Risk delete fails.");
      }
    } catch (error) {
      console.error("Error sending request", error);
      handleToast("error", "Risk delete fails.");
    }
  };

  const setCurrentPagingation = (page: number) => {
    setCurrentPage(page);
  };

  const handleRiskSelect = (risk: RiskModel) => {
    setSelectedRisk(risk);
  };

  const handleRiskFilterChange = (filtered: RiskModel[], filters: IFilterState) => {
    setFilteredRisks(filtered);
    setActiveFilters(filters);

    if (filters.deletionStatus !== (activeFilters?.deletionStatus || "active")) {
      fetchRisksData(filters.deletionStatus);
    }
  };

  const rowStyle = {
    gap: 10,
    mb: 10,
  };

  return (
    <Stack spacing={3}>
      {/* Optional Header Content (e.g., Framework Toggle) */}
      {headerContent}

      <Stack className="risks-view" key={refreshKey}>
        {alert && (
          <Suspense fallback={<div>Loading...</div>}>
            <Box>
              <Alert
                variant={alert.variant}
                title={alert.title}
                body={alert.body}
                isToast={true}
                onClick={() => setAlert(null)}
              />
            </Box>
          </Suspense>
        )}
        {isLoading.loading && <CustomizableToast title={isLoading.message} />}
        <Stack className="risks-row" sx={rowStyle}>
          <StatusTileCards
            items={[
              { key: "Total", label: "Total", count: risksSummary.total, color: "#4B5563" },
              { key: "Very high", label: "Very high", count: risksSummary.veryHighRisks, color: "#C63622" },
              { key: "High", label: "High", count: risksSummary.highRisks, color: "#D68B61" },
              { key: "Medium", label: "Medium", count: risksSummary.mediumRisks, color: "#D6B971" },
              { key: "Low", label: "Low", count: risksSummary.lowRisks, color: "#52AB43" },
              { key: "Very low", label: "Very low", count: risksSummary.veryLowRisks, color: "#B8D39C" },
            ] satisfies StatusTileItem[]}
            entityName="risk"
            size="small"
          />
        </Stack>
        <br />

        <Stack spacing={3}>
          {/* Risk Filters */}
          <RiskFilters risks={projectRisks} onFilterChange={handleRiskFilterChange} />

          {/* Risk Visualization Section */}
          <RiskVisualizationTabs
            risks={filteredRisks}
            selectedRisk={selectedRisk}
            onRiskSelect={handleRiskSelect}
          />
        </Stack>
        <br />
        <Stack
          className="risks-row"
          sx={{
            gap: 10,
            mb: 10,
          }}
        >
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: "text.primary" }}>
            {title}
          </Typography>

          {showCustomizableSkeleton ? (
            <CustomizableSkeleton variant="rectangular" width="100%" height={200} />
          ) : (
            <VWProjectRisksTable
              rows={projectRisks}
              setPage={setCurrentPagingation}
              page={currentPage}
              setSelectedRow={(row: RiskModel) => setSelectedRow([row])}
              setAnchor={setAnchor}
              onDeleteRisk={handleDelete}
              flashRow={null}
            />
          )}
        </Stack>

        {/* Edit Risk Popup */}
        {selectedRow.length > 0 && anchor && (
          <Popup
            popupId="edit-risk-popup"
            popupContent={
              <AddNewRiskForm
                closePopup={() => setAnchor(null)}
                popupStatus="edit"
                onSuccess={handleUpdate}
                onError={handleError}
                onLoading={handleLoading}
                users={users}
                usersLoading={usersLoading}
              />
            }
            openPopupButtonName="Edit risk"
            popupTitle="Edit project risk"
            handleOpenOrClose={() => setAnchor(null)}
            anchor={anchor}
          />
        )}
      </Stack>
    </Stack>
  );
};

export default RisksView;
