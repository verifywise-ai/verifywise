const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isOpenMuiModalRoot(modalRoot: HTMLElement): boolean {
  return modalRoot.getAttribute("aria-hidden") !== "true";
}

/**
 * Returns true when a MUI Modal or aria-modal dialog is open outside the trap container
 * (e.g. ImageLightbox or StandardModal stacked above the Help sidebar).
 */
export function hasOpenNestedOverlay(container: HTMLElement): boolean {
  const muiModals = document.querySelectorAll<HTMLElement>(".MuiModal-root");
  for (const modalRoot of muiModals) {
    if (container.contains(modalRoot) || !isOpenMuiModalRoot(modalRoot)) {
      continue;
    }
    return true;
  }

  const nestedDialogs = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][aria-modal="true"]',
  );
  for (const dialog of nestedDialogs) {
    if (dialog === container || container.contains(dialog)) {
      continue;
    }
    return true;
  }

  return false;
}

/** Returns true when focus is inside a nested overlay that should own keyboard handling. */
export function isFocusInNestedOverlay(
  container: HTMLElement,
  activeElement: HTMLElement | null = document.activeElement as HTMLElement | null,
): boolean {
  if (!activeElement) {
    return false;
  }

  if (container.contains(activeElement)) {
    return false;
  }

  const muiModalRoot = activeElement.closest(".MuiModal-root");
  if (muiModalRoot instanceof HTMLElement && !container.contains(muiModalRoot)) {
    return isOpenMuiModalRoot(muiModalRoot);
  }

  const nestedDialog = activeElement.closest('[role="dialog"][aria-modal="true"]');
  if (
    nestedDialog instanceof HTMLElement &&
    nestedDialog !== container &&
    !container.contains(nestedDialog)
  ) {
    return true;
  }

  return false;
}

export function shouldYieldFocusTrap(
  container: HTMLElement,
  activeElement: HTMLElement | null = document.activeElement as HTMLElement | null,
): boolean {
  return isFocusInNestedOverlay(container, activeElement);
}

function shouldSkipRecoveringFocusToContainer(
  container: HTMLElement,
  activeElement: HTMLElement | null,
): boolean {
  return !container.contains(activeElement) && hasOpenNestedOverlay(container);
}

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.tabIndex !== -1,
  );
}

export function focusFirstElement(container: HTMLElement): void {
  const focusableElements = getFocusableElements(container);
  if (focusableElements.length > 0) {
    focusableElements[0].focus();
    return;
  }

  if (!container.hasAttribute("tabindex")) {
    container.setAttribute("tabindex", "-1");
  }
  container.focus();
}

export function handleFocusTrapKeyDown(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = getFocusableElements(container);
  if (focusableElements.length === 0) {
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement as HTMLElement | null;

  if (shouldYieldFocusTrap(container, activeElement)) {
    return;
  }

  if (event.shiftKey) {
    if (activeElement === firstElement || !container.contains(activeElement)) {
      if (shouldSkipRecoveringFocusToContainer(container, activeElement)) {
        return;
      }
      event.preventDefault();
      lastElement.focus();
    }
    return;
  }

  if (activeElement === lastElement || !container.contains(activeElement)) {
    if (shouldSkipRecoveringFocusToContainer(container, activeElement)) {
      return;
    }
    event.preventDefault();
    firstElement.focus();
  }
}
