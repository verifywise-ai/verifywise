import { Upload } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { useAuth } from "../../../../application/hooks/useAuth";

interface BulkUploadButtonProps {
  onClick: () => void;
}

export default function BulkUploadButton({ onClick }: BulkUploadButtonProps) {
  const { userRoleName } = useAuth();
  const isDisabled = !userRoleName || !["Admin", "Editor"].includes(userRoleName);

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
