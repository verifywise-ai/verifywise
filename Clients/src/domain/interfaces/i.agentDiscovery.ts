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

export interface AgentTableProps {
  agents: AgentPrimitiveRow[];
  isLoading: boolean;
  onRowClick: (agent: AgentPrimitiveRow) => void;
  onEdit: (agent: AgentPrimitiveRow) => void;
  onDelete: (agent: AgentPrimitiveRow) => void;
  visibleColumns?: Set<string>;
}
