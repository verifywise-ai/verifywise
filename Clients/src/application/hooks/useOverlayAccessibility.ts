import { RefObject, useEffect, useRef } from "react";
import {
  focusFirstElement,
  handleFocusTrapKeyDown,
  hasOpenNestedOverlay,
} from "../utils/focusTrap";

interface UseOverlayAccessibilityProps {
  isOpen: boolean;
  onClose: () => void;
  onEscapeKey?: () => void;
  containerRef?: RefObject<HTMLElement | null>;
  trapFocus?: boolean;
  restoreFocus?: boolean;
}

/**
 * Handles Escape-to-close, optional focus trapping, and focus restoration
 * for custom overlays that do not use MUI Modal/Dialog/Drawer.
 */
export const useOverlayAccessibility = ({
  isOpen,
  onClose,
  onEscapeKey,
  containerRef,
  trapFocus = true,
  restoreFocus = true,
}: UseOverlayAccessibilityProps) => {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (restoreFocus) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    }

    const container = containerRef?.current;
    if (container && trapFocus) {
      requestAnimationFrame(() => {
        if (containerRef?.current) {
          focusFirstElement(containerRef.current);
        }
      });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const container = containerRef?.current;

      if (event.key === "Escape") {
        if (container && hasOpenNestedOverlay(container)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (onEscapeKey) {
          onEscapeKey();
        } else {
          onClose();
        }
        return;
      }

      if (trapFocus && container) {
        handleFocusTrapKeyDown(event, container);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      if (restoreFocus && previouslyFocusedRef.current?.focus) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [isOpen, onClose, onEscapeKey, containerRef, trapFocus, restoreFocus]);
};
