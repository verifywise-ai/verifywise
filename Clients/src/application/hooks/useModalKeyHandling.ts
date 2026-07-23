import { RefObject } from "react";
import { useOverlayAccessibility } from "./useOverlayAccessibility";

interface UseModalKeyHandlingProps {
  isOpen: boolean;
  onClose: () => void;
  onEscapeKey?: () => void;
  /** When provided, Tab focus is trapped inside the container and focus is restored on close. */
  containerRef?: RefObject<HTMLElement | null>;
  trapFocus?: boolean;
  restoreFocus?: boolean;
}

/**
 * Handles ESC key press and optional focus trapping for modals and custom overlays.
 * MUI Modal/Dialog/Drawer components handle focus automatically — use this hook
 * only for custom portal-based overlays or pass containerRef for explicit trapping.
 */
export const useModalKeyHandling = ({
  isOpen,
  onClose,
  onEscapeKey,
  containerRef,
  trapFocus = Boolean(containerRef),
  restoreFocus = Boolean(containerRef),
}: UseModalKeyHandlingProps) => {
  useOverlayAccessibility({
    isOpen,
    onClose,
    onEscapeKey,
    containerRef,
    trapFocus: containerRef ? trapFocus : false,
    restoreFocus: containerRef ? restoreFocus : false,
  });
};
