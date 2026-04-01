/**
 * This file is currently in use
 */

import {
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Box,
} from "@mui/material";
import { Dispatch, useCallback, useEffect, useState } from "react";
import { Control } from "../../../../domain/types/Control";
import { User } from "../../../../domain/types/User";
import CustomizableSkeleton from "../../../components/Skeletons";
import NewControlPane from "../../../components/Modals/Controlpane/NewControlPane";
import Alert from "../../../components/Alert";
import { StyledTableRow, AlertBox, styles } from "./styles";
import { useSearchParams } from "react-router-dom";
import useUsers from "../../../../application/hooks/useUsers";
import {
  getControlByIdAndProject,
  getControlsByControlCategoryId,
} from "../../../../application/repository/control_eu_act.repository";

interface Column {
  name: string;
}

interface ControlsTableProps {
  controlCategoryId: number;
  controlCategoryIndex: number;
  columns: Column[];
  onComplianceUpdate?: () => void;
  flashRow?: number | null;
  projectId: number;
  projectFrameworkId: number;
  statusFilter?: string;
  ownerFilter?: string;
  approverFilter?: string;
  dueDateFilter?: string;
  setFilteredControlsCount: Dispatch<React.SetStateAction<number | null>>;
}

const ControlsTable: React.FC<ControlsTableProps> = ({
  controlCategoryId,
  controlCategoryIndex,
  columns,
  onComplianceUpdate,
  projectId,
  projectFrameworkId,
  statusFilter,
  ownerFilter,
  approverFilter,
  dueDateFilter,
  setFilteredControlsCount
}) => {
  const { users } = useUsers();
  const currentProjectId = projectId;
  const [controls, setControls] = useState<Control[]>([]);
  const [selectedControl, setSelectedControl] = useState<Control | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<unknown>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [currentFlashRow, setCurrentFlashRow] = useState<number | null>(null);
  const [alert, setAlert] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const controlId = searchParams.get("controlId");

  useEffect(() => {
    const fetchControls = async () => {
      if (!currentProjectId) return;

      setLoading(true);
      try {
        const response = await getControlsByControlCategoryId({
          controlCategoryId,
          projectFrameworkId,
          owner: ownerFilter,
          approver: approverFilter,
          dueDateFilter: dueDateFilter,
        });

        const filteredControls = response.filter((control: Control) => {
          return (
            control.status?.toLowerCase() === statusFilter ||
            statusFilter === ""
          );
        });

        if (ownerFilter || approverFilter || dueDateFilter || statusFilter) {
          setFilteredControlsCount?.(filteredControls.length);
        } else {
          setFilteredControlsCount(null);
        }

        setControls(filteredControls);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchControls();
  }, [
    currentProjectId, 
    controlCategoryId, 
    projectFrameworkId, 
    refreshTrigger, 
    ownerFilter, 
    approverFilter, 
    dueDateFilter, 
    statusFilter,
    setFilteredControlsCount
  ]);

  useEffect(() => {
    if (controlId) {
      // URL param 'controlId' is the tenant table ID (controls_eu.id)
      // Find control by matching control_id (tenant table ID)
      const controlExists = controls.find(
        (control: any) => control.control_id === Number(controlId)
      );
      if (controlExists) {
        (async () => {
          // API expects struct table ID (control.id), not tenant table ID (control.control_id)
          const subControlsResponse = await getControlByIdAndProject({
            controlId: (controlExists as any).id,
            projectFrameworkId,
            owner: ownerFilter,
            approver: approverFilter,
            dueDateFilter: dueDateFilter,
          });
          setSelectedControl(subControlsResponse.data);
          setSelectedRow(Number(controlId));
          setModalOpen(true);
        })();
      }
    }
  }, [controlId, controls, loading, projectFrameworkId, ownerFilter, approverFilter, dueDateFilter]);

  // Reset state when project changes
  useEffect(() => {
    setControls([]);
    setLoading(true);
    setError(null);
    setSelectedRow(null);
    setModalOpen(false);
    setCurrentFlashRow(null);
    setAlert(null);
  }, [currentProjectId]);

  const handleRowClick = async (control: Control) => {
    const subControlsResponse = await getControlByIdAndProject({
      controlId: control.id!,
      projectFrameworkId,
      owner: ownerFilter,
      approver: approverFilter,
      dueDateFilter: dueDateFilter,
    });

    setSelectedControl(subControlsResponse.data);
    setSelectedRow(control.id!);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedRow(null);
    if (controlId) {
      searchParams.delete("controlId");
      setSearchParams(searchParams);
    }
  };

  const handleControlUpdate = () => {
    setRefreshTrigger((prev) => prev + 1);
    if (onComplianceUpdate) {
      onComplianceUpdate();
    }
  };

  const handleSaveSuccess = (control: Control) => {
    if (control.id) {
      setCurrentFlashRow(control.id);
      setAlert({
        type: "success",
        message: "Control updated successfully",
      });

      setTimeout(() => {
        setCurrentFlashRow(null);
        setAlert(null);
      }, 1000);

      handleControlUpdate();
      handleCloseModal();
    }
  };

  const handleSaveError = () => {
    setAlert({
      type: "error",
      message: "Failed to save control changes. Please try again.",
    });
    setTimeout(() => {
      setAlert(null);
    }, 1000);
    handleCloseModal();
  };

  const getProgressColor = useCallback((value: number) => {
    if (value <= 10) return "#FF4500"; // 0-10%
    if (value <= 20) return "#FF4500"; // 11-20%
    if (value <= 30) return "#FFA500"; // 21-30%
    if (value <= 40) return "#FFD700"; // 31-40%
    if (value <= 50) return "#E9F14F"; // 41-50%
    if (value <= 60) return "#CDDD24"; // 51-60%
    if (value <= 70) return "#64E730"; // 61-70%
    if (value <= 80) return "#32CD32"; // 71-80%
    if (value <= 90) return "#228B22"; // 81-90%
    return "#008000"; // 91-100%
  }, []);

  const calculateCompletionPercentage = useCallback((control: Control) => {
    if (!control.numberOfSubcontrols) return 0;
    return Math.round(
      ((control.numberOfDoneSubcontrols ?? 0) / control.numberOfSubcontrols) *
        100
    );
  }, []);

  const getOwnerName = (ownerId: number | undefined) => {
    if (!ownerId) return "Not set";
    const owner = users?.find((user: User) => user.id === ownerId);
    return owner ? `${owner.name} ${owner.surname}` : "Not set";
  };

  if (loading) {
    return (
      <Stack spacing={2}>
        <CustomizableSkeleton variant="rectangular" width="100%" height={36} />
        <CustomizableSkeleton variant="rectangular" width="100%" height={36} />
        <CustomizableSkeleton variant="rectangular" width="100%" height={36} />
      </Stack>
    );
  }

  if (error) {
    return <div>Error loading controls</div>;
  }

  return (
    <>
      {alert && (
        <AlertBox>
          <Alert
            variant={alert.type}
            body={alert.message}
            isToast={true}
            onClick={() => setAlert(null)}
            sx={styles.alert}
          />
        </AlertBox>
      )}
      <TableContainer className="controls-table-container">
        <Table className="controls-table">
          <TableHead sx={styles.tableHead}>
            <TableRow>
              {columns.map((col: Column, index: number) => (
                <TableCell key={index} sx={styles.headerCell}>
                  {col.name}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {controls.length === 0 && (
              <StyledTableRow isflashing={0}>
                <TableCell
                  sx={styles.descriptionCell}
                  colSpan={columns.length}
                >
                  <Typography
                    sx={{ 
                      textAlign: "center", 
                      display: "block", 
                      color: "#666", 
                      fontSize: "13px",
                      textTransform: "none"
                    }}
                  >
                    No controls found for the selected filters.
                  </Typography>
                </TableCell>
              </StyledTableRow>
            )}
            {controls
              .sort((a, b) => (a.order_no ?? 0) - (b.order_no ?? 0))
              .map((control: Control) => {
                const completionPercentage =
                  calculateCompletionPercentage(control);
                return (
                  <StyledTableRow
                    key={control.id}
                    onClick={() =>
                      control.id !== undefined && handleRowClick(control)
                    }
                    isflashing={currentFlashRow === control.id ? 1 : 0}
                  >
                    <TableCell
                      sx={styles.descriptionCell}
                      key={`${controlCategoryId}-${control.id}`}
                    >
                      <Typography component="span" variant="body2">
                        {controlCategoryIndex}.{`${control.order_no}`}{" "}
                        {control.title}{" "}
                        <Typography
                          component="span"
                          sx={{ color: "grey", fontSize: "13px" }}
                        >
                          {`(${control.description})`}
                        </Typography>
                      </Typography>
                    </TableCell>
                    <TableCell sx={styles.cell} key={`owner-${control.id}`}>
                      <Typography component="span" variant="body2">
                        {getOwnerName(control.owner)}
                      </Typography>
                    </TableCell>
                    <TableCell
                      sx={styles.cell}
                      key={`noOfSubControls-${control.id}`}
                    >
                      <Typography component="span" variant="body2">
                        {`${control.numberOfSubcontrols} Subcontrols`}
                      </Typography>
                    </TableCell>
                    <TableCell
                      sx={styles.cell}
                      key={`completion-${control.id}`}
                    >
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: "100%", mr: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={completionPercentage}
                            sx={{
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: "status.default.border",
                              "& .MuiLinearProgress-bar": {
                                backgroundColor:
                                  getProgressColor(completionPercentage),
                              },
                            }}
                          />
                        </Box>
                        <Typography component="span" variant="body2">
                          {`${completionPercentage}%`}
                        </Typography>
                      </Stack>
                    </TableCell>
                  </StyledTableRow>
                );
              })}
          </TableBody>
        </Table>
      </TableContainer>
      {modalOpen && selectedRow !== null && (
        <NewControlPane
          data={selectedControl!}
          isOpen={modalOpen}
          handleClose={handleCloseModal}
          OnSave={handleSaveSuccess}
          OnError={handleSaveError}
          controlCategoryId={controlCategoryIndex?.toString()}
          onComplianceUpdate={onComplianceUpdate}
          projectId={currentProjectId}
        />
      )}
    </>
  );
};

export default ControlsTable;
