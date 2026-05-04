import { useState, useEffect } from "react";

/**
 * Options for the `useMultipleOnScreen` hook.
 *
 * @interface UseMultipleOnScreenOptions
 *
 * @property {number} countToTrigger - The number of elements that need to be on screen
 * before the hook triggers the desired action.
 *
 * @property {IntersectionObserverInit} [options] - Optional configuration object for the
 * `IntersectionObserver`, allowing customization of root, rootMargin, and threshold.
 */
interface UseMultipleOnScreenOptions {
  countToTrigger: number;
  options?: IntersectionObserverInit;
}

interface UseMultipleOnScreenReturn<T extends Element> {
  refs: ((node: T | null) => void)[];
  allVisible: boolean;
}

const useMultipleOnScreen = <T extends Element>({
  countToTrigger,
  options,
}: UseMultipleOnScreenOptions): UseMultipleOnScreenReturn<T> => {
  const [visibleCount, setVisibleCount] = useState(0);
  const [refs, setRefs] = useState<((node: T | null) => void)[]>([]);

  useEffect(() => {
    const newRefs: ((node: T | null) => void)[] = Array(countToTrigger)
      .fill(null)
      .map(() => {
        let observer: IntersectionObserver | null = null;

        return (node: T | null) => {
          if (observer) observer.disconnect();

          if (node) {
            observer = new IntersectionObserver(([entry]) => {
              setVisibleCount((prev) => (entry.isIntersecting ? prev + 1 : prev - 1));
            }, options);

            observer.observe(node);
          }
        };
      });

    setRefs(newRefs);
  }, [countToTrigger, options]);

  const allVisible = visibleCount >= countToTrigger;

  return { refs, allVisible };
};

export default useMultipleOnScreen;
