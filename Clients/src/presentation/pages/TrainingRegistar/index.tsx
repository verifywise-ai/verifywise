import React, {
  useState,
  useEffect,
  useCallback,
  Suspense,
  useMemo,
  useRef,
} from "react";
import { Box, Stack, Fade } from "@mui/material";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CirclePlus as AddCircleOutlineIcon } from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import { logEngine } from "../../../application/tools/log.engine";
import {
  getAllEntities,
  deleteEntityById,
  getEntityById,
  updateEntityById,
} from "../../../application/repository/entity.repository";

// Import the table and modal components specific to Training
import TrainingTable from "./trainingTable";
import NewTraining from "../../../presentation/components/Modals/NewTraining";
import { createTraining } from "../../../application/repository/trainingregistar.repository";
import { useAuth } from "../../../application/hooks/useAuth";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { SearchBox } from "../../components/Search";
import PageTour from "../../components/PageTour";
import TrainingSteps from "./TrainingSteps";
import {
  TrainingRegistarModel,
  TrainingRegistarDTO,
} from "../../../domain/models/Common/trainingRegistar/trainingRegistar.model";
import { GroupBy } from "../../components/Table/GroupBy";
import {
  useTableGrouping,
  useGroupByState,
} from "../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import { ExportMenu } from "../../components/Table/ExportMenu";
import { FilterBy, FilterColumn } from "../../components/Table/FilterBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import { ColumnSelector } from "../../components/Table/ColumnSelector";
import {
  useColumnVisibility,
  ColumnConfig,
} from "../../../application/hooks/useColumnVisibility";

const Alert = React.lazy(
  () => import("../../../presentation/components/Alert")
);

// Types (Type Safety)
type AlertVariant = "success" | "info" | "warning" | "error";

interface AlertState {
  variant: AlertVariant;
  title?: string;
  body: string;
}

// Utility: Map TrainingRegistarModel to form data DTO (DRY)
// Returns complete DTO (id is already optional in DTO definition)
const mapTrainingToFormData = (
  training: TrainingRegistarModel
): TrainingRegistarDTO => {
  return {
    training_name: training.training_name,
    duration: training.duration,
    provider: training.provider,
    department: training.department,
    status: training.status,
    numberOfPeople: training.numberOfPeople,
    description: training.description,
  };
};

// Utility: Show alert with auto-dismiss (DRY)
const createAlert = (
  variant: AlertVariant,
  body: string,
  title?: string
): AlertState => ({
  variant,
  body,
  title,
});

// Column type for Training table
type TrainingColumn =
  | "training_name"
  | "duration"
  | "provider"
  | "department"
  | "status"
  | "numberOfPeople"
  | "actions";

const TRAINING_COLUMNS: ColumnConfig<TrainingColumn>[] = [
  { key: "training_name", label: "Training name", defaultVisible: true, alwaysVisible: true },
  { key: "duration", label: "Duration", defaultVisible: true },
  { key: "provider", label: "Provider", defaultVisible: true },
  { key: "department", label: "Department", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "numberOfPeople", label: "People", defaultVisible: true },
  { key: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

const Training: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasProcessedUrlParam = useRef(false);
  const [trainingData, setTrainingData] = useState<TrainingRegistarModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewTrainingModalOpen, setIsNewTrainingModalOpen] = useState(false);
  const [selectedTrainingId, setSelectedTrainingId] = useState<string | null>(
    null
  );
  const [selectedTraining, setSelectedTraining] =
    useState<TrainingRegistarModel | null>(null);
    const [showAlert, setShowAlert] = useState(false);

  const { userRoleName } = useAuth();
  // Assuming a similar permission structure for 'training' as 'vendors'
  const isCreatingDisabled =
    !userRoleName || !["Admin", "Editor"].includes(userRoleName); // Example permission check
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");

  // Column visibility
  const { visibleColumns, allColumns, toggleColumn, resetToDefaults } =
    useColumnVisibility<TrainingColumn>({
      tableId: "training-registry-table",
      columns: TRAINING_COLUMNS,
    });

  // GroupBy state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  const fetchTrainingData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getAllEntities({ routeUrl: "/training" });
      if (response?.data) {
        setTrainingData(response.data);
      }
    } catch (error) {
      logEngine({
        type: "error",
        message: `Failed to fetch training data: ${error}`,
      });
      setAlert({
        variant: "error",
        body: "Failed to load training data. Please try again later.",
      });
      setShowAlert(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrainingData();
  }, [fetchTrainingData]);

  useEffect(() => {
    if (alert) {
      setShowAlert(true);
      const timer = setTimeout(() => {
        setShowAlert(false);
        setTimeout(() => setAlert(null), 300); // Wait for fade out animation
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  // Check for openCreateModal state from navigation
  useEffect(() => {
    const state = location.state as { openCreateModal?: boolean } | null;
    if (state?.openCreateModal) {
      setIsNewTrainingModalOpen(true);
      // Clear the state to prevent modal from opening again on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
    // Dependencies: location contains state from mega dropdown navigation, navigate used for state clearing
  }, [location, navigate]);

  // Handle trainingId URL param to open edit modal from Wise Search
  useEffect(() => {
    const trainingId = searchParams.get("trainingId");
    if (trainingId && !hasProcessedUrlParam.current && !isLoading) {
      hasProcessedUrlParam.current = true;
      // Use existing handleEditTraining pattern which fetches details and opens modal
      handleEditTraining(trainingId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, isLoading, setSearchParams]);

  const handleNewTrainingClick = () => {
    setIsNewTrainingModalOpen(true);
  };

  const handleEditTraining = (id: string) => {
    setSelectedTrainingId(id);
    setIsNewTrainingModalOpen(true);
  };
  // Fetch training data when modal opens with an ID
  useEffect(() => {
    const fetchTrainingDetails = async () => {
      if (selectedTrainingId && isNewTrainingModalOpen) {
        try {
          const response = await getEntityById({
            routeUrl: `/training/training-id/${selectedTrainingId}`,
          });
          if (response?.data) {
            setSelectedTraining(response.data);
          }
        } catch (error) {
          logEngine({
            type: "error",
            message: `Failed to fetch training details: ${error}`,
          });
          setAlert({
            variant: "error",
            body: "Failed to load training details. Please try again.",
          });
        }
      }
    };

    fetchTrainingDetails();
  }, [selectedTrainingId, isNewTrainingModalOpen]);

  const handleCloseModal = () => {
    setIsNewTrainingModalOpen(false);
    setSelectedTraining(null);
    setSelectedTrainingId(null);
  };

  // Handler: Create/Update training with proper typing and defensive programming
  // ENTERPRISE: Handle response differences between create/update APIs
  // Returns Promise<boolean>: true on success, false on failure
  // Uses DTO for data transfer (plain object), not Model (class instance)
  // Receives complete DTO after form validation (all required fields validated)
  const handleTrainingSuccess = useCallback(
    async (formData: TrainingRegistarDTO): Promise<boolean> => {
      try {
        // DEFENSIVE: formData already has numberOfPeople from model
        // Server expects numberOfPeople (controller maps it to 'people' for DB)
        let payload: TrainingRegistarModel | undefined;
        let successMessage: string;

        if (selectedTraining) {
          // Defensive: Ensure training has an ID before updating
          if (!selectedTraining.id) {
            logEngine({
              type: "error",
              message: "Cannot update training without ID",
            });
            setAlert(
              createAlert("error", "Cannot update training: Missing ID")
            );
            return false;
          }

          // Update existing training
          const res = await updateEntityById({
            routeUrl: `/training/${selectedTraining.id}`,
            body: formData,
          });
          // DEFENSIVE: updateEntityById returns AxiosResponse, extract data
          payload = res?.data;
          successMessage = "Training updated successfully!";
        } else {
          // Create new training
          // DEFENSIVE: createTraining returns response.data directly
          const created = await createTraining("/training", formData);
          payload = created;
          successMessage = "Training created successfully!";
        }

        // Defensive: Check response validity
        if (payload) {
          setAlert(createAlert("success", successMessage));
          await fetchTrainingData();
          handleCloseModal();
          return true;
        } else {
          // API returned but without data - unexpected state
          logEngine({
            type: "error",
            message: "API response missing data",
          });
          setAlert(
            createAlert(
              "error",
              selectedTraining
                ? "Failed to update training. Please try again."
                : "Failed to create training. Please try again."
            )
          );
          return false;
        }
      } catch (error) {
        logEngine({
          type: "error",
          message: `Failed to ${
            selectedTraining ? "update" : "create"
          } training: ${error}`,
        });
        setAlert(
          createAlert(
            "error",
            selectedTraining
              ? "Failed to update training. Please try again."
              : "Failed to create training. Please try again."
          )
        );
        return false;
      }
    },
    [selectedTraining, fetchTrainingData]
  );

  const handleDeleteTraining = async (id: string) => {
    try {
      await deleteEntityById({ routeUrl: `/training/${id}` });
      await fetchTrainingData();
      setAlert({
        variant: "success",
        body: "Training deleted successfully!",
      });
    } catch (error) {
      logEngine({
        type: "error",
        message: `Failed to delete training: ${error}`,
      });
      setAlert({
        variant: "error",
        body: "Failed to delete training. Please try again.",
      });
    }
  };

  // FilterBy - Dynamic options generators
  const getUniqueProviders = useCallback(() => {
    const providers = new Set<string>();
    trainingData.forEach((training) => {
      if (training.provider) {
        providers.add(training.provider);
      }
    });
    return Array.from(providers)
      .sort()
      .map((provider) => ({
        value: provider,
        label: provider,
      }));
  }, [trainingData]);

  const getUniqueDepartments = useCallback(() => {
    const departments = new Set<string>();
    trainingData.forEach((training) => {
      if (training.department) {
        departments.add(training.department);
      }
    });
    return Array.from(departments)
      .sort()
      .map((department) => ({
        value: department,
        label: department,
      }));
  }, [trainingData]);

  // FilterBy - Filter columns configuration
  const trainingFilterColumns: FilterColumn[] = useMemo(
    () => [
      {
        id: "training_name",
        label: "Training name",
        type: "text" as const,
      },
      {
        id: "status",
        label: "Status",
        type: "select" as const,
        options: [
          { value: "Planned", label: "Planned" },
          { value: "In Progress", label: "In progress" },
          { value: "Completed", label: "Completed" },
        ],
      },
      {
        id: "provider",
        label: "Provider",
        type: "select" as const,
        options: getUniqueProviders(),
      },
      {
        id: "department",
        label: "Department",
        type: "select" as const,
        options: getUniqueDepartments(),
      },
      {
        id: "duration",
        label: "Duration",
        type: "text" as const,
      },
    ],
    [getUniqueProviders, getUniqueDepartments]
  );

  // FilterBy - Field value getter
  const getTrainingFieldValue = useCallback(
    (
      item: TrainingRegistarModel,
      fieldId: string
    ): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "training_name":
          return item.training_name;
        case "status":
          return item.status;
        case "provider":
          return item.provider;
        case "department":
          return item.department;
        case "duration":
          return item.duration;
        default:
          return null;
      }
    },
    []
  );

  // FilterBy - Initialize hook
  const {
    filterData: filterTrainingData,
    handleFilterChange: handleTrainingFilterChange,
  } = useFilterBy<TrainingRegistarModel>(getTrainingFieldValue);

  // Filtered trainings using FilterBy and search
  const filteredTraining = useMemo(() => {
    // First apply FilterBy conditions
    let result = filterTrainingData(trainingData);

    // Apply search filter last
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter((training) => {
        const trainingName = training.training_name?.toLowerCase() ?? "";
        return trainingName.includes(search);
      });
    }

    return result;
  }, [filterTrainingData, trainingData, searchTerm]);

  // Define how to get the group key for each training
  const getTrainingGroupKey = (
    training: TrainingRegistarModel,
    field: string
  ): string | string[] => {
    switch (field) {
      case "status":
        return training.status || "Unknown Status";
      case "provider":
        return training.provider || "Unknown Provider";
      case "department":
        return training.department || "Unknown Department";
      default:
        return "Other";
    }
  };

  // Apply grouping to filtered training data
  const groupedTraining = useTableGrouping({
    data: filteredTraining,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getTrainingGroupKey,
  });

  // Define export columns for training table
  const exportColumns = useMemo(() => {
    return [
      { id: "training_name", label: "Training name" },
      { id: "duration", label: "Duration" },
      { id: "provider", label: "Provider" },
      { id: "department", label: "Department" },
      { id: "status", label: "Status" },
      { id: "numberOfPeople", label: "People" },
    ];
  }, []);

  // Prepare export data - format the data for export
  const exportData = useMemo(() => {
    return filteredTraining.map((training: TrainingRegistarModel) => {
      return {
        training_name: training.training_name || "-",
        duration: training.duration || "-",
        provider: training.provider || "-",
        department: training.department || "-",
        status: training.status || "-",
        numberOfPeople: training.numberOfPeople?.toString() || "-",
      };
    });
  }, [filteredTraining]);

  return (
    <PageHeaderExtended
      title="AI Training Registry"
      description="This registry lists all AI-related training programs available to your organization. You can view, add, and manage training details here."
      helpArticlePath="training/training-tracking"
      tipBoxEntity="training"
      alert={
        alert && (
        <Suspense fallback={<div>Loading...</div>}>
          <Fade
            in={showAlert}
            timeout={300}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 1000,
            }}
          >
            <Box mb={2}>
              <Alert
                variant={alert.variant}
                title={alert.title}
                body={alert.body}
                isToast={true}
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

      {/* Filter + Search row */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={4}
        sx={{ width: "100%" }}
      >
        {/* Left side: FilterBy, GroupBy, Search */}
        <Stack direction="row" spacing={2} alignItems="center">
          <FilterBy
            columns={trainingFilterColumns}
            onFilterChange={handleTrainingFilterChange}
          />

          <GroupBy
            options={[
              { id: "status", label: "Status" },
              { id: "provider", label: "Provider" },
              { id: "department", label: "Department" },
            ]}
            onGroupChange={handleGroupChange}
          />

          <ColumnSelector
            columns={allColumns}
            visibleColumns={visibleColumns}
            onToggleColumn={toggleColumn}
            onResetToDefaults={resetToDefaults}
          />

          <SearchBox
            placeholder="Search trainings..."
            value={searchTerm}
            onChange={setSearchTerm}
            inputProps={{ "aria-label": "Search trainings" }}
            fullWidth={false}
          />
        </Stack>

        {/* Right side: Export and Add Button */}
        <Stack direction="row" gap="8px" alignItems="center">
          <ExportMenu
            data={exportData}
            columns={exportColumns}
            filename="training-registry"
            title="Training Registry"
          />
          <Box data-joyride-id="add-training-button">
            <CustomizableButton
              variant="contained"
              sx={{
                backgroundColor: "brand.primary",
                border: "1px solid brand.primary",
                gap: 2,
              }}
              text="New training"
              icon={<AddCircleOutlineIcon size={16} />}
              onClick={handleNewTrainingClick}
              isDisabled={isCreatingDisabled}
            />
          </Box>
        </Stack>
      </Stack>

      {/* Table */}
      <Box sx={{ mt: 1 }}>
        <GroupedTableView
          groupedData={groupedTraining}
          ungroupedData={filteredTraining}
          renderTable={(data, options) => (
            <TrainingTable
              data={data}
              isLoading={isLoading}
              onEdit={handleEditTraining}
              onDelete={handleDeleteTraining}
              hidePagination={options?.hidePagination}
              visibleColumns={visibleColumns as Set<string>}
            />
          )}
        />
      </Box>

      {/* Modal */}
      <NewTraining
        isOpen={isNewTrainingModalOpen}
        setIsOpen={handleCloseModal}
        onSuccess={handleTrainingSuccess}
        initialData={
          selectedTraining ? mapTrainingToFormData(selectedTraining) : undefined
        }
        isEdit={!!selectedTraining}
        entityId={selectedTraining?.id ? Number(selectedTraining.id) : undefined}
      />

      <PageTour steps={TrainingSteps} run={true} tourKey="training-tour" />
    </PageHeaderExtended>
  );
};

export default Training;
