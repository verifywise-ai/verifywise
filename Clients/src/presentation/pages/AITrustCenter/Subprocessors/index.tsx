/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, Suspense, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Typography,
  TableCell,
  Stack,
  CircularProgress,
} from "@mui/material";
import Toggle from "../../../components/Inputs/Toggle";
import IconButtonComponent from "../../../components/IconButton";
import { useStyles } from "./styles";
import Field from "../../../components/Inputs/Field";
import { CustomizableButton } from "../../../components/button/customizable-button";
import StandardModal from "../../../components/Modals/StandardModal";
import { CirclePlus as AddCircleOutlineIcon } from "lucide-react";
import { useTheme } from "@mui/material/styles";
import AITrustCenterTable from "../../../components/Table/AITrustCenterTable";
import Alert from "../../../components/Alert";
import {
  useAITrustCentreOverviewQuery,
  useAITrustCentreOverviewMutation,
} from "../../../../application/hooks/useAITrustCentreOverviewQuery";
import {
  useAITrustCentreSubprocessorsQuery,
  useCreateAITrustCentreSubprocessorMutation,
  useUpdateAITrustCentreSubprocessorMutation,
  useDeleteAITrustCentreSubprocessorMutation,
} from "../../../../application/hooks/useAITrustCentreSubprocessorsQuery";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { AITrustCentreOverviewData } from "../../../../application/hooks/useAITrustCentreOverviewQuery";
import { Subprocessor } from "../../../../domain/interfaces/i.aiTrustCenter";
import { TABLE_COLUMNS, WARNING_MESSAGES } from "./constants";
import { GroupBy } from "../../../components/Table/GroupBy";
import { useTableGrouping, useGroupByState } from "../../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../../components/Table/GroupedTableView";
import { background } from "../../../themes/palette";

interface FormData {
  info?: {
    subprocessor_visible?: boolean;
  };
}

// Helper component for Subprocessor Table Row
const SubprocessorTableRow: React.FC<{
  subprocessor: Subprocessor;
  onDelete: (id: number) => void;
  onEdit: (id: number) => void;
  sortConfig?: {
    key: string;
    direction: "asc" | "desc" | null;
  };
}> = ({ subprocessor, onDelete, onEdit, sortConfig }) => {
  const theme = useTheme();
  const styles = useStyles(theme);

  const handleRowClick = () => {
    onEdit(subprocessor.id);
  };


  return (
    <>
      <TableCell
        onClick={handleRowClick}
        sx={{
          cursor: "pointer",
          textTransform: "none !important",
          backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("company name") ? "#e8e8e8" : "#fafafa",
          maxWidth: "200px",
          width: "200px",
        }}
      >
        <Typography sx={styles.tableDataCell}>{subprocessor.name}</Typography>
      </TableCell>
      <TableCell
        onClick={handleRowClick}
        sx={{
          cursor: "pointer",
          textTransform: "none !important",
          backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("url") ? `${background.surface}` : "inherit",
        }}
      >
        <Typography sx={styles.tableDataCell}>{subprocessor.url.replace(/^https?:\/\//, "")}</Typography>
      </TableCell>
      <TableCell
        onClick={handleRowClick}
        sx={{
          cursor: "pointer",
          textTransform: "none !important",
          backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("purpose") ? `${background.surface}` : "inherit",
        }}
      >
        <Typography sx={styles.tableDataCell}>
          {subprocessor.purpose}
        </Typography>
      </TableCell>
      <TableCell
        onClick={handleRowClick}
        sx={{
          cursor: "pointer",
          textTransform: "none !important",
          backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("location") ? `${background.surface}` : "inherit",
        }}
      >
        <Typography sx={styles.tableDataCell}>
          {subprocessor.location}
        </Typography>
      </TableCell>
      <TableCell
        sx={{
          backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("action") ? `${background.surface}` : "inherit",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButtonComponent
            id={subprocessor.id}
            onDelete={() => onDelete(subprocessor.id)}
            onEdit={() => onEdit(subprocessor.id)}
            onMouseEvent={() => {}}
            type=""
            warningTitle={WARNING_MESSAGES.deleteTitle}
            warningMessage={WARNING_MESSAGES.deleteMessage}
          />
        </Box>
      </TableCell>
    </>
  );
};

// Helper component for Modal Field
const ModalField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  enabled: boolean;
}> = ({ label, value, onChange, enabled }) => (
  <Field
    label={label}
    value={value}
    onChange={(e) => enabled && onChange(e.target.value)}
    sx={{ width: "100%" }}
    disabled={!enabled}
  />
);

const AITrustCenterSubprocessors: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const hasProcessedUrlParam = useRef(false);
  const {
    data: overviewData,
    isLoading: overviewLoading,
    error: overviewError,
  } = useAITrustCentreOverviewQuery();
  const updateOverviewMutation = useAITrustCentreOverviewMutation();
  const {
    data: subprocessors,
    isLoading: subprocessorsLoading,
    error: subprocessorsError,
  } = useAITrustCentreSubprocessorsQuery();
  const createSubprocessorMutation =
    useCreateAITrustCentreSubprocessorMutation();
  const updateSubprocessorMutation =
    useUpdateAITrustCentreSubprocessorMutation();
  const deleteSubprocessorMutation =
    useDeleteAITrustCentreSubprocessorMutation();
  const theme = useTheme();
  const styles = useStyles(theme);

  // GroupBy state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // State management
  const [formData, setFormData] = useState<FormData | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    purpose: "",
    url: "",
    location: "",
  });
  const [newSubprocessor, setNewSubprocessor] = useState({
    name: "",
    purpose: "",
    url: "",
    location: "",
  });

  // Success/Error states
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);
  const [addSubprocessorError, setAddSubprocessorError] = useState<
    string | null
  >(null);
  const [deleteSubprocessorError, setDeleteSubprocessorError] = useState<
    string | null
  >(null);
  const [editSubprocessorError, setEditSubprocessorError] = useState<
    string | null
  >(null);

  // Update local form data when query data changes
  React.useEffect(() => {
    if (overviewData) {
      setFormData(overviewData);
    }
  }, [overviewData]);

  // Handle subprocessorId URL param to open edit modal from Wise Search
  useEffect(() => {
    const subprocessorId = searchParams.get("subprocessorId");
    if (subprocessorId && !hasProcessedUrlParam.current && subprocessors && subprocessors.length > 0) {
      hasProcessedUrlParam.current = true;
      // Use existing handleEdit function which opens the modal
      handleEdit(parseInt(subprocessorId, 10));
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, subprocessors, setSearchParams]);

  // Handle field change and auto-save
  const handleFieldChange = (
    section: string,
    field: string,
    value: boolean | string
  ) => {
    setFormData((prev: FormData | null) => {
      if (!prev) return prev;
      const updatedData = {
        ...prev,
        [section]: {
          ...prev[section as keyof FormData],
          [field]: value,
        },
      };
      handleSave(updatedData);
      return updatedData;
    });
  };

  // Save data to server
  const handleSave = async (data?: FormData) => {
    try {
      const dataToUse = data || formData;
      if (!dataToUse) return;

      // Only send the info section with the subprocessor_visible field
      const dataToSave = {
        info: {
          subprocessor_visible: dataToUse.info?.subprocessor_visible ?? false,
        },
      } as Partial<AITrustCentreOverviewData>;

      await updateOverviewMutation.mutateAsync(dataToSave);
      handleAlert({
        variant: "success",
        body: "Subprocessors saved successfully",
        setAlert,
      });
    } catch (error) {
      console.error("Save failed:", error);
    }
  };

  // Modal handlers
  const handleOpenAddModal = () => {
    if (!formData?.info?.subprocessor_visible) return;
    setAddModalOpen(true);
    setNewSubprocessor({ name: "", purpose: "", url: "", location: "" });
    setAddSubprocessorError(null);
  };

  const handleCloseAddModal = () => {
    setAddModalOpen(false);
    setNewSubprocessor({ name: "", purpose: "", url: "", location: "" });
    setAddSubprocessorError(null);
  };

  const handleOpenEditModal = (subprocessor: Subprocessor) => {
    if (!formData?.info?.subprocessor_visible) return;
    setForm({
      name: subprocessor.name,
      purpose: subprocessor.purpose,
      url: subprocessor.url,
      location: subprocessor.location,
    });
    setEditId(subprocessor.id);
    setEditModalOpen(true);
    setEditSubprocessorError(null);
  };

  const handleCloseEditModal = () => {
    setEditModalOpen(false);
    setEditId(null);
    setForm({ name: "", purpose: "", url: "", location: "" });
    setEditSubprocessorError(null);
  };

  const handleFormChange = (field: string, value: string) => {
    if (!formData?.info?.subprocessor_visible) return;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleNewSubprocessorChange = (field: string, value: string) => {
    if (!formData?.info?.subprocessor_visible) return;
    setNewSubprocessor((prev) => ({ ...prev, [field]: value }));
  };

  // Subprocessor operations
  const handleAddSubprocessor = async () => {
    if (
      !formData?.info?.subprocessor_visible ||
      !newSubprocessor.name ||
      !newSubprocessor.purpose ||
      !newSubprocessor.url ||
      !newSubprocessor.location
    ) {
      setAddSubprocessorError("Please fill in all fields");
      return;
    }

     // Client-side validation
      if (newSubprocessor.purpose.length < 10) {
        setEditSubprocessorError("Subprocessor purpose must be at least 10 characters long");
        return;
      }

      // Validate URL (accept without http/https)
      const urlPattern = /^((https?:\/\/)?[\w-]+(\.[\w-]+)+(\/[^\s?#]*)?(\?.*)?(#.*)?)$/i;
      if (!urlPattern.test(newSubprocessor.url)) {
        setEditSubprocessorError("Subprocessor URL must be a valid URL");
        return;
      }

    try {
       // Prepend http:// if missing
        let formattedUrl = newSubprocessor.url;
        if (!/^https?:\/\//i.test(formattedUrl)) {
          formattedUrl = "http://" + formattedUrl;
        }
      await createSubprocessorMutation.mutateAsync({
        name: newSubprocessor.name,
        purpose: newSubprocessor.purpose,
        location: newSubprocessor.location,
        url: formattedUrl,
      });
      handleAlert({
        variant: "success",
        body: "Subprocessor added successfully",
        setAlert,
      });
      setAddModalOpen(false);
      setNewSubprocessor({ name: "", purpose: "", url: "", location: "" });
      setAddSubprocessorError(null);
    } catch (error: any) {
      setAddSubprocessorError(error.message || "Failed to create subprocessor");
    }
  };

  const handleEditSave = async () => {
    if (
      !formData?.info?.subprocessor_visible ||
      !editId ||
      !form.name ||
      !form.purpose ||
      !form.url ||
      !form.location
    ) {
      setEditSubprocessorError("Please fill in all fields");
      return;
    }

     // Client-side validation
      if (form.purpose.length < 10) {
        setEditSubprocessorError("Subprocessor purpose must be at least 10 characters long");
        return;
      }

       // Validate URL (accept without http/https)
      const urlPattern = /^((https?:\/\/)?[\w-]+(\.[\w-]+)+(\/[\w-]*)*(\?.*)?(#.*)?)$/i;
      if (!urlPattern.test(form.url)) {
        setEditSubprocessorError("Subprocessor URL must be a valid URL");
        return;
      }


    try {

       // Prepend http:// if missing
    let formattedUrl = form.url;
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = "http://" + formattedUrl;
    }

      await updateSubprocessorMutation.mutateAsync({
        subprocessorId: editId,
        name: form.name,
        purpose: form.purpose,
        location: form.location,
        url: formattedUrl,
      });
      handleAlert({
        variant: "success",
        body: "Subprocessor updated successfully",
        setAlert,
      });
      setEditModalOpen(false);
      setEditId(null);
      setForm({ name: "", purpose: "", url: "", location: "" });
      setEditSubprocessorError(null);
    } catch (error: any) {
      setEditSubprocessorError(
        error.message || "Failed to update subprocessor"
      );
    }
  };

  const handleEdit = (subprocessorId: number) => {
    if (!formData?.info?.subprocessor_visible || !subprocessors) return;
    const subprocessor = subprocessors.find((sp) => sp.id === subprocessorId);
    if (subprocessor) {
      handleOpenEditModal(subprocessor);
    }
  };

  const handleDelete = async (subprocessorId: number) => {
    if (!formData?.info?.subprocessor_visible || !subprocessors) return;
    try {
      await deleteSubprocessorMutation.mutateAsync(subprocessorId);
      handleAlert({
        variant: "success",
        body: "Subprocessor deleted successfully",
        setAlert,
      });
    } catch (error: any) {
      setDeleteSubprocessorError(
        error.message || "Failed to delete subprocessor"
      );
    }
  };

  // Define how to get the group key for each subprocessor
  const getSubprocessorGroupKey = useCallback((subprocessor: Subprocessor, field: string): string => {
    switch (field) {
      case 'location':
        return subprocessor.location || 'Unknown';
      case 'purpose':
        return subprocessor.purpose || 'Unknown';
      default:
        return 'Other';
    }
  }, []);

  // Apply grouping to subprocessors
  const groupedSubprocessors = useTableGrouping({
    data: subprocessors || [],
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getSubprocessorGroupKey,
  });

  // Show loading state
  if (overviewLoading || subprocessorsLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
      </Box>
    );
  }

  // Show error state
  if (overviewError || subprocessorsError) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <Typography color="error">
          {overviewError?.message ||
            subprocessorsError?.message ||
            "An error occurred"}
        </Typography>
      </Box>
    );
  }

  // Ensure subprocessors is available before rendering
  if (!subprocessors) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <Typography>No subprocessors data available</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography sx={styles.description}>
        The subprocessor section is an important part of your AI Trust Center.
        It provides transparency about third-party vendors that process or store
        data on behalf of your organization. Subprocessors are integral to
        various operations, from AI model hosting and data storage to compliance
        monitoring and analytics.
      </Typography>
      <Box sx={styles.container}>
        <Box sx={styles.subprocessorsHeader}>
          <Box sx={styles.headerControls}>
            <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <GroupBy
                options={[
                  { id: 'location', label: 'Location' },
                  { id: 'purpose', label: 'Purpose' },
                ]}
                onGroupChange={handleGroupChange}
              />
            </Box>
            <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <Box sx={styles.toggleRow}>
                <Typography
                  sx={{ ...styles.toggleLabel, cursor: "pointer" }}
                  onClick={() =>
                    handleFieldChange("info", "subprocessor_visible", !formData?.info?.subprocessor_visible)
                  }
                >
                  Visible?
                </Typography>
                <Toggle
                  checked={formData?.info?.subprocessor_visible ?? false}
                  onChange={(_, checked) =>
                    handleFieldChange("info", "subprocessor_visible", checked)
                  }
                />
              </Box>
              <CustomizableButton
                sx={styles.addButton}
                variant="contained"
                onClick={handleOpenAddModal}
                isDisabled={!formData?.info?.subprocessor_visible}
                text="Add new subprocessor"
                icon={<AddCircleOutlineIcon size={16} />}
              />
            </Box>
          </Box>
        </Box>
        <Box sx={styles.tableWrapper}>
          <GroupedTableView
            groupedData={groupedSubprocessors}
            ungroupedData={subprocessors || []}
            renderTable={(data, options) => (
              <AITrustCenterTable
                data={data}
                columns={TABLE_COLUMNS}
                isLoading={subprocessorsLoading}
                paginated={true}
                disabled={!formData?.info?.subprocessor_visible}
                emptyStateText="No subprocessors found. Add your first subprocessor to get started."
                renderRow={(subprocessor, sortConfig) => (
                  <SubprocessorTableRow
                    key={subprocessor.id}
                    subprocessor={subprocessor}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    sortConfig={sortConfig}
                  />
                )}
                tableId="subprocessors-table"
                hidePagination={options?.hidePagination}
              />
            )}
          />
        </Box>

        {/* Edit Subprocessor Modal */}
        <StandardModal
          isOpen={editModalOpen}
          onClose={handleCloseEditModal}
          title="Edit subprocessor"
          description="Update subprocessor company details"
          onSubmit={handleEditSave}
          submitButtonText="Save"
          isSubmitting={
            !formData?.info?.subprocessor_visible ||
            !form.name ||
            !form.purpose ||
            !form.url ||
            !form.location
          }
        >
          <Stack spacing={6}>
            <ModalField
              label="Company name"
              value={form.name}
              onChange={(value) => handleFormChange("name", value)}
              enabled={!!formData?.info?.subprocessor_visible}
            />
            <ModalField
              label="Purpose"
              value={form.purpose}
              onChange={(value) => handleFormChange("purpose", value)}
              enabled={!!formData?.info?.subprocessor_visible}
            />
            <ModalField
              label="URL"
              value={form.url}
              onChange={(value) => handleFormChange("url", value)}
              enabled={!!formData?.info?.subprocessor_visible}
            />
            <ModalField
              label="Location"
              value={form.location}
              onChange={(value) => handleFormChange("location", value)}
              enabled={!!formData?.info?.subprocessor_visible}
            />
          </Stack>
        </StandardModal>

        {/* Add Subprocessor Modal */}
        <StandardModal
          isOpen={addModalOpen}
          onClose={handleCloseAddModal}
          title="Add new subprocessor"
          description="Add a new subprocessor company to your AI Trust Center"
          onSubmit={handleAddSubprocessor}
          submitButtonText="Add subprocessor"
          isSubmitting={
            !formData?.info?.subprocessor_visible ||
            !newSubprocessor.name ||
            !newSubprocessor.purpose ||
            !newSubprocessor.url ||
            !newSubprocessor.location
          }
        >
          <Stack spacing={6}>
            <ModalField
              label="Company name"
              value={newSubprocessor.name}
              onChange={(value) => handleNewSubprocessorChange("name", value)}
              enabled={!!formData?.info?.subprocessor_visible}
            />
            <ModalField
              label="Purpose"
              value={newSubprocessor.purpose}
              onChange={(value) =>
                handleNewSubprocessorChange("purpose", value)
              }
              enabled={!!formData?.info?.subprocessor_visible}
            />
            <ModalField
              label="URL"
              value={newSubprocessor.url}
              onChange={(value) => handleNewSubprocessorChange("url", value)}
              enabled={!!formData?.info?.subprocessor_visible}
            />
            <ModalField
              label="Location"
              value={newSubprocessor.location}
              onChange={(value) =>
                handleNewSubprocessorChange("location", value)
              }
              enabled={!!formData?.info?.subprocessor_visible}
            />
          </Stack>
        </StandardModal>
      </Box>

      {alert && (
        <Suspense fallback={<div>Loading...</div>}>
          <Alert
            variant={alert.variant}
            title={alert.title}
            body={alert.body}
            isToast={true}
            onClick={() => setAlert(null)}
          />
        </Suspense>
      )}

      {/* Error notification for add subprocessor */}
      {addSubprocessorError && (
        <Suspense fallback={<div>Loading...</div>}>
          <Alert
            variant="error"
            body={addSubprocessorError}
            isToast={true}
            onClick={() => setAddSubprocessorError(null)}
          />
        </Suspense>
      )}

      {/* Error notification for delete subprocessor */}
      {deleteSubprocessorError && (
        <Suspense fallback={<div>Loading...</div>}>
          <Alert
            variant="error"
            body={deleteSubprocessorError}
            isToast={true}
            onClick={() => setDeleteSubprocessorError(null)}
          />
        </Suspense>
      )}

      {/* Error notification for edit subprocessor */}
      {editSubprocessorError && (
        <Suspense fallback={<div>Loading...</div>}>
          <Alert
            variant="error"
            body={editSubprocessorError}
            isToast={true}
            onClick={() => setEditSubprocessorError(null)}
          />
        </Suspense>
      )}
    </Box>
  );
};

export default AITrustCenterSubprocessors;
