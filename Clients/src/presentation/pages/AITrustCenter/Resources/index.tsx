/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, Suspense, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Typography,
  TableCell,
  CircularProgress,
  Stack,
  Tooltip,
} from "@mui/material";
import Alert from "../../../components/Alert";
import { Eye as VisibilityIcon, EyeOff as VisibilityOffIcon } from "lucide-react";
import { CirclePlus as AddCircleOutlineIcon } from "lucide-react";
import Toggle from "../../../components/Inputs/Toggle";
import { useStyles } from "./styles";
import { CustomizableButton } from "../../../components/button/customizable-button";
import IconButtonComponent from "../../../components/IconButton";
import Field from "../../../components/Inputs/Field";
import StandardModal from "../../../components/Modals/StandardModal";
import FileManagerUploadModal from "../../../components/Modals/FileManagerUpload";
import {
  useAITrustCentreOverviewQuery,
  useAITrustCentreOverviewMutation,
} from "../../../../application/hooks/useAITrustCentreOverviewQuery";
import {
  useAITrustCentreResourcesQuery,
  useCreateAITrustCentreResourceMutation,
  useUpdateAITrustCentreResourceMutation,
  useDeleteAITrustCentreResourceMutation,
} from "../../../../application/hooks/useAITrustCentreResourcesQuery";
import { handleDownload as downloadFile } from "../../../../application/tools/fileDownload";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { TABLE_COLUMNS, WARNING_MESSAGES } from "./constants";
import { AITrustCentreOverviewData } from "../../../../application/hooks/useAITrustCentreOverview";
import { useTheme } from "@mui/material/styles";
import AITrustCenterTable from "../../../components/Table/AITrustCenterTable";
import { Resource } from "../../../../domain/interfaces/i.aiTrustCenter";
import { GroupBy } from "../../../components/Table/GroupBy";
import { useTableGrouping, useGroupByState } from "../../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../../components/Table/GroupedTableView";
import singleTheme from "../../../themes/v1SingleTheme";
import { text, background, border as borderPalette } from "../../../themes/palette";

// Helper component for Resource Table Row
const ResourceTableRow: React.FC<{
  resource: Resource;
  onDelete: (id: number) => void;
  onEdit: (id: number) => void;
  onMakeVisible: (id: number) => void;
  onDownload: (id: number) => void;
  sortConfig?: {
    key: string;
    direction: "asc" | "desc" | null;
  };
}> = ({
  resource,
  onDelete,
  onEdit,
  onMakeVisible,
  onDownload,
  sortConfig,
}) => {
  const theme = useTheme();
  const styles = useStyles(theme);

  const handleRowClick = () => {
    if (resource.visible) {
      onEdit(resource.id);
    }
  };

  return (
    <>
      <TableCell
        onClick={handleRowClick}
        sx={{
          cursor: resource.visible ? "pointer" : "default",
          textTransform: "none !important",
          opacity: resource.visible ? 1 : 0.5,
          backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("resource name") ? singleTheme.tableColors.sortedColumnFirst : "transparent",
        }}
      >
        <Typography sx={styles.resourceName}>{resource.name}</Typography>
      </TableCell>
      <TableCell
        onClick={handleRowClick}
        sx={{
          cursor: resource.visible ? "pointer" : "default",
          textTransform: "none !important",
          opacity: resource.visible ? 1 : 0.5,
          backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("type") && sortConfig.key.toLowerCase().includes("purpose") ? singleTheme.tableColors.sortedColumn : "transparent",
        }}
      >
        <Typography sx={styles.resourceType}>{resource.description}</Typography>
      </TableCell>
      <TableCell
        onClick={() => onMakeVisible(resource.id)}
        sx={{
          cursor: resource.visible ? "pointer" : "default",
          textTransform: "none !important",
          opacity: resource.visible ? 1 : 0.5,
          backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("visibility") ? singleTheme.tableColors.sortedColumn : "transparent",
        }}
      >
        {resource.visible ? (
          <Tooltip title="Click to make this resource invisible">
            <Box component="span" sx={{ display: "inline-flex" }}>
              <VisibilityIcon size={20} />
            </Box>
          </Tooltip>
        ) : (
          <Tooltip title="Click to make this resource visible">
            <Box component="span" sx={{ display: "inline-flex" }}>
              <VisibilityOffIcon size={20} />
            </Box>
          </Tooltip>
        )}
      </TableCell>
      <TableCell
        sx={{
          backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("action") ? singleTheme.tableColors.sortedColumn : "transparent",
        }}
      >
        <IconButtonComponent
          id={resource.id}
          onDelete={() => onDelete(resource.id)}
          onEdit={() => onEdit(resource.id)}
          onMouseEvent={() => {}}
          onMakeVisible={() => onMakeVisible(resource.id)}
          onDownload={() => onDownload(resource.id)}
          isVisible={resource.visible}
          warningTitle={WARNING_MESSAGES.deleteTitle}
          warningMessage={WARNING_MESSAGES.deleteMessage}
          type="Resource"
        />
      </TableCell>
    </>
  );
};

interface FormData {
  intro?: Record<string, unknown>;
  compliance_badges?: Record<string, unknown>;
  company_description?: Record<string, unknown>;
  terms_and_contact?: Record<string, unknown>;
  info?: {
    resources_visible?: boolean;
  };
}

const TrustCenterResources: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const hasProcessedUrlParam = useRef(false);
  const {
    data: overviewData,
    isLoading: overviewLoading,
    error: overviewError,
  } = useAITrustCentreOverviewQuery();
  const updateOverviewMutation = useAITrustCentreOverviewMutation();
  const {
    data: resources,
    isLoading: resourcesLoading,
    error: resourcesError,
  } = useAITrustCentreResourcesQuery();
  const createResourceMutation = useCreateAITrustCentreResourceMutation();
  const updateResourceMutation = useUpdateAITrustCentreResourceMutation();
  const deleteResourceMutation = useDeleteAITrustCentreResourceMutation();
  const theme = useTheme();
  const styles = useStyles(theme);

  // GroupBy state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // State management
  const [formData, setFormData] = useState<FormData | null>(null);
  const [flashRowId, setFlashRowId] = useState<number | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [newResource, setNewResource] = useState<{
    name: string;
    description: string;
    file: File | null;
  }>({ name: "", description: "", file: null });
  const [editResource, setEditResource] = useState<{
    id: number;
    name: string;
    description: string;
    visible: boolean;
    file: File | null;
    filename?: string;
    file_id?: number;
  }>({
    id: 0,
    name: "",
    description: "",
    visible: true,
    file: null,
    filename: "",
    file_id: undefined,
  });

  // File upload modal states
  const [addFileModalOpen, setAddFileModalOpen] = useState(false);
  const [editFileModalOpen, setEditFileModalOpen] = useState(false);

  // Success/Error states
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);
  const [addResourceError, setAddResourceError] = useState<string | null>(null);
  const [deleteResourceError, setDeleteResourceError] = useState<string | null>(
    null
  );
  const [editResourceError, setEditResourceError] = useState<string | null>(
    null
  );

  // Update local form data when query data changes
  React.useEffect(() => {
    if (overviewData) {
      setFormData(overviewData);
    }
  }, [overviewData]);

  // Handle resourceId URL param to open edit modal from Wise Search
  useEffect(() => {
    const resourceId = searchParams.get("resourceId");
    if (resourceId && !hasProcessedUrlParam.current && resources && resources.length > 0) {
      hasProcessedUrlParam.current = true;
      // Use existing handleEditResource function which opens the modal
      handleEditResource(parseInt(resourceId, 10));
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, resources, setSearchParams]);

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

      // Only send the info section with the resources_visible field
      const dataToSave = {
        info: {
          resources_visible: dataToUse.info?.resources_visible ?? false,
        },
      } as Partial<AITrustCentreOverviewData>;

      await updateOverviewMutation.mutateAsync(dataToSave);
      handleAlert({
        variant: "success",
        body: "Resources saved successfully",
        setAlert,
      });
    } catch (error) {
      console.error("Save failed:", error);
    }
  };

  // Modal handlers
  const handleOpenAddModal = () => {
    if (!formData?.info?.resources_visible) return;
    setAddModalOpen(true);
    setNewResource({ name: "", description: "", file: null });
    setAddResourceError(null);
  };

  const handleCloseAddModal = () => {
    setAddModalOpen(false);
    setNewResource({ name: "", description: "", file: null });
    setAddResourceError(null);
  };

  const handleOpenEditModal = (resource: any) => {
    if (!formData?.info?.resources_visible) return;
    setEditResource({
      id: resource.id,
      name: resource.name,
      description: resource.description,
      visible: resource.visible,
      file: null,
      filename: resource.filename || resource.name, // Use filename if available, otherwise use resource name
      file_id: resource.file_id, // Store the current file ID for deletion when replacing
    });
    setEditModalOpen(true);
    setEditResourceError(null);
  };

  const handleCloseEditModal = () => {
    setEditModalOpen(false);
    setEditResource({
      id: 0,
      name: "",
      description: "",
      visible: true,
      file: null,
      filename: "",
      file_id: undefined,
    });
    setEditResourceError(null);
  };

  // Resource operations
  const handleAddResource = async () => {
    if (
      !formData?.info?.resources_visible ||
      !newResource.name ||
      !newResource.description ||
      !newResource.file
    ) {
      setAddResourceError("Please fill in all fields and upload a file");
      return;
    }
  
    // Check if description is at least 10 characters
    if (newResource.description.length < 10) {
      setAddResourceError("Description must be at least 10 characters long");
      return;
    }
    // Proceed with adding the resource
    setAddResourceError(""); 

    try {
      await createResourceMutation.mutateAsync({
        file: newResource.file,
        name: newResource.name,
        description: newResource.description,
        visible: true,
      });
      handleAlert({
        variant: "success",
        body: "Resource added successfully",
        setAlert,
      });
      setAddModalOpen(false);
      setNewResource({ name: "", description: "", file: null });
      setAddResourceError(null);
    } catch (error: any) {
      setAddResourceError(error.message || "Failed to create resource");
    }
  };

  const handleSaveEditResource = async () => {
    if (
      !formData?.info?.resources_visible ||
      !editResource.name ||
      !editResource.description 
    ) {
      setEditResourceError("Please fill in all fields and upload a file");
      return;
    }
  
    // Check if description is at least 10 characters
    if (editResource.description.length < 10) {
      setEditResourceError("Description must be at least 10 characters long");
      return;
    }
  
    // Proceed with adding the resource
    setEditResourceError(""); 

    try {
      // Pass the old file ID only when a new file is being uploaded
      const oldFileId = editResource.file ? editResource.file_id : undefined;

      // Use the unified update function - it handles both cases
      await updateResourceMutation.mutateAsync({
        resourceId: editResource.id,
        name: editResource.name,
        description: editResource.description,
        visible: editResource.visible,
        file: editResource.file || undefined,
        oldFileId: oldFileId,
      });

      // Flash the updated resource row
      setFlashRowId(editResource.id);
      setTimeout(() => setFlashRowId(null), 3000);

      handleAlert({
        variant: "success",
        body: "Resource updated successfully",
        setAlert,
      });
      setEditModalOpen(false);
      setEditResource({
        id: 0,
        name: "",
        description: "",
        visible: true,
        file: null,
        filename: "",
        file_id: undefined,
      });
      setEditResourceError(null);
    } catch (error: any) {
      setEditResourceError(error.message || "Failed to update resource");
    }
  };

  const handleEditResource = (resourceId: number) => {
    if (!formData?.info?.resources_visible || !resources) return;
    const resource = resources.find((r) => r.id === resourceId);
    if (resource && resource.visible) {
      handleOpenEditModal(resource);
    }
  };

  const handleDeleteResource = async (resourceId: number) => {
    if (!formData?.info?.resources_visible || !resources) return;
    const resource = resources.find((r) => r.id === resourceId);
    if (!resource?.visible) return;
    try {
      await deleteResourceMutation.mutateAsync(resourceId);
      handleAlert({
        variant: "success",
        body: "Resource deleted successfully",
        setAlert,
      });
    } catch (error: any) {
      setDeleteResourceError(error.message || "Failed to delete resource");
    }
  };

  const handleMakeVisible = async (resourceId: number) => {
    if (!formData?.info?.resources_visible || !resources) return;
    const resource = resources.find((r) => r.id === resourceId);
    if (resource) {
      try {
        await updateResourceMutation.mutateAsync({
          resourceId: resourceId,
          name: resource.name,
          description: resource.description,
          visible: !resource.visible,
          file: undefined,
          oldFileId: undefined,
        });
      } catch (error: any) {
        setEditResourceError(
          error.message || "Failed to update resource visibility"
        );
      }
    }
  };

  const handleDownload = async (resourceId: number) => {
    if (!formData?.info?.resources_visible || !resources) return;

    try {
      // Find the resource to get its file_id and name for the download
      const resource = resources.find((r) => r.id === resourceId);
      if (!resource) {
        console.error("Resource not found");
        return;
      }

      // Only allow download if resource is visible
      if (!resource.visible) return;

      // Check if file_id exists
      if (!resource.file_id) {
        console.error("File ID not found for resource");
        handleAlert({
          variant: "error",
          body: "File not found for download",
          setAlert,
        });
        return;
      }

      // Use the file_id for download
      await downloadFile(resource.file_id.toString(), resource.filename || resource.name);
      handleAlert({
        variant: "success",
        body: "File downloaded successfully",
        setAlert,
      });
    } catch (error) {
      console.error("Download failed:", error);
      handleAlert({
        variant: "error",
        body: "Failed to download file",
        setAlert,
      });
    }
  };

  // Define how to get the group key for each resource
  const getResourceGroupKey = useCallback((resource: Resource, field: string): string => {
    switch (field) {
      case 'description':
        return resource.description || 'Unknown';
      case 'visible':
        return resource.visible ? 'Visible' : 'Hidden';
      default:
        return 'Other';
    }
  }, []);

  // Apply grouping to resources
  const groupedResources = useTableGrouping({
    data: resources || [],
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getResourceGroupKey,
  });

  // Show loading state
  if (overviewLoading || resourcesLoading) {
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
  if (overviewError || resourcesError) {
    const errorMessage =
      overviewError?.message || resourcesError?.message || "An error occurred";
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <Typography color="error">{errorMessage}</Typography>
      </Box>
    );
  }

  // Ensure resources is available before rendering
  if (!resources) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <Typography>No resources data available</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography sx={styles.description}>
        Provide easy access to documentation and policies relevant to your AI
        governance, data security, compliance, and ethical practices. This
        section should act as a centralized repository where your customers,
        partners, and stakeholders can download, review, and understand key
        policy documents.
      </Typography>

      <Box sx={styles.container}>
        <Box sx={styles.resourcesHeader}>
          <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <GroupBy
              options={[
                { id: 'description', label: 'Type' },
                { id: 'visible', label: 'Visibility' },
              ]}
              onGroupChange={handleGroupChange}
            />
          </Box>
          <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Box sx={styles.toggleRow}>
              <Typography
                sx={{ ...styles.toggleLabel, cursor: "pointer" }}
                onClick={() =>
                  handleFieldChange("info", "resources_visible", !formData?.info?.resources_visible)
                }
              >
                Visible?
              </Typography>
              <Toggle
                checked={formData?.info?.resources_visible ?? false}
                onChange={(_, checked) =>
                  handleFieldChange("info", "resources_visible", checked)
                }
              />
            </Box>
            <CustomizableButton
              sx={styles.addButton}
              variant="contained"
              onClick={handleOpenAddModal}
              isDisabled={!formData?.info?.resources_visible}
              text="Add new resource"
              icon={<AddCircleOutlineIcon size={16} />}
            />
          </Box>
        </Box>

        <Box sx={styles.tableWrapper}>
          <GroupedTableView
            groupedData={groupedResources}
            ungroupedData={resources || []}
            renderTable={(data, options) => (
              <AITrustCenterTable
                data={data}
                columns={TABLE_COLUMNS}
                isLoading={resourcesLoading}
                paginated={true}
                disabled={!formData?.info?.resources_visible}
                emptyStateText="No resources found. Add your first resource to get started."
                renderRow={(resource, sortConfig) => (
                  <ResourceTableRow
                    key={resource.id}
                    resource={resource}
                    onDelete={handleDeleteResource}
                    onEdit={handleEditResource}
                    onMakeVisible={handleMakeVisible}
                    onDownload={handleDownload}
                    sortConfig={sortConfig}
                  />
                )}
                tableId="resources-table"
                hidePagination={options?.hidePagination}
                flashRowId={flashRowId}
              />
            )}
          />
        </Box>

        {/* Add Resource Modal */}
        <StandardModal
          isOpen={addModalOpen}
          onClose={handleCloseAddModal}
          title="Add a new resource"
          description="Upload a resource document for your AI Trust Center"
          onSubmit={handleAddResource}
          submitButtonText="Add resource"
          isSubmitting={
            !formData?.info?.resources_visible ||
            !newResource.name ||
            !newResource.description ||
            !newResource.file
          }
        >
          <Stack spacing={6}>
            <Field
              id="resource-name"
              label="Resource name"
              value={newResource.name}
              onChange={(e) =>
                setNewResource((r) => ({ ...r, name: e.target.value }))
              }
              disabled={!formData?.info?.resources_visible}
              isRequired
              sx={styles.fieldStyle}
              placeholder="Enter resource name"
            />
            <Field
              id="resource-description"
              label="Type or purpose of resource"
              value={newResource.description}
              onChange={(e) =>
                setNewResource((r) => ({ ...r, description: e.target.value }))
              }
              disabled={!formData?.info?.resources_visible}
              isRequired
              sx={styles.fieldStyle}
              placeholder="Enter resource description"
            />
            <Box>
              <CustomizableButton
                text={newResource.file ? "Change file" : "Upload a file"}
                variant="outlined"
                onClick={() => setAddFileModalOpen(true)}
                isDisabled={!formData?.info?.resources_visible}
                sx={{
                  border: `1px solid ${borderPalette.dark}`,
                  color: `${text.secondary}`,
                  "&:hover": {
                    backgroundColor: `${background.accent}`,
                    border: `1px solid ${borderPalette.dark}`,
                  },
                }}
              />
              {newResource.file && (
                <Typography sx={styles.fileName}>
                  {newResource.file.name}
                </Typography>
              )}
            </Box>
          </Stack>
        </StandardModal>

        {/* File Upload Modal for Add Resource */}
        <FileManagerUploadModal
          open={addFileModalOpen}
          onClose={() => setAddFileModalOpen(false)}
          selectionOnly
          multiple={false}
          acceptedMimeTypes={["application/pdf"]}
          title="Select PDF File"
          onFileSelect={(files) => {
            if (files[0]) {
              setNewResource((r) => ({ ...r, file: files[0] }));
              setAddResourceError(null);
            }
            setAddFileModalOpen(false);
          }}
        />

        {/* Edit Resource Modal */}
        <StandardModal
          isOpen={editModalOpen}
          onClose={handleCloseEditModal}
          title="Edit resource"
          description="Update resource details and manage visibility"
          onSubmit={handleSaveEditResource}
          submitButtonText="Save"
          isSubmitting={
            !formData?.info?.resources_visible ||
            !editResource.name ||
            !editResource.description
          }
        >
          <Stack spacing={6}>
            <Field
              id="edit-resource-name"
              label="Resource name"
              value={editResource.name}
              onChange={(e) =>
                setEditResource((r) => ({ ...r, name: e.target.value }))
              }
              disabled={!formData?.info?.resources_visible}
              isRequired
              sx={styles.fieldStyle}
              placeholder="Enter resource name"
            />
            <Field
              id="edit-resource-description"
              label="Type or purpose of resource"
              value={editResource.description}
              onChange={(e) =>
                setEditResource((r) => ({
                  ...r,
                  description: e.target.value,
                }))
              }
              disabled={!formData?.info?.resources_visible}
              isRequired
              sx={styles.fieldStyle}
              placeholder="Enter resource description"
            />
            <Box>
              <Typography sx={styles.modalLabel}>Visibility</Typography>
              <Toggle
                checked={editResource.visible}
                onChange={(_, checked) =>
                  setEditResource((r) => ({ ...r, visible: checked }))
                }
              />
            </Box>
            <Box>
              <CustomizableButton
                text="Replace file"
                variant="outlined"
                onClick={() => setEditFileModalOpen(true)}
                isDisabled={!formData?.info?.resources_visible}
                sx={{
                  border: `1px solid ${borderPalette.dark}`,
                  color: `${text.secondary}`,
                  "&:hover": {
                    backgroundColor: `${background.accent}`,
                    border: `1px solid ${borderPalette.dark}`,
                  },
                }}
              />
              {/* Show existing file name */}
              {!editResource.file && editResource.filename && (
                <Typography sx={styles.existingFileName}>
                  Current file: {editResource.filename}
                </Typography>
              )}
              {/* Show new file name when selected */}
              {editResource.file && (
                <Typography sx={styles.fileName}>
                  New file: {editResource.file.name}
                </Typography>
              )}
            </Box>
          </Stack>
        </StandardModal>

        {/* File Upload Modal for Edit Resource */}
        <FileManagerUploadModal
          open={editFileModalOpen}
          onClose={() => setEditFileModalOpen(false)}
          selectionOnly
          multiple={false}
          acceptedMimeTypes={["application/pdf"]}
          title="Select PDF File"
          onFileSelect={(files) => {
            if (files[0]) {
              setEditResource((r) => ({ ...r, file: files[0] }));
              setEditResourceError(null);
            }
            setEditFileModalOpen(false);
          }}
        />
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

      {/* Error notification for add resource */}
      {addResourceError && (
        <Suspense fallback={<div>Loading...</div>}>
          <Alert
            variant="error"
            body={addResourceError}
            isToast={true}
            onClick={() => setAddResourceError(null)}
          />
        </Suspense>
      )}

      {/* Error notification for delete resource */}
      {deleteResourceError && (
        <Suspense fallback={<div>Loading...</div>}>
          <Alert
            variant="error"
            body={deleteResourceError}
            isToast={true}
            onClick={() => setDeleteResourceError(null)}
          />
        </Suspense>
      )}

      {/* Error notification for edit resource */}
      {editResourceError && (
        <Suspense fallback={<div>Loading...</div>}>
          <Alert
            variant="error"
            body={editResourceError}
            isToast={true}
            onClick={() => setEditResourceError(null)}
          />
        </Suspense>
      )}
    </Box>
  );
};

export default TrustCenterResources;
