import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Stack,
  CircularProgress,
  Alert as MuiAlert,
  useTheme,
  TableFooter,
  TablePagination,
} from "@mui/material";
import { useState, useEffect, useCallback, useMemo } from "react";
import React from "react";
import StandardModal from "../Modals/StandardModal";
import Chip from "../Chip";
import singleTheme from "../../themes/v1SingleTheme";
import {
  tableWrapper,
  paginationDropdown,
  paginationSelect,
  paginationStyle,
} from "../Table/styles";
import { EmptyState } from "../EmptyState";
import TablePaginationActions from "../TablePagination";
import { ChevronsUpDown, ShieldAlert } from "lucide-react";
import { IModelRisk, IModelRiskFormData } from "../../../domain/interfaces/i.modelRisk";
import { getAllEntities, updateEntityById } from "../../../application/repository/entity.repository";
import { User } from "../../../domain/types/User";
import NewModelRisk from "../Modals/NewModelRisk";

const SelectorVertical = (props: React.SVGAttributes<SVGSVGElement>) => (
  <ChevronsUpDown size={16} {...props} />
);

interface ModelRisksDialogProps {
  open: boolean;
  onClose: () => void;
  modelId: number;
  modelName: string;
}

const ModelRisksDialog: React.FC<ModelRisksDialogProps> = ({
  open,
  onClose,
  modelId,
  modelName,
}) => {
  const [modelRisks, setModelRisks] = useState<IModelRisk[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [selectedRisk, setSelectedRisk] = useState<IModelRisk | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const theme = useTheme();

  // Create a mapping of user IDs to user names
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((user) => {
      map.set(user.id.toString(), `${user.name} ${user.surname}`.trim());
    });
    return map;
  }, [users]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch both model risks and users in parallel
      const [risksResponse, usersResponse] = await Promise.all([
        getAllEntities({ routeUrl: "/modelRisks?filter=active" }),
        getAllEntities({ routeUrl: "/users" }),
      ]);

      // Handle risks data
      const risksData = Array.isArray(risksResponse) ? risksResponse : (risksResponse.data || []);
      const risks = risksData.filter(
        (risk: IModelRisk) => risk.model_id === modelId && !risk.is_deleted
      );
      setModelRisks(risks);

      // Handle users data
      const usersData = Array.isArray(usersResponse) ? usersResponse : (usersResponse.data || []);
      setUsers(usersData);
    } catch (err) {
      console.error("Failed to fetch model risks:", err);
      setError("Failed to load model risks");
    } finally {
      setLoading(false);
    }
  }, [modelId]);

  useEffect(() => {
    if (open && modelId) {
      setPage(0); // Reset pagination when dialog opens or model changes
      fetchData();
    }
  }, [open, modelId, fetchData]);

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleRiskClick = (risk: IModelRisk) => {
    setSelectedRisk(risk);
    setIsEditModalOpen(true);
  };

  const handleEditModalClose = () => {
    setIsEditModalOpen(false);
    setSelectedRisk(null);
  };

  const handleEditSuccess = async (formData: IModelRiskFormData) => {
    if (!selectedRisk?.id) return;

    try {
      await updateEntityById({
        routeUrl: `/modelRisks/${selectedRisk.id}`,
        body: formData,
      });
      handleEditModalClose();
      // Refresh the risks table after edit
      if (open && modelId) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to update model risk:", err);
      setError("Failed to update model risk");
    }
  };

  // Convert IModelRisk to IModelRiskFormData for the edit modal
  const selectedRiskFormData: IModelRiskFormData | undefined = selectedRisk
    ? {
        risk_name: selectedRisk.risk_name,
        risk_category: selectedRisk.risk_category,
        risk_level: selectedRisk.risk_level,
        status: selectedRisk.status,
        owner: selectedRisk.owner?.toString() || "",
        target_date: selectedRisk.target_date,
        description: selectedRisk.description,
        mitigation_plan: selectedRisk.mitigation_plan,
        impact: selectedRisk.impact,
        likelihood: selectedRisk.likelihood,
        key_metrics: selectedRisk.key_metrics,
        current_values: selectedRisk.current_values,
        threshold: selectedRisk.threshold,
        model_id: selectedRisk.model_id,
      }
    : undefined;

  return (
    <>
    <StandardModal
      isOpen={open}
      onClose={onClose}
      title={`Model risks ${modelName ? `- ${modelName}` : ""} (${modelRisks.length})`}
      description="View all risks associated with this model"
      maxWidth="900px"
      hideFooter={true}
    >
      {loading ? (
        <Stack
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            py: 4,
          }}
        >
          <CircularProgress size={40} />
        </Stack>
      ) : error ? (
        <MuiAlert severity="error" sx={{ mt: 2 }}>
          {error}
        </MuiAlert>
      ) : (
        <TableContainer>
          <Table
            sx={{
              ...singleTheme.tableStyles.primary.frame,
              ...tableWrapper(theme),
            }}
          >
            <TableHead
              sx={{
                backgroundColor:
                  singleTheme.tableStyles.primary.header.backgroundColors,
              }}
            >
              <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                <TableCell
                  style={{
                    ...singleTheme.tableStyles.primary.header.cell,
                  }}
                >
                  Risk name
                </TableCell>
                <TableCell
                  style={{
                    ...singleTheme.tableStyles.primary.header.cell,
                  }}
                >
                  Category
                </TableCell>
                <TableCell
                  style={{
                    ...singleTheme.tableStyles.primary.header.cell,
                  }}
                >
                  Risk level
                </TableCell>
                <TableCell
                  style={{
                    ...singleTheme.tableStyles.primary.header.cell,
                  }}
                >
                  Status
                </TableCell>
                <TableCell
                  style={{
                    ...singleTheme.tableStyles.primary.header.cell,
                  }}
                >
                  Owner
                </TableCell>
              </TableRow>
            </TableHead>
            {modelRisks.length > 0 ? (
              <>
                <TableBody>
                  {modelRisks
                    .slice(
                      page * rowsPerPage,
                      page * rowsPerPage + rowsPerPage
                    )
                    .map((risk) => (
                      <TableRow
                        key={risk.id}
                        sx={{
                          ...singleTheme.tableStyles.primary.body.row,
                          cursor: "pointer",
                          "&:hover": {
                            backgroundColor: "rgba(0, 0, 0, 0.04)",
                          },
                        }}
                        onClick={() => handleRiskClick(risk)}
                      >
                        <TableCell
                          sx={{
                            ...singleTheme.tableStyles.primary.body.cell,
                            maxWidth: 200,
                          }}
                        >
                          <Typography
                            variant="body2"
                            noWrap
                            title={risk.risk_name}
                          >
                            {risk.risk_name && risk.risk_name.length > 30
                              ? `${risk.risk_name.slice(0, 30)}...`
                              : risk.risk_name || "-"}
                          </Typography>
                        </TableCell>
                        <TableCell
                          sx={{
                            ...singleTheme.tableStyles.primary.body.cell,
                            maxWidth: 120,
                          }}
                        >
                          <Typography variant="body2">
                            {risk.risk_category || "-"}
                          </Typography>
                        </TableCell>
                        <TableCell
                          sx={singleTheme.tableStyles.primary.body.cell}
                        >
                          <Chip label={risk.risk_level} />
                        </TableCell>
                        <TableCell
                          sx={singleTheme.tableStyles.primary.body.cell}
                        >
                          <Chip label={risk.status} />
                        </TableCell>
                        <TableCell
                          sx={{
                            ...singleTheme.tableStyles.primary.body.cell,
                            maxWidth: 120,
                          }}
                        >
                          {(() => {
                            const ownerName = risk.owner
                              ? userMap.get(risk.owner.toString()) || "-"
                              : "-";
                            return (
                              <Typography variant="body2" noWrap title={ownerName}>
                                {ownerName.length > 15
                                  ? `${ownerName.slice(0, 15)}...`
                                  : ownerName}
                              </Typography>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
                <TableFooter>
                  <TableRow
                    sx={{
                      "& .MuiTableCell-root.MuiTableCell-footer": {
                        paddingX: theme.spacing(8),
                        paddingY: theme.spacing(4),
                      },
                    }}
                  >
                    <TablePagination
                      count={modelRisks.length}
                      page={page}
                      onPageChange={handleChangePage}
                      rowsPerPage={rowsPerPage}
                      rowsPerPageOptions={[5, 10, 15, 20, 25]}
                      onRowsPerPageChange={handleChangeRowsPerPage}
                      ActionsComponent={(props) => (
                        <TablePaginationActions {...props} />
                      )}
                      labelRowsPerPage="Risks per page"
                      labelDisplayedRows={({ page, count }) =>
                        `Page ${page + 1} of ${Math.max(
                          0,
                          Math.ceil(count / rowsPerPage)
                        )}`
                      }
                      sx={paginationStyle(theme)}
                      slotProps={{
                        select: {
                          MenuProps: {
                            keepMounted: true,
                            PaperProps: {
                              className: "pagination-dropdown",
                              sx: paginationDropdown(theme),
                            },
                            transformOrigin: {
                              vertical: "bottom",
                              horizontal: "left",
                            },
                            anchorOrigin: {
                              vertical: "top",
                              horizontal: "left",
                            },
                            sx: { mt: theme.spacing(-2) },
                          },
                          inputProps: { id: "pagination-dropdown" },
                          IconComponent: SelectorVertical,
                          sx: paginationSelect(theme),
                        },
                      }}
                    />
                  </TableRow>
                </TableFooter>
              </>
            ) : (
              <TableBody>
                <TableRow>
                  <TableCell
                    colSpan={5}
                    sx={{ border: "none", p: 0 }}
                  >
                    <EmptyState icon={ShieldAlert} message="No risks found for this model." />
                  </TableCell>
                </TableRow>
              </TableBody>
            )}
          </Table>
        </TableContainer>
      )}
    </StandardModal>

    {/* Edit Risk Modal */}
    {isEditModalOpen && selectedRisk && selectedRiskFormData && (
      <NewModelRisk
        isOpen={isEditModalOpen}
        setIsOpen={handleEditModalClose}
        initialData={selectedRiskFormData}
        isEdit={true}
        onSuccess={handleEditSuccess}
        entityId={selectedRisk?.id}
      />
    )}
  </>
  );
};

export default ModelRisksDialog;
