import { Upload } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { useAuth } from "../../../../application/hooks/useAuth";
import { brand } from "../../../themes/palette";

interface BulkUploadButtonProps {
  onTriggerModal?: (componentName: string) => void;
}

export default function BulkUploadButton({
  onTriggerModal,
}: BulkUploadButtonProps) {
  const { userRoleName } = useAuth();
  const isDisabled =
    !userRoleName || !["Admin", "Editor"].includes(userRoleName);

  return (
    <CustomizableButton
      variant="outlined"
      sx={{
        borderColor: `${brand.primary}`,
        color: `${brand.primary}`,
        gap: "8px",
        "&:hover": { borderColor: "#0e5a48", backgroundColor: "#f0faf7" },
      }}
      text="Bulk upload"
      icon={<Upload size={16} />}
      onClick={() => onTriggerModal?.("BulkUploadButton")}
      isDisabled={isDisabled}
    />
  );
}
