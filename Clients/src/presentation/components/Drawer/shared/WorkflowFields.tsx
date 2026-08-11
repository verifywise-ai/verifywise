import React from "react";
import { Stack, Typography, SelectChangeEvent } from "@mui/material";
import { Dayjs } from "dayjs";
import Field from "../../Inputs/Field";
import Select from "../../Inputs/Select";
import DatePicker from "../../Inputs/Datepicker";
import RichTextEditor from "../../RichTextEditor";
import { MemberOption, StatusOption } from "./types";

export const workflowInputStyles = {
  minWidth: 200,
  maxWidth: "100%",
  flexGrow: 1,
  height: 34,
};

export interface WorkflowFormData {
  status: string;
  implementation_description: string;
  owner: string;
  reviewer: string;
  approver: string;
  auditor_feedback: string;
}

interface WorkflowFieldsProps {
  formData: WorkflowFormData;
  onFieldChange: (field: keyof WorkflowFormData, value: string) => void;
  date: Dayjs | null;
  onDateChange: (newDate: Dayjs | null) => void;
  statusOptions: StatusOption[];
  memberOptions: MemberOption[];
  isEditingDisabled?: boolean;
  isAuditingDisabled?: boolean;
  showImplementationDescription?: boolean;
  implementationDescriptionLabel?: string;
  implementationDescriptionPlaceholder?: string;
  auditorFeedbackLabel?: string;
  auditorFeedbackPlaceholder?: string;
  ownerValueAsInt?: boolean;
}

/**
 * Shared workflow field block for framework impl drawers: implementation
 * description (rich text) plus status / owner / reviewer / approver / due
 * date / auditor feedback. Same six fields exist on every impl table in the
 * codebase; only the status enum varies (passed via statusOptions).
 */
const WorkflowFields: React.FC<WorkflowFieldsProps> = ({
  formData,
  onFieldChange,
  date,
  onDateChange,
  statusOptions,
  memberOptions,
  isEditingDisabled,
  isAuditingDisabled,
  showImplementationDescription = true,
  implementationDescriptionLabel = "Implementation description:",
  implementationDescriptionPlaceholder = "Describe how this requirement is implemented...",
  auditorFeedbackLabel = "Auditor feedback:",
  auditorFeedbackPlaceholder = "Enter audit feedback...",
  ownerValueAsInt = true,
}) => {
  const handleSelect =
    (field: keyof WorkflowFormData) => (event: SelectChangeEvent<string | number>) => {
      onFieldChange(field, event.target.value.toString());
    };

  const memberValue = (raw: string) => {
    if (!raw) return "";
    return ownerValueAsInt ? parseInt(raw) : raw;
  };

  return (
    <>
      {showImplementationDescription && (
        <Stack>
          <Typography fontSize={13} sx={{ marginBottom: "5px" }}>
            {implementationDescriptionLabel}
          </Typography>
          <RichTextEditor
            toolbar="full"
            initialContent={formData.implementation_description}
            onContentChange={(content) => onFieldChange("implementation_description", content)}
            placeholder={implementationDescriptionPlaceholder}
            isEditable={!isEditingDisabled}
            height="120px"
          />
        </Stack>
      )}

      <Stack gap="24px">
        <Select
          id="status"
          label="Status:"
          value={formData.status}
          onChange={handleSelect("status")}
          items={statusOptions.map((s) => ({ _id: s.id, name: s.name }))}
          sx={workflowInputStyles}
          placeholder="Select status"
          disabled={isEditingDisabled}
        />

        <Select
          id="Owner"
          label="Owner:"
          value={memberValue(formData.owner)}
          onChange={handleSelect("owner")}
          items={memberOptions}
          sx={workflowInputStyles}
          placeholder="Select owner"
          disabled={isEditingDisabled}
          {...(ownerValueAsInt ? {} : { getOptionValue: (item: MemberOption) => item._id })}
        />

        <Select
          id="Reviewer"
          label="Reviewer:"
          value={memberValue(formData.reviewer)}
          onChange={handleSelect("reviewer")}
          items={memberOptions}
          sx={workflowInputStyles}
          placeholder="Select reviewer"
          disabled={isEditingDisabled}
          {...(ownerValueAsInt ? {} : { getOptionValue: (item: MemberOption) => item._id })}
        />

        <Select
          id="Approver"
          label="Approver:"
          value={memberValue(formData.approver)}
          onChange={handleSelect("approver")}
          items={memberOptions}
          sx={workflowInputStyles}
          placeholder="Select approver"
          disabled={isEditingDisabled}
          {...(ownerValueAsInt ? {} : { getOptionValue: (item: MemberOption) => item._id })}
        />

        <DatePicker
          label="Due date:"
          sx={workflowInputStyles}
          date={date}
          disabled={isEditingDisabled}
          handleDateChange={onDateChange}
        />

        <Stack>
          <Typography fontSize={13} sx={{ marginBottom: "5px" }}>
            {auditorFeedbackLabel}
          </Typography>
          <Field
            type="description"
            value={formData.auditor_feedback}
            onChange={(e) => onFieldChange("auditor_feedback", e.target.value)}
            placeholder={auditorFeedbackPlaceholder}
            disabled={isAuditingDisabled}
          />
        </Stack>
      </Stack>
    </>
  );
};

export default WorkflowFields;
