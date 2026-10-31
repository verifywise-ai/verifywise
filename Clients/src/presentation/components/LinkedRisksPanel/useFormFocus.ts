import { useCallback, useEffect, useRef } from "react";

/**
 * Keeps keyboard focus in place around an inline form. The button that opens
 * the form is disabled while it is open, which drops focus to the page body,
 * and the form's own Cancel unmounts with it. So: on open, focus the form's
 * first enabled control; on close, return focus to the button that opened it.
 *
 * `open` is the key of the open form, or null when none is.
 */
export function useFormFocus<K extends string>(open: K | null) {
  const formRef = useRef<HTMLDivElement>(null);
  const openers = useRef<Partial<Record<K, HTMLButtonElement | null>>>({});
  const previous = useRef<K | null>(open);

  useEffect(() => {
    const last = previous.current;
    previous.current = open;
    if (open === last) return;
    if (open) {
      formRef.current
        ?.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled])")
        ?.focus();
    } else if (last) {
      openers.current[last]?.focus();
    }
  }, [open]);

  const openerRef = useCallback(
    (key: K) => (element: HTMLButtonElement | null) => {
      openers.current[key] = element;
    },
    [],
  );

  return { formRef, openerRef };
}
