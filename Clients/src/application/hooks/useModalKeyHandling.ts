import { useEffect } from "react";

interface UseModalKeyHandlingProps {
  isOpen: boolean;
  onClose: () => void;
  onEscapeKey?: () => void;
}

/**
 * Custom hook for handling ESC key press and focus trapping in modals
 *
 * @param isOpen - Whether the modal is currently open
 * @param onClose - Function to call when modal should be closed
 * @param onEscapeKey - Optional function to call when ESC key is pressed (defaults to onClose)
 */
export const useModalKeyHandling = ({ isOpen, onClose, onEscapeKey }: UseModalKeyHandlingProps) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        if (onEscapeKey) {
          onEscapeKey();
        } else {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, onEscapeKey]);
};
