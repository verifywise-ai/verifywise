/**
 * @fileoverview Project Datasets page: my datasets and built-in templates for LLM evals.
 *
 * @module pages/EvalsDashboard/ProjectDatasets
 */

import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import TabBar from "../../components/TabBar";
import Alert from "../../components/Alert";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import { PageHeader } from "../../components/Layout/PageHeader";
import HelperIcon from "../../components/HelperIcon";
import TipBox from "../../components/TipBox";
import { palette } from "../../themes/palette";
import UploadDatasetModal from "./ProjectDatasets/UploadDatasetModal";
import CreateDatasetModals from "./ProjectDatasets/CreateDatasetModals";
import DatasetPreviewDrawer from "./ProjectDatasets/DatasetPreviewDrawer";
import TemplatePreviewDrawer from "./ProjectDatasets/TemplatePreviewDrawer";
import DatasetInlineEditor from "./ProjectDatasets/DatasetInlineEditor";
import MyDatasetsTab from "./ProjectDatasets/MyDatasetsTab";
import TemplatesTab from "./ProjectDatasets/TemplatesTab";
import { useProjectDatasets } from "./ProjectDatasets/useProjectDatasets";

type ProjectDatasetsProps = { projectId: string; orgId?: string | null };

export function ProjectDatasets({ projectId, orgId }: ProjectDatasetsProps) {
  void projectId; // Used for future project-scoped features
  const ds = useProjectDatasets({ orgId });

  // If editor is loading, show spinner
  if (ds.loadingEditor) {
    return (
      <Box
        sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}
      >
        <CircularProgress sx={{ color: palette.brand.primary }} />
      </Box>
    );
  }

  // Inline editor view
  if (ds.editorOpen && ds.editingDataset) {
    return (
      <DatasetInlineEditor
        alert={ds.alert}
        setAlert={ds.setAlert}
        editingDataset={ds.editingDataset}
        editDatasetName={ds.editDatasetName}
        setEditDatasetName={ds.setEditDatasetName}
        editablePrompts={ds.editablePrompts}
        setEditablePrompts={ds.setEditablePrompts}
        copiedJson={ds.copiedJson}
        setCopiedJson={ds.setCopiedJson}
        isValidToSave={ds.isValidToSave}
        savingDataset={ds.savingDataset}
        onCloseEditor={ds.handleCloseEditor}
        onSaveDataset={ds.handleSaveDataset}
        onAddPrompt={ds.handleAddPrompt}
        onDeletePrompt={ds.handleDeletePrompt}
        promptDrawerOpen={ds.promptDrawerOpen}
        setPromptDrawerOpen={ds.setPromptDrawerOpen}
        selectedPromptIndex={ds.selectedPromptIndex}
        setSelectedPromptIndex={ds.setSelectedPromptIndex}
      />
    );
  }

  // Default table view
  return (
    <Stack sx={{ width: "100%" }}>
      {ds.alert && <Alert variant={ds.alert.variant} body={ds.alert.body} />}

      <PageHeader
        title="Datasets"
        description="Datasets contain the prompts or conversations used to evaluate your models. Create custom datasets or use templates to get started quickly."
        rightContent={<HelperIcon articlePath="llm-evals/managing-datasets" />}
      />
      <Box sx={{ mt: "18px" }}>
        <TipBox entityName="evals-datasets" />
      </Box>

      {/* Hidden file input for uploads */}
      <input
        ref={ds.fileInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={ds.handleFileChange}
      />

      {/* Tab bar for My datasets / Templates */}
      <TabContext value={ds.activeTab}>
        <Box sx={{ mb: "18px" }}>
          <TabBar
            tabs={[
              {
                label: "My datasets",
                value: "my",
                icon: "Database",
                count: ds.datasets.length,
              },
              {
                label: "Templates",
                value: "templates",
                icon: "LayoutTemplate",
                count: ds.flattenedTemplates.length,
              },
            ]}
            activeTab={ds.activeTab}
            onChange={(_e, value) => {
              ds.setActiveTab(value as "my" | "templates");
              ds.setSelectedTemplate(null);
            }}
          />
        </Box>
      </TabContext>

      {ds.activeTab === "my" && (
        <MyDatasetsTab
          filterColumns={ds.filterColumns}
          onFilterChange={ds.handleFilterChange}
          onGroupChange={ds.handleDatasetsGroupChange}
          searchTerm={ds.searchTerm}
          onSearchTermChange={ds.setSearchTerm}
          uploading={ds.uploading}
          canUploadDataset={ds.canUploadDataset}
          canDeleteDataset={ds.canDeleteDataset}
          onUploadClick={ds.handleUploadClick}
          onCreateClick={() => ds.setCreateDatasetModalOpen(true)}
          groupedDatasets={ds.groupedDatasets}
          filteredDatasets={ds.filteredDatasets}
          loading={ds.loading}
          onRowClick={ds.handleRowClick}
          onView={ds.handleViewPrompts}
          onEdit={ds.handleOpenInEditor}
          onDelete={ds.handleRequestDelete}
          onDownload={ds.handleDownloadDataset}
        />
      )}

      {ds.activeTab === "templates" && (
        <TemplatesTab
          filterColumns={ds.templateFilterColumns}
          onFilterChange={ds.handleTemplateFilterChange}
          templateSearchTerm={ds.templateSearchTerm}
          onTemplateSearchTermChange={ds.setTemplateSearchTerm}
          filteredTemplates={ds.filteredAndSortedTemplates}
          flattenedTemplatesCount={ds.flattenedTemplates.length}
          loading={ds.loadingTemplatesList}
          copyingTemplate={ds.copyingTemplate}
          templateGroups={ds.templateGroups}
          onViewTemplate={ds.handleViewTemplate}
          onCopyTemplate={ds.handleOpenCopyModal}
        />
      )}

      {/* Delete confirmation modal */}
      <ConfirmationModal
        isOpen={ds.deleteModalOpen}
        title="Delete this dataset?"
        body={`Are you sure you want to remove "${ds.datasetToDelete?.name || "this dataset"}" from your project? This action cannot be undone.`}
        cancelText="Cancel"
        proceedText="Delete"
        onCancel={() => {
          ds.setDeleteModalOpen(false);
          ds.setDatasetToDelete(null);
        }}
        onProceed={ds.handleConfirmDelete}
        proceedButtonColor="error"
        proceedButtonVariant="contained"
      />

      {/* Copy template confirmation modal */}
      <ConfirmationModal
        isOpen={ds.copyModalOpen}
        title="Copy to my datasets?"
        TitleFontSize={16}
        body={
          <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
            This will copy &quot;{ds.templateToCopy?.name || "this template"}&quot; to your
            datasets. You can then edit and use it in your experiments.
          </Typography>
        }
        cancelText="Cancel"
        proceedText="Copy"
        onCancel={() => {
          ds.setCopyModalOpen(false);
          ds.setTemplateToCopy(null);
        }}
        onProceed={ds.handleConfirmCopy}
        proceedButtonColor="primary"
        proceedButtonVariant="contained"
      />

      <UploadDatasetModal
        isOpen={ds.uploadModalOpen}
        onClose={() => ds.setUploadModalOpen(false)}
        turnType={ds.datasetTurnType}
        onTurnTypeChange={ds.setDatasetTurnType}
        useCase={ds.exampleDatasetType}
        onUseCaseChange={ds.setExampleDatasetType}
        onUploadClick={ds.handleFileSelect}
      />

      <DatasetPreviewDrawer
        open={ds.drawerOpen}
        onClose={ds.handleCloseDrawer}
        datasetName={ds.selectedDataset?.name}
        prompts={ds.datasetPrompts}
        loading={ds.loadingPrompts}
      />

      <TemplatePreviewDrawer
        open={ds.templateDrawerOpen}
        onClose={ds.handleCloseTemplateDrawer}
        templateName={ds.selectedTemplate?.name}
        prompts={ds.templatePrompts}
        loading={ds.loadingTemplatePrompts}
        copying={ds.copyingTemplate}
        onCopy={() => {
          if (ds.selectedTemplate) {
            ds.handleOpenCopyModal(ds.selectedTemplate);
          }
        }}
      />

      <CreateDatasetModals
        choiceOpen={ds.createDatasetModalOpen}
        onChoiceClose={() => ds.setCreateDatasetModalOpen(false)}
        onOpenTypeSelection={() => {
          ds.setCreateDatasetModalOpen(false);
          ds.setCreateTypeSelectionOpen(true);
        }}
        onChooseUpload={() => {
          ds.setCreateDatasetModalOpen(false);
          ds.setUploadModalOpen(true);
        }}
        onChooseTemplate={() => {
          ds.setCreateDatasetModalOpen(false);
          ds.setActiveTab("templates");
        }}
        typeSelectionOpen={ds.createTypeSelectionOpen}
        onTypeSelectionClose={() => ds.setCreateTypeSelectionOpen(false)}
        onCreate={(draft) => {
          ds.setEditablePrompts(draft.prompts);
          ds.setEditDatasetName("");
          ds.setEditingDataset({
            key: "new",
            name: "New Dataset",
            path: "",
            use_case: draft.useCase,
            datasetType: draft.useCase,
            turnType: draft.turnType,
          });
          ds.setEditorOpen(true);
        }}
      />
    </Stack>
  );
}
