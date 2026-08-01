import { Stack } from "@mui/material";
import { PolicyEditorTitleArea, type PolicyEditorTitleAreaProps } from "./PolicyEditorTitleArea";
import { PolicyEditorActionsBar, type PolicyEditorActionsBarProps } from "./PolicyEditorActionsBar";

export type PolicyEditorHeaderProps = PolicyEditorTitleAreaProps & PolicyEditorActionsBarProps;

/** Title editing chrome and save/export/import actions for the policy editor. */
export function PolicyEditorHeader(props: PolicyEditorHeaderProps) {
  const {
    pageTitle,
    isEditingTitle,
    editedTitle,
    isSavingTitle,
    titleError,
    onBack,
    onStartEditTitle,
    onEditedTitleChange,
    onSaveTitle,
    onCancelEditTitle,
    ...actionsProps
  } = props;

  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      sx={{ mb: "8px", flexShrink: 0 }}
    >
      <PolicyEditorTitleArea
        pageTitle={pageTitle}
        isEditingTitle={isEditingTitle}
        editedTitle={editedTitle}
        isSavingTitle={isSavingTitle}
        titleError={titleError}
        onBack={onBack}
        onStartEditTitle={onStartEditTitle}
        onEditedTitleChange={onEditedTitleChange}
        onSaveTitle={onSaveTitle}
        onCancelEditTitle={onCancelEditTitle}
      />
      <PolicyEditorActionsBar {...actionsProps} />
    </Stack>
  );
}
