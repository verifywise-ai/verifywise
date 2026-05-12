import { useCallback, useState } from "react";
import { Box, Divider, Typography, useTheme } from "@mui/material";
import { Check, X } from "lucide-react";
import { CustomizableButton } from "../../button/customizable-button";
import ConfirmationModal from "../../Dialogs/ConfirmationModal";
import BottomChip from "../../BottomChip";

export interface BulkActionConfirm {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
}

export interface BulkAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  confirm?: BulkActionConfirm;
}

export interface BulkSelectAllConfig {
  /** Total number of rows that *could* be selected (across pages, after filters). */
  totalCount: number;
  /** Called when the user clicks the "Select all N" affordance. */
  onSelectAll: () => void;
}

interface BulkActionsToolbarProps {
  count: number;
  onClear: () => void;
  actions: BulkAction[];
  /** When supplied, surfaces a "Select all N" button while count < totalCount. */
  selectAll?: BulkSelectAllConfig;
}

/**
 * Floating bottom-center pill that appears whenever at least one row is
 * selected. Layout (left → right):
 *
 *   "{count} selected"   |   Select all N (optional)   ×  Clear selection
 *                        |   <action 1>   <action 2>   …
 *
 * Sits at `position: fixed` above the table so it stays visible while the
 * user scrolls. Pointer events are disabled on the wrapper so the rest of
 * the page stays interactive everywhere except on the pill itself.
 */
const BulkActionsToolbar: React.FC<BulkActionsToolbarProps> = ({
  count,
  onClear,
  actions,
  selectAll,
}) => {
  const theme = useTheme();
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleActionClick = useCallback((action: BulkAction) => {
    if (action.disabled) return;
    if (action.confirm) {
      setPendingAction(action);
    } else {
      void action.onClick();
    }
  }, []);

  const handleCancelConfirm = useCallback(() => {
    if (isRunning) return;
    setPendingAction(null);
  }, [isRunning]);

  const handleProceedConfirm = useCallback(async () => {
    if (!pendingAction) return;
    try {
      setIsRunning(true);
      await pendingAction.onClick();
    } finally {
      setIsRunning(false);
      setPendingAction(null);
    }
  }, [pendingAction]);

  if (count <= 0) return null;

  const hasMoreToSelect = !!selectAll && count < selectAll.totalCount;

  return (
    <>
      <BottomChip role="toolbar" ariaLabel="Bulk actions">
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: 13,
            color: theme.palette.text.primary,
            whiteSpace: "nowrap",
          }}
        >
          {count} selected
        </Typography>

        {hasMoreToSelect && (
          <CustomizableButton
            text={`Select all ${selectAll!.totalCount}`}
            variant="text"
            size="small"
            startIcon={<Check size={14} />}
            onClick={selectAll!.onSelectAll}
            sx={{
              color: theme.palette.text.secondary,
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
            ariaLabel={`Select all ${selectAll!.totalCount}`}
          />
        )}

        <CustomizableButton
          text="Clear selection"
          variant="text"
          size="small"
          startIcon={<X size={14} />}
          onClick={onClear}
          sx={{
            color: theme.palette.text.secondary,
            fontSize: 13,
            whiteSpace: "nowrap",
          }}
          ariaLabel="Clear selection"
        />

        {actions.length > 0 && (
          <Divider orientation="vertical" flexItem sx={{ mx: theme.spacing(1) }} />
        )}

        <Box
          component="ul"
          sx={{
            display: "flex",
            flexDirection: "row",
            gap: theme.spacing(1),
            m: 0,
            p: 0,
            listStyle: "none",
            flexWrap: "wrap",
            rowGap: theme.spacing(1),
          }}
        >
          {actions.map((action) => (
            <li key={action.id}>
              <CustomizableButton
                text={action.label}
                variant="text"
                size="small"
                color={action.confirm?.danger ? "error" : "primary"}
                startIcon={action.icon}
                onClick={() => handleActionClick(action)}
                isDisabled={action.disabled}
                sx={{ fontSize: 13, whiteSpace: "nowrap" }}
                ariaLabel={action.label}
              />
            </li>
          ))}
        </Box>
      </BottomChip>

      {pendingAction?.confirm && (
        <ConfirmationModal
          title={pendingAction.confirm.title}
          body={pendingAction.confirm.body}
          cancelText="Cancel"
          proceedText={pendingAction.confirm.confirmLabel}
          proceedButtonVariant="contained"
          proceedButtonColor={pendingAction.confirm.danger ? "error" : "primary"}
          onCancel={handleCancelConfirm}
          onProceed={handleProceedConfirm}
          isLoading={isRunning}
          isOpen
        />
      )}
    </>
  );
};

export default BulkActionsToolbar;
