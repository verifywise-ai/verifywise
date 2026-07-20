import Chip from "../../components/Chip";
import { palette } from "../../themes/palette";
import { displayFormattedDate } from "../../tools/isoDateToString";

export function getStatusChip(status: string) {
  switch (status) {
    case "completed":
      return (
        <Chip
          label="Completed"
          size="small"
          uppercase={false}
          backgroundColor={palette.status.success.bg}
          textColor={palette.status.success.text}
        />
      );
    case "running":
      return (
        <Chip
          label="Running"
          size="small"
          uppercase={false}
          backgroundColor={palette.status.info.bg}
          textColor={palette.status.info.text}
        />
      );
    case "pending":
      return (
        <Chip
          label="Pending"
          size="small"
          uppercase={false}
          backgroundColor={palette.background.accent}
          textColor={palette.text.secondary}
        />
      );
    case "failed":
      return (
        <Chip
          label="Failed"
          size="small"
          uppercase={false}
          backgroundColor={palette.status.error.bg}
          textColor={palette.status.error.text}
        />
      );
    default:
      return <Chip label={status} size="small" uppercase={false} />;
  }
}

export function getModeChip(mode: string) {
  const labels: Record<string, string> = {
    quantitative_audit: "Quantitative",
    impact_assessment: "Assessment",
    compliance_checklist: "Checklist",
    framework_assessment: "Framework",
    custom: "Custom",
  };
  return <Chip label={labels[mode] || mode} size="small" uppercase={false} variant="default" />;
}

export function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return displayFormattedDate(dateStr);
}
