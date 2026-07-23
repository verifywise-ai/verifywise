export interface AgentPrimitiveRow {
  id: number;
  source_system: string;
  primitive_type: string;
  external_id: string;
  display_name: string;
  owner_id: string | null;
  permissions: any[];
  permission_categories: string[];
  last_activity: string | null;
  metadata: Record<string, any>;
  review_status: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  linked_model_inventory_id: number | null;
  is_stale: boolean;
  is_manual: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentAuditLogEntry {
  id: number;
  agent_primitive_id: number;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  performed_by: number | null;
  created_at: string;
}

// The lifecycle a single agent moves through, derived from review_status +
// is_stale (no dedicated backend column). Rejected is terminal; stale is a
// warning branch off the active (confirmed) state.
export type AgentLifecycleStage = "added" | "under_review" | "confirmed" | "active" | "rejected";

export interface AgentTableProps {
  agents: AgentPrimitiveRow[];
  isLoading: boolean;
  onRowClick: (agent: AgentPrimitiveRow) => void;
  onEdit: (agent: AgentPrimitiveRow) => void;
  onDelete: (agent: AgentPrimitiveRow) => void;
  onSync?: () => void;
  onAddAgent?: () => void;
  isSyncing?: boolean;
  visibleColumns?: Set<string>;
}
