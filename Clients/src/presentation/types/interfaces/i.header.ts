import { ReactNode } from "react";
import { BreadcrumbItem } from "../../../domain/types/breadcrumbs.types";

export interface PageHeaderExtendedProps {
  title: string;
  /** Text, or an element when the description has to be more than one string. */
  description?: ReactNode;
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
  /** "Back to ..." link rendered between the breadcrumbs and the title. */
  backButton?: ReactNode;
}
