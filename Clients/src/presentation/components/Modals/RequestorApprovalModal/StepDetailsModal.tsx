import React from "react";
import { Stack } from "@mui/material";
import StandardModal from "../StandardModal";
import DetailField from "./DetailField";
import { IStepDetailsModalProps } from "src/domain/interfaces/i.approvalForkflow";

const StepDetailsModal: React.FC<IStepDetailsModalProps> = ({ isOpen, onClose, stepDetails }) => {
  if (!stepDetails) {
    return null;
  }

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title="Step Details"
      description=""
      hideFooter={true}
      maxWidth="600px"
    >
      <Stack spacing={4}>
        <DetailField label="Owner" value={stepDetails.owner} />
        <DetailField label="Team members" value={stepDetails.teamMembers} />
        <DetailField label="Location" value={stepDetails.location} />
        <DetailField label="Start date" value={stepDetails.startDate} />
        <DetailField label="Target industry" value={stepDetails.targetIndustry} withWrap />
        <DetailField label="Description" value={stepDetails.description} withWrap />
      </Stack>
    </StandardModal>
  );
};

export default StepDetailsModal;
