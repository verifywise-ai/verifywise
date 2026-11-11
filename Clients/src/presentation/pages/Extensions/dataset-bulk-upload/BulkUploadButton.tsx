import { Upload } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { useCan } from "../../../../application/hooks/useCan";

interface BulkUploadButtonProps {
  onClick: () => void;
}

export default function BulkUploadButton({ onClick }: BulkUploadButtonProps) {
  const isDisabled = !useCan("ext.datasetBulkUpload.edit");

  return (
    <CustomizableButton
      variant="outlined"
      color="primary"
      size="small"
      icon={<Upload size={16} />}
      text="Bulk upload"
      onClick={onClick}
      isDisabled={isDisabled}
    />
  );
}
