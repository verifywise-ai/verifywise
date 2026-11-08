import { useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { ChevronDown, ChevronUp } from "lucide-react";
import StandardModal from "../../components/Modals/StandardModal";
import { CustomizableButton } from "../../components/button/customizable-button";
import Toggle from "../../components/Inputs/Toggle";
import Alert from "../../components/Alert";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";
import { border } from "../../themes/palette";
import {
  DASHBOARD_WIDGETS,
  moveWidget,
  type DashboardWidgetKey,
  type ViewWidget,
} from "./widgetRegistry";

interface EditLayoutModalProps {
  /** The layout being edited, in order. */
  widgets: ViewWidget[];
  /** What "Reset to default" restores. */
  defaults: ViewWidget[];
  isAvailable: (key: DashboardWidgetKey) => boolean;
  /** Rejects when saving failed; the modal then stays open. */
  onSave: (widgets: ViewWidget[]) => Promise<void>;
  onClose: () => void;
}

const moveButtonSx = { width: "30px", minWidth: "30px", height: "30px" };

/** Show, hide and reorder the widgets of the view on screen. Nothing is stored until Save. */
const EditLayoutModal = ({
  widgets,
  defaults,
  isAvailable,
  onSave,
  onClose,
}: EditLayoutModalProps) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ViewWidget[]>(widgets);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const offered = draft.filter((widget) => isAvailable(widget.key));

  const setVisible = (key: DashboardWidgetKey, visible: boolean) =>
    setDraft((current) => current.map((w) => (w.key === key ? { ...w, visible } : w)));

  const move = (key: DashboardWidgetKey, direction: "up" | "down") =>
    setDraft((current) => moveWidget(current, key, direction, isAvailable));

  const handleSave = async () => {
    setSaving(true);
    setSaveFailed(false);
    try {
      await onSave(draft);
      onClose();
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  // A save in flight cannot be taken back, so the modal stays until it settles.
  const handleClose = () => {
    if (!saving) onClose();
  };

  return (
    <StandardModal
      isOpen
      onClose={handleClose}
      title="Edit layout"
      description="Show, hide and reorder the widgets in this view. Only you see these changes."
      onSubmit={handleSave}
      isSubmitting={saving}
      maxWidth="600px"
    >
      <Stack gap="8px">
        {saveFailed && (
          <Alert variant="error" body="Could not save your layout. Try again." isToast={false} />
        )}
        <Stack direction="row" justifyContent="flex-end">
          <CustomizableButton
            text="Reset to default"
            variant="outlined"
            onClick={() => setDraft(defaults)}
            sx={{ height: "30px" }}
          />
        </Stack>
        <Box role="list">
          {offered.map((widget, index) => {
            const label = DASHBOARD_WIDGETS[widget.key].label;
            const names = { widget: t(label) };
            return (
              <Stack
                key={widget.key}
                role="listitem"
                direction="row"
                alignItems="center"
                gap="8px"
                sx={{
                  "py": "8px",
                  "borderBottom": `1px solid ${border.dark}`,
                  "&:last-of-type": { borderBottom: "none" },
                }}
              >
                <Toggle
                  checked={widget.visible}
                  onChange={(event) => setVisible(widget.key, event.target.checked)}
                  ariaLabel={fill(t("Show {widget}"), names)}
                />
                <Typography
                  sx={{
                    flex: 1,
                    fontSize: 13,
                    color: widget.visible ? "text.primary" : "text.secondary",
                  }}
                >
                  {label}
                </Typography>
                <CustomizableButton
                  iconOnly
                  variant="outlined"
                  icon={<ChevronUp size={16} strokeWidth={1.5} />}
                  ariaLabel={fill(t("Move {widget} up"), names)}
                  isDisabled={index === 0}
                  onClick={() => move(widget.key, "up")}
                  sx={moveButtonSx}
                />
                <CustomizableButton
                  iconOnly
                  variant="outlined"
                  icon={<ChevronDown size={16} strokeWidth={1.5} />}
                  ariaLabel={fill(t("Move {widget} down"), names)}
                  isDisabled={index === offered.length - 1}
                  onClick={() => move(widget.key, "down")}
                  sx={moveButtonSx}
                />
              </Stack>
            );
          })}
        </Box>
      </Stack>
    </StandardModal>
  );
};

export default EditLayoutModal;
