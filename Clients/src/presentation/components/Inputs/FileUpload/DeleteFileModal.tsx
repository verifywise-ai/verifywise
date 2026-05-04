import { Typography } from "@mui/material";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";

interface DeleteFileModalProps {
  isOpen: boolean;
  fileName: string;
  onClose: () => void;
  onDelete: () => void;
}

function DeleteFileModal({ isOpen, fileName, onClose, onDelete }: DeleteFileModalProps) {
  if (!isOpen) return null;

  return (
    <ConfirmationModal
      title="Confirm delete"
      body={
        <Typography fontSize={13}>Are you sure you want to delete the file {fileName}?</Typography>
      }
      cancelText="Cancel"
      proceedText="Delete"
      onCancel={onClose}
      onProceed={onDelete}
      proceedButtonColor="error"
      proceedButtonVariant="contained"
      TitleFontSize={0}
    />
  );
}
export default DeleteFileModal;
