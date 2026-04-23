import {
  AlertTriangle,
  BarChart3,
  Brain,
  EyeOff,
  FileText,
  FlaskConical,
  GraduationCap,
  Info,
  Plug,
  Rocket,
  Router,
  ScanSearch,
  Settings,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import type { IconName } from '@user-guide-content/userGuideConfig';

const collectionIconMap: Record<IconName, LucideIcon> = {
  Rocket,
  Shield,
  AlertTriangle,
  Brain,
  Settings,
  Plug,
  FileText,
  GraduationCap,
  BarChart3,
  FlaskConical,
  ScanSearch,
  EyeOff,
  Router,
};

export const resolveIcon = (name: IconName): LucideIcon =>
  collectionIconMap[name] || Info;
