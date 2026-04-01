/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { Box, Stack, Fade } from "@mui/material";
import { CirclePlus as AddCircleOutlineIcon } from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import { SearchBox } from "../../components/Search";
import {
  getAllEntities,
  deleteEntityById,
  getEntityById,
  updateEntityById,
} from "../../../application/repository/entity.repository";
import { createDataset } from "../../../application/repository/dataset.repository";
import { logEngine } from "../../../application/tools/log.engine";
import { useAuth } from "../../../application/hooks/useAuth";
import { PluginSlot } from "../../components/PluginSlot";
import { PLUGIN_SLOTS } from "../../../domain/constants/pluginSlots";
import { IDataset, DatasetSummary as DatasetSummaryType } from "../../../domain/interfaces/i.dataset";
import { DatasetStatus, DatasetType, DataClassification } from "../../../domain/enums/dataset.enum";
import { IModelInventory } from "../../../domain/interfaces/i.modelInventory";
import { GroupBy } from "../../components/Table/GroupBy";
import { FilterBy, FilterColumn } from "../../components/Table/FilterBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import { useTableGrouping, useGroupByState } from "../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import DatasetSummary from "../ModelInventory/DatasetSummary";
import DatasetTable from "../ModelInventory/DatasetTable";
import NewDataset from "../../components/Modals/NewDataset";

const Alert = React.lazy(() => import("../../components/Alert"));

const DATASET_GROUP_BY_OPTIONS = [
  { id: "status", label: "Status" },
  { id: "type", label: "Type" },
  { id: "classification", label: "Classification" },
  { id: "owner", label: "Owner" },
];

const DATASET_FILTER_COLUMNS: FilterColumn[] = [
  {
    id: "name",
    label: "Name",
    type: "text" as const,
  },
  {
    id: "description",
    label: "Description",
    type: "text" as const,
  },
  {
    id: "status",
    label: "Status",
    type: "select" as const,
    options: [
      { value: DatasetStatus.DRAFT, label: "Draft" },
      { value: DatasetStatus.ACTIVE, label: "Active" },
      { value: DatasetStatus.DEPRECATED, label: "Deprecated" },
      { value: DatasetStatus.ARCHIVED, label: "Archived" },
    ],
  },
  {
    id: "type",
    label: "Type",
    type: "select" as const,
    options: [
      { value: DatasetType.TRAINING, label: "Training" },
      { value: DatasetType.VALIDATION, label: "Validation" },
      { value: DatasetType.TESTING, label: "Testing" },
      { value: DatasetType.PRODUCTION, label: "Production" },
      { value: DatasetType.REFERENCE, label: "Reference" },
    ],
  },
  {
    id: "classification",
    label: "Classification",
    type: "select" as const,
    options: [
      { value: DataClassification.PUBLIC, label: "Public" },
      { value: DataClassification.INTERNAL, label: "Internal" },
      { value: DataClassification.CONFIDENTIAL, label: "Confidential" },
      { value: DataClassification.RESTRICTED, label: "Restricted" },
    ],
  },
  {
    id: "owner",
    label: "Owner",
    type: "text" as const,
  },
  {
    id: "source",
    label: "Source",
    type: "text" as const,
  },
];

const Datasets: React.FC = () => {
  const [datasetData, setDatasetData] = useState<IDataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewDatasetModalOpen, setIsNewDatasetModalOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<IDataset | null>(null);
  const [deletingDatasetId, setDeletingDatasetId] = useState<string | null>(null);
  const [selectedDatasetStatus, setSelectedDatasetStatus] = useState<string | null>(null);
  const [flashDatasetRowId, setFlashDatasetRowId] = useState<number | string | null>(null);
  const [modelInventoryData, setModelInventoryData] = useState<IModelInventory[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Bulk upload modal state (bridged between button and modal PluginSlots)
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);

  const { userRoleName } = useAuth();

  // GroupBy state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();;

  // FilterBy - Field value getter
  const getDatasetFieldValue = useCallback(
    (item: IDataset, fieldId: string): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "name":
          return item.name;
        case "description":
          return item.description;
        case "status":
          return item.status;
        case "type":
          return item.type;
        case "classification":
          return item.classification;
        case "owner":
          return item.owner;
        case "source":
          return item.source;
        default:
          return null;
      }
    },
    []
  );

  // FilterBy - Initialize hook
  const { filterData: filterDatasetData, handleFilterChange: handleDatasetFilterChange } =
    useFilterBy<IDataset>(getDatasetFieldValue);

  // GroupBy - Get group key for a dataset
  const getDatasetGroupKey = useCallback((dataset: IDataset, field: string): string => {
    switch (field) {
      case "status":
        return dataset.status || "Unknown";
      case "type":
        return dataset.type || "Unknown";
      case "classification":
        return dataset.classification || "Unknown";
      case "owner":
        return dataset.owner || "Unassigned";
      default:
        return "Other";
    }
  }, []);
  const isCreatingDisabled = !userRoleName || !["Admin", "Editor"].includes(userRoleName);

  // Alert state
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const statusCardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusCardFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDatasetData = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const response = await getAllEntities({ routeUrl: "/datasets" });
      let datasetsData: IDataset[] = [];
      if (Array.isArray(response)) {
        datasetsData = response;
      } else if (response?.data && Array.isArray(response.data)) {
        datasetsData = response.data;
      } else if (response?.data) {
        datasetsData = response.data;
      }
      setDatasetData(datasetsData);
    } catch (error) {
      console.error("Error fetching datasets:", error);
      logEngine({ type: "error", message: `Failed to fetch datasets: ${error}` });
      setAlert({ variant: "error", body: "Failed to load datasets. Please try again later." });
      setShowAlert(true);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  const fetchModelInventoryData = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/modelInventory" });
      setModelInventoryData(Array.isArray(response?.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching model inventory:", error);
    }
  }, []);

  useEffect(() => {
    fetchDatasetData();
    fetchModelInventoryData();
  }, [fetchDatasetData, fetchModelInventoryData]);

  useEffect(() => {
    if (alert) {
      setShowAlert(true);
      const timer = setTimeout(() => {
        setShowAlert(false);
        setTimeout(() => setAlert(null), 300);
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  // Summary
  const datasetSummary: DatasetSummaryType = useMemo(() => ({
    draft: datasetData.filter((item) => item.status === DatasetStatus.DRAFT).length,
    active: datasetData.filter((item) => item.status === DatasetStatus.ACTIVE).length,
    deprecated: datasetData.filter((item) => item.status === DatasetStatus.DEPRECATED).length,
    archived: datasetData.filter((item) => item.status === DatasetStatus.ARCHIVED).length,
    total: datasetData.length,
  }), [datasetData]);

  // Filter datasets by FilterBy + status card + search
  const filteredDatasets = useMemo(() => {
    // Apply FilterBy conditions first
    let data = filterDatasetData(datasetData);

    if (selectedDatasetStatus) {
      const statusMap: Record<string, string> = {
        draft: DatasetStatus.DRAFT,
        active: DatasetStatus.ACTIVE,
        deprecated: DatasetStatus.DEPRECATED,
        archived: DatasetStatus.ARCHIVED,
      };
      const targetStatus = statusMap[selectedDatasetStatus];
      if (targetStatus) {
        data = data.filter((item) => item.status === targetStatus);
      }
    }

    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      data = data.filter(
        (item) =>
          item.name?.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query) ||
          item.source?.toLowerCase().includes(query) ||
          item.owner?.toLowerCase().includes(query)
      );
    }

    return data;
  }, [filterDatasetData, datasetData, selectedDatasetStatus, searchTerm]);

  // Apply grouping to filtered datasets
  const groupedDatasets = useTableGrouping({
    data: filteredDatasets,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getDatasetGroupKey,
  });

  // Handlers
  const handleNewDatasetClick = () => {
    setSelectedDataset(null);
    setIsNewDatasetModalOpen(true);
  };

  const handleCloseDatasetModal = () => {
    setIsNewDatasetModalOpen(false);
    setSelectedDataset(null);
  };

  const handleEditDataset = async (id: string) => {
    try {
      const response = await getEntityById({ routeUrl: `/datasets/${id}` });
      if (response?.data) {
        setSelectedDataset(response.data);
        setIsNewDatasetModalOpen(true);
      }
    } catch (error) {
      console.error("Error fetching dataset details:", error);
      setAlert({ variant: "error", body: "Failed to load dataset details. Please try again." });
    }
  };

  const handleDeleteDataset = async (id: string) => {
    try {
      setDeletingDatasetId(id);
      setDatasetData((prev) => prev.filter((item) => item.id?.toString() !== id));
      await deleteEntityById({ routeUrl: `/datasets/${id}` });
      await fetchDatasetData(false);
      setAlert({ variant: "success", body: "Dataset deleted successfully!" });
    } catch (error) {
      console.error("Error deleting dataset:", error);
      await fetchDatasetData(false);
      setAlert({ variant: "error", body: "Failed to delete dataset. Please try again." });
    } finally {
      setDeletingDatasetId(null);
    }
  };

  const handleDatasetSuccess = async (formData: any) => {
    try {
      let datasetId: number | null = null;
      if (selectedDataset) {
        await updateEntityById({
          routeUrl: `/datasets/${selectedDataset.id}`,
          body: formData,
        });
        datasetId = selectedDataset.id ?? null;
        setAlert({ variant: "success", body: "Dataset updated successfully!" });
      } else {
        const response = await createDataset("/datasets", formData);
        datasetId = response?.data?.id ?? null;
        setAlert({ variant: "success", body: "New dataset added successfully!" });
      }
      await fetchDatasetData();
      if (datasetId) {
        setFlashDatasetRowId(datasetId);
        setTimeout(() => setFlashDatasetRowId(null), 3000);
      }
    } catch (error) {
      handleDatasetError(error);
    }
  };

  const handleDatasetError = (error: any) => {
    console.error("Dataset operation error:", error);
    let errorMessage = selectedDataset
      ? "Failed to update dataset. Please try again."
      : "Failed to add dataset. Please try again.";

    const errorData = error?.response?.data || error?.response || (error?.status && error?.errors ? error : null);
    if (errorData) {
      if (errorData.status === "error" && Array.isArray(errorData.errors)) {
        errorMessage = errorData.errors.map((err: any) => err.message || "Validation error").join(", ");
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
    }
    setAlert({ variant: "error", body: errorMessage });
  };

  const handleDatasetStatusCardClick = useCallback((statusKey: string) => {
    if (statusCardTimerRef.current) clearTimeout(statusCardTimerRef.current);
    if (statusCardFadeTimerRef.current) clearTimeout(statusCardFadeTimerRef.current);

    if (statusKey === "total" || selectedDatasetStatus === statusKey) {
      setSelectedDatasetStatus(null);
      setAlert(null);
      setShowAlert(false);
    } else {
      setSelectedDatasetStatus(statusKey);
      const labelMap: Record<string, string> = {
        draft: "Draft",
        active: "Active",
        deprecated: "Deprecated",
        archived: "Archived",
      };
      setAlert({
        variant: "info",
        title: `Filtering by ${labelMap[statusKey]} datasets`,
        body: "Click the card again or click Total to see all datasets.",
      });
      setShowAlert(true);
      statusCardTimerRef.current = setTimeout(() => {
        setShowAlert(false);
        statusCardFadeTimerRef.current = setTimeout(() => setAlert(null), 300);
      }, 5000);
    }
  }, [selectedDatasetStatus]);

  return (
    <PageHeaderExtended
      title="Datasets"
      description="Manage training and evaluation datasets used by your models. Track data lineage, classification, and compliance metadata."
      helpArticlePath="ai-governance/datasets"
      tipBoxEntity="datasets"
      summaryCards={
        <DatasetSummary
          summary={datasetSummary}
          onCardClick={handleDatasetStatusCardClick}
          selectedStatus={selectedDatasetStatus}
        />
      }
      alert={
        alert && (
          <Suspense fallback={null}>
            <Fade in={showAlert} timeout={300}>
              <Box sx={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000 }}>
                <Alert
                  variant={alert.variant}
                  title={alert.title}
                  body={alert.body}
                  isToast
                  onClick={() => {
                    setShowAlert(false);
                    setTimeout(() => setAlert(null), 300);
                  }}
                />
              </Box>
            </Fade>
          </Suspense>
        )
      }
    >
      {/* Controls row */}
      <Stack spacing={2}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <FilterBy
              columns={DATASET_FILTER_COLUMNS}
              onFilterChange={handleDatasetFilterChange}
            />
            <GroupBy
              options={DATASET_GROUP_BY_OPTIONS}
              onGroupChange={handleGroupChange}
            />
            <SearchBox
              placeholder="Search datasets..."
              value={searchTerm}
              onChange={setSearchTerm}
              fullWidth={false}
            />
          </Stack>
          <Stack direction="row" gap="8px" alignItems="center">
            <PluginSlot
              id={PLUGIN_SLOTS.DATASETS_TOOLBAR}
              renderType="button"
              slotProps={{
                onSuccess: fetchDatasetData,
                onTriggerModal: () => setIsBulkUploadOpen(true),
              }}
            />
            <CustomizableButton
              variant="contained"
              sx={{ backgroundColor: "brand.primary", border: "1px solid brand.primary", gap: "8px" }}
              text="Add new dataset"
              icon={<AddCircleOutlineIcon size={16} />}
              onClick={handleNewDatasetClick}
              isDisabled={isCreatingDisabled}
            />
          </Stack>
        </Stack>
      </Stack>

      {/* Table */}
      <GroupedTableView
        groupedData={groupedDatasets}
        ungroupedData={filteredDatasets}
        renderTable={(data, options) => (
          <DatasetTable
            data={data}
            isLoading={isLoading}
            onEdit={handleEditDataset}
            onDelete={handleDeleteDataset}
            deletingId={deletingDatasetId}
            flashRowId={flashDatasetRowId}
            hidePagination={options?.hidePagination}
          />
        )}
      />

      {/* Plugin modals (e.g., bulk upload) */}
      <PluginSlot
        id={PLUGIN_SLOTS.DATASETS_TOOLBAR}
        renderType="modal"
        slotProps={{
          open: isBulkUploadOpen,
          onClose: () => setIsBulkUploadOpen(false),
          onSuccess: fetchDatasetData,
        }}
      />

      {/* Dataset modal */}
      <NewDataset
        isOpen={isNewDatasetModalOpen}
        setIsOpen={handleCloseDatasetModal}
        onSuccess={handleDatasetSuccess}
        onError={handleDatasetError}
        modelInventoryData={modelInventoryData}
        initialData={
          selectedDataset
            ? {
                name: selectedDataset.name || "",
                description: selectedDataset.description || "",
                version: selectedDataset.version || "",
                owner: selectedDataset.owner || "",
                type: selectedDataset.type,
                function: selectedDataset.function || "",
                source: selectedDataset.source || "",
                license: selectedDataset.license || "",
                format: selectedDataset.format || "",
                classification: selectedDataset.classification,
                contains_pii: selectedDataset.contains_pii || false,
                pii_types: selectedDataset.pii_types || "",
                status: selectedDataset.status,
                status_date: selectedDataset.status_date
                  ? new Date(selectedDataset.status_date as string).toISOString().split("T")[0]
                  : new Date().toISOString().split("T")[0],
                known_biases: selectedDataset.known_biases || "",
                bias_mitigation: selectedDataset.bias_mitigation || "",
                collection_method: selectedDataset.collection_method || "",
                preprocessing_steps: selectedDataset.preprocessing_steps || "",
                models: selectedDataset.models || [],
                projects: selectedDataset.projects || [],
              }
            : undefined
        }
        isEdit={!!selectedDataset}
        entityId={selectedDataset?.id}
      />
    </PageHeaderExtended>
  );
};

export default Datasets;
