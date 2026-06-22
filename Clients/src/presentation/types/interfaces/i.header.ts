import { ReactNode } from "react";
import { BreadcrumbItem } from "../../../domain/types/breadcrumbs.types";

export interface PageHeaderExtendedProps {
  title: string;
  description?: string;
  helpArticlePath?: string;
  /** Banner rendered above the TipBox (e.g. deadline warnings). */
  warningBanner?: ReactNode;
  tipBoxEntity?: string;
  summaryCards?: ReactNode;
  summaryCardsJoyrideId?: string;
  children?: ReactNode;
  alert?: ReactNode;
  loadingToast?: ReactNode;
  titleFontFamily?: string;
  breadcrumbItems?: BreadcrumbItem[];
  actionButton?: ReactNode | null;
}
