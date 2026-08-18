import { FileData } from "../../../../domain/types/File";

export type AlertVariant = "success" | "error" | "warning" | "info";

export interface DrawerAlertPayload {
  variant: AlertVariant;
  body: string;
}

export type OnAlert = (alert: DrawerAlertPayload) => void;

export interface DrawerTab {
  label: string;
  value: string;
  icon: "FileText" | "FolderOpen" | "Link" | "MessageSquare" | "AlertTriangle" | "CheckSquare";
}

export interface StatusOption {
  id: string;
  name: string;
}

export interface MemberOption {
  _id: string | number;
  name: string;
  email?: string;
  surname?: string;
}

export interface LinkedRisk {
  id: number;
  risk_name: string;
  risk_level?: string;
}

export type { FileData };
