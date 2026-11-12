import { Swords } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { CustomizableButton } from "../../components/button/customizable-button";
import { useCan } from "../../../application/hooks/useCan";

interface ArenaDisabledStateProps {
  /** Opens the LLM Evals settings, where an Admin can turn Arena on. */
  onOpenSettings: () => void;
}

/** Shown in place of the Arena page when Arena is off for the organization. */
export default function ArenaDisabledState({ onOpenSettings }: ArenaDisabledStateProps) {
  const canManage = useCan("organization.admin");

  return (
    <EmptyState
      icon={Swords}
      message={
        canManage
          ? "Arena is turned off for your organization. Turn it on in settings."
          : "Arena is turned off for your organization. Ask an Admin to turn it on."
      }
      showBorder
    >
      {canManage && (
        <CustomizableButton variant="contained" text="Open settings" onClick={onOpenSettings} />
      )}
    </EmptyState>
  );
}
