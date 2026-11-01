import { useState } from "react";
import { useSearchParams } from "react-router";
import { LIFECYCLE_STAGES, LifecycleStage } from "../../domain/enums/lifecycleStage.enum";

const isStage = (value: string | null): value is LifecycleStage =>
  !!value && (LIFECYCLE_STAGES as readonly string[]).includes(value);

/**
 * The selected lifecycle tab of an inventory page (use cases, AI apps):
 * ?stage= wins (dashboard links), else the last tab used on this browser
 * (read once), else Planned. Choosing a tab saves it and updates the URL.
 */
export function useLifecycleTab(
  storageKey: string,
): [LifecycleStage, (next: LifecycleStage) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const [storedStage] = useState<LifecycleStage>(() => {
    const stored = localStorage.getItem(storageKey);
    return isStage(stored) ? stored : LifecycleStage.PLANNED;
  });
  const param = searchParams.get("stage");
  const stage = isStage(param) ? param : storedStage;
  const setStage = (next: LifecycleStage) => {
    localStorage.setItem(storageKey, next);
    const params = new URLSearchParams(searchParams);
    params.set("stage", next);
    setSearchParams(params, { replace: true });
  };
  return [stage, setStage];
}
