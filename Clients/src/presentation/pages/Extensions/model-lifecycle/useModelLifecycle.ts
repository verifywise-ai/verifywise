/**
 * Model Lifecycle Hooks
 *
 * React hooks for fetching and managing model lifecycle data via the plugin API.
 */

import { useState, useEffect, useCallback } from "react";
import { apiServices } from "../../../../infrastructure/api/networkServices";

// ========== TYPE DEFINITIONS ==========

export type LifecycleItemType =
  | "text"
  | "textarea"
  | "documents"
  | "people"
  | "classification"
  | "checklist"
  | "approval";

export interface LifecyclePhase {
  id: number;
  name: string;
  description?: string;
  display_order: number;
  is_active: boolean;
  items?: LifecycleItem[];
  created_at?: string;
  updated_at?: string;
}

export interface LifecycleItem {
  id: number;
  phase_id: number;
  name: string;
  description?: string;
  item_type: LifecycleItemType;
  is_required: boolean;
  display_order: number;
  config: Record<string, any>;
  is_active: boolean;
  value?: LifecycleValue | null;
  created_at?: string;
  updated_at?: string;
}

export interface LifecycleValue {
  id: number;
  model_inventory_id: number;
  item_id: number;
  value_text?: string | null;
  value_json?: any;
  files?: LifecycleItemFile[];
  updated_by?: number;
  created_at?: string;
  updated_at?: string;
}

export interface LifecycleItemFile {
  id: number;
  value_id: number;
  file_id: number;
  filename?: string;
  mimetype?: string;
  created_at?: string;
}

export interface LifecyclePhaseProgress {
  phase_id: number;
  phase_name: string;
  total_items: number;
  filled_items: number;
  required_items: number;
  filled_required_items: number;
}

export interface LifecycleProgress {
  phases: LifecyclePhaseProgress[];
  total_items: number;
  filled_items: number;
  total_required: number;
  filled_required: number;
  completion_percentage: number;
}

// ========== HOOKS ==========

interface UseModelLifecycleResult {
  phases: LifecyclePhase[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useModelLifecycle(modelId: number | null, enabled = true): UseModelLifecycleResult {
  const [phases, setPhases] = useState<LifecyclePhase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!modelId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiServices.get(
        `/extensions/model-lifecycle/models/${modelId}/lifecycle`,
      );
      const phasesData = (response.data as any)?.data || response.data || [];
      setPhases(Array.isArray(phasesData) ? phasesData : []);
    } catch (err) {
      setError((err as Error).message || "Failed to load lifecycle data");
    } finally {
      setLoading(false);
    }
  }, [modelId, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { phases, loading, error, refresh: fetchData };
}

interface UseLifecycleProgressResult {
  progress: LifecycleProgress | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useLifecycleProgress(
  modelId: number | null,
  enabled = true,
): UseLifecycleProgressResult {
  const [progress, setProgress] = useState<LifecycleProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!modelId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiServices.get(
        `/extensions/model-lifecycle/models/${modelId}/lifecycle/progress`,
      );
      setProgress((response.data as any)?.data || response.data || null);
    } catch (err) {
      setError((err as Error).message || "Failed to load lifecycle progress");
    } finally {
      setLoading(false);
    }
  }, [modelId, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { progress, loading, error, refresh: fetchData };
}

interface UseLifecycleConfigResult {
  phases: LifecyclePhase[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  setPhases: React.Dispatch<React.SetStateAction<LifecyclePhase[]>>;
}

export function useLifecycleConfig(
  includeInactive = false,
  enabled = true,
): UseLifecycleConfigResult {
  const [phases, setPhases] = useState<LifecyclePhase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const query = includeInactive ? "?includeInactive=true" : "";
      const response = await apiServices.get(`/extensions/model-lifecycle/config${query}`);
      const phasesData = (response.data as any)?.data || response.data || [];
      setPhases(Array.isArray(phasesData) ? phasesData : []);
    } catch (err) {
      setError((err as Error).message || "Failed to load lifecycle config");
    } finally {
      setLoading(false);
    }
  }, [includeInactive, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { phases, loading, error, refresh: fetchData, setPhases };
}
